/**
 * Server Entry Point
 *
 * Responsibilities:
 * 1. Load environment variables from .env
 * 2. Connect to MongoDB (fail-fast if unavailable)
 * 3. Start the Express HTTP server
 * 4. Handle unhandled promise rejections and uncaught exceptions
 *    (last resort error handlers — these should almost never fire if the app
 *    is written correctly with asyncHandler wrappers)
 *
 * Why separate from app.js?
 * app.js creates the Express app without starting a server. This lets
 * integration tests import app.js and use supertest without binding
 * to a real port, making tests faster and avoiding port conflicts.
 */

require("dotenv").config(); // Load .env FIRST — before any other require that reads process.env

const app = require("./app");
const connectDB = require("./config/database");
const logger = require("./config/logger");

const PORT = parseInt(process.env.PORT) || 5000;

/**
 * startServer
 *
 * Connects to MongoDB first, then starts Express.
 * If MongoDB connection fails, process.exit(1) is called inside connectDB,
 * so this function effectively won't reach the listen() call.
 */
const startServer = async () => {
  logger.info("Starting IT Helpdesk API server...", {
    environment: process.env.NODE_ENV,
    port: PORT,
  });

  // Connect to MongoDB — this will exit(1) on failure
  await connectDB();

  // Start Express HTTP server
  const server = app.listen(PORT, () => {
    logger.info("Server is running", {
      port: PORT,
      url: `http://localhost:${PORT}`,
      healthCheck: `http://localhost:${PORT}/health`,
      environment: process.env.NODE_ENV,
    });
  });

  // ── Unhandled Rejection Handler ─────────────────────────────────────────
  // Catches any Promise that rejects without a .catch() handler.
  // This is a safety net — proper async handlers should never let this fire.
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Promise Rejection — shutting down", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
    // Graceful shutdown: stop accepting new connections, finish existing ones
    server.close(() => {
      logger.info("HTTP server closed after unhandled rejection");
      process.exit(1);
    });
  });

  // ── Uncaught Exception Handler ──────────────────────────────────────────
  // Catches synchronous errors that weren't caught by any try/catch.
  // After an uncaught exception the process state is undefined — always exit.
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception — shutting down immediately", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  return server;
};

startServer();
