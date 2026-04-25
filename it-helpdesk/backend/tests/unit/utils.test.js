/**
 * Utility Unit Tests
 *
 * Tests for:
 *   - src/utils/response.js  (sendSuccess, sendPaginated, sendCreated)
 *   - src/utils/errors.js    (AppError, asyncHandler)
 *   - src/utils/ticketStatus.js (all transition rules, TICKET_CATEGORIES)
 */

const { sendSuccess, sendPaginated, sendCreated } = require("../../src/utils/response");
const { AppError, asyncHandler } = require("../../src/utils/errors");
const {
  isValidTransition,
  getValidTransitions,
  VALID_TRANSITIONS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
} = require("../../src/utils/ticketStatus");

// ── Mock res helper ───────────────────────────────────────────────────────────
const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

describe("sendSuccess", () => {
  it("sends 200 with success=true and data", () => {
    const res = makeRes();
    const payload = { id: "abc", name: "Test" };

    sendSuccess(res, { data: payload, message: "Fetched successfully." });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual(payload);
    expect(body.message).toBe("Fetched successfully.");
  });

  it("uses 200 as default status code", () => {
    const res = makeRes();
    sendSuccess(res, {});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("accepts a custom status code", () => {
    const res = makeRes();
    sendSuccess(res, { statusCode: 204 });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("sendCreated", () => {
  it("sends 201 with success=true", () => {
    const res = makeRes();
    sendCreated(res, { data: { _id: "new-id" }, message: "Created." });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});

describe("sendPaginated", () => {
  it("includes pagination metadata in the response", () => {
    const res = makeRes();
    sendPaginated(res, {
      data: [1, 2, 3],
      page: 2,
      limit: 3,
      totalItems: 10,
      message: "List fetched.",
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(3);
    expect(body.pagination.totalItems).toBe(10);
    expect(body.pagination.totalPages).toBe(4); // ceil(10/3) = 4
    expect(body.pagination.hasNextPage).toBe(true);
    expect(body.pagination.hasPrevPage).toBe(true);
  });

  it("computes hasNextPage=false on the last page", () => {
    const res = makeRes();
    sendPaginated(res, { data: [], page: 3, limit: 10, totalItems: 25 });
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.hasNextPage).toBe(false);
    expect(body.pagination.hasPrevPage).toBe(true);
  });

  it("computes hasPrevPage=false on the first page", () => {
    const res = makeRes();
    sendPaginated(res, { data: [], page: 1, limit: 10, totalItems: 50 });
    const body = res.json.mock.calls[0][0];
    expect(body.pagination.hasPrevPage).toBe(false);
    expect(body.pagination.hasNextPage).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// APP ERROR
// ─────────────────────────────────────────────────────────────────────────────

describe("AppError", () => {
  it("creates an error with statusCode, code, and isOperational=true", () => {
    const err = new AppError("Not found", 404, "NOT_FOUND");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.isOperational).toBe(true);
  });

  it("captures a stack trace", () => {
    const err = new AppError("Test error", 500, "TEST");
    expect(err.stack).toBeDefined();
    // Error.captureStackTrace produces a stack starting with the message line,
    // not the class name — so we just verify it is a non-empty string
    expect(typeof err.stack).toBe("string");
    expect(err.stack.length).toBeGreaterThan(0);
    expect(err.stack).toContain("Test error");
  });

  it("works without a code argument", () => {
    const err = new AppError("Simple error", 400);
    expect(err.code).toBeNull();
    expect(err.statusCode).toBe(400);
  });

  it("standard Error instances are NOT operational", () => {
    const err = new Error("Unexpected crash");
    expect(err.isOperational).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ASYNC HANDLER
// ─────────────────────────────────────────────────────────────────────────────

describe("asyncHandler", () => {
  it("calls next(error) when the wrapped function rejects", async () => {
    const error = new AppError("Test error", 500, "TEST");
    const rejectingHandler = jest.fn().mockRejectedValue(error);
    const next = jest.fn();

    const wrapped = asyncHandler(rejectingHandler);
    await wrapped({}, {}, next);

    // Wait for the microtask queue to flush the catch handler
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(error);
  });

  it("does NOT call next(error) when the wrapped function resolves", async () => {
    const successHandler = jest.fn().mockResolvedValue("ok");
    const next = jest.fn();

    const wrapped = asyncHandler(successHandler);
    await wrapped({}, {}, next);
    await Promise.resolve();

    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TICKET STATUS RULES
// ─────────────────────────────────────────────────────────────────────────────

describe("VALID_TRANSITIONS map", () => {
  it("covers all 5 canonical states as keys", () => {
    const states = ["Created", "Assigned", "Started", "Completed", "Blocked"];
    states.forEach((state) => {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
    });
  });

  it("Completed has no outgoing transitions (terminal)", () => {
    expect(VALID_TRANSITIONS.Completed).toEqual([]);
  });
});

describe("isValidTransition", () => {
  // Every valid edge in the state machine
  const validCases = [
    ["Created",  "Assigned"],
    ["Created",  "Blocked"],
    ["Assigned", "Started"],
    ["Assigned", "Blocked"],
    ["Started",  "Completed"],
    ["Started",  "Blocked"],
    ["Blocked",  "Started"],
  ];

  test.each(validCases)(
    "returns true for valid transition: %s → %s",
    (from, to) => expect(isValidTransition(from, to)).toBe(true)
  );

  // Invalid / skipped transitions
  const invalidCases = [
    ["Created",   "Started"],    // Cannot skip Assigned
    ["Created",   "Completed"],  // Cannot skip to terminal
    ["Assigned",  "Completed"],  // Cannot skip Started
    ["Completed", "Created"],    // Terminal — no exit
    ["Completed", "Assigned"],   // Terminal — no exit
    ["Blocked",   "Completed"],  // Must go through Started first
    ["Blocked",   "Created"],    // Not a valid resume path
  ];

  test.each(invalidCases)(
    "returns false for invalid transition: %s → %s",
    (from, to) => expect(isValidTransition(from, to)).toBe(false)
  );

  it("returns false for unknown status", () => {
    expect(isValidTransition("Unknown", "Created")).toBe(false);
    expect(isValidTransition("Created", "Unknown")).toBe(false);
  });
});

describe("getValidTransitions", () => {
  it("returns array of valid next states for each status", () => {
    expect(getValidTransitions("Created")).toContain("Assigned");
    expect(getValidTransitions("Assigned")).toContain("Started");
    expect(getValidTransitions("Started")).toContain("Completed");
    expect(getValidTransitions("Blocked")).toContain("Started");
  });

  it("returns empty array for Completed", () => {
    expect(getValidTransitions("Completed")).toEqual([]);
  });

  it("returns empty array for unknown status", () => {
    expect(getValidTransitions("Unknown")).toEqual([]);
  });
});

describe("STATUS_LABELS", () => {
  it("has a human-readable label for every canonical status", () => {
    const statuses = ["Created", "Assigned", "Started", "Completed", "Blocked"];
    statuses.forEach((s) => {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(typeof STATUS_LABELS[s]).toBe("string");
    });
  });
});

describe("TICKET_CATEGORIES", () => {
  it("has at least 6 categories matching the assignment spec", () => {
    const expectedCategories = [
      "Hardware",
      "Software",
      "Network/VPN",
      "Email/Collaboration",
      "Access & Permissions",
      "Other",
    ];
    expectedCategories.forEach((cat) => {
      expect(TICKET_CATEGORIES).toHaveProperty(cat);
    });
  });

  it("each category has at least 2 subcategories", () => {
    Object.entries(TICKET_CATEGORIES).forEach(([category, subcategories]) => {
      expect(Array.isArray(subcategories)).toBe(true);
      expect(subcategories.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("Hardware category includes laptop and desktop options", () => {
    const hardwareSubs = TICKET_CATEGORIES["Hardware"];
    const text = hardwareSubs.join(" ").toLowerCase();
    expect(text).toContain("laptop");
    expect(text).toContain("desktop");
  });
});
