/**
 * Dashboard Service Unit Tests
 *
 * Tests every dashboard aggregation in dashboardService.js using mocked
 * Ticket, AuditEvent, and User models.
 *
 * Key patterns:
 * - Mongoose .aggregate() returns an array directly (no chain needed)
 * - Ticket.countDocuments() returns a number
 * - All assertions verify the correct filter objects are passed
 */

jest.mock("../../src/models/Ticket");
jest.mock("../../src/models/AuditEvent");
jest.mock("../../src/models/User");
jest.mock("../../src/config/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const dashboardService = require("../../src/services/dashboardService");
const Ticket = require("../../src/models/Ticket");
const User = require("../../src/models/User");

// ─────────────────────────────────────────────────────────────────────────────
// REQUESTER DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

describe("getRequesterDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns total and byStatus counts from aggregation", async () => {
    // Simulate aggregation returning counts per status
    Ticket.aggregate.mockResolvedValue([
      { _id: "Created",   count: 3 },
      { _id: "Assigned",  count: 1 },
      { _id: "Started",   count: 2 },
      { _id: "Completed", count: 5 },
      { _id: "Blocked",   count: 0 },
    ]);

    const result = await dashboardService.getRequesterDashboard("req001");

    // Total should be the sum of all counts
    expect(result.total).toBe(11);
    expect(result.byStatus.Created).toBe(3);
    expect(result.byStatus.Assigned).toBe(1);
    expect(result.byStatus.Started).toBe(2);
    expect(result.byStatus.Completed).toBe(5);
  });

  it("initialises all statuses to 0 when no tickets exist", async () => {
    Ticket.aggregate.mockResolvedValue([]); // No tickets for this user

    const result = await dashboardService.getRequesterDashboard("req001");

    expect(result.total).toBe(0);
    expect(result.byStatus.Created).toBe(0);
    expect(result.byStatus.Completed).toBe(0);
    expect(result.byStatus.Blocked).toBe(0);
  });

  it("passes requester ID as match filter in aggregation", async () => {
    Ticket.aggregate.mockResolvedValue([]);

    await dashboardService.getRequesterDashboard("req-xyz");

    // The aggregation pipeline's first stage must filter by requester
    const pipeline = Ticket.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { requester: "req-xyz" } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

describe("getAgentDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns assigned, started, blocked, completedToday, unassignedInQueue", async () => {
    // Aggregation returns assigned ticket counts by status
    Ticket.aggregate.mockResolvedValue([
      { _id: "Assigned", count: 4 },
      { _id: "Started",  count: 2 },
      { _id: "Blocked",  count: 1 },
    ]);

    // countDocuments calls: completedToday and unassignedCount
    Ticket.countDocuments
      .mockResolvedValueOnce(3)  // completedToday
      .mockResolvedValueOnce(7); // unassignedCount

    const result = await dashboardService.getAgentDashboard("agent001");

    expect(result.assigned).toBe(4);
    expect(result.started).toBe(2);
    expect(result.blocked).toBe(1);
    expect(result.completedToday).toBe(3);
    expect(result.unassignedInQueue).toBe(7);
  });

  it("defaults missing statuses to 0", async () => {
    // Only Assigned tickets returned — no Started or Blocked
    Ticket.aggregate.mockResolvedValue([{ _id: "Assigned", count: 2 }]);
    Ticket.countDocuments.mockResolvedValue(0);

    const result = await dashboardService.getAgentDashboard("agent001");

    expect(result.started).toBe(0);
    expect(result.blocked).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

describe("getAdminDashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns all KPI fields", async () => {
    // countDocuments is called 3 times in parallel
    Ticket.countDocuments
      .mockResolvedValueOnce(42) // openCount
      .mockResolvedValueOnce(8)  // unassignedCount
      .mockResolvedValueOnce(15) // highPriorityCount
      .mockResolvedValueOnce(6); // completedThisWeek

    // aggregate is called twice: userCountByRole and statusDistribution
    User.aggregate.mockResolvedValue([
      { _id: "requester", count: 20 },
      { _id: "agent",     count: 5  },
      { _id: "admin",     count: 2  },
    ]);

    Ticket.aggregate.mockResolvedValue([
      { _id: "Created",   count: 10 },
      { _id: "Completed", count: 30 },
    ]);

    const result = await dashboardService.getAdminDashboard();

    expect(result.openCount).toBe(42);
    expect(result.unassignedCount).toBe(8);
    expect(result.highPriorityCount).toBe(15);
    expect(result.completedThisWeek).toBe(6);
    expect(result.users.requester).toBe(20);
    expect(result.users.agent).toBe(5);
    expect(result.users.admin).toBe(2);
  });

  it("defaults user counts to 0 for missing roles", async () => {
    Ticket.countDocuments.mockResolvedValue(0);
    User.aggregate.mockResolvedValue([]); // No users
    Ticket.aggregate.mockResolvedValue([]);

    const result = await dashboardService.getAdminDashboard();

    expect(result.users.requester).toBe(0);
    expect(result.users.agent).toBe(0);
    expect(result.users.admin).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS BY STATUS / CATEGORY REPORTS
// ─────────────────────────────────────────────────────────────────────────────

describe("getTicketsByStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns formatted status distribution array", async () => {
    Ticket.aggregate.mockResolvedValue([
      { status: "Created",   count: 5 },
      { status: "Completed", count: 20 },
    ]);

    const result = await dashboardService.getTicketsByStatus();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    // Each item should have status and count
    result.forEach((item) => {
      expect(item).toHaveProperty("count");
    });
  });

  it("returns empty array when no tickets exist", async () => {
    Ticket.aggregate.mockResolvedValue([]);
    const result = await dashboardService.getTicketsByStatus();
    expect(result).toEqual([]);
  });
});

describe("getTicketsByCategory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns category distribution sorted by count descending", async () => {
    Ticket.aggregate.mockResolvedValue([
      { category: "Hardware", count: 12 },
      { category: "Software", count: 8  },
      { category: "Other",    count: 2  },
    ]);

    const result = await dashboardService.getTicketsByCategory();

    expect(result).toHaveLength(3);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });
});
