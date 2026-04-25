/**
 * Auth Integration Tests
 *
 * Tests the full HTTP request → middleware → controller → service → DB → response
 * cycle for authentication endpoints.
 *
 * Uses:
 * - mongodb-memory-server: in-memory MongoDB, no external DB required
 * - supertest: makes HTTP requests against the Express app without binding a port
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../../src/app");
const User = require("../../src/models/User");

let mongoServer;

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Start in-memory MongoDB instance (no real DB needed)
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean up all collections after each test to ensure isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── Test data ─────────────────────────────────────────────────────────────────

const validUser = {
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  password: "Test@1234",
  confirmPassword: "Test@1234",
};

// ── Registration tests ────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("should register a new user and return token", async () => {
    const res = await request(app).post("/api/auth/register").send(validUser);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data.user).toHaveProperty("_id");
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.role).toBe("requester"); // Default role
    // Password must NOT be in the response
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("should reject registration with existing email", async () => {
    // First registration
    await request(app).post("/api/auth/register").send(validUser);

    // Second registration with same email
    const res = await request(app).post("/api/auth/register").send(validUser);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("DUPLICATE_EMAIL");
  });

  it("should reject invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validUser, email: "not-an-email" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should reject weak password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validUser, password: "weak", confirmPassword: "weak" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should reject mismatched confirm password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validUser, confirmPassword: "Different@1234" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should reject missing required fields", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@test.com" }); // Missing firstName, lastName, password

    expect(res.statusCode).toBe(400);
  });
});

// ── Login tests ───────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    // Register a user before each login test
    await request(app).post("/api/auth/register").send(validUser);
  });

  it("should login successfully with valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: validUser.email,
      password: validUser.password,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("should reject login with wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: validUser.email,
      password: "WrongPassword@1",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("should reject login with non-existent email", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@example.com",
      password: validUser.password,
    });

    expect(res.statusCode).toBe(401);
    // Same error message to prevent user enumeration
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("should reject login with invalid email format", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "not-an-email",
      password: validUser.password,
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── /me endpoint tests ────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  let token;

  beforeEach(async () => {
    const res = await request(app).post("/api/auth/register").send(validUser);
    token = res.body.data.token;
  });

  it("should return current user profile with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
  });

  it("should reject request without token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("should reject request with malformed token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer this.is.invalid");

    expect(res.statusCode).toBe(401);
  });
});
