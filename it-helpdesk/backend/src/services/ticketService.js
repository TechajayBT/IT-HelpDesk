/**
 * Ticket Service
 *
 * Houses ALL business logic for ticket operations. Controllers call these
 * methods and send HTTP responses; services know nothing about req/res.
 *
 * Key responsibilities:
 * - CRUD operations on Ticket documents
 * - Enforcing status transition rules (see ticketStatus.js)
 * - Handling optimistic concurrency for assign-to-me
 * - Writing audit events for every meaningful change
 * - Filtering comment visibility based on requester vs agent role
 */

const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const AuditEvent = require("../models/AuditEvent");
const { AppError } = require("../utils/errors");
const { isValidTransition } = require("../utils/ticketStatus");
const logger = require("../config/logger");

// ─────────────────────────────────────────────────────────────────────────────
// TICKET CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createTicket
 *
 * Creates a new ticket with status 'Created' and no assignee.
 * Writes a ticket_created audit event atomically after creation.
 *
 * @param {Object} ticketData - Validated ticket payload
 * @param {Object} requester  - Authenticated user document
 * @returns {Object}          - Populated ticket document
 */
const createTicket = async (ticketData, requester) => {
  logger.debug("Creating new ticket", {
    requester: requester._id,
    title: ticketData.title,
    priority: ticketData.priority,
  });

  // Create ticket with requester set from the authenticated user — NOT from the
  // request body. This prevents requesters from creating tickets on behalf of others.
  const ticket = await Ticket.create({
    ...ticketData,
    requester: requester._id,
    status: "Created",      // Always starts at Created regardless of payload
    assignee: null,         // Always unassigned at creation
  });

  // Populate requester info so the response includes name/email
  await ticket.populate([
    { path: "requester", select: "firstName lastName email role" },
    { path: "assignee", select: "firstName lastName email role" },
  ]);

  // Append-only audit event — record who created the ticket and when
  await AuditEvent.log({
    ticketId: ticket._id,
    actor: requester._id,
    eventType: "ticket_created",
    toValue: "Created",
    details: `Ticket "${ticket.title}" created by ${requester.firstName} ${requester.lastName}`,
  });

  logger.info("Ticket created", {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    requester: requester._id,
    priority: ticket.priority,
  });

  return ticket;
};

/**
 * getTicketById
 *
 * Fetches a single ticket with all populated references.
 * Filters out internal comments if the requester is viewing.
 *
 * @param {string} ticketId  - MongoDB ObjectId string
 * @param {Object} requestingUser - Authenticated user
 * @returns {Object}         - Ticket with filtered comments
 */
const getTicketById = async (ticketId, requestingUser) => {
  const ticket = await Ticket.findById(ticketId)
    .populate("requester", "firstName lastName email role")
    .populate("assignee", "firstName lastName email role")
    .populate("comments.author", "firstName lastName email role")
    .populate("attachments.uploadedBy", "firstName lastName email");

  if (!ticket) {
    throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");
  }

  // ── Ownership check ───────────────────────────────────────────────────────
  // Requesters can only see their own tickets.
  // Agents and admins can see all tickets.
  if (
    requestingUser.role === "requester" &&
    ticket.requester._id.toString() !== requestingUser._id.toString()
  ) {
    logger.warn("Ticket access denied", {
      userId: requestingUser._id,
      ticketId: ticket._id,
    });
    throw new AppError("You do not have access to this ticket.", 403, "FORBIDDEN");
  }

  // ── Filter internal comments for requesters ───────────────────────────────
  // Internal notes must NEVER be sent to requesters. We filter here in the
  // service (not in the controller or model) so every code path respects this rule.
  if (requestingUser.role === "requester") {
    ticket.comments = ticket.comments.filter((c) => c.visibility === "public");
  }

  return ticket;
};

/**
 * listRequesterTickets
 *
 * Returns a paginated, searchable, filterable list of tickets belonging to
 * the authenticated requester.
 *
 * @param {Object} requestingUser - Authenticated requester
 * @param {Object} queryParams    - Validated query params (page, limit, filters, sort)
 * @returns {{ tickets: Array, totalItems: number }}
 */
