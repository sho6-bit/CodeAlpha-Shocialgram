import { Router } from "express";
import authRouter from "./auth.routes.js";
import healthRouter from "./health.routes.js";
import messagesRouter from "./messages.routes.js";
import notificationsRouter from "./notifications.routes.js";
import postsRouter from "./posts.routes.js";
import storiesRouter from "./stories.routes.js";
import usersRouter from "./users.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/posts", postsRouter);
apiRouter.use("/stories", storiesRouter);
apiRouter.use("/messages", messagesRouter);
apiRouter.use("/notifications", notificationsRouter);

export default apiRouter;
