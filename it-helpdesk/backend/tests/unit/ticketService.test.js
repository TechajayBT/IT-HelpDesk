/**
 * Ticket Service Unit Tests — Fixed Version
 */
jest.mock("../../src/models/Ticket");
jest.mock("../../src/models/AuditEvent");
jest.mock("../../src/config/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn(),
}));
jest.mock("../../src/config/multer", () => ({
  upload: {},
  uploadConfig: { maxAttachments: 5, uploadDir: "uploads", maxFileSize: 5242880, allowedFileTypes: [] },
}));

const ticketService = require("../../src/services/ticketService");
const Ticket = require("../../src/models/Ticket");
const AuditEvent = require("../../src/models/AuditEvent");
const { AppError } = require("../../src/utils/errors");
const { isValidTransition, getValidTransitions } = require("../../src/utils/ticketStatus");

// Build a fluent populate chain mock that resolves to resolveValue
const buildPopulateChain = (resolveValue) => {
  const chain = {
    populate: jest.fn(),
    then: (onFulfilled, onRejected) => Promise.resolve(resolveValue).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(resolveValue).catch(fn),
  };
  chain.populate.mockReturnValue(chain);
  return chain;
};

const makeAgent = (id = "agent001") => ({ _id: id, firstName: "Bob", lastName: "Agent", role: "agent" });
const makeRequester = (idStr = "req001") => ({
  _id: { toString: () => idStr },
  firstName: "Alice", lastName: "Requester", role: "requester",
});
const makeTicket = (overrides = {}) => {
  const ticket = {
    _id: "ticket001", ticketNumber: "TKT-00001", title: "Test ticket",
    status: "Created", assignee: null, __v: 0,
    requester: { _id: { toString: () => "req001" } },
    comments: [], attachments: [],
    save: jest.fn().mockResolvedValue(true),
    populate: jest.fn(),
    ...overrides,
  };
  ticket.populate.mockResolvedValue(ticket);
  return ticket;
};

// ── Status Transitions ───────────────────────────────────────────────────────
describe("isValidTransition", () => {
  const valid = [
    ["Created","Assigned"],["Created","Blocked"],["Assigned","Started"],
    ["Assigned","Blocked"],["Started","Completed"],["Started","Blocked"],["Blocked","Started"],
  ];
  test.each(valid)("allows %s → %s", (f,t) => expect(isValidTransition(f,t)).toBe(true));

  const invalid = [
    ["Created","Started"],["Created","Completed"],["Completed","Started"],
    ["Completed","Created"],["Blocked","Completed"],
  ];
  test.each(invalid)("blocks %s → %s", (f,t) => expect(isValidTransition(f,t)).toBe(false));
  it("Completed has no valid transitions", () => expect(getValidTransitions("Completed")).toEqual([]));
});

// ── createTicket ─────────────────────────────────────────────────────────────
describe("createTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates ticket with status=Created and assignee=null", async () => {
    const mockTicket = makeTicket();
    Ticket.create.mockResolvedValue(mockTicket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.createTicket(
      { title: "T", description: "D", type: "Incident", category: "Hardware", subcategory: "s", priority: "High" },
      { _id: "req001", firstName: "Alice", lastName: "Req" }
    );
    expect(Ticket.create).toHaveBeenCalledWith(expect.objectContaining({ status: "Created", assignee: null, requester: "req001" }));
    expect(AuditEvent.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ticket_created" }));
  });
});

// ── getTicketById ─────────────────────────────────────────────────────────────
describe("getTicketById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("filters internal comments for requester", async () => {
    const mockTicket = makeTicket({
      requester: { _id: { toString: () => "req001" } },
      comments: [
        { _id: "c1", visibility: "public", body: "Pub" },
        { _id: "c2", visibility: "internal", body: "Int" },
      ],
    });
    Ticket.findById.mockReturnValue(buildPopulateChain(mockTicket));
    const result = await ticketService.getTicketById("ticket001", makeRequester("req001"));
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].visibility).toBe("public");
  });

  it("shows all comments to agents", async () => {
    const mockTicket = makeTicket({
      requester: { _id: { toString: () => "req001" } },
      comments: [
        { _id: "c1", visibility: "public", body: "Pub" },
        { _id: "c2", visibility: "internal", body: "Int" },
      ],
    });
    Ticket.findById.mockReturnValue(buildPopulateChain(mockTicket));
    const result = await ticketService.getTicketById("ticket001", makeAgent());
    expect(result.comments).toHaveLength(2);
  });

  it("throws 404 when ticket not found", async () => {
    Ticket.findById.mockReturnValue(buildPopulateChain(null));
    await expect(ticketService.getTicketById("bad", makeAgent()))
      .rejects.toMatchObject({ statusCode: 404, code: "TICKET_NOT_FOUND" });
  });

  it("throws 403 when requester accesses another user's ticket", async () => {
    const mockTicket = makeTicket({ requester: { _id: { toString: () => "req001" } } });
    Ticket.findById.mockReturnValue(buildPopulateChain(mockTicket));
    await expect(ticketService.getTicketById("ticket001", makeRequester("req999")))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});

