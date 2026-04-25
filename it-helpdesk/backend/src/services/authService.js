/**
 * Auth Service
 *
 * Contains all business logic for authentication operations.
 * Controllers are thin — they call service methods and send responses.
 * Services contain the "how" of each operation.
 *
 * Service layer responsibilities:
 * - Interact with the User model
 * - Sign and verify JWTs
 * - Throw AppErrors for domain rule violations
 * - No HTTP concerns (no req/res/status codes)
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { AppError } = require("../utils/errors");
const logger = require("../config/logger");

/**
 * generateToken
 *
 * Creates a signed JWT for the given user.
 * The payload contains only what the frontend needs to bootstrap its state:
 * userId, email, and role. We avoid putting sensitive data in the token
 * because the payload is only base64-encoded (not encrypted).
 *
 * @param {Object} user - Mongoose User document
 * @returns {string}    - Signed JWT string
 */
const generateToken = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    issuer: "it-helpdesk-api",
  });
};

/**
 * registerUser
 *
 * Creates a new user account with default role 'requester'.
 * Throws AppError if the email is already registered.
 *
 * Why check for duplicates manually instead of relying on MongoDB's unique index?
 * Because MongoDB returns a confusing error (code 11000) that we'd have to parse.
 * An explicit check lets us give a clear, predictable error message.
 *
 * @param {Object} userData - Validated registration payload
 * @returns {{ user: Object, token: string }}
 */
const registerUser = async (userData) => {
  const { firstName, lastName, email, password, role } = userData;

  // ── Duplicate email check ─────────────────────────────────────────────────
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    logger.warn("Registration attempt with existing email", { email });
    throw new AppError(
      "An account with this email address already exists.",
      409,
      "DUPLICATE_EMAIL"
    );
  }

  // ── Create user ───────────────────────────────────────────────────────────
  // Password hashing happens in the pre-save hook on the User model.
  // We do NOT hash here to keep this concern encapsulated in the model.
  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    role: role || "requester",
    lastLoginAt: new Date(), // Auto-login after registration
  });

  logger.info("New user registered", {
    userId: user._id,
    email: user.email,
    role: user.role,
  });

  const token = generateToken(user);

  return { user: user.toSafeObject(), token };
};

/**
 * loginUser
 *
 * Authenticates a user by email/password and returns a JWT.
 *
 * Security note: We return the same error message for "email not found" and
 * "wrong password" to prevent user enumeration attacks.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ user: Object, token: string }}
 */
const loginUser = async (email, password) => {
  // ── Find user — explicitly select password (excluded by default) ──────────
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    logger.debug("Login failed — email not found", { email });
    // Generic message to prevent user enumeration
    throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  // ── Check account status ──────────────────────────────────────────────────
  if (!user.isActive) {
    logger.warn("Login attempt on inactive account", { email });
    throw new AppError(
      "Your account has been deactivated. Please contact support.",
      403,
      "ACCOUNT_INACTIVE"
    );
  }

  // ── Verify password ───────────────────────────────────────────────────────
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    logger.warn("Login failed — wrong password", { email });
    throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  // ── Update last login timestamp ───────────────────────────────────────────
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false }); // Skip full validation for this minor update

  logger.info("User logged in", {
    userId: user._id,
    email: user.email,
    role: user.role,
  });

  const token = generateToken(user);

  return { user: user.toSafeObject(), token };
};

/**
 * getUserById
 *
 * Fetches a user's profile by ID. Used by the /me endpoint.
 *
 * @param {string} userId - MongoDB ObjectId string
 * @returns {Object}      - Safe user object (no password)
 */
const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found.", 404, "USER_NOT_FOUND");
  }
  return user.toSafeObject();
};

module.exports = { generateToken, registerUser, loginUser, getUserById };
