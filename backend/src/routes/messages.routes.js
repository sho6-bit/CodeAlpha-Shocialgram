import { Router } from "express";
import {
  getConversation,
  getConversations,
  sendMessage,
  sharePost,
} from "../controllers/messages.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/async-handler.js";

const messagesRouter = Router();

messagesRouter.get("/", authenticate, asyncHandler(getConversations));
messagesRouter.get("/:userId", authenticate, asyncHandler(getConversation));
messagesRouter.post("/", authenticate, asyncHandler(sendMessage));
messagesRouter.post("/share-post", authenticate, asyncHandler(sharePost));

export default messagesRouter;
