import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./app-error.js";

const uploadsDirectory = fileURLToPath(new URL("../../uploads/", import.meta.url));

function detectImage(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  throw new AppError(400, "The uploaded file is not a supported image");
}

export async function saveImage(file) {
  if (!file?.buffer) {
    throw new AppError(400, "An image file is required");
  }
  const extension = detectImage(file.buffer);
  await mkdir(uploadsDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadsDirectory, filename), file.buffer, { flag: "wx" });
  return `/uploads/${filename}`;
}

export async function removeImage(imageUrl) {
  if (!imageUrl?.startsWith("/uploads/")) return;
  const filename = path.basename(imageUrl);
  if (!/^[\da-f-]+\.(jpg|png|webp)$/i.test(filename)) return;
  try {
    await unlink(path.join(uploadsDirectory, filename));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
