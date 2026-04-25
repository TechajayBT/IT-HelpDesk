/**
 * Authentication & Authorization Middlewares
 *
 * authMiddleware   — Verifies the JWT in the Authorization header.
 *                   Attaches the decoded user to req.user.
 *                   Rejects if token is missing, malformed, or expired.
 *
 * authorize(roles) — Factory that creates a middleware checking req.user.role
 *                   against the list of allowed roles. Must run AFTER authMiddleware.
 *
 * The two middlewares are intentionally separate so that routes can be
 * authenticated (token required) without being role-restricted, and vice versa
 * is handled by combining them:
 *
 *   router.get("/me",          authMiddleware,               userController.getMe);
 *   router.post("/tickets",    authMiddleware, authorize(["requester", "agent"]), ...);
 *   router.get("/audit-logs",  authMiddleware, authorize(["admin"]),              ...);
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { AppError, asyncHandler } = require("../utils/errors");
const logger = require("../config/logger");

/**
 * authMiddleware
 *
 * 1. Reads the Authorization header (expects "Bearer <token>")
 * 2. Verifies the token with the JWT_SECRET
 * 3. Looks up the user in the DB to ensure the account still exists and is active
 * 4. Attaches the full user object to req.user
 */
const authMiddleware = asyncHandler(async (req, res, next) => {
  // ── Step 1: Extract token from header ────────────────────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.debug("Auth failed — missing or malformed Authorization header", {
      path: req.path,
      ip: req.ip,
    });
    throw new AppError("Authentication required. Please log in.", 401, "UNAUTHORIZED");
  }

  const token = authHeader.split(" ")[1];

  // ── Step 2: Verify token signature and expiry ─────────────────────────────
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtError) {
    if (jwtError.name === "TokenExpiredError") {
      logger.debug("Auth failed — token expired", { path: req.path });
      throw new AppError("Your session has expired. Please log in again.", 401, "TOKEN_EXPIRED");
    }
    logger.debug("Auth failed — invalid token", {
      path: req.path,
      error: jwtError.message,
    });
    throw new AppError("Invalid authentication token.", 401, "INVALID_TOKEN");
  }

  // ── Step 3: Verify the user account still exists and is active ───────────
  // This catches cases like: user deleted after token was issued
  const user = await User.findById(decoded.userId).select("+isActive");

  if (!user) {
    logger.warn("Auth failed — token userId not found in DB", {
      userId: decoded.userId,
      path: req.path,
    });
    throw new AppError("The user associated with this token no longer exists.", 401, "USER_NOT_FOUND");
  }

  if (!user.isActive) {
    logger.warn("Auth failed — inactive user attempted access", {
      userId: user._id,
      email: user.email,
    });
    throw new AppError("Your account has been deactivated. Please contact support.", 403, "ACCOUNT_INACTIVE");
  }

  // ── Step 4: Attach user to request ───────────────────────────────────────
  req.user = user;

  logger.debug("Auth successful", {
    userId: user._id,
    role: user.role,
    path: req.path,
  });

  next();
});

/**
 * authorize
 *
 * Factory function that returns a middleware. Checks that req.user.role is
 * included in the provided roles array. Always run AFTER authMiddleware.
 *
 * @param {string[]} roles - Allowed roles e.g. ["admin", "agent"]
 * @returns {import("express").RequestHandler}
 */
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required.", 401, "UNAUTHORIZED"));
    }
    if (!roles.includes(req.user.role)) {
      logger.warn("Authorization failed — insufficient role", {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
      });
      return next(new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN"));
    }
    logger.debug("Authorization successful", { userId: req.user._id, role: req.user.role, path: req.path });
    next();
  };
};

/**
 * ticketOwnerOrAgent
 *
 * Middleware that verifies the requesting user is either the ticket's requester
 * or has an elevated role (agent/admin). Used on ticket detail endpoints.
 *
 * Assumes req.ticket has been populated by a prior middleware or the controller.
 * For routes where the ticket isn't pre-fetched, the controller should do the check.
 */
const ticketOwnerOrAgent = (req, res, next) => {
  const { user, ticket } = req;

  if (!ticket) {
    // Guard: should never happen if route ordering is correct
    throw new AppError("Ticket not found in request context.", 500, "INTERNAL_ERROR");
  }

  const isOwner = ticket.requester.toString() === user._id.toString();
  const isPrivileged = ["agent", "admin"].includes(user.role);

  if (!isOwner && !isPrivileged) {
    logger.warn("Ticket access denied — not owner or agent", {
      userId: user._id,
      ticketId: ticket._id,
    });
    throw new AppError("You do not have access to this ticket.", 403, "FORBIDDEN");
  }

  next();
};

module.exports = { authMiddleware, authorize, ticketOwnerOrAgent };
