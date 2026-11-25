import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { toPublicUser } from "../utils/response-serialization.js";

function issueToken(userId) {
  return jwt.sign({ userId: userId.toString() }, env.jwtSecret, { expiresIn: "7d" });
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email) {
  if (email.length > 254) return false;
  const localPart = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
  const domainLabel = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  return new RegExp(`^${localPart}@(?:${domainLabel}\\.)+${domainLabel}$`, "i").test(email);
}

export async function register(request, response) {
  const body = request.body ?? {};
  const username = String(body.username ?? "").trim().toLowerCase();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();

  if (!/^[a-z0-9._]{3,50}$/.test(username)) {
    throw new AppError(400, "Username must be 3-50 characters (letters, numbers, dots, underscores)");
  }
  if (!isValidEmail(email)) {
    throw new AppError(400, "Enter a valid email address");
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw new AppError(400, "Password must be between 8 and 72 characters");
  }
  if (!fullName || fullName.length > 100) {
    throw new AppError(400, "Full name is required and must be 100 characters or fewer");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, password_hash: passwordHash, fullName },
  });
  response.status(201).json({ user: toPublicUser(user), token: issueToken(user.id) });
}

export async function login(request, response) {
  const body = request.body ?? {};
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!isValidEmail(email) || !password) {
    throw new AppError(400, "Enter a valid email address and password");
  }
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, "Email or password is incorrect");
  }
  response.json({ user: toPublicUser(user), token: issueToken(user.id) });
}

export async function getCurrentUser(request, response) {
  const user = await prisma.user.findUnique({ where: { id: BigInt(request.userId) } });
  if (!user) throw new AppError(401, "User account no longer exists");
  response.json({ user: toPublicUser(user) });
}
