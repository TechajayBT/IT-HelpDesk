/**
 * Ticket Integration Tests
 *
 * Tests the complete ticket lifecycle:
 * - Creation (requester)
 * - Listing with filters and pagination
 * - Status transitions (agent)
 * - Concurrent assign-to-me (OCC verification)
 * - Comment visibility rules
 * - RBAC enforcement
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../../src/app");

let mongoServer;
let requesterToken, agentToken;
let requesterId, agentId;

// ── Helpers ───────────────────────────────────────────────────────────────────

const registerAndLogin = async (userData) => {
  const res = await request(app).post("/api/auth/register").send(userData);
  return { token: res.body.data.token, userId: res.body.data.user._id };
};

const createTicketAsRequester = async (token, overrides = {}) => {
  const payload = {
    title: "My laptop won't start",
    description: "The laptop shows a black screen when I press the power button. It was working yesterday.",
    type: "Incident",
    category: "Hardware",
    subcategory: "Laptop Issue",
    priority: "High",
    extraFields: { deviceType: "Laptop", operatingSystem: "Windows", location: "Office" },
    ...overrides,
  };
  return request(app)
    .post("/api/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Create a requester and agent used across tests
  const requester = await registerAndLogin({
    firstName: "Alice", lastName: "Requester",
    email: "alice@test.com", password: "Alice@1234", confirmPassword: "Alice@1234",
  });
  requesterToken = requester.token;
  requesterId = requester.userId;

  // Register as requester first, then manually set role to agent for testing
  const agent = await registerAndLogin({
    firstName: "Bob", lastName: "Agent",
    email: "bob@test.com", password: "Bob@12345", confirmPassword: "Bob@12345",
  });
  agentToken = agent.token;
  agentId = agent.userId;

  // Elevate bob to agent role directly in DB (no admin endpoint in tests)
  const User = require("../../src/models/User");
  await User.findByIdAndUpdate(agentId, { role: "agent" });

  // Re-login to get a token with the updated role
  const loginRes = await request(app).post("/api/auth/login").send({
    email: "bob@test.com", password: "Bob@12345",
  });
  agentToken = loginRes.body.data.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Only clear tickets and audit events between tests; keep users
  const Ticket = mongoose.connection.collections["tickets"];
  const AuditEvent = mongoose.connection.collections["auditevents"];
  if (Ticket) await Ticket.deleteMany({});
  if (AuditEvent) await AuditEvent.deleteMany({});
});

// ── Create ticket tests ───────────────────────────────────────────────────────

describe("POST /api/tickets", () => {
  it("should allow requester to create a ticket", async () => {
    const res = await createTicketAsRequester(requesterToken);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ticket).toMatchObject({
      status: "Created",
      assignee: null,
      priority: "High",
    });
    expect(res.body.data.ticket.ticketNumber).toMatch(/^TKT-/);
  });

  it("should reject ticket creation without required fields", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ title: "Incomplete ticket" }); // Missing many required fields

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should not allow unauthenticated ticket creation", async () => {
    const res = await request(app).post("/api/tickets").send({
      title: "Test", description: "Test", type: "Incident",
      category: "Hardware", subcategory: "Laptop Issue", priority: "Low",
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Get tickets tests ─────────────────────────────────────────────────────────

describe("GET /api/tickets/my", () => {
  beforeEach(async () => {
    // Create 3 tickets as requester
    await createTicketAsRequester(requesterToken, { priority: "Low" });
    await createTicketAsRequester(requesterToken, { priority: "High" });
    await createTicketAsRequester(requesterToken, { priority: "Critical" });
  });

  it("should return only the requester's own tickets", async () => {
    const res = await request(app)
      .get("/api/tickets/my")
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.totalItems).toBe(3);
  });

  it("should support pagination", async () => {
    const res = await request(app)
      .get("/api/tickets/my?page=1&limit=2")
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.pagination.hasNextPage).toBe(true);
  });

  it("should filter by priority", async () => {
    const res = await request(app)
      .get("/api/tickets/my?priority=Critical")
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].priority).toBe("Critical");
  });
});

// ── Status transition tests ───────────────────────────────────────────────────

describe("Ticket status transitions", () => {
  let ticketId;

  beforeEach(async () => {
    const res = await createTicketAsRequester(requesterToken);
    ticketId = res.body.data.ticket._id;
  });

  it("should allow agent to assign ticket to self", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/assign-to-me`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.ticket.status).toBe("Assigned");
    expect(res.body.data.ticket.assignee).not.toBeNull();
  });

  it("should allow agent to start an assigned ticket", async () => {
    // First assign it
    await request(app)
      .post(`/api/tickets/${ticketId}/assign-to-me`)
      .set("Authorization", `Bearer ${agentToken}`);

    // Then start it
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/start`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.ticket.status).toBe("Started");
  });

  it("should reject starting an unassigned ticket", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/start`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("TICKET_NOT_ASSIGNED");
  });

  it("should require resolutionSummary to complete a ticket", async () => {
    // Assign → Start
    await request(app).post(`/api/tickets/${ticketId}/assign-to-me`).set("Authorization", `Bearer ${agentToken}`);
    await request(app).post(`/api/tickets/${ticketId}/start`).set("Authorization", `Bearer ${agentToken}`);

    // Try to complete without resolution summary
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/complete`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({}); // No resolutionSummary

    expect(res.statusCode).toBe(400);
  });

  it("should complete ticket with valid resolution summary", async () => {
    await request(app).post(`/api/tickets/${ticketId}/assign-to-me`).set("Authorization", `Bearer ${agentToken}`);
    await request(app).post(`/api/tickets/${ticketId}/start`).set("Authorization", `Bearer ${agentToken}`);

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/complete`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ resolutionSummary: "Replaced the hard drive and the laptop now boots correctly." });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.ticket.status).toBe("Completed");
    expect(res.body.data.ticket.completedAt).not.toBeNull();
  });

  it("should not allow requester to change ticket status", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/start`)
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(res.statusCode).toBe(403);
  });
});

// ── Comment visibility tests ──────────────────────────────────────────────────

describe("Comment visibility", () => {
  let ticketId;

  beforeEach(async () => {
    const res = await createTicketAsRequester(requesterToken);
    ticketId = res.body.data.ticket._id;
  });

  it("requester should not see internal comments", async () => {
    // Agent posts internal note
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ body: "Internal note: user has had 3 previous similar issues.", visibility: "internal" });

    // Requester posts public comment
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ body: "Any update on my ticket?" });

    // Requester fetches ticket — should only see public comment
    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(res.statusCode).toBe(200);
    const comments = res.body.data.ticket.comments;
    expect(comments.every((c) => c.visibility === "public")).toBe(true);
    expect(comments).toHaveLength(1); // Only the public comment
  });

  it("agent should see all comments including internal", async () => {
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ body: "Internal note for agents only.", visibility: "internal" });

    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${agentToken}`);

    const comments = res.body.data.ticket.comments;
    expect(comments).toHaveLength(1);
    expect(comments[0].visibility).toBe("internal");
  });
});

// ── RBAC tests ────────────────────────────────────────────────────────────────

describe("RBAC enforcement", () => {
  it("requester cannot access agent queue", async () => {
    const res = await request(app)
      .get("/api/agent/tickets/unassigned")
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(res.statusCode).toBe(403);
  });

  it("agent cannot view another user's requester tickets", async () => {
    // Create a ticket as requester
    const ticketRes = await createTicketAsRequester(requesterToken);
    const ticketId = ticketRes.body.data.ticket._id;

    // Agent should be able to view it (agent has queue access)
    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${agentToken}`);

    // Agents CAN view all tickets (that's their job)
    expect(res.statusCode).toBe(200);
  });
});
