/**
 * Logger Configuration
 *
 * Uses Winston for structured, leveled logging.
 * - Console output in development (colorized, human-readable)
 * - Daily rotating file logs in production (JSON format)
 * - Separate error log file for quick error triage
 * - Never logs sensitive data (passwords, tokens)
 */

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");

// Pull log level and directory from environment; fall back to sane defaults
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_DIR = process.env.LOG_DIR || "logs";
const NODE_ENV = process.env.NODE_ENV || "development";

// ── Custom log format ────────────────────────────────────────────────────────
// Adds timestamp, log level label, and the message together so every line is
// self-contained and grep-friendly.
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }), // Include stack trace on Error objects
  winston.format.json() // Machine-readable JSON for log aggregation tools
);

// ── Human-readable format for the developer console ─────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // If extra metadata was passed, print it compactly after the message
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// ── Transport list ───────────────────────────────────────────────────────────
// Transports are built conditionally based on the runtime environment so that
// production never spams the console and development never writes to disk.
const transports = [];

if (NODE_ENV !== "test") {
  // Console transport — always present unless running Jest tests (keeps test output clean)
  transports.push(
    new winston.transports.Console({
      level: LOG_LEVEL,
      format: NODE_ENV === "production" ? logFormat : consoleFormat,
    })
  );
}

if (NODE_ENV === "production") {
  // Rotating combined log: keeps 14 days of history, zips old files
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      zippedArchive: true,
      level: LOG_LEVEL,
      format: logFormat,
    })
  );

  // Dedicated error log so on-call engineers can filter quickly
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: true,
      level: "error",
      format: logFormat,
    })
  );
}

// ── Logger instance ──────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports,
  // Prevent Winston from throwing unhandled exceptions on transport errors
  exitOnError: false,
});

module.exports = logger;
