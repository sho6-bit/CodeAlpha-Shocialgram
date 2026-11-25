import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

export function authenticate(request, _response, next) {
  const authorization = request.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return next(new AppError(401, "Authentication required"));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (
      typeof payload !== "object" ||
      typeof payload.userId !== "string" ||
      !/^\d+$/.test(payload.userId)
    ) {
      throw new Error("Invalid token payload");
    }
    request.userId = BigInt(payload.userId);
    return next();
  } catch {
    return next(new AppError(401, "Invalid or expired token"));
  }
}
