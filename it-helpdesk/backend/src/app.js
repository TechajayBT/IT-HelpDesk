/**
 * Express Application Setup
 *
 * This file creates and configures the Express app WITHOUT starting the server.
 * The app is exported so it can be imported by:
 *   - server.js   → binds to a port and starts listening
 *   - tests       → creates an in-memory server without binding to a port
 *
 * Middleware registration order matters:
 * 1. Security headers (helmet)
 * 2. CORS
 * 3. Rate limiting
 * 4. Request parsing (JSON, URL-encoded)
 * 5. HTTP request logging (morgan)
 * 6. MongoDB sanitization
 * 7. Routes
 * 8. 404 handler
 * 9. Global error handler (LAST)
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");

const logger = require("./config/logger");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

// ── Route modules ─────────────────────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const agentRoutes = require("./routes/agentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const attachmentRoutes = require("./routes/attachmentRoutes");
const { boolean } = require("joi");

const app = express();

// ── 1. Security headers ───────────────────────────────────────────────────────
// helmet sets various HTTP headers to protect against common web vulnerabilities
// (XSS, clickjacking, MIME-sniffing, etc.)
app.use(helmet());

// ── 2. CORS ───────────────────────────────────────────────────────────────────
// Allow the React dev server and production client to make cross-origin requests.
// In production, restrict `origin` to the exact deployed frontend URL.
const allowedOrigins = [
  "http://localhost:3000",
  "https://it-help-desk-sepia.vercel.app/",          
  process.env.CLIENT_URL,
].filter(url => typeof url === "string" && url.length > 0);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight requests
app.options("*", cors());
app.options("*", cors());

// ── 3. Rate limiting ──────────────────────────────────────────────────────────
// Limits each IP to 100 requests per 15 minutes on all /api routes.
// Auth endpoints have a stricter limit (configured separately below).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    },
  },
  standardHeaders: true,  // Return RateLimit-* headers
  legacyHeaders: false,
});

// Stricter limiter for auth endpoints to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login/register attempts per 15 min per IP
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again in 15 minutes.",
    },
  },
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);

// ── 4. Request body parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));         // Parse JSON bodies; reject oversized bodies
app.use(express.urlencoded({ extended: true }));   // Parse URL-encoded form bodies

// ── 5. Gzip compression ───────────────────────────────────────────────────────
app.use(compression());

// ── 6. HTTP request logging ───────────────────────────────────────────────────
// morgan logs each HTTP request. In development use the colorful "dev" format.
// In production use "combined" (Apache-style) for structured log aggregation.
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
      // Stream morgan output through winston so all logs go to the same destination
      stream: {
        write: (message) => logger.http(message.trim()),
      },
    })
  );
}

// ── 7. MongoDB injection sanitization ────────────────────────────────────────
// Strips out MongoDB operators ($, .) from request bodies and query strings
// to prevent NoSQL injection attacks.
app.use(mongoSanitize());

// ── 8. Health check (before auth — doesn't need a token) ─────────────────────
// Used by load balancers, Docker health checks, and CI/CD pipeline checks
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    },
  });
});

// ── 9. API Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/attachments", attachmentRoutes);
app.use("/api", dashboardRoutes); // Dashboard routes mount at /api directly (paths include /dashboard, /reports, /audit-logs)

// ── 10. 404 handler ────────────────────────────────────────────────────────────
// Catches any request that didn't match a defined route
app.use(notFoundHandler);

// ── 11. Global error handler ───────────────────────────────────────────────────
// MUST be the last middleware registered. Express identifies error handlers
// by the 4-argument signature (err, req, res, next).
app.use(errorHandler);

module.exports = app;
