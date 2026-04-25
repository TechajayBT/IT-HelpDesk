/**
 * User Model
 *
 * Represents a platform user. A user can be a Requester, Agent, or Admin.
 * The role field drives all RBAC decisions throughout the application.
 *
 * Security practices applied:
 * - Passwords are hashed with bcrypt (cost factor 12) in a pre-save hook
 * - The `password` field is excluded from query results by default (select: false)
 * - comparePassword() is an instance method so controllers never touch raw hash
 *
 * Indexes:
 * - email: unique sparse index for fast login lookups
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ── Sub-schema: profile information ─────────────────────────────────────────
// Separated for readability; keeps the main schema focused on auth fields
const userSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    // select: false means password is NEVER returned unless explicitly requested
    // via .select('+password') — prevents accidental exposure in API responses
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },

    // ── RBAC ─────────────────────────────────────────────────────────────────
    // Role controls what API endpoints and UI sections the user can access.
    // Default is 'requester'; only admins can elevate to 'agent' or 'admin'.
    role: {
      type: String,
      enum: {
        values: ["requester", "agent", "admin"],
        message: "Role must be one of: requester, agent, admin",
      },
      default: "requester",
    },

    // ── Account state ─────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },

    // Tracks when the user last successfully authenticated (useful for security audits)
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    // ── Schema options ─────────────────────────────────────────────────────
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    toJSON: {
      // Transform output: remove password and __v from JSON responses
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// The email index is unique; searching by email (login) is the hottest query

userSchema.index({ role: 1 }); // For admin user listing queries

// ── Virtual: fullName ────────────────────────────────────────────────────────
// Computed field that concatenates firstName + lastName without storing it
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Pre-save hook: hash password ─────────────────────────────────────────────
// Only runs when the password field is actually modified, so updates to other
// fields (e.g., role, lastLoginAt) do NOT re-hash an already-hashed password.
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  // bcrypt cost factor 12 is a good balance between security and performance
  // (≈300ms on a modern server; increases cracking time exponentially)
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance method: comparePassword ────────────────────────────────────────
// Controllers call this instead of bcrypt directly so the hashing algorithm
// is encapsulated in the model. Swap bcrypt for argon2 here without touching
// controller code.
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Instance method: toSafeObject ────────────────────────────────────────────
// Returns a plain object suitable for embedding in JWT payload or API response.
// Explicitly picks fields to prevent accidentally leaking new fields added later.
userSchema.methods.toSafeObject = function () {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

const User = mongoose.model("User", userSchema);

module.exports = User;
