/**
 * Attachment Routes
 * Base path: /api/attachments
 */

const router = require("express").Router();
const ticketController = require("../controllers/ticketController");
const { authMiddleware, authorize } = require("../middlewares/auth");

router.use(authMiddleware);

// GET /api/attachments/:id — Download file (agent/admin only)
router.get("/:id", authorize(["agent", "admin"]), ticketController.downloadAttachment);

// DELETE /api/attachments/:id — Delete attachment (agent/admin only)
router.delete("/:id", authorize(["agent", "admin"]), ticketController.deleteAttachment);

module.exports = router;
