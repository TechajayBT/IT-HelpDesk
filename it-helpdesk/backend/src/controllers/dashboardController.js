/**
 * Dashboard Controller
 *
 * Handles dashboard and reporting endpoints. Each handler determines
 * which service method to call based on the authenticated user's role.
 */

const dashboardService = require("../services/dashboardService");
const AuditEvent = require("../models/AuditEvent");
const { sendSuccess, sendPaginated } = require("../utils/response");
const { asyncHandler } = require("../utils/errors");
const logger = require("../config/logger");

/**
 * getRequesterDashboard
 * GET /api/dashboard/requester
 * Role: requester
 */
const getRequesterDashboard = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getRequesterDashboard(req.user._id);

  return sendSuccess(res, {
    data: stats,
    message: "Requester dashboard data fetched.",
  });
});

/**
 * getAgentDashboard
 * GET /api/dashboard/agent
 * Role: agent
 */
const getAgentDashboard = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getAgentDashboard(req.user._id);

  return sendSuccess(res, {
    data: stats,
    message: "Agent dashboard data fetched.",
  });
});

/**
 * getAdminDashboard
 * GET /api/dashboard/admin
 * Role: admin
 */
const getAdminDashboard = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getAdminDashboard();

  return sendSuccess(res, {
    data: stats,
    message: "Admin dashboard data fetched.",
  });
});

/**
 * getTicketsByStatus
 * GET /api/reports/tickets-by-status
 * Role: admin, agent
 */
const getTicketsByStatus = asyncHandler(async (req, res) => {
  const data = await dashboardService.getTicketsByStatus();

  return sendSuccess(res, {
    data,
    message: "Tickets by status report fetched.",
  });
});

/**
 * getTicketsByCategory
 * GET /api/reports/tickets-by-category
 * Role: admin
 */
const getTicketsByCategory = asyncHandler(async (req, res) => {
  const data = await dashboardService.getTicketsByCategory();

  return sendSuccess(res, {
    data,
    message: "Tickets by category report fetched.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getAuditLogs
 * GET /api/audit-logs
 * Role: admin — system-wide audit log with filtering
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, ticketId, eventType, fromDate, toDate } = req.query;

  // Build filter dynamically — only include fields that were provided
  const filter = {};
  if (ticketId) filter.ticketId = ticketId;
  if (eventType) filter.eventType = eventType;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;

  const [logs, totalItems] = await Promise.all([
    AuditEvent.find(filter)
      .populate("actor", "firstName lastName email role")
      .populate("ticketId", "ticketNumber title")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditEvent.countDocuments(filter),
  ]);

  logger.debug("Audit logs fetched", {
    adminId: req.user._id,
    totalItems,
    filters: filter,
  });

  return sendPaginated(res, {
    data: logs,
    page,
    limit,
    totalItems,
    message: "Audit logs fetched successfully.",
  });
});

/**
 * getTicketHistory
 * GET /api/tickets/:id/history
 * Role: requester (own ticket), agent, admin
 */
const getTicketHistory = asyncHandler(async (req, res) => {
  const Ticket = require("../models/Ticket");
  const { AppError } = require("../utils/errors");

  // Verify ticket exists and user has access
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) {
    throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");
  }

  // Requesters can only see history of their own tickets
  if (
    req.user.role === "requester" &&
    ticket.requester.toString() !== req.user._id.toString()
  ) {
    throw new AppError("You do not have access to this ticket.", 403, "FORBIDDEN");
  }

  const history = await AuditEvent.find({ ticketId: req.params.id })
    .populate("actor", "firstName lastName email role")
    .sort({ createdAt: 1 }) // Chronological order for timeline display
    .lean();

  return sendSuccess(res, {
    data: { history },
    message: "Ticket history fetched successfully.",
  });
});

module.exports = {
  getRequesterDashboard,
  getAgentDashboard,
  getAdminDashboard,
  getTicketsByStatus,
  getTicketsByCategory,
  getAuditLogs,
  getTicketHistory,
};
