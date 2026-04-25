/**
 * Controller Unit Tests
 *
 * Controllers are thin HTTP adapters — they:
 *   1. Read validated data from req.body / req.params / req.query
 *   2. Call a service method
 *   3. Send a response via response helpers
 *
 * Testing strategy:
 * - Mock the service layer so controllers can be tested in isolation
 * - Provide minimal req/res/next mocks
 * - Verify correct service calls, response codes, and response shapes
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock("../../src/services/authService");
jest.mock("../../src/services/ticketService");
jest.mock("../../src/services/dashboardService");
jest.mock("../../src/models/AuditEvent");
jest.mock("../../src/models/Ticket");
jest.mock("../../src/config/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn(),
}));
jest.mock("../../src/config/multer", () => ({
  upload: { single: jest.fn(() => jest.fn()) },
  uploadConfig: { maxAttachments: 5, uploadDir: "uploads" },
}));

const authController    = require("../../src/controllers/authController");
const ticketController  = require("../../src/controllers/ticketController");
const dashboardController = require("../../src/controllers/dashboardController");
const authService       = require("../../src/services/authService");
const ticketService     = require("../../src/services/ticketService");
const dashboardService  = require("../../src/services/dashboardService");
const AuditEvent        = require("../../src/models/AuditEvent");

// ── Test helpers ──────────────────────────────────────────────────────────────

const makeReq = (overrides = {}) => ({
  body: {}, params: {}, query: {}, user: null,
  headers: {}, path: "/test", method: "GET",
  file: null,
  ...overrides,
});

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.locals = {};
  return res;
};

const makeNext = () => jest.fn();

// Sample data
const MOCK_USER  = { _id: "u1", firstName: "Alice", lastName: "Test", email: "a@b.com", role: "requester" };
const MOCK_AGENT = { _id: "ag1", firstName: "Bob",   lastName: "Agent", email: "b@c.com", role: "agent" };
const MOCK_TOKEN = "header.payload.signature";
const MOCK_TICKET = {
  _id: "t1", ticketNumber: "TKT-00001", title: "Laptop broken",
  status: "Created", priority: "High", requester: MOCK_USER, assignee: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

describe("authController.register", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with user and token on success", async () => {
    authService.registerUser.mockResolvedValue({ user: MOCK_USER, token: MOCK_TOKEN });

    const req = makeReq({ body: { firstName: "Alice", email: "a@b.com", password: "Test@1234" } });
    const res = makeRes();

    await authController.register(req, res, makeNext());

    expect(authService.registerUser).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.user).toEqual(MOCK_USER);
    expect(body.data.token).toBe(MOCK_TOKEN);
  });

  it("calls next(error) when service throws", async () => {
    const error = new Error("Duplicate email");
    authService.registerUser.mockRejectedValue(error);

    const next = makeNext();
    await authController.register(makeReq(), makeRes(), next);
    await Promise.resolve(); // flush asyncHandler promise

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe("authController.login", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with user and token on successful login", async () => {
    authService.loginUser.mockResolvedValue({ user: MOCK_USER, token: MOCK_TOKEN });

    const req = makeReq({ body: { email: "a@b.com", password: "Test@1234" } });
    const res = makeRes();

    await authController.login(req, res, makeNext());

    expect(authService.loginUser).toHaveBeenCalledWith("a@b.com", "Test@1234");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});

describe("authController.getMe", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with current user profile", async () => {
    authService.getUserById.mockResolvedValue(MOCK_USER);

    const req = makeReq({ user: { _id: "u1" } });
    const res = makeRes();

    await authController.getMe(req, res, makeNext());

    expect(authService.getUserById).toHaveBeenCalledWith("u1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user).toEqual(MOCK_USER);
  });
});

describe("authController.logout", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 and a logout message", async () => {
    const req = makeReq({ user: { _id: "u1" } });
    const res = makeRes();

    await authController.logout(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TICKET CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

describe("ticketController.createTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with created ticket", async () => {
    ticketService.createTicket.mockResolvedValue(MOCK_TICKET);

    const req = makeReq({ body: { title: "Laptop broken" }, user: MOCK_USER });
    const res = makeRes();

    await ticketController.createTicket(req, res, makeNext());

    expect(ticketService.createTicket).toHaveBeenCalledWith(req.body, MOCK_USER);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.data.ticket).toEqual(MOCK_TICKET);
  });
});

describe("ticketController.getMyTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns paginated tickets for the authenticated user", async () => {
    ticketService.listRequesterTickets.mockResolvedValue({
      tickets: [MOCK_TICKET],
      totalItems: 1,
    });

    const req = makeReq({ query: { page: 1, limit: 10 }, user: MOCK_USER });
    const res = makeRes();

    await ticketController.getMyTickets(req, res, makeNext());

    expect(ticketService.listRequesterTickets).toHaveBeenCalledWith(MOCK_USER, req.query);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toHaveLength(1);
    expect(body.pagination.totalItems).toBe(1);
  });
});

describe("ticketController.getTicketById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with ticket details", async () => {
    ticketService.getTicketById.mockResolvedValue(MOCK_TICKET);

    const req = makeReq({ params: { id: "t1" }, user: MOCK_USER });
    const res = makeRes();

    await ticketController.getTicketById(req, res, makeNext());

    expect(ticketService.getTicketById).toHaveBeenCalledWith("t1", MOCK_USER);
    expect(res.json.mock.calls[0][0].data.ticket).toEqual(MOCK_TICKET);
  });

  it("calls next(error) when service throws", async () => {
    const { AppError } = require("../../src/utils/errors");
    ticketService.getTicketById.mockRejectedValue(new AppError("Not found", 404, "TICKET_NOT_FOUND"));

    const next = makeNext();
    await ticketController.getTicketById(makeReq({ params: { id: "bad" }, user: MOCK_USER }), makeRes(), next);
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});

describe("ticketController.getUnassignedTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns paginated unassigned tickets for agent queue", async () => {
    ticketService.listAgentQueue.mockResolvedValue({ tickets: [MOCK_TICKET], totalItems: 1 });

    const req = makeReq({ query: { page: 1, limit: 15 }, user: MOCK_AGENT });
    const res = makeRes();

    await ticketController.getUnassignedTickets(req, res, makeNext());

    expect(ticketService.listAgentQueue).toHaveBeenCalledWith(req.query);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("ticketController.assignToSelf", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with assigned ticket", async () => {
    const assignedTicket = { ...MOCK_TICKET, status: "Assigned", assignee: MOCK_AGENT };
    ticketService.assignTicketToSelf.mockResolvedValue(assignedTicket);

    const req = makeReq({ params: { id: "t1" }, user: MOCK_AGENT });
    const res = makeRes();

    await ticketController.assignToSelf(req, res, makeNext());

    expect(ticketService.assignTicketToSelf).toHaveBeenCalledWith("t1", MOCK_AGENT);
    expect(res.json.mock.calls[0][0].data.ticket.status).toBe("Assigned");
  });
});

describe("ticketController.startTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with started ticket", async () => {
    ticketService.startTicket.mockResolvedValue({ ...MOCK_TICKET, status: "Started" });

    const req = makeReq({ params: { id: "t1" }, user: MOCK_AGENT });
    const res = makeRes();

    await ticketController.startTicket(req, res, makeNext());

    expect(ticketService.startTicket).toHaveBeenCalledWith("t1", MOCK_AGENT);
    expect(res.json.mock.calls[0][0].data.ticket.status).toBe("Started");
  });
});

describe("ticketController.completeTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with completed ticket", async () => {
    const completedTicket = { ...MOCK_TICKET, status: "Completed", resolutionSummary: "Issue resolved." };
    ticketService.completeTicket.mockResolvedValue(completedTicket);

    const req = makeReq({
      params: { id: "t1" },
      body: { resolutionSummary: "Issue resolved." },
      user: MOCK_AGENT,
    });
    const res = makeRes();

    await ticketController.completeTicket(req, res, makeNext());

    expect(ticketService.completeTicket).toHaveBeenCalledWith("t1", MOCK_AGENT, "Issue resolved.");
    expect(res.json.mock.calls[0][0].data.ticket.status).toBe("Completed");
  });
});

describe("ticketController.blockTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with blocked ticket", async () => {
    ticketService.blockTicket.mockResolvedValue({ ...MOCK_TICKET, status: "Blocked" });

    const req = makeReq({ params: { id: "t1" }, body: { reason: "Waiting for vendor" }, user: MOCK_AGENT });
    const res = makeRes();

    await ticketController.blockTicket(req, res, makeNext());

    expect(ticketService.blockTicket).toHaveBeenCalledWith("t1", MOCK_AGENT, "Waiting for vendor");
  });
});

describe("ticketController.resumeTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with resumed ticket", async () => {
    ticketService.resumeTicket.mockResolvedValue({ ...MOCK_TICKET, status: "Started" });

    const req = makeReq({ params: { id: "t1" }, user: MOCK_AGENT });
    const res = makeRes();

    await ticketController.resumeTicket(req, res, makeNext());

    expect(ticketService.resumeTicket).toHaveBeenCalledWith("t1", MOCK_AGENT);
  });
});

describe("ticketController.addComment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with the new comment", async () => {
    const updatedTicket = {
      ...MOCK_TICKET,
      comments: [{ _id: "c1", body: "A comment", visibility: "public", author: MOCK_USER }],
    };
    ticketService.addComment.mockResolvedValue(updatedTicket);

    const req = makeReq({
      params: { id: "t1" },
      body: { body: "A comment", visibility: "public" },
      user: MOCK_USER,
    });
    const res = makeRes();

    await ticketController.addComment(req, res, makeNext());

    expect(ticketService.addComment).toHaveBeenCalledWith("t1", MOCK_USER, req.body);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("ticketController.uploadAttachment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with attachment metadata when file is provided", async () => {
    const mockAttachment = { _id: "att1", originalName: "test.pdf", size: 1024 };
    ticketService.addAttachment.mockResolvedValue(mockAttachment);

    const req = makeReq({
      params: { id: "t1" },
      user: MOCK_USER,
      file: { originalname: "test.pdf", filename: "uuid.pdf", mimetype: "application/pdf", size: 1024 },
    });
    const res = makeRes();

    await ticketController.uploadAttachment(req, res, makeNext());

    expect(ticketService.addAttachment).toHaveBeenCalledWith("t1", MOCK_USER, req.file);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("calls next(AppError 400) when no file is uploaded", async () => {
    const req = makeReq({ params: { id: "t1" }, user: MOCK_USER, file: null });
    const next = makeNext();

    await ticketController.uploadAttachment(req, makeRes(), next);
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].code).toBe("NO_FILE");
  });
});

describe("ticketController.unassignTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with unassigned ticket", async () => {
    ticketService.unassignTicket.mockResolvedValue({ ...MOCK_TICKET, assignee: null });

    const req = makeReq({
      params: { id: "t1" },
      body: { description: "Reassigning to a different agent" },
      user: MOCK_AGENT,
    });
    const res = makeRes();

    await ticketController.unassignTicket(req, res, makeNext());

    expect(ticketService.unassignTicket).toHaveBeenCalledWith("t1", MOCK_AGENT, "Reassigning to a different agent");
  });
});

describe("ticketController.getAssignedToMe", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns paginated tickets assigned to the requesting agent", async () => {
    ticketService.listAgentAssignedTickets.mockResolvedValue({ tickets: [MOCK_TICKET], totalItems: 1 });

    const req = makeReq({ query: { page: 1, limit: 10 }, user: MOCK_AGENT });
    const res = makeRes();

    await ticketController.getAssignedToMe(req, res, makeNext());

    expect(ticketService.listAgentAssignedTickets).toHaveBeenCalledWith(MOCK_AGENT, req.query);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

describe("dashboardController.getRequesterDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with requester stats", async () => {
    const stats = { total: 5, byStatus: { Created: 2, Completed: 3 } };
    dashboardService.getRequesterDashboard.mockResolvedValue(stats);

    const req = makeReq({ user: { _id: "u1" } });
    const res = makeRes();

    await dashboardController.getRequesterDashboard(req, res, makeNext());

    expect(dashboardService.getRequesterDashboard).toHaveBeenCalledWith("u1");
    expect(res.json.mock.calls[0][0].data).toEqual(stats);
  });
});

describe("dashboardController.getAgentDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with agent workload metrics", async () => {
    const stats = { assigned: 3, started: 1, completedToday: 2, unassignedInQueue: 7 };
    dashboardService.getAgentDashboard.mockResolvedValue(stats);

    const req = makeReq({ user: { _id: "ag1" } });
    const res = makeRes();

    await dashboardController.getAgentDashboard(req, res, makeNext());

    expect(dashboardService.getAgentDashboard).toHaveBeenCalledWith("ag1");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("dashboardController.getAdminDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with admin KPIs", async () => {
    const stats = { openCount: 42, unassignedCount: 8 };
    dashboardService.getAdminDashboard.mockResolvedValue(stats);

    const req = makeReq({ user: { _id: "admin1", role: "admin" } });
    const res = makeRes();

    await dashboardController.getAdminDashboard(req, res, makeNext());

    expect(dashboardService.getAdminDashboard).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data).toEqual(stats);
  });
});

describe("dashboardController.getTicketsByStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns status distribution report", async () => {
    dashboardService.getTicketsByStatus.mockResolvedValue([
      { status: "Created", count: 10 },
      { status: "Completed", count: 30 },
    ]);

    const res = makeRes();
    await dashboardController.getTicketsByStatus(makeReq(), res, makeNext());

    expect(res.json.mock.calls[0][0].data).toHaveLength(2);
  });
});

describe("dashboardController.getAuditLogs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls AuditEvent.find and countDocuments and returns 200", async () => {
    const mockLogs = [{ _id: "ev1", eventType: "ticket_created", actor: MOCK_USER }];
    const leanFn   = jest.fn().mockResolvedValue(mockLogs);
    const chain    = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(),
                       skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: leanFn };
    // Mutate the shared auto-mock object so the controller sees the same instance
    Object.assign(AuditEvent, {
      find:           jest.fn().mockReturnValue(chain),
      countDocuments: jest.fn().mockResolvedValue(1),
    });

    const req  = makeReq({ query: { page: 1, limit: 20 }, user: { _id: "admin1", role: "admin" } });
    const res  = makeRes();
    const next = makeNext();
    await dashboardController.getAuditLogs(req, res, next);
    await Promise.resolve(); // flush asyncHandler

    // If next was called with an error, log it to understand what went wrong
    if (next.mock.calls.length && next.mock.calls[0][0] instanceof Error) {
      throw next.mock.calls[0][0]; // re-throw so Jest shows the real cause
    }

    expect(AuditEvent.find).toHaveBeenCalled();
    expect(AuditEvent.countDocuments).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].pagination.totalItems).toBe(1);
  });
});

describe("dashboardController.getTicketHistory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns history events for an agent", async () => {
    const Ticket       = require("../../src/models/Ticket");
    const historyEvents = [{ _id: "ev1", eventType: "ticket_created" }];
    const leanFn       = jest.fn().mockResolvedValue(historyEvents);
    const chain        = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), lean: leanFn };

    // Mutate the shared auto-mock objects
    Object.assign(Ticket, {
      findById: jest.fn().mockResolvedValue({ _id: "t1", requester: { toString: () => "req001" } }),
    });
    Object.assign(AuditEvent, { find: jest.fn().mockReturnValue(chain) });

    const req  = makeReq({ params: { id: "t1" }, user: MOCK_AGENT });
    const res  = makeRes();
    const next = makeNext();
    await dashboardController.getTicketHistory(req, res, next);
    await Promise.resolve();

    if (next.mock.calls.length && next.mock.calls[0][0] instanceof Error) {
      throw next.mock.calls[0][0];
    }

    expect(Ticket.findById).toHaveBeenCalledWith("t1");
    expect(AuditEvent.find).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.history).toEqual(historyEvents);
  });

  it("returns 404 when ticket not found", async () => {
    const Ticket = require("../../src/models/Ticket");
    Object.assign(Ticket, { findById: jest.fn().mockResolvedValue(null) });

    const next = makeNext();
    await dashboardController.getTicketHistory(
      makeReq({ params: { id: "bad" }, user: MOCK_AGENT }),
      makeRes(),
      next
    );
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});
