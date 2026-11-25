export function errorHandler(error, _request, response, _next) {
  let status = Number.isInteger(error.status) ? error.status : 500;
  let message = status >= 500 ? "Internal server error" : error.message;

  if (error.code === "P2002") {
    status = 409;
    message = "That username or email is already in use";
  } else if (error.code === "P2003") {
    status = 409;
    message = "A related database record is no longer available";
  } else if (error.code === "P2025") {
    status = 404;
    message = "Resource not found";
  } else if (error.name === "MulterError") {
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = status === 413 ? "Image must be 8 MB or smaller" : "Invalid image upload";
  } else if (error.name === "SyntaxError" && "body" in error) {
    status = 400;
    message = "Invalid JSON request body";
  }

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({ error: message });
}
