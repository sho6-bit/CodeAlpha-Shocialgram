import cors from "cors";
import express from "express";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import apiRouter from "./routes/index.js";

const app = express();
const frontendDirectory = fileURLToPath(new URL("../../frontend/", import.meta.url));
const uploadsDirectory = fileURLToPath(new URL("../uploads/", import.meta.url));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadsDirectory, { fallthrough: false, maxAge: "1d" }));
app.use("/api", apiRouter);
app.use(express.static(frontendDirectory));
app.use(notFound);
app.use(errorHandler);

export default app;
