/**
 * Middleware Unit Tests
 *
 * Tests each middleware in isolation by building minimal mock req/res/next objects.
 * No HTTP server or DB needed.
 *
 * Covers:
 * - authMiddleware: valid token, missing header, expired token, inactive user
 * - authorize: allowed role, forbidden role
 * - validate: valid body passes through, invalid body calls next(AppError)
 * - errorHandler: formats AppError correctly, formats Mongoose errors, hides internals
 */

jest.mock("../../src/models/User");
jest.mock("../../src/config/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const User = require("../../src/models/User");
const { authMiddleware, authorize } = require("../../src/middlewares/auth");
const validate = require("../../src/middlewares/validate");
const { errorHandler } = require("../../src/middlewares/errorHandler");
const { AppError } = require("../../src/utils/errors");
const Joi = require("joi");

process.env.JWT_SECRET = "test_secret_that_is_long_enough_32chars";
process.env.NODE_ENV = "test";

// ── Mock helpers ──────────────────────────────────────────────────────────────

const makeReq = (overrides = {}) => ({
  headers: {},
  path: "/test",
  method: "GET",
  ip: "127.0.0.1",
  user: null,
  body: {},
  query: {},
  params: {},
  ...overrides,
});

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = {};
  return res;
};

const makeNext = () => jest.fn();

const makeToken = (payload = {}, expiresIn = "1d") =>
  jwt.sign(
    { userId: "user001", email: "test@test.com", role: "requester", ...payload },
    process.env.JWT_SECRET,
    { expiresIn }
  );

// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  beforeEach(() => jest.clearAllMocks());

  it("should attach user to req and call next() with a valid token", async () => {
    const mockUser = {
      _id: "user001",
      email: "test@test.com",
      role: "requester",
      isActive: true,
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

    const token = makeToken({ userId: "user001" });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res, next);

    // next() should be called with no arguments (no error)
    expect(next).toHaveBeenCalledWith();
    // User should be attached to req
    expect(req.user).toBe(mockUser);
  });

  it("should call next(AppError 401) when Authorization header is missing", async () => {
    const req = makeReq({ headers: {} });
    const next = makeNext();

    await authMiddleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(next.mock.calls[0][0].code).toBe("UNAUTHORIZED");
  });

  it("should call next(AppError 401) when token is malformed", async () => {
    const req = makeReq({ headers: { authorization: "Bearer not.a.valid.token" } });
    const next = makeNext();

    await authMiddleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("should call next(AppError 401 TOKEN_EXPIRED) when token has expired", async () => {
    // Create an already-expired token (expiresIn: 0 means immediate expiry)
    const expiredToken = jwt.sign(
      { userId: "user001", email: "t@t.com", role: "requester" },
      process.env.JWT_SECRET,
      { expiresIn: "1ms" }
    );

    // Wait 10ms to ensure it's expired
    await new Promise((r) => setTimeout(r, 10));

    const req = makeReq({ headers: { authorization: `Bearer ${expiredToken}` } });
    const next = makeNext();

    await authMiddleware(req, makeRes(), next);

    expect(next.mock.calls[0][0].code).toBe("TOKEN_EXPIRED");
  });

  it("should call next(AppError 401) when user no longer exists in DB", async () => {
    // findById returns a chain: .select() resolves to null (user deleted)
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const token = makeToken({ userId: "deleted-user" });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = makeNext();

    // authMiddleware is wrapped by asyncHandler which schedules next(err) as a
    // microtask via Promise.catch(). We must wait for all pending microtasks to
    // settle before asserting, which a plain await on the call already does since
    // asyncHandler returns the inner promise.
    await authMiddleware(req, makeRes(), next);
    // Flush remaining microtasks (bcrypt/mongoose chain may add extra ticks)
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("USER_NOT_FOUND");
  });

  it("should call next(AppError 403) when user account is inactive", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: "u1", isActive: false }),
    });

    const token = makeToken();
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = makeNext();

    await authMiddleware(req, makeRes(), next);
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("ACCOUNT_INACTIVE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZE MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe("authorize", () => {
  it("should call next() when user role is in allowed roles", () => {
    const req = makeReq({ user: { _id: "u1", role: "agent" } });
    const next = makeNext();

    authorize(["agent", "admin"])(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(); // No error argument
  });

  it("should call next(AppError 403) when role is not allowed", () => {
    const req = makeReq({ user: { _id: "u1", role: "requester" } });
    const next = makeNext();

    authorize(["agent", "admin"])(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(next.mock.calls[0][0].code).toBe("FORBIDDEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe("validate middleware", () => {
  const testSchema = Joi.object({
    name: Joi.string().required(),
    age: Joi.number().integer().min(1).default(18),
  });

  it("should call next() and coerce defaults when body is valid", () => {
    const req = makeReq({ body: { name: "Alice" } }); // age missing — has default
    const next = makeNext();

    validate(testSchema)(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(); // No error
    // Joi should have applied the default value
    expect(req.body.age).toBe(18);
  });

  it("should call next(AppError 400) when required field is missing", () => {
    const req = makeReq({ body: { age: 25 } }); // name missing
    const next = makeNext();

    validate(testSchema)(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
  });

  it("should validate query params when source='query'", () => {
    const schema = Joi.object({ page: Joi.number().default(1) });
    const req = makeReq({ query: {} });
    const next = makeNext();

    validate(schema, "query")(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query.page).toBe(1); // default applied
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLER MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe("errorHandler", () => {
  it("should return AppError statusCode and message", () => {
    const err = new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");
    const req = makeReq();
    const res = makeRes();

    errorHandler(err, req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "TICKET_NOT_FOUND",
          message: "Ticket not found",
        }),
      })
    );
  });

  it("should return 500 for non-operational errors", () => {
    const err = new Error("Unexpected crash");
    const req = makeReq();
    const res = makeRes();

    errorHandler(err, req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("should handle Mongoose CastError (invalid ObjectId)", () => {
    const castError = new Error("Cast to ObjectId failed");
    castError.name = "CastError";
    castError.path = "_id";
    castError.value = "not-a-valid-id";

    const res = makeRes();
    errorHandler(castError, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(400);
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.error.code).toBe("INVALID_ID");
  });

  it("should handle MongoDB duplicate key error (code 11000)", () => {
    const dupError = new Error("E11000 duplicate key error");
    dupError.code = 11000;
    dupError.keyValue = { email: "test@test.com" };

    const res = makeRes();
    errorHandler(dupError, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe("DUPLICATE_KEY");
  });

  it("should hide error message from client for non-operational errors in test env", () => {
    // NODE_ENV=test is not 'development', so internal message should be hidden
    const err = new Error("Database internal error with sensitive info");
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    const responseBody = res.json.mock.calls[0][0];
    // The raw message should NOT appear in test/production
    expect(responseBody.error.message).not.toBe("Database internal error with sensitive info");
  });
});
