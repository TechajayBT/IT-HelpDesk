/**
 * Global Error Handling Middleware
 *
 * This is the LAST middleware registered in Express. It catches any error that
 * was passed to next(error) — whether thrown intentionally (AppError) or
 * unexpectedly (programming bugs, DB errors, etc.).
 *
 * Responsibilities:
 * 1. Log all errors at the appropriate level (warn for operational, error for bugs)
 * 2. Transform known Mongoose/JWT errors into AppErrors with useful messages
 * 3. Send a consistent JSON error envelope to the client
 * 4. Never expose stack traces or internals to the client in production
 *
 * Error response format:
 * {
 *   success: false,
 *   error: {
 *     code: "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN" | ...,
 *     message: "Human-readable message",
 *     details: [{ field: "email", message: "Invalid email" }] // For validation errors
 *   }
 * }
 */

const { AppError } = require("../utils/errors");
const logger = require("../config/logger");

// ── Mongoose-specific error transformers ─────────────────────────────────────
// Convert raw Mongoose errors into AppErrors with user-friendly messages

/**
 * Handle Mongoose CastError — typically caused by an invalid MongoDB ObjectId
 * (e.g., GET /tickets/not-a-real-id)
 */
const handleCastError = (error) => {
  return new AppError(`Invalid ${error.path}: ${error.value}`, 400, "INVALID_ID");
};

/**
 * Handle Mongoose duplicate key error (code 11000)
 * e.g., registering with an email that already exists
 */
const handleDuplicateKeyError = (error) => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  return new AppError(
    `A record with ${field} '${value}' already exists.`,
    409,
    "DUPLICATE_KEY"
  );
};

/**
 * Handle Mongoose ValidationError — thrown when a document fails schema validation
 * This is a last line of defence; Joi should catch these before they reach Mongoose.
 */
const handleMongooseValidationError = (error) => {
  const messages = Object.values(error.errors).map((e) => e.message);
  return new AppError(messages.join(". "), 400, "VALIDATION_ERROR");
};

/**
 * Handle Mongoose VersionError — thrown when optimistic concurrency control fails.
 * This means two agents tried to assign the same ticket simultaneously.
 */
const handleVersionError = () => {
  return new AppError(
    "This ticket was just updated by someone else. Please refresh and try again.",
    409,
    "CONCURRENT_MODIFICATION"
  );
};

// ── Main error handler ────────────────────────────────────────────────────────
/**
 * errorHandler
 *
 * Express error-handling middleware (4-argument signature required by Express).
 * Must be registered AFTER all routes.
 */
const errorHandler = (error, req, res, next) => {
  // Make a mutable copy so we can transform without mutating the original
  let processedError = error;

  // ── Transform known non-AppError types ────────────────────────────────────
  if (error.name === "CastError") {
    processedError = handleCastError(error);
  } else if (error.code === 11000) {
    processedError = handleDuplicateKeyError(error);
  } else if (error.name === "ValidationError") {
    processedError = handleMongooseValidationError(error);
  } else if (error.name === "VersionError") {
    processedError = handleVersionError();
  } else if (error.name === "MulterError") {
    // Multer file upload errors (too large, too many files, etc.)
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? `File too large. Maximum size is ${Math.round(parseInt(process.env.MAX_FILE_SIZE || 5242880) / 1024 / 1024)}MB`
        : error.code === "LIMIT_FILE_COUNT"
        ? `Too many files. Maximum is ${process.env.MAX_ATTACHMENTS_PER_TICKET || 5} attachments`
        : error.message;
    processedError = new AppError(message, 400, "FILE_UPLOAD_ERROR");
  }

  // Set default values for unexpected errors
  const statusCode = processedError.statusCode || 500;
  const isOperational = processedError.isOperational || false;

  // ── Logging ───────────────────────────────────────────────────────────────
  // Operational errors are expected and logged at warn level (no stack trace needed)
  // Programming bugs are logged at error level with the full stack trace
  if (isOperational) {
    logger.warn("Operational error", {
      statusCode,
      code: processedError.code,
      message: processedError.message,
      path: req.path,
      method: req.method,
      userId: req.user?._id,
    });
  } else {
    logger.error("Unexpected error", {
      statusCode,
      message: processedError.message,
      stack: processedError.stack,
      path: req.path,
      method: req.method,
      userId: req.user?._id,
    });
  }

  // ── Response ──────────────────────────────────────────────────────────────
  const isDevelopment = process.env.NODE_ENV === "development";

  return res.status(statusCode).json({
    success: false,
    error: {
      code: processedError.code || "INTERNAL_SERVER_ERROR",
      message: isOperational
        ? processedError.message
        : isDevelopment
        ? processedError.message // Show real message in dev for debugging
        : "An unexpected error occurred. Please try again later.",
      // Include Joi validation details if present
      ...(processedError.code === "VALIDATION_ERROR" && {
        details: processedError.details || [],
      }),
      // Include stack trace only in development (never in production)
      ...(isDevelopment && !isOperational && { stack: processedError.stack }),
    },
  });
};

/**
 * notFoundHandler
 *
 * Catches requests to routes that don't exist and converts them to 404 errors.
 * Registered BEFORE errorHandler but AFTER all route definitions.
 */
const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, 404, "NOT_FOUND"));
};

module.exports = { errorHandler, notFoundHandler };