const listRequesterTickets = async (requestingUser, queryParams) => {
  const { page, limit, status, category, priority, type, search, sortBy, sortOrder } = queryParams;

  // ── Build MongoDB query filter ────────────────────────────────────────────
  const filter = {
    requester: requestingUser._id, // Hard lock: only own tickets
  };

  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (type) filter.type = type;

  // Full-text search on ticketNumber and title using regex
  // For production with large datasets, use MongoDB Atlas Search or text indexes
  if (search) {
    filter.$or = [
      { ticketNumber: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
    ];
  }

  // ── Build sort object ─────────────────────────────────────────────────────
  // For priority sort a MongoDB aggregation with $addFields would give correct ordering.
  // For simplicity, we sort alphabetically by priority field name here.
  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  // ── Execute query with pagination ─────────────────────────────────────────
  const skip = (page - 1) * limit;

  const [tickets, totalItems] = await Promise.all([
    Ticket.find(filter)
      .populate("assignee", "firstName lastName email")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(), // .lean() returns plain JS objects — faster, no Mongoose overhead
    Ticket.countDocuments(filter),
  ]);

  logger.debug("Requester tickets listed", {
    userId: requestingUser._id,
    totalItems,
    page,
    filters: { status, category, priority, type },
  });

  return { tickets, totalItems };
};

/**
 * listAgentQueue
 *
 * Returns paginated unassigned tickets for the agent queue.
 * Supports the same filters as the requester list.
 *
 * @param {Object} queryParams
 * @returns {{ tickets: Array, totalItems: number }}
 */
const listAgentQueue = async (queryParams) => {
  const { page, limit, status, category, priority, type, search, sortBy, sortOrder } = queryParams;

  // Unassigned queue: only tickets with no assignee
  const filter = { assignee: null };

  // Optionally filter by status (default: exclude Completed tickets from queue)
  if (status) {
    filter.status = status;
  } else {
    filter.status = { $nin: ["Completed"] }; // Hide completed tickets from queue by default
  }

  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (type) filter.type = type;

  if (search) {
    filter.$or = [
      { ticketNumber: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
    ];
  }

  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
  const skip = (page - 1) * limit;

  const [tickets, totalItems] = await Promise.all([
    Ticket.find(filter)
      .populate("requester", "firstName lastName email")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Ticket.countDocuments(filter),
  ]);

  return { tickets, totalItems };
};

/**
 * listAgentAssignedTickets
 *
 * Returns tickets currently assigned to the authenticated agent.
 *
 * @param {Object} agent       - Authenticated agent
 * @param {Object} queryParams
 * @returns {{ tickets: Array, totalItems: number }}
 */
const listAgentAssignedTickets = async (agent, queryParams) => {
  const { page, limit, status, category, priority, type, search, sortBy, sortOrder } = queryParams;

  const filter = { assignee: agent._id };

  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (type) filter.type = type;

  if (search) {
    filter.$or = [
      { ticketNumber: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
    ];
  }

  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
  const skip = (page - 1) * limit;

  const [tickets, totalItems] = await Promise.all([
    Ticket.find(filter)
      .populate("requester", "firstName lastName email")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Ticket.countDocuments(filter),
  ]);

  return { tickets, totalItems };
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * assignTicketToSelf
 *
 * Assigns the ticket to the requesting agent using optimistic concurrency control
 * to prevent two agents from claiming the same ticket simultaneously.
 *
 * Optimistic locking strategy:
 * 1. Read ticket and note its __v (version)
 * 2. Attempt atomic update: update WHERE _id matches AND assignee is still null AND __v still matches
 * 3. If 0 documents updated → someone else got there first → 409 Conflict
 * 4. If 1 document updated → success
 *
 * @param {string} ticketId - MongoDB ObjectId string
 * @param {Object} agent    - Authenticated agent document
 * @returns {Object}        - Updated ticket
 */
const assignTicketToSelf = async (ticketId, agent) => {
  // First, read the ticket to check current state
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) {
    throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");
  }

  // Prevent assignment if ticket is already assigned (to anyone)
  if (ticket.assignee !== null) {
    throw new AppError(
      "This ticket has already been assigned. Please refresh and try again.",
      409,
      "ALREADY_ASSIGNED"
    );
  }

  if (ticket.status === "Completed") {
    throw new AppError("Cannot assign a completed ticket.", 400, "INVALID_TRANSITION");
  }

  // ── Atomic conditional update with optimistic locking ────────────────────
  // findOneAndUpdate with the condition `assignee: null` acts as a compare-and-swap.
  // If two agents submit simultaneously:
  //   - Both read ticket with assignee: null
  //   - One update succeeds (sets assignee = agentId)
  //   - The other update finds assignee !== null → no document matched → returns null
  const updatedTicket = await Ticket.findOneAndUpdate(
    {
      _id: ticketId,
      assignee: null,           // Only update if still unassigned
      __v: ticket.__v,          // Only update if version hasn't changed (OCC)
    },
    {
      assignee: agent._id,
      // Auto-advance status to Assigned if it was Created
      status: ticket.status === "Created" ? "Assigned" : ticket.status,
      $inc: { __v: 1 },         // Increment version to invalidate concurrent operations
    },
    { new: true }               // Return the updated document
  )
    .populate("requester", "firstName lastName email")
    .populate("assignee", "firstName lastName email");

  if (!updatedTicket) {
    // Either version changed (OCC) or assignee changed between our read and write
    logger.warn("Concurrent assignment conflict", {
      ticketId,
      agentId: agent._id,
    });
    throw new AppError(
      "This ticket was just assigned to someone else. Please refresh and try again.",
      409,
      "ALREADY_ASSIGNED"
    );
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  await AuditEvent.log({
    ticketId: updatedTicket._id,
    actor: agent._id,
    eventType: "ticket_assigned",
    fromValue: null,
    toValue: agent._id.toString(),
    details: `Ticket assigned to ${agent.firstName} ${agent.lastName}`,
  });

  // Log status change if it occurred
  if (ticket.status !== updatedTicket.status) {
    await AuditEvent.log({
      ticketId: updatedTicket._id,
      actor: agent._id,
      eventType: "status_changed",
      fromValue: ticket.status,
      toValue: updatedTicket.status,
    });
  }

  logger.info("Ticket assigned to agent", {
    ticketId: updatedTicket._id,
    agentId: agent._id,
    newStatus: updatedTicket.status,
  });

  return updatedTicket;
};

/**
 * unassignTicket
 *
 * Removes assignee from the ticket and reverts status to Created.
 * Requires a description/reason from the agent.
 *
 * @param {string} ticketId    - MongoDB ObjectId string
 * @param {Object} agent       - Authenticated agent
 * @param {string} description - Required reason for unassigning
 * @returns {Object}           - Updated ticket
 */
const unassignTicket = async (ticketId, agent, description) => {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  if (!ticket.assignee) {
    throw new AppError("Ticket is not assigned.", 400, "INVALID_OPERATION");
  }

  if (ticket.status === "Completed") {
    throw new AppError("Cannot unassign a completed ticket.", 400, "INVALID_OPERATION");
  }

  const previousAssignee = ticket.assignee;
  const previousStatus = ticket.status;

  ticket.assignee = null;
  ticket.status = "Created"; // Revert to unassigned state
  await ticket.save();

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: agent._id,
    eventType: "ticket_unassigned",
    fromValue: previousAssignee.toString(),
    toValue: null,
    details: description,
  });

  if (previousStatus !== "Created") {
    await AuditEvent.log({
      ticketId: ticket._id,
      actor: agent._id,
      eventType: "status_changed",
      fromValue: previousStatus,
      toValue: "Created",
    });
  }

  logger.info("Ticket unassigned", { ticketId, agentId: agent._id });

  return ticket.populate([
    { path: "requester", select: "firstName lastName email" },
    { path: "assignee", select: "firstName lastName email" },
  ]);
};

/**
 * startTicket
 *
 * Moves ticket from Assigned → Started.
 * Ticket must have an assignee (enforced by transition rules).
 */
const startTicket = async (ticketId, agent) => {
  return _transitionStatus(ticketId, agent, "Started", "status_changed");
};

/**
 * blockTicket
 *
 * Moves ticket to Blocked status from any state.
 * Requires a reason.
 */
const blockTicket = async (ticketId, agent, reason) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  if (!isValidTransition(ticket.status, "Blocked")) {
    throw new AppError(
      `Cannot block a ticket with status '${ticket.status}'.`,
      400,
      "INVALID_TRANSITION"
    );
  }

  const fromStatus = ticket.status;
  ticket.status = "Blocked";
  await ticket.save();

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: agent._id,
    eventType: "ticket_blocked",
    fromValue: fromStatus,
    toValue: "Blocked",
    details: reason,
  });

  logger.info("Ticket blocked", { ticketId, agentId: agent._id, reason });

  return ticket.populate([
    { path: "requester", select: "firstName lastName email" },
    { path: "assignee", select: "firstName lastName email" },
  ]);
};

