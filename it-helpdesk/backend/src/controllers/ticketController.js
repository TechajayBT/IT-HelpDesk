/**
 * Ticket Controller
 *
 * HTTP handlers for all ticket-related endpoints.
 * Pattern: validate (middleware) → controller → service → response
 *
 * No business logic here — each handler reads from req, calls a service
 * method, and sends a response using the response helpers.
 */

const ticketService = require("../services/ticketService");
const { sendSuccess, sendCreated, sendPaginated } = require("../utils/response");
const { asyncHandler } = require("../utils/errors");
const logger = require("../config/logger");

// ─────────────────────────────────────────────────────────────────────────────
// REQUESTER HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createTicket
 * POST /api/tickets
 * Role: requester (agents can also create tickets as requesters)
 */
const createTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.createTicket(req.body, req.user);

  logger.info("Ticket creation handler complete", {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    userId: req.user._id,
  });

  return sendCreated(res, {
    data: { ticket },
    message: `Ticket ${ticket.ticketNumber} created successfully.`,
  });
});

/**
 * getMyTickets
 * GET /api/tickets/my
 * Role: requester — returns only the authenticated user's tickets
 */
const getMyTickets = asyncHandler(async (req, res) => {
  // req.query has been validated and defaulted by the validate middleware
  const { tickets, totalItems } = await ticketService.listRequesterTickets(
    req.user,
    req.query
  );

  return sendPaginated(res, {
    data: tickets,
    page: req.query.page,
    limit: req.query.limit,
    totalItems,
    message: "Tickets fetched successfully.",
  });
});

/**
 * getTicketById
 * GET /api/tickets/:id
 * Role: requester (own only), agent, admin
 */
const getTicketById = asyncHandler(async (req, res) => {
  const ticket = await ticketService.getTicketById(req.params.id, req.user);

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket fetched successfully.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getUnassignedTickets
 * GET /api/agent/tickets/unassigned
 * Role: agent, admin — returns all unassigned tickets (the shared queue)
 */
const getUnassignedTickets = asyncHandler(async (req, res) => {
  const { tickets, totalItems } = await ticketService.listAgentQueue(req.query);

  return sendPaginated(res, {
    data: tickets,
    page: req.query.page,
    limit: req.query.limit,
    totalItems,
    message: "Unassigned tickets fetched successfully.",
  });
});

/**
 * getAssignedToMe
 * GET /api/agent/tickets/assigned-to-me
 * Role: agent, admin — returns tickets assigned to the authenticated agent
 */
const getAssignedToMe = asyncHandler(async (req, res) => {
  const { tickets, totalItems } = await ticketService.listAgentAssignedTickets(
    req.user,
    req.query
  );

  return sendPaginated(res, {
    data: tickets,
    page: req.query.page,
    limit: req.query.limit,
    totalItems,
    message: "Assigned tickets fetched successfully.",
  });
});

/**
 * assignToSelf
 * POST /api/tickets/:id/assign-to-me
 * Role: agent, admin
 */
const assignToSelf = asyncHandler(async (req, res) => {
  const ticket = await ticketService.assignTicketToSelf(req.params.id, req.user);

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket assigned to you successfully.",
  });
});

/**
 * unassignTicket
 * POST /api/tickets/:id/unassign
 * Role: agent, admin
 */
const unassignTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.unassignTicket(
    req.params.id,
    req.user,
    req.body.description
  );

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket unassigned successfully.",
  });
});

/**
 * startTicket
 * POST /api/tickets/:id/start
 * Role: agent, admin
 */
const startTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.startTicket(req.params.id, req.user);

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket moved to Started.",
  });
});

/**
 * blockTicket
 * POST /api/tickets/:id/block
 * Role: agent, admin
 */
const blockTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.blockTicket(
    req.params.id,
    req.user,
    req.body.reason
  );

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket blocked/put on hold.",
  });
});

/**
 * resumeTicket
 * POST /api/tickets/:id/resume
 * Role: agent, admin
 */
const resumeTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.resumeTicket(req.params.id, req.user);

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket resumed to Started.",
  });
});

/**
 * completeTicket
 * POST /api/tickets/:id/complete
 * Role: agent, admin
 */
const completeTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.completeTicket(
    req.params.id,
    req.user,
    req.body.resolutionSummary
  );

  return sendSuccess(res, {
    data: { ticket },
    message: "Ticket completed successfully.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addComment
 * POST /api/tickets/:id/comments
 * Role: requester (own tickets, public only), agent, admin
 */
const addComment = asyncHandler(async (req, res) => {
  const ticket = await ticketService.addComment(
    req.params.id,
    req.user,
    req.body
  );

  // Return only the last comment (the one just added)
  const newComment = ticket.comments[ticket.comments.length - 1];

  return sendCreated(res, {
    data: { comment: newComment, ticketId: ticket._id },
    message: "Comment added successfully.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * uploadAttachment
 * POST /api/tickets/:id/attachments
 * Role: requester (own tickets), agent, admin
 * Note: multer middleware runs before this handler and puts file info in req.file
 */
const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    const { AppError } = require("../utils/errors");
    throw new AppError("No file was uploaded.", 400, "NO_FILE");
  }

  const attachment = await ticketService.addAttachment(
    req.params.id,
    req.user,
    req.file
  );

  return sendCreated(res, {
    data: { attachment },
    message: "File uploaded successfully.",
  });
});

/**
 * downloadAttachment
 * GET /api/attachments/:id
 * Role: agent, admin
 * Streams the file from disk to the response.
 */
const downloadAttachment = asyncHandler(async (req, res) => {
  const path = require("path");
  const fs = require("fs");
  const Ticket = require("../models/Ticket");
  const { AppError } = require("../utils/errors");
  const { uploadConfig } = require("../config/multer");

  // Find which ticket contains this attachment
  const ticket = await Ticket.findOne({
    "attachments._id": req.params.id,
  });

  if (!ticket) {
    throw new AppError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
  }

  const attachment = ticket.attachments.id(req.params.id);
  const filePath = path.join(uploadConfig.uploadDir, attachment.storedName);

  if (!fs.existsSync(filePath)) {
    logger.error("Attachment file missing from disk", {
      attachmentId: req.params.id,
      storedName: attachment.storedName,
    });
    throw new AppError("File not found on server.", 404, "FILE_NOT_FOUND");
  }

  // Set appropriate Content-Type and Content-Disposition headers
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${attachment.originalName}"`
  );

  // Stream file instead of loading it all into memory
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

/**
 * deleteAttachment
 * DELETE /api/attachments/:id
 * Role: agent, admin
 */
const deleteAttachment = asyncHandler(async (req, res) => {
  const Ticket = require("../models/Ticket");
  const { AppError } = require("../utils/errors");

  // Find the ticket containing this attachment to get the ticketId
  const ticket = await Ticket.findOne({ "attachments._id": req.params.id });
  if (!ticket) {
    throw new AppError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
  }

  await ticketService.deleteAttachment(ticket._id.toString(), req.params.id, req.user);

  return sendSuccess(res, {
    data: null,
    message: "Attachment deleted successfully.",
  });
});

module.exports = {
  createTicket,
  getMyTickets,
  getTicketById,
  getUnassignedTickets,
  getAssignedToMe,
  assignToSelf,
  unassignTicket,
  startTicket,
  blockTicket,
  resumeTicket,
  completeTicket,
  addComment,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
};
