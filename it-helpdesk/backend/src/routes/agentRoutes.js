/**
 * Agent Routes
 * Base path: /api/agent
 *
 * Endpoints specific to the agent's queue view.
 */

const router = require("express").Router();
const ticketController = require("../controllers/ticketController");
const { authMiddleware, authorize } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const { ticketListQuerySchema } = require("../validators/schemas");

router.use(authMiddleware);
router.use(authorize(["agent", "admin"])); // All agent routes require agent/admin role

// GET /api/agent/tickets/unassigned — Shared queue: all unassigned tickets
router.get(
  "/tickets/unassigned",
  validate(ticketListQuerySchema, "query"),
  ticketController.getUnassignedTickets
);

// GET /api/agent/tickets/assigned-to-me — My assigned tickets
router.get(
  "/tickets/assigned-to-me",
  validate(ticketListQuerySchema, "query"),
  ticketController.getAssignedToMe
);

module.exports = router;
