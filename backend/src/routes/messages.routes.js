import { Router } from "express";
import { sharePost } from "../controllers/messages.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/async-handler.js";

const messagesRouter = Router();

messagesRouter.post("/share-post", authenticate, asyncHandler(sharePost));

export default messagesRouter;
