const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://pos-cafe.emacrontechnologies.com",
  "https://cafe.theyuji.com",
];

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  // Reflect the request origin back (if it is in the allowed list) so that
  // error responses are not blocked by browser CORS checks on the new domain.
  const requestOrigin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: err.message,
    });
  }

  // Handle custom errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.errorType || "OPERATIONAL_ERROR",
      message: err.message,
    });
  }

  // Generic error response
  res.status(500).json({
    error: "SERVER_ERROR",
    message: "Something went wrong!",
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      details: err.message,
    }),
  });
};

module.exports = errorHandler;
