/**
 * Error Utilities
 *
 * Two exports:
 * 1. AppError — Operational error class. Thrown intentionally for expected
 *    failure cases (validation errors, not found, forbidden, etc.).
 *    Carries an HTTP status code so the error handler can respond correctly.
 *
 * 2. asyncHandler — Higher-order function that wraps async route handlers.
 *    Without this wrapper, unhandled promise rejections in async controllers
 *    would crash the process instead of being caught by the error middleware.
 *
 * Usage:
 *   throw new AppError("Ticket not found", 404);
 *   router.get("/tickets", asyncHandler(ticketController.list));
 */

/**
 * AppError
 *
 * All intentional errors thrown in the application should be instances of
 * AppError. The global error handling middleware checks `error.isOperational`
 * to distinguish expected failures from programming bugs.
 */
class AppError extends Error {
  /**
   * @param {string} message   - Human-readable message sent to the client
   * @param {number} statusCode - HTTP status code (400, 401, 403, 404, 409, etc.)
   * @param {string} [code]    - Optional machine-readable code for client-side handling
   */
  constructor(message, statusCode, code = null) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;

    // isOperational = true means "this error was expected and handled".
    // The global error handler sends these to the client.
    // Non-operational errors (programming bugs) log a stack trace and return 500.
    this.isOperational = true;

    // Capture stack trace, excluding this constructor call from the trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * asyncHandler
 *
 * Wraps an async Express route handler and forwards any rejected promise
 * to Express's next() function so the global error middleware can handle it.
 *
 * Without this, an unhandled rejection in an async controller silently swallows
 * the error (Node < 15) or crashes the process (Node >= 15).
 *
 * @param {Function} fn - Async Express handler (req, res, next) => Promise
 * @returns {Function}  - Express middleware that catches async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { AppError, asyncHandler };
