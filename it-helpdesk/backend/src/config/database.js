/**
 * Database Configuration — MongoDB via Mongoose
 *
 * Responsibilities:
 * 1. Connect to MongoDB using the URI from environment variables
 * 2. Log all connection lifecycle events (connected, error, disconnected, reconnected)
 * 3. Gracefully disconnect on process termination signals
 *
 * Why separate from server.js?
 * Keeping DB logic isolated makes it easy to swap the data layer in tests
 * (e.g., swapping to mongodb-memory-server) without touching the server bootstrap.
 */

const mongoose = require("mongoose");
const logger = require("./logger");

/**
 * connectDB — Establish a connection to MongoDB.
 *
 * Uses a single connection pool managed by Mongoose. The function is async so
 * the server can await it before binding to a port, ensuring no requests are
 * served before the DB is ready.
 */
const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    logger.error("MONGODB_URI is not defined in environment variables");
    process.exit(1);
  }

  try {
    // ── Mongoose connection options ────────────────────────────────────────
    // serverSelectionTimeoutMS: how long to wait before giving up on initial
    //   connection. Default is 30s; we shorten to 10s for faster startup failures.
    const connection = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10_000,
    });

    logger.info("MongoDB connected", {
      host: connection.connection.host,
      dbName: connection.connection.name,
    });
  } catch (error) {
    logger.error("MongoDB initial connection failed", {
      error: error.message,
      mongoURI: mongoURI.replace(/\/\/.*@/, "//***@"), // Mask credentials in logs
    });
    // Exit with non-zero code so container orchestrators (K8s, Docker) know to restart
    process.exit(1);
  }
};

// ── Mongoose event listeners ─────────────────────────────────────────────────
// These fire on the default connection for the lifetime of the process.
// Logging here gives visibility into transient network blips in production.

mongoose.connection.on("error", (err) => {
  logger.error("MongoDB connection error", { error: err.message });
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected — Mongoose will attempt to reconnect");
});

mongoose.connection.on("reconnected", () => {
  logger.info("MongoDB reconnected successfully");
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Close the connection cleanly when the process receives a shutdown signal.
// This prevents "open handle" warnings in tests and data corruption in production.
const gracefulDisconnect = async (signal) => {
  logger.info(`Received ${signal} — closing MongoDB connection`);
  await mongoose.connection.close();
  logger.info("MongoDB connection closed");
  process.exit(0);
};

process.on("SIGINT", () => gracefulDisconnect("SIGINT"));
process.on("SIGTERM", () => gracefulDisconnect("SIGTERM"));

module.exports = connectDB;
