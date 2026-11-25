import { AppError } from "./app-error.js";

export function parseBigIntId(value, label) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return BigInt(value);
}
