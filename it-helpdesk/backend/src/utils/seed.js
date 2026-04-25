/**
 * Database Seed Script
 *
 * Populates the database with initial data required for the application to work:
 * - Admin user (for system administration)
 * - Sample agent user (for testing agent workflows)
 * - Sample requester (for testing requester workflows)
 *
 * Usage:
 *   npm run seed
 *   NODE_ENV=development node src/utils/seed.js
 *
 * Idempotent: checks for existing records before inserting to avoid duplicates.
 * Safe to run multiple times.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const logger = require("../config/logger");

// ── Seed data definitions ─────────────────────────────────────────────────────
// IMPORTANT: Change these passwords in a real deployment.
// These are intentionally weak for demo purposes.

const seedUsers = [
  {
    firstName: "System",
    lastName: "Admin",
    email: "admin@helpdesk.com",
    password: "Admin@1234",
    role: "admin",
    isActive: true,
  },
  {
    firstName: "John",
    lastName: "Agent",
    email: "agent@helpdesk.com",
    password: "Agent@1234",
    role: "agent",
    isActive: true,
  },
  {
    firstName: "Jane",
    lastName: "Requester",
    email: "requester@helpdesk.com",
    password: "Requester@1234",
    role: "requester",
    isActive: true,
  },
];

/**
 * seedDatabase
 *
 * Connects to MongoDB, inserts seed data if not already present, then disconnects.
 */
const seedDatabase = async () => {
  try {
    logger.info("Connecting to MongoDB for seeding...");
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info("MongoDB connected for seeding");

    // ── Seed users ──────────────────────────────────────────────────────────
    logger.info("Seeding users...");
    let createdCount = 0;
    let skippedCount = 0;

    for (const userData of seedUsers) {
      const existingUser = await User.findOne({ email: userData.email });

      if (existingUser) {
        logger.info(`User already exists — skipping: ${userData.email}`);
        skippedCount++;
        continue;
      }

      // Create user — password hashing happens in the pre-save hook
      await User.create(userData);
      logger.info(`User created: ${userData.email} (role: ${userData.role})`);
      createdCount++;
    }

    // ── Seed summary ────────────────────────────────────────────────────────
    logger.info("Seeding complete", {
      usersCreated: createdCount,
      usersSkipped: skippedCount,
    });

    logger.info("Seed credentials (for development only):");
    seedUsers.forEach(({ email, password, role }) => {
      logger.info(`  [${role}] ${email} / ${password}`);
    });

  } catch (error) {
    logger.error("Seeding failed", { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed after seeding");
    process.exit(0);
  }
};

seedDatabase();
