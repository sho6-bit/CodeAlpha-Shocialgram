import multer from "multer";
import { AppError } from "../utils/app-error.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new AppError(400, "Upload a JPEG, PNG, or WebP image"));
    }
    callback(null, true);
  },
});

export const uploadSingleImage = upload.single("image");
