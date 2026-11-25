import assert from "node:assert/strict";
import { test } from "node:test";
import { configureTestEnvironment, responseStub } from "./test-helpers.js";

configureTestEnvironment();

const [{ getConnections }, { prisma }] = await Promise.all([
  import("./users.controller.js"),
  import("../config/prisma.js"),
]);

test("getConnections includes the authenticated viewer's follow status", async (t) => {
  const originalFindUnique = prisma.user.findUnique;
  const originalFindMany = prisma.follow.findMany;
  t.after(() => {
    prisma.user.findUnique = originalFindUnique;
    prisma.follow.findMany = originalFindMany;
  });

  prisma.user.findUnique = async () => ({ id: 5n });
  let queries = 0;
  prisma.follow.findMany = async (args) => {
    queries += 1;
    if (queries === 1) {
      assert.deepEqual(args.where, { followingId: 5n });
      return [
        { follower: { id: 7n, username: "follows-viewer", _count: { followers: 3 } } },
        { follower: { id: 8n, username: "not-followed", _count: { followers: 1 } } },
      ];
    }
    assert.deepEqual(args.where, { followerId: 42n, followingId: { in: [7n, 8n] } });
    return [{ followingId: 7n }];
  };

  const response = responseStub();
  await getConnections({
    params: { username: "profile", kind: "followers" },
    userId: 42n,
  }, response);

  assert.equal(queries, 2);
  assert.deepEqual(response.body.users.map(({ id, isFollowing }) => [id, isFollowing]), [
    ["7", true],
    ["8", false],
  ]);
  assert.equal(response.body.users[0].followersCount, 3);
});
