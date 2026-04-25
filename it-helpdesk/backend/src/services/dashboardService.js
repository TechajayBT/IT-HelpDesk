/**
 * Dashboard Service
 *
 * Provides aggregated statistics for each role's dashboard.
 * All queries use MongoDB aggregation pipelines for efficiency
 * (no N+1 queries, single round-trip per dashboard).
 *
 * Requester dashboard : ticket counts by status for the user's own tickets
 * Agent dashboard     : workload metrics (assigned, started, completed today)
 * Admin dashboard     : system-wide KPIs
 */

const Ticket = require("../models/Ticket");
const AuditEvent = require("../models/AuditEvent");
const User = require("../models/User");
const logger = require("../config/logger");

/**
 * getRequesterDashboard
 *
 * Returns ticket counts grouped by status for the authenticated requester.
 * Used to render the "My Tickets" summary cards at the top of the dashboard.
 *
 * @param {string} requesterId - MongoDB ObjectId string
 * @returns {Object}           - { total, byStatus: { Created, Assigned, Started, Completed, Blocked } }
 */
const getRequesterDashboard = async (requesterId) => {
  logger.debug("Building requester dashboard", { requesterId });

  // Single aggregation pipeline to get counts by status in one query
  const statusCounts = await Ticket.aggregate([
    { $match: { requester: requesterId } },           // Filter to this requester's tickets only
    { $group: { _id: "$status", count: { $sum: 1 } } }, // Group by status
  ]);

  // Convert array of { _id: "Created", count: 3 } to a flat object { Created: 3 }
  const byStatus = statusCounts.reduce((acc, { _id, count }) => {
    acc[_id] = count;
    return acc;
  }, { Created: 0, Assigned: 0, Started: 0, Completed: 0, Blocked: 0 });

  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return { total, byStatus };
};

/**
 * getAgentDashboard
 *
 * Returns workload metrics for an agent:
 * - Tickets assigned to me (not yet completed)
 * - Tickets started (actively working)
 * - Tickets completed today
 * - Unassigned tickets in queue (for awareness)
 *
 * @param {string} agentId - MongoDB ObjectId string
 * @returns {Object}
 */
const getAgentDashboard = async (agentId) => {
  logger.debug("Building agent dashboard", { agentId });

  // Start of today (midnight local time) for "completed today" filter
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Run all aggregations in parallel for performance
  const [assignedCounts, completedToday, unassignedCount] = await Promise.all([
    // My tickets grouped by status
    Ticket.aggregate([
      { $match: { assignee: agentId, status: { $ne: "Completed" } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // Tickets I completed today
    Ticket.countDocuments({
      assignee: agentId,
      status: "Completed",
      completedAt: { $gte: todayStart },
    }),

    // Total unassigned tickets (agent's awareness of queue depth)
    Ticket.countDocuments({
      assignee: null,
      status: { $nin: ["Completed"] },
    }),
  ]);

  const byStatus = assignedCounts.reduce((acc, { _id, count }) => {
    acc[_id] = count;
    return acc;
  }, { Assigned: 0, Started: 0, Blocked: 0 });

  return {
    assigned: byStatus.Assigned,
    started: byStatus.Started,
    blocked: byStatus.Blocked,
    completedToday,
    unassignedInQueue: unassignedCount,
  };
};

/**
 * getAdminDashboard
 *
 * System-wide KPIs for admin overview:
 * - Total open tickets (not completed)
 * - Unassigned tickets
 * - High + Critical priority open tickets
 * - Completed this week
 * - Total users by role
 *
 * @returns {Object}
 */
const getAdminDashboard = async () => {
  logger.debug("Building admin dashboard");

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [
    openCount,
    unassignedCount,
    highPriorityCount,
    completedThisWeek,
    userCountByRole,
    statusDistribution,
  ] = await Promise.all([
    // Open = not completed
    Ticket.countDocuments({ status: { $ne: "Completed" } }),

    // Unassigned and not completed
    Ticket.countDocuments({ assignee: null, status: { $ne: "Completed" } }),

    // High or Critical priority, not completed
    Ticket.countDocuments({
      priority: { $in: ["High", "Critical"] },
      status: { $ne: "Completed" },
    }),

    // Completed in the last 7 days
    Ticket.countDocuments({
      status: "Completed",
      completedAt: { $gte: weekStart },
    }),

    // Users grouped by role
    User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),

    // All tickets grouped by status (for pie chart)
    Ticket.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const usersByRole = userCountByRole.reduce((acc, { _id, count }) => {
    acc[_id] = count;
    return acc;
  }, { requester: 0, agent: 0, admin: 0 });

  return {
    openCount,
    unassignedCount,
    highPriorityCount,
    completedThisWeek,
    users: usersByRole,
    statusDistribution,
  };
};

/**
 * getTicketsByStatus
 *
 * Aggregates all tickets grouped by status.
 * Used for the status distribution chart on admin/agent dashboards.
 *
 * @returns {Array} - [{ status: "Created", count: 10 }, ...]
 */
const getTicketsByStatus = async () => {
  const results = await Ticket.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $project: { _id: 0, status: "$_id", count: 1 } },
    { $sort: { status: 1 } },
  ]);
  return results;
};

/**
 * getTicketsByCategory
 *
 * Aggregates all tickets grouped by category.
 * Used for the category breakdown report on admin dashboard.
 *
 * @returns {Array} - [{ category: "Hardware", count: 5 }, ...]
 */
const getTicketsByCategory = async () => {
  const results = await Ticket.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $project: { _id: 0, category: "$_id", count: 1 } },
    { $sort: { count: -1 } }, // Sort by count descending for chart readability
  ]);
  return results;
};

module.exports = {
  getRequesterDashboard,
  getAgentDashboard,
  getAdminDashboard,
  getTicketsByStatus,
  getTicketsByCategory,
};
