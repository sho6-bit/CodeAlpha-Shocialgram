import { Router } from "express";
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getExplore,
  getFeed,
  getPost,
  toggleLike,
  updatePost,
} from "../controllers/posts.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { optionalAuthenticate } from "../middleware/optional-authenticate.js";
import { uploadSingleImage } from "../middleware/upload-image.js";
import { asyncHandler } from "../utils/async-handler.js";

const postsRouter = Router();

postsRouter.get("/feed", authenticate, asyncHandler(getFeed));
postsRouter.get("/explore", optionalAuthenticate, asyncHandler(getExplore));
postsRouter.post("/", authenticate, uploadSingleImage, asyncHandler(createPost));
postsRouter.get("/:id", optionalAuthenticate, asyncHandler(getPost));
postsRouter.patch("/:id", authenticate, asyncHandler(updatePost));
postsRouter.delete("/:id", authenticate, asyncHandler(deletePost));
postsRouter.post("/:id/likes", authenticate, asyncHandler(toggleLike));
postsRouter.post("/:id/comments", authenticate, asyncHandler(addComment));
postsRouter.delete("/:id/comments/:commentId", authenticate, asyncHandler(deleteComment));

export default postsRouter;
