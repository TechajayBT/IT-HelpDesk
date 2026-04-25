/**
 * Ticket Routes
 * Base path: /api/tickets
 *
 * RBAC rules applied at the route level:
 * - POST /             → requester, agent (agents can also create tickets as requesters)
 * - GET  /my           → requester, agent (only shows own tickets)
 * - GET  /:id          → requester (own only — enforced in service), agent, admin
 * - POST /:id/comments → requester (own, public only), agent, admin
 * - POST /:id/attachments → requester (own), agent, admin
 * - POST /:id/assign-to-me → agent, admin
 * - POST /:id/start    → agent, admin
 * - POST /:id/complete → agent, admin
 * - POST /:id/block    → agent, admin
 * - POST /:id/resume   → agent, admin
 * - GET  /:id/history  → requester (own), agent, admin
 */

const router = require("express").Router();
const ticketController = require("../controllers/ticketController");
const dashboardController = require("../controllers/dashboardController");
const { authMiddleware, authorize } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const { upload } = require("../config/multer");
const {
  ticketCreateSchema,
  ticketListQuerySchema,
  commentCreateSchema,
  completeTicketSchema,
  blockTicketSchema,
  unassignTicketSchema,
} = require("../validators/schemas");

// ── All ticket routes require authentication ──────────────────────────────────
// Apply authMiddleware once at the router level instead of per-route
router.use(authMiddleware);

// ── Requester routes ──────────────────────────────────────────────────────────

// Create a ticket (requesters and agents who act as requesters)
router.post(
  "/",
  authorize(["requester", "agent", "admin"]),
  validate(ticketCreateSchema),
  ticketController.createTicket
);

// List own tickets (requester's "My Tickets" view)
router.get(
  "/my",
  authorize(["requester", "agent", "admin"]),
  validate(ticketListQuerySchema, "query"),
  ticketController.getMyTickets
);

// Get single ticket details
router.get(
  "/:id",
  authorize(["requester", "agent", "admin"]),
  ticketController.getTicketById
);

// Add a comment to a ticket
router.post(
  "/:id/comments",
  authorize(["requester", "agent", "admin"]),
  validate(commentCreateSchema),
  ticketController.addComment
);

// Upload an attachment to a ticket
// multer middleware parses the multipart form data BEFORE the controller
router.post(
  "/:id/attachments",
  authorize(["requester", "agent", "admin"]),
  upload.single("file"), // Expect a single file field named "file"
  ticketController.uploadAttachment
);

// Get ticket audit history / timeline
router.get(
  "/:id/history",
  authorize(["requester", "agent", "admin"]),
  dashboardController.getTicketHistory
);

// ── Agent-only status transition routes ──────────────────────────────────────

// Assign ticket to self (OCC-protected)
router.post(
  "/:id/assign-to-me",
  authorize(["agent", "admin"]),
  ticketController.assignToSelf
);

// Unassign ticket (requires description)
router.post(
  "/:id/unassign",
  authorize(["agent", "admin"]),
  validate(unassignTicketSchema),
  ticketController.unassignTicket
);

// Start working on a ticket (Assigned → Started)
router.post(
  "/:id/start",
  authorize(["agent", "admin"]),
  ticketController.startTicket
);

// Block / put on hold
router.post(
  "/:id/block",
  authorize(["agent", "admin"]),
  validate(blockTicketSchema),
  ticketController.blockTicket
);

// Resume from blocked state (Blocked → Started)
router.post(
  "/:id/resume",
  authorize(["agent", "admin"]),
  ticketController.resumeTicket
);

// Complete a ticket (requires resolutionSummary)
router.post(
  "/:id/complete",
  authorize(["agent", "admin"]),
  validate(completeTicketSchema),
  ticketController.completeTicket
);

module.exports = router;
