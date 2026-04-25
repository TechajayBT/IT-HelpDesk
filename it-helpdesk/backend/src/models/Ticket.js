/**
 * Ticket Model
 *
 * Central entity of the IT Helpdesk system. Tracks the full lifecycle of a
 * support request from creation to resolution.
 *
 * Design decisions:
 * - Comments are embedded as a sub-array (not a separate collection) because
 *   they are always loaded alongside the ticket and rarely exceed a few dozen.
 *   This keeps the read as a single MongoDB query.
 * - Attachments metadata is embedded; actual files live on disk.
 * - Status is system-managed; the API validates all transitions via a
 *   dedicated service (not raw field updates).
 *
 * Indexes:
 * - requester, assignee, status, priority, createdAt — covers the most common
 *   query patterns (my tickets, queue view, dashboard aggregations)
 */

const mongoose = require("mongoose");

// ── Sub-schema: Attachment ───────────────────────────────────────────────────
// Stores file metadata; the actual file bytes live on disk (or S3 in production)
const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true }, // Human-readable filename shown in UI
    storedName: { type: String, required: true }, // UUID-based filename on disk
    mimeType: { type: String, required: true },
    size: { type: Number, required: true }, // Bytes
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// ── Sub-schema: Comment ──────────────────────────────────────────────────────
// Both requesters and agents post comments. 'internal' notes are agent-only
// and must be filtered out of responses sent to requesters.
const commentSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: [true, "Comment body is required"],
      trim: true,
      maxlength: [5000, "Comment cannot exceed 5000 characters"],
    },
    // visibility controls who can see this comment:
    // 'public'   — visible to everyone including requester
    // 'internal' — visible to agents and admins only (never sent to requester)
    visibility: {
      type: String,
      enum: ["public", "internal"],
      default: "public",
    },
    attachments: [attachmentSchema], // Optional files attached to this comment
  },
  { timestamps: true }
);

// ── Main Ticket Schema ───────────────────────────────────────────────────────
const ticketSchema = new mongoose.Schema(
  {
    // ── Identification ───────────────────────────────────────────────────────
    // Human-readable ticket ID (e.g., "TKT-0001") for display in UI
    ticketNumber: {
      type: String,
      unique: true,
      // Generated in a pre-save hook using a counter approach
    },

    // ── Core Fields ──────────────────────────────────────────────────────────
    title: {
      type: String,
      required: [true, "Ticket title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Ticket description is required"],
      trim: true,
      maxlength: [10000, "Description cannot exceed 10000 characters"],
    },
    type: {
      type: String,
      required: [true, "Ticket type is required"],
      enum: {
        values: ["Incident", "Service Request"],
        message: "Type must be Incident or Service Request",
      },
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: [
          "Hardware",
          "Software",
          "Network/VPN",
          "Email/Collaboration",
          "Access & Permissions",
          "Other",
        ],
        message: "Invalid category",
      },
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
    },
    priority: {
      type: String,
      required: [true, "Priority is required"],
      enum: {
        values: ["Low", "High", "Critical"],
        message: "Priority must be Low, High, or Critical",
      },
    },

    // ── Status Lifecycle ─────────────────────────────────────────────────────
    // Valid transitions: Created → Assigned → Started → Completed
    // Any state → Blocked/On-hold; Blocked/On-hold → Started (resume)
    status: {
      type: String,
      enum: {
        values: ["Created", "Assigned", "Started", "Completed", "Blocked"],
        message: "Invalid status",
      },
      default: "Created",
    },

    // ── People ────────────────────────────────────────────────────────────────
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Requester is required"],
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Resolution ────────────────────────────────────────────────────────────
    // Required before a ticket can be marked Completed
    resolutionSummary: {
      type: String,
      trim: true,
      maxlength: [5000, "Resolution summary cannot exceed 5000 characters"],
    },
    completedAt: {
      type: Date,
      default: null,
    },

    // ── Category-Specific Extra Fields ────────────────────────────────────────
    // Stored as a flexible object to avoid schema proliferation for each category.
    // UI renders the relevant fields based on the selected category.
    extraFields: {
      deviceType: {
        type: String,
        enum: ["Laptop", "Desktop", "Mobile", null],
        default: null,
      },
      operatingSystem: {
        type: String,
        enum: ["Windows", "macOS", "Other", null],
        default: null,
      },
      location: {
        type: String,
        enum: ["Office", "Remote", null],
        default: null,
      },
    },

    // ── Embedded Content ──────────────────────────────────────────────────────
    comments: [commentSchema],
    attachments: [attachmentSchema],

    // ── Optimistic Locking (concurrent assign-to-me) ──────────────────────────
    // __v (Mongoose's default version key) is used for optimistic locking in
    // the assign-to-me flow. Two agents submitting simultaneously:
    //   1. Both read ticket at version N
    //   2. One writes successfully → version becomes N+1
    //   3. The other write fails (version mismatch) → API returns 409 Conflict
    // This prevents double-assignment without transactions.
  },
  {
    timestamps: true, // createdAt, updatedAt
    optimisticConcurrency: true, // Mongoose built-in OCC using __v
  }
);

// ── Compound Indexes ─────────────────────────────────────────────────────────
// These index combinations match the most common query patterns:

// Requester's "My Tickets" list: filter by requester, sort by createdAt
ticketSchema.index({ requester: 1, createdAt: -1 });

// Agent queue: unassigned tickets sorted by priority then creation date
ticketSchema.index({ assignee: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1, createdAt: 1 });

// Dashboard aggregations group by status, category
ticketSchema.index({ status: 1 });
ticketSchema.index({ category: 1 });

// ── Pre-save hook: generate ticketNumber ─────────────────────────────────────
// Generates a sequential, human-readable ticket number like "TKT-00042".
// Uses mongoose's Model.countDocuments() as a simple counter. For high-concurrency
// production systems this would be replaced with a MongoDB atomic counter
// using findOneAndUpdate on a dedicated counters collection.
ticketSchema.pre("save", async function (next) {
  if (this.isNew && !this.ticketNumber) {
    try {
      const count = await mongoose.model("Ticket").countDocuments();
      // Zero-pad to 5 digits; supports up to 99,999 tickets without overflow
      this.ticketNumber = `TKT-${String(count + 1).padStart(5, "0")}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// ── Instance method: canBeAccessedBy ─────────────────────────────────────────
// Returns true if the given user is allowed to view this ticket.
// Centralises the ownership/role check used in multiple controllers.
ticketSchema.methods.canBeAccessedBy = function (user) {
  if (user.role === "admin") return true;
  if (user.role === "agent") return true;
  // Requester can only see their own tickets
  return this.requester.toString() === user._id.toString();
};

const Ticket = mongoose.model("Ticket", ticketSchema);

module.exports = Ticket;
