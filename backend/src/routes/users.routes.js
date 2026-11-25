import { Router } from "express";
import {
  getConnections,
  getProfile,
  searchUsers,
  toggleFollow,
  updateAvatar,
  updateProfile,
} from "../controllers/users.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { optionalAuthenticate } from "../middleware/optional-authenticate.js";
import { uploadSingleImage } from "../middleware/upload-image.js";
import { asyncHandler } from "../utils/async-handler.js";

const usersRouter = Router();

usersRouter.get("/search", optionalAuthenticate, asyncHandler(searchUsers));
usersRouter.patch("/me", authenticate, asyncHandler(updateProfile));
usersRouter.post("/me/avatar", authenticate, uploadSingleImage, asyncHandler(updateAvatar));
usersRouter.post("/:id/follow", authenticate, asyncHandler(toggleFollow));
usersRouter.get("/:username/:kind(followers|following)", asyncHandler(getConnections));
usersRouter.get("/:username", optionalAuthenticate, asyncHandler(getProfile));

export default usersRouter;
