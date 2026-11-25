import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function optionalAuthenticate(request, _response, next) {
  const authorization = request.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return next();

  try {
    const payload = jwt.verify(authorization.slice(7), env.jwtSecret);
    if (
      typeof payload === "object" &&
      typeof payload.userId === "string" &&
      /^\d+$/.test(payload.userId)
    ) {
      request.userId = BigInt(payload.userId);
    }
  } catch {
    // Public endpoints remain available when an optional token is expired.
  }
  next();
}
