/**
 * Dashboard Routes
 * Base path: /api/dashboard and /api/reports and /api/audit-logs
 */

const router = require("express").Router();
const dashboardController = require("../controllers/dashboardController");
const { authMiddleware, authorize } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const { auditLogQuerySchema } = require("../validators/schemas");

router.use(authMiddleware);

// ── Dashboard endpoints ───────────────────────────────────────────────────────
router.get("/dashboard/requester", authorize(["requester", "agent", "admin"]), dashboardController.getRequesterDashboard);
router.get("/dashboard/agent",     authorize(["agent", "admin"]),              dashboardController.getAgentDashboard);
router.get("/dashboard/admin",     authorize(["admin"]),                       dashboardController.getAdminDashboard);

// ── Report endpoints ──────────────────────────────────────────────────────────
router.get("/reports/tickets-by-status",   authorize(["agent", "admin"]), dashboardController.getTicketsByStatus);
router.get("/reports/tickets-by-category", authorize(["admin"]),          dashboardController.getTicketsByCategory);

// ── Audit log endpoints ───────────────────────────────────────────────────────
router.get(
  "/audit-logs",
  authorize(["admin"]),
  validate(auditLogQuerySchema, "query"),
  dashboardController.getAuditLogs
);

module.exports = router;