// ── assignTicketToSelf ────────────────────────────────────────────────────────
describe("assignTicketToSelf", () => {
  beforeEach(() => jest.clearAllMocks());

  it("assigns and advances Created → Assigned", async () => {
    const agent = makeAgent();
    const assigned = makeTicket({ status: "Assigned", assignee: agent, __v: 1 });
    Ticket.findById.mockResolvedValue(makeTicket({ assignee: null, __v: 0 }));
    Ticket.findOneAndUpdate.mockReturnValue(buildPopulateChain(assigned));
    AuditEvent.log = jest.fn().mockResolvedValue({});
    const result = await ticketService.assignTicketToSelf("ticket001", agent);
    expect(Ticket.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ assignee: null, __v: 0 }),
      expect.objectContaining({ assignee: agent._id, status: "Assigned" }),
      expect.objectContaining({ new: true })
    );
    expect(result.status).toBe("Assigned");
  });

  it("throws 409 when already assigned", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ assignee: "other" }));
    await expect(ticketService.assignTicketToSelf("ticket001", makeAgent()))
      .rejects.toMatchObject({ statusCode: 409, code: "ALREADY_ASSIGNED" });
    expect(Ticket.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("throws 409 on OCC conflict (concurrent claim)", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ assignee: null, __v: 0 }));
    Ticket.findOneAndUpdate.mockReturnValue(buildPopulateChain(null));
    await expect(ticketService.assignTicketToSelf("ticket001", makeAgent()))
      .rejects.toMatchObject({ statusCode: 409, code: "ALREADY_ASSIGNED" });
  });
});

// ── startTicket ───────────────────────────────────────────────────────────────
describe("startTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("transitions Assigned → Started", async () => {
    const agent = makeAgent();
    const mockTicket = makeTicket({ status: "Assigned", assignee: agent._id });
    Ticket.findById.mockResolvedValue(mockTicket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.startTicket("ticket001", agent);
    expect(mockTicket.status).toBe("Started");
    expect(mockTicket.save).toHaveBeenCalledTimes(1);
  });

  it("throws 400 when ticket is unassigned", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ status: "Assigned", assignee: null }));
    await expect(ticketService.startTicket("ticket001", makeAgent()))
      .rejects.toMatchObject({ statusCode: 400, code: "TICKET_NOT_ASSIGNED" });
  });

  it("throws 400 for Created → Started (invalid transition)", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ status: "Created", assignee: makeAgent()._id }));
    await expect(ticketService.startTicket("ticket001", makeAgent()))
      .rejects.toMatchObject({ statusCode: 400, code: "INVALID_TRANSITION" });
  });
});

// ── completeTicket ────────────────────────────────────────────────────────────
describe("completeTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("completes Started ticket with valid summary", async () => {
    const agent = makeAgent();
    const mockTicket = makeTicket({ status: "Started", assignee: agent._id });
    Ticket.findById.mockResolvedValue(mockTicket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    const summary = "Replaced the hard drive. Laptop boots correctly now.";
    await ticketService.completeTicket("ticket001", agent, summary);
    expect(mockTicket.status).toBe("Completed");
    expect(mockTicket.resolutionSummary).toBe(summary);
    expect(mockTicket.completedAt).toBeInstanceOf(Date);
  });

  it("throws 400 when resolutionSummary is empty", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ status: "Started" }));
    await expect(ticketService.completeTicket("ticket001", makeAgent(), ""))
      .rejects.toMatchObject({ statusCode: 400, code: "RESOLUTION_REQUIRED" });
  });

  it("throws 400 when resolutionSummary is too short", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ status: "Started" }));
    await expect(ticketService.completeTicket("ticket001", makeAgent(), "Fixed it"))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for Completed → Completed (terminal state)", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ status: "Completed" }));
    await expect(ticketService.completeTicket("ticket001", makeAgent(), "Already done previously."))
      .rejects.toMatchObject({ statusCode: 400, code: "INVALID_TRANSITION" });
  });
});

