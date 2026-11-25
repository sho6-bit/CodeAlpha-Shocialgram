import assert from "node:assert/strict";
import { test } from "node:test";
import { configureTestEnvironment, responseStub } from "./test-helpers.js";

configureTestEnvironment();

const [
  { register, login, getCurrentUser },
  { prisma },
  { errorHandler },
  { authenticate },
  bcrypt,
  jwtModule,
  { env },
] = await Promise.all([
  import("./auth.controller.js"),
  import("../config/prisma.js"),
  import("../middleware/error-handler.js"),
  import("../middleware/authenticate.js"),
  import("bcryptjs"),
  import("jsonwebtoken"),
  import("../config/env.js"),
]);
const jwt = jwtModule.default;

test("register, duplicate handling, login, and current-user auth", async (t) => {
  const originalCreate = prisma.user.create;
  const originalFindUnique = prisma.user.findUnique;
  t.after(() => {
    prisma.user.create = originalCreate;
    prisma.user.findUnique = originalFindUnique;
  });

  const registration = {
    body: {
      username: "sample.user",
      email: "  sample@example.com ",
      password: "correct-horse-battery",
      fullName: "Sample User",
    },
  };
  let createdData;
  prisma.user.create = async ({ data }) => {
    createdData = data;
    return { id: 42n, ...data, createdAt: new Date(), updatedAt: new Date() };
  };

  const registerResponse = responseStub();
  await register(registration, registerResponse);
  assert.equal(registerResponse.statusCode, 201);
  assert.equal(createdData.email, "sample@example.com");
  assert.equal(createdData.password, undefined);
  assert.equal(await bcrypt.compare(registration.body.password, createdData.password_hash), true);
  assert.notEqual(createdData.password_hash, registration.body.password);
  assert.equal(registerResponse.body.user.id, "42");
  assert.equal("password_hash" in registerResponse.body.user, false);
  assert.equal(jwt.verify(registerResponse.body.token, env.jwtSecret).userId, "42");

  prisma.user.create = async () => {
    throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  };
  let duplicateError;
  try {
    await register(registration, responseStub());
    assert.fail("Duplicate registration should reject");
  } catch (error) {
    duplicateError = error;
  }
  const duplicateResponse = responseStub();
  errorHandler(duplicateError, {}, duplicateResponse, () => {});
  assert.equal(duplicateResponse.statusCode, 409);

  let lookup;
  const storedUser = {
    id: 42n,
    username: "sample.user",
    email: "sample@example.com",
    password_hash: createdData.password_hash,
    fullName: "Sample User",
  };
  prisma.user.findUnique = async (args) => {
    lookup = args;
    return storedUser;
  };
  const loginResponse = responseStub();
  await login({ body: { email: " SAMPLE@example.com ", password: registration.body.password } }, loginResponse);
  assert.equal(lookup.where.email, "sample@example.com");
  assert.equal(loginResponse.statusCode, 200);
  assert.equal("password_hash" in loginResponse.body.user, false);

  await assert.rejects(
    login({ body: { email: storedUser.email, password: "wrong-password" } }, responseStub()),
    (error) => error.status === 401,
  );
  await assert.rejects(
    register({ body: { ...registration.body, email: "bad..email@example..com" } }, responseStub()),
    (error) => error.status === 400,
  );
  const invalidRegistrations = [
    { ...registration.body, username: "ab" },
    { ...registration.body, password: "short" },
    { ...registration.body, password: "é".repeat(37) },
    { ...registration.body, fullName: "" },
  ];
  for (const body of invalidRegistrations) {
    await assert.rejects(register({ body }, responseStub()), (error) => error.status === 400);
  }
  await assert.rejects(
    login({ body: { email: "not-an-email", password: "anything" } }, responseStub()),
    (error) => error.status === 400,
  );
  prisma.user.findUnique = async () => null;
  await assert.rejects(
    login({ body: { email: storedUser.email, password: "anything" } }, responseStub()),
    (error) => error.status === 401,
  );

  prisma.user.findUnique = async (args) => {
    lookup = args;
    return storedUser;
  };
  const currentUserResponse = responseStub();
  await getCurrentUser({ userId: 42n }, currentUserResponse);
  assert.equal(lookup.where.id, 42n);
  assert.equal(currentUserResponse.body.user.id, "42");
  assert.equal("password_hash" in currentUserResponse.body.user, false);

  const request = {
    get: () => `Bearer ${registerResponse.body.token}`,
  };
  let middlewareError;
  authenticate(request, {}, (error) => { middlewareError = error; });
  assert.equal(middlewareError, undefined);
  assert.equal(request.userId, 42n);
});
