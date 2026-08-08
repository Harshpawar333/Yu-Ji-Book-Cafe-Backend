const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  // Set CORS headers even on errors
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
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