// ── addComment ────────────────────────────────────────────────────────────────
describe("addComment", () => {
  beforeEach(() => jest.clearAllMocks());

  const makeCommentTicket = (ownerIdStr = "req001") => {
    // Mongoose populated doc: ticket.requester.toString() returns the _id string
    const requesterMock = { _id: { toString: () => ownerIdStr }, toString: () => ownerIdStr };
    const ticket = makeTicket({ requester: requesterMock });
    // Use spyOn so the real push still works without recursion
    jest.spyOn(ticket.comments, "push");
    ticket.populate = jest.fn().mockResolvedValue(ticket);
    return ticket;
  };

  it("adds public comment for ticket owner", async () => {
    const ticket = makeCommentTicket("req001");
    Ticket.findById.mockResolvedValue(ticket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.addComment("ticket001", makeRequester("req001"), { body: "Any update?", visibility: "public" });
    expect(ticket.comments.push).toHaveBeenCalledWith(expect.objectContaining({ visibility: "public" }));
    expect(ticket.save).toHaveBeenCalledTimes(1);
  });

  it("coerces requester internal note to public", async () => {
    const ticket = makeCommentTicket("req001");
    Ticket.findById.mockResolvedValue(ticket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.addComment("ticket001", makeRequester("req001"), { body: "Internal attempt", visibility: "internal" });
    expect(ticket.comments.push).toHaveBeenCalledWith(expect.objectContaining({ visibility: "public" }));
  });

  it("allows agent to post internal note", async () => {
    const ticket = makeCommentTicket("req001");
    Ticket.findById.mockResolvedValue(ticket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.addComment("ticket001", makeAgent(), { body: "Agent internal note for team", visibility: "internal" });
    expect(ticket.comments.push).toHaveBeenCalledWith(expect.objectContaining({ visibility: "internal" }));
  });

  it("throws 403 when requester comments on another user's ticket", async () => {
    const ticket = makeCommentTicket("req001");
    Ticket.findById.mockResolvedValue(ticket);
    await expect(ticketService.addComment("ticket001", makeRequester("req999"), { body: "Hack" }))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("throws 404 when ticket not found", async () => {
    Ticket.findById.mockResolvedValue(null);
    await expect(ticketService.addComment("bad", makeRequester(), { body: "Test" }))
      .rejects.toMatchObject({ statusCode: 404, code: "TICKET_NOT_FOUND" });
  });
});

// ── blockTicket / resumeTicket ────────────────────────────────────────────────
describe("blockTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("blocks a Started ticket", async () => {
    const mockTicket = makeTicket({ status: "Started" });
    Ticket.findById.mockResolvedValue(mockTicket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.blockTicket("ticket001", makeAgent(), "Waiting for vendor");
    expect(mockTicket.status).toBe("Blocked");
    expect(AuditEvent.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ticket_blocked" }));
  });

  it("blocks an Assigned ticket", async () => {
    const mockTicket = makeTicket({ status: "Assigned" });
    Ticket.findById.mockResolvedValue(mockTicket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.blockTicket("ticket001", makeAgent(), "Need more info");
    expect(mockTicket.status).toBe("Blocked");
  });
});

describe("resumeTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("resumes Blocked → Started when ticket is assigned", async () => {
    const agent = makeAgent();
    const mockTicket = makeTicket({ status: "Blocked", assignee: agent._id });
    Ticket.findById.mockResolvedValue(mockTicket);
    AuditEvent.log = jest.fn().mockResolvedValue({});
    await ticketService.resumeTicket("ticket001", agent);
    expect(mockTicket.status).toBe("Started");
  });

  it("throws 400 when resuming a Completed ticket", async () => {
    Ticket.findById.mockResolvedValue(makeTicket({ status: "Completed", assignee: makeAgent()._id }));
    await expect(ticketService.resumeTicket("ticket001", makeAgent()))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
