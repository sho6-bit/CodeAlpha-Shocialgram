import { Router } from "express";
import { getNotifications, markNotificationsRead } from "../controllers/notifications.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/async-handler.js";

const notificationsRouter = Router();
notificationsRouter.get("/", authenticate, asyncHandler(getNotifications));
notificationsRouter.post("/read", authenticate, asyncHandler(markNotificationsRead));
export default notificationsRouter;
