/**
 * Auth Controller
 *
 * Thin HTTP layer for authentication endpoints.
 * Each handler:
 *   1. Reads validated data from req.body (Joi middleware already ran)
 *   2. Delegates to authService for business logic
 *   3. Sends a consistent response via response helpers
 *
 * Controllers contain ZERO business logic — that lives in services.
 * This separation makes services easily unit-testable without an HTTP server.
 */

const authService = require("../services/authService");
const { sendSuccess, sendCreated } = require("../utils/response");
const { asyncHandler } = require("../utils/errors");
const logger = require("../config/logger");

/**
 * register
 *
 * POST /api/auth/register
 * Creates a new user account and returns a JWT for immediate auto-login.
 */
const register = asyncHandler(async (req, res) => {
  // req.body has already been validated and sanitized by the validate middleware
  const { user, token } = await authService.registerUser(req.body);

  logger.info("Registration endpoint: user created", {
    userId: user._id,
    email: user.email,
  });

  return sendCreated(res, {
    data: { user, token },
    message: "Account created successfully. Welcome!",
  });
});

/**
 * login
 *
 * POST /api/auth/login
 * Authenticates a user by email/password and returns a JWT.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { user, token } = await authService.loginUser(email, password);

  logger.info("Login endpoint: user authenticated", {
    userId: user._id,
    role: user.role,
  });

  return sendSuccess(res, {
    data: { user, token },
    message: "Login successful.",
  });
});

/**
 * logout
 *
 * POST /api/auth/logout
 *
 * With stateless JWTs there is no server-side session to invalidate.
 * The client is responsible for discarding the token.
 * This endpoint exists so the frontend can call a consistent "logout" URL
 * and for future compatibility if we add a token blacklist (Redis).
 *
 * In production you would store invalidated JTI (JWT ID) claims in Redis
 * with a TTL equal to the remaining token lifetime.
 */
const logout = asyncHandler(async (req, res) => {
  // Log the logout action for audit purposes
  logger.info("Logout endpoint: user logged out", {
    userId: req.user?._id,
  });

  return sendSuccess(res, {
    data: null,
    message: "Logged out successfully. Please discard your token.",
  });
});

/**
 * getMe
 *
 * GET /api/auth/me
 * Returns the authenticated user's profile.
 * Used by the frontend on page load to validate the session and restore user state.
 */
const getMe = asyncHandler(async (req, res) => {
  // req.user is attached by authMiddleware
  const user = await authService.getUserById(req.user._id);

  return sendSuccess(res, {
    data: { user },
    message: "Profile fetched successfully.",
  });
});

module.exports = { register, login, logout, getMe };
