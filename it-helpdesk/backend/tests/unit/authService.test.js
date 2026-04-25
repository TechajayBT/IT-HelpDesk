/**
 * Auth Service Unit Tests
 *
 * Tests authService business logic in complete isolation using Jest mocks.
 * No real MongoDB connection required — the User model is fully mocked.
 *
 * This approach is faster than integration tests and works in CI environments
 * that don't have MongoDB available. Integration tests with a real DB are
 * written separately and run against a test MongoDB instance.
 *
 * Coverage targets:
 * - registerUser: success, duplicate email
 * - loginUser: success, wrong password, inactive account, not found
 * - getUserById: success, not found
 * - generateToken: returns a signed JWT
 */

// ── Jest module mocks (must be before imports) ────────────────────────────────

// Mock the User model so no mongoose connection is needed
jest.mock("../../src/models/User");

// Mock logger to suppress output during tests
jest.mock("../../src/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const authService = require("../../src/services/authService");
const User = require("../../src/models/User");
const { AppError } = require("../../src/utils/errors");

// Set JWT secret for token generation tests
process.env.JWT_SECRET = "test_secret_that_is_long_enough_32chars";
process.env.JWT_EXPIRES_IN = "1d";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a mock User instance that mimics the real Mongoose document.
 * Each field maps to what the real User model returns.
 */
const makeMockUser = (overrides = {}) => {
  const base = {
    _id: "64abc123def456789012abcd",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    role: "requester",
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-01-01"),
    password: "$2b$12$hashedpassword",
    save: jest.fn().mockResolvedValue(true),
    comparePassword: jest.fn().mockResolvedValue(true),
    toSafeObject: jest.fn().mockReturnValue({
      _id: "64abc123def456789012abcd",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      role: "requester",
      isActive: true,
    }),
    ...overrides,
  };
  return base;
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE TOKEN
// ─────────────────────────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("should return a JWT string containing userId and role", () => {
    const user = makeMockUser();
    const token = authService.generateToken(user);

    // A JWT has exactly 3 parts separated by dots
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    // Decode the payload (middle segment is base64-encoded JSON)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8")
    );
    expect(payload.userId).toBe(user._id);
    expect(payload.email).toBe(user.email);
    expect(payload.role).toBe(user.role);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER USER
// ─────────────────────────────────────────────────────────────────────────────

describe("registerUser", () => {
  // Reset all mocks before each test so state doesn't bleed between tests
  beforeEach(() => jest.clearAllMocks());

  it("should create a new user and return user + token on success", async () => {
    const mockUser = makeMockUser();

    // findOne returns null → no duplicate email
    User.findOne.mockResolvedValue(null);
    // create returns the new mock user
    User.create.mockResolvedValue(mockUser);

    const result = await authService.registerUser({
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      password: "Test@1234",
      role: "requester",
    });

    // Should have called findOne with the provided email to check duplicates
    expect(User.findOne).toHaveBeenCalledWith({ email: "test@example.com" });
    // Should have created the user
    expect(User.create).toHaveBeenCalledTimes(1);
    // Should return a token string and safe user object
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("user");
    expect(typeof result.token).toBe("string");
  });

  it("should throw AppError 409 when email already exists", async () => {
    // Simulate existing user found
    User.findOne.mockResolvedValue(makeMockUser());

    await expect(
      authService.registerUser({
        firstName: "Dup",
        lastName: "User",
        email: "test@example.com",
        password: "Test@1234",
      })
    ).rejects.toThrow(AppError);

    await expect(
      authService.registerUser({
        firstName: "Dup",
        lastName: "User",
        email: "test@example.com",
        password: "Test@1234",
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_EMAIL" });

    // create should never be called when email exists
    expect(User.create).not.toHaveBeenCalled();
  });

  it("should default role to requester when not specified", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(makeMockUser());

    await authService.registerUser({
      firstName: "Test",
      lastName: "User",
      email: "new@example.com",
      password: "Test@1234",
    });

    // The create call should include role: "requester" (the default)
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "requester" })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN USER
// ─────────────────────────────────────────────────────────────────────────────

describe("loginUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("should return user and token on successful login", async () => {
    const mockUser = makeMockUser({
      comparePassword: jest.fn().mockResolvedValue(true),
    });

    // findOne with .select('+password') chain
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    const result = await authService.loginUser("test@example.com", "Test@1234");

    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("user");
    // save() should have been called to update lastLoginAt
    expect(mockUser.save).toHaveBeenCalledTimes(1);
  });

  it("should throw 401 when email is not found", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(
      authService.loginUser("nobody@example.com", "password")
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("should throw 401 when password is incorrect", async () => {
    const mockUser = makeMockUser({
      comparePassword: jest.fn().mockResolvedValue(false), // Wrong password
    });

    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    await expect(
      authService.loginUser("test@example.com", "WrongPassword")
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("should throw 403 when account is inactive", async () => {
    const mockUser = makeMockUser({
      isActive: false,
      comparePassword: jest.fn().mockResolvedValue(true),
    });

    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    await expect(
      authService.loginUser("test@example.com", "Test@1234")
    ).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_INACTIVE" });
  });

  it("should use the same error message for missing email and wrong password", async () => {
    // Both "user not found" and "wrong password" should return INVALID_CREDENTIALS
    // to prevent user enumeration attacks
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    let err1;
    try { await authService.loginUser("nobody@x.com", "pass"); }
    catch (e) { err1 = e; }

    const mockUser = makeMockUser({
      comparePassword: jest.fn().mockResolvedValue(false),
    });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

    let err2;
    try { await authService.loginUser("test@example.com", "wrongpass"); }
    catch (e) { err2 = e; }

    // Both errors should have the same message (prevents enumeration)
    expect(err1.message).toBe(err2.message);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY ID
// ─────────────────────────────────────────────────────────────────────────────

describe("getUserById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("should return safe user object when user exists", async () => {
    const mockUser = makeMockUser();
    User.findById.mockResolvedValue(mockUser);

    const result = await authService.getUserById("64abc123def456789012abcd");

    expect(User.findById).toHaveBeenCalledWith("64abc123def456789012abcd");
    expect(result).not.toHaveProperty("password");
    expect(result).toHaveProperty("email");
  });

  it("should throw AppError 404 when user does not exist", async () => {
    User.findById.mockResolvedValue(null);

    await expect(
      authService.getUserById("nonexistentid")
    ).rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
  });
});
