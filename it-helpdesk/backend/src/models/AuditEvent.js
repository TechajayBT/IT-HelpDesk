/**
 * AuditEvent Model — Append-Only Audit Log
 *
 * Records every meaningful action that happens to a ticket. The log is append-only:
 * no UPDATE or DELETE operations are ever performed on these documents.
 *
 * Why append-only?
 * - Provides a tamper-evident history for compliance purposes
 * - Enables "undo" features and dispute resolution
 * - Makes the ticket timeline UI trivial to build (just sort by createdAt)
 *
 * Each event captures:
 * - What happened (eventType)
 * - Who did it (actor)
 * - When it happened (createdAt via timestamps)
 * - What ticket it belongs to (ticketId)
 * - The before/after state for transitions (fromValue, toValue)
 * - Optional free-text details for complex events
 */

const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
  {
    // ── Ticket reference ─────────────────────────────────────────────────────
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: [true, "ticketId is required for audit events"],
      index: true, // Heavy query: "give me all events for this ticket"
    },

    // ── Actor (who triggered this event) ─────────────────────────────────────
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "actor is required for audit events"],
    },

    // ── Event classification ──────────────────────────────────────────────────
    // Using a controlled vocabulary makes it easy to filter by event type on
    // the audit log UI and to generate reports (e.g., "all assignments this week")
    eventType: {
      type: String,
      required: [true, "eventType is required"],
      enum: {
        values: [
          "ticket_created",    // Ticket first submitted
          "ticket_assigned",   // Assignee set or changed
          "ticket_unassigned", // Assignee removed
          "status_changed",    // Any status transition
          "comment_added",     // New comment (public or internal)
          "attachment_added",  // File uploaded
          "attachment_deleted",// File removed
          "ticket_completed",  // Resolved with summary
          "ticket_blocked",    // Moved to Blocked/On-hold
          "ticket_resumed",    // Resumed from Blocked to Started
        ],
        message: "Invalid eventType",
      },
    },

    // ── State transition metadata ─────────────────────────────────────────────
    // For status_changed and ticket_assigned events we record before/after
    // so the history timeline can display "Status changed from Started → Completed"
    fromValue: {
      type: String,
      default: null, // null for events that don't have a "before" state (e.g., ticket_created)
    },
    toValue: {
      type: String,
      default: null,
    },

    // ── Human-readable context ────────────────────────────────────────────────
    // Extra detail that doesn't fit neatly into from/to. Examples:
    //   - Resolution summary text on ticket_completed
    //   - Reason entered when unassigning
    //   - Comment body preview on comment_added
    details: {
      type: String,
      maxlength: [2000, "Details cannot exceed 2000 characters"],
      default: null,
    },
  },
  {
    // Only createdAt is needed (no updatedAt — we never update these docs)
    timestamps: { createdAt: true, updatedAt: false },

    // Documents in this collection are NEVER updated. Enforcing this at the
    // application layer; you could also enforce at the DB layer via a change stream
    // or a custom plugin that rejects updates.
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Most common queries: "all events for ticket X" and "all events of type Y in date range"
auditEventSchema.index({ ticketId: 1, createdAt: -1 }); // Ticket history timeline
auditEventSchema.index({ eventType: 1, createdAt: -1 }); // Admin audit log with type filter
auditEventSchema.index({ actor: 1, createdAt: -1 });     // "What did this user do?"

// ── Static factory method ────────────────────────────────────────────────────
// Using a static method instead of calling new AuditEvent() directly ensures
// consistent event creation and makes it easy to add cross-cutting logic
// (e.g., alerting, analytics) in one place.
auditEventSchema.statics.log = async function ({
  ticketId,
  actor,
  eventType,
  fromValue = null,
  toValue = null,
  details = null,
}) {
  return this.create({ ticketId, actor, eventType, fromValue, toValue, details });
};

const AuditEvent = mongoose.model("AuditEvent", auditEventSchema);

module.exports = AuditEvent;