/**
 * resumeTicket
 *
 * Moves ticket from Blocked → Started.
 */
const resumeTicket = async (ticketId, agent) => {
  return _transitionStatus(ticketId, agent, "Started", "ticket_resumed");
};

/**
 * completeTicket
 *
 * Moves ticket from Started → Completed.
 * Requires resolutionSummary — validates this in the service (not just Joi).
 *
 * @param {string} ticketId          - MongoDB ObjectId string
 * @param {Object} agent             - Authenticated agent
 * @param {string} resolutionSummary - Required field
 */
const completeTicket = async (ticketId, agent, resolutionSummary) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  if (!isValidTransition(ticket.status, "Completed")) {
    throw new AppError(
      `Cannot complete a ticket with status '${ticket.status}'. Ticket must be in Started status.`,
      400,
      "INVALID_TRANSITION"
    );
  }

  // Double-check the resolution summary is present (Joi also validates this)
  if (!resolutionSummary || resolutionSummary.trim().length < 10) {
    throw new AppError(
      "Resolution summary is required and must be at least 10 characters.",
      400,
      "RESOLUTION_REQUIRED"
    );
  }

  const fromStatus = ticket.status;
  ticket.status = "Completed";
  ticket.resolutionSummary = resolutionSummary.trim();
  ticket.completedAt = new Date();
  await ticket.save();

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: agent._id,
    eventType: "ticket_completed",
    fromValue: fromStatus,
    toValue: "Completed",
    details: resolutionSummary.trim(),
  });

  logger.info("Ticket completed", {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    agentId: agent._id,
  });

  return ticket.populate([
    { path: "requester", select: "firstName lastName email" },
    { path: "assignee", select: "firstName lastName email" },
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addComment
 *
 * Adds a comment to a ticket.
 * Rules:
 * - Requesters can only add public comments on their own tickets
 * - Agents can add public or internal comments on any ticket
 * - Internal visibility is silently coerced to 'public' if user is a requester
 *
 * @param {string} ticketId   - MongoDB ObjectId string
 * @param {Object} user       - Authenticated user
 * @param {Object} commentData - { body, visibility }
 * @returns {Object}          - Updated ticket
 */
const addComment = async (ticketId, user, commentData) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  // ── Ownership check for requesters ────────────────────────────────────────
  if (
    user.role === "requester" &&
    ticket.requester.toString() !== user._id.toString()
  ) {
    throw new AppError(
      "You can only comment on your own tickets.",
      403,
      "FORBIDDEN"
    );
  }

  // ── Coerce visibility for requesters ─────────────────────────────────────
  // Requesters cannot post internal notes even if they send visibility: 'internal'
  const visibility =
    user.role === "requester" ? "public" : commentData.visibility || "public";

  ticket.comments.push({
    author: user._id,
    body: commentData.body,
    visibility,
  });

  await ticket.save();

  // Populate newly added comment's author
  await ticket.populate("comments.author", "firstName lastName email role");

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: user._id,
    eventType: "comment_added",
    details: `${visibility === "internal" ? "[Internal] " : ""}${commentData.body.slice(0, 100)}${commentData.body.length > 100 ? "..." : ""}`,
  });

  logger.debug("Comment added to ticket", {
    ticketId,
    userId: user._id,
    visibility,
  });

  return ticket;
};

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addAttachment
 *
 * Records file metadata on the ticket after multer saves the file to disk.
 * The actual file bytes are stored on disk; only metadata goes in MongoDB.
 *
 * @param {string} ticketId   - MongoDB ObjectId
 * @param {Object} user       - Authenticated user
 * @param {Object} fileInfo   - Multer file object { originalname, filename, mimetype, size }
 * @returns {Object}          - The created attachment metadata
 */
