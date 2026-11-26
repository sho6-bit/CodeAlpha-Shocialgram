import { Router } from "express";
import { createStory, deleteStory, getStoryFeed, recordStoryView, replyToStory, toggleStoryReaction } from "../controllers/stories.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { uploadSingleStoryMedia } from "../middleware/upload-image.js";
import { asyncHandler } from "../utils/async-handler.js";

const storiesRouter = Router();
storiesRouter.get("/feed", authenticate, asyncHandler(getStoryFeed));
storiesRouter.post("/", authenticate, uploadSingleStoryMedia, asyncHandler(createStory));
storiesRouter.post("/:id/views", authenticate, asyncHandler(recordStoryView));
storiesRouter.post("/:id/reactions", authenticate, asyncHandler(toggleStoryReaction));
storiesRouter.post("/:id/replies", authenticate, asyncHandler(replyToStory));
storiesRouter.delete("/:id", authenticate, asyncHandler(deleteStory));
export default storiesRouter;
