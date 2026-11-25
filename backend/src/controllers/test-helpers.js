export function configureTestEnvironment() {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/shocialgram_test?schema=public";
  process.env.JWT_SECRET ??= "shocialgram-controller-tests-secret-at-least-32-chars";
}

export function responseStub() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