const addAttachment = async (ticketId, user, fileInfo) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  // Ownership check for requesters
  if (
    user.role === "requester" &&
    ticket.requester.toString() !== user._id.toString()
  ) {
    throw new AppError("You can only upload attachments to your own tickets.", 403, "FORBIDDEN");
  }

  const { uploadConfig } = require("../config/multer");
  if (ticket.attachments.length >= uploadConfig.maxAttachments) {
    throw new AppError(
      `Maximum ${uploadConfig.maxAttachments} attachments allowed per ticket.`,
      400,
      "MAX_ATTACHMENTS_EXCEEDED"
    );
  }

  const attachment = {
    originalName: fileInfo.originalname,
    storedName: fileInfo.filename,
    mimeType: fileInfo.mimetype,
    size: fileInfo.size,
    uploadedBy: user._id,
  };

  ticket.attachments.push(attachment);
  await ticket.save();

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: user._id,
    eventType: "attachment_added",
    details: `File "${fileInfo.originalname}" (${Math.round(fileInfo.size / 1024)}KB) uploaded`,
  });

  logger.debug("Attachment added", {
    ticketId,
    userId: user._id,
    fileName: fileInfo.originalname,
  });

  // Return the last added attachment
  return ticket.attachments[ticket.attachments.length - 1];
};

/**
 * deleteAttachment
 *
 * Removes attachment metadata from the ticket and deletes the file from disk.
 *
 * @param {string} ticketId    - MongoDB ObjectId string
 * @param {string} attachmentId - MongoDB ObjectId of the attachment sub-document
 * @param {Object} user        - Authenticated user (agent or admin only)
 */
const deleteAttachment = async (ticketId, attachmentId, user) => {
  const fs = require("fs");
  const path = require("path");
  const { uploadConfig } = require("../config/multer");

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  const attachment = ticket.attachments.id(attachmentId);
  if (!attachment) {
    throw new AppError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
  }

  const storedName = attachment.storedName;
  const originalName = attachment.originalName;

  // Remove metadata from ticket
  attachment.deleteOne();
  await ticket.save();

  // Delete file from disk — wrap in try/catch so missing files don't fail the request
  try {
    const filePath = path.join(uploadConfig.uploadDir, storedName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug("Attachment file deleted from disk", { filePath });
    }
  } catch (fsError) {
    logger.error("Failed to delete attachment file from disk", {
      storedName,
      error: fsError.message,
    });
    // Continue — metadata is already removed from DB; orphan file can be cleaned up separately
  }

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: user._id,
    eventType: "attachment_deleted",
    details: `File "${originalName}" deleted`,
  });

  logger.info("Attachment deleted", { ticketId, attachmentId, userId: user._id });
};

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * _transitionStatus
 *
 * Internal helper that handles the common pattern of:
 * 1. Fetch ticket
 * 2. Validate transition
 * 3. Update status
 * 4. Save
 * 5. Write audit event
 *
 * @param {string} ticketId   - MongoDB ObjectId string
 * @param {Object} agent      - Authenticated agent
 * @param {string} newStatus  - Target status
 * @param {string} eventType  - Audit event type
 * @returns {Object}          - Updated ticket
 */
const _transitionStatus = async (ticketId, agent, newStatus, eventType) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");

  if (!isValidTransition(ticket.status, newStatus)) {
    throw new AppError(
      `Cannot transition from '${ticket.status}' to '${newStatus}'.`,
      400,
      "INVALID_TRANSITION"
    );
  }

  // For Starting a ticket: must be assigned (to anyone, not necessarily to this agent)
  if (newStatus === "Started" && !ticket.assignee) {
    throw new AppError(
      "Cannot start an unassigned ticket. Please assign it first.",
      400,
      "TICKET_NOT_ASSIGNED"
    );
  }

  const fromStatus = ticket.status;
  ticket.status = newStatus;
  await ticket.save();

  await AuditEvent.log({
    ticketId: ticket._id,
    actor: agent._id,
    eventType,
    fromValue: fromStatus,
    toValue: newStatus,
  });

  logger.info("Ticket status transitioned", {
    ticketId: ticket._id,
    fromStatus,
    toStatus: newStatus,
    agentId: agent._id,
  });

  return ticket.populate([
    { path: "requester", select: "firstName lastName email" },
    { path: "assignee", select: "firstName lastName email" },
  ]);
};

module.exports = {
  createTicket,
  getTicketById,
  listRequesterTickets,
  listAgentQueue,
  listAgentAssignedTickets,
  assignTicketToSelf,
  unassignTicket,
  startTicket,
  blockTicket,
  resumeTicket,
  completeTicket,
  addComment,
  addAttachment,
  deleteAttachment,
};
