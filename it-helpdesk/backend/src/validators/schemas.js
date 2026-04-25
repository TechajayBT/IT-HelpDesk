/**
 * Joi Validation Schemas
 *
 * Every write endpoint validates its request body against a Joi schema before
 * the controller runs. This keeps validation logic out of controllers and
 * ensures consistent error messages.
 *
 * Schema naming convention: <entity><Action>Schema
 * Examples: userRegisterSchema, ticketCreateSchema, commentCreateSchema
 */

const Joi = require("joi");

// ── Reusable field definitions ────────────────────────────────────────────────
// Define common fields once and reuse them in multiple schemas to stay DRY

const passwordRule = Joi.string()
  .min(8)
  .max(128)
  .pattern(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/,
    "password complexity"
  )
  .messages({
    "string.pattern.name":
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#)",
    "string.min": "Password must be at least 8 characters",
  });

const mongoIdRule = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({ "string.pattern.base": "Invalid ID format" });

// ── Auth Schemas ──────────────────────────────────────────────────────────────

const userRegisterSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "First name is required",
  }),
  lastName: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Last name is required",
  }),
  email: Joi.string().email().lowercase().required().messages({
    "string.email": "Please provide a valid email address",
    "string.empty": "Email is required",
  }),
  password: passwordRule.required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "string.empty": "Please confirm your password",
  }),
  // Role can be set by admin during user creation; defaults to 'requester'
  role: Joi.string().valid("requester", "agent", "admin").default("requester"),
});

const userLoginSchema = Joi.object({
  email: Joi.string().email().lowercase().required().messages({
    "string.email": "Please provide a valid email address",
    "string.empty": "Email is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
  }),
});

// ── Ticket Schemas ────────────────────────────────────────────────────────────

const ticketCreateSchema = Joi.object({
  title: Joi.string().trim().min(5).max(200).required().messages({
    "string.min": "Title must be at least 5 characters",
    "string.empty": "Title is required",
  }),
  description: Joi.string().trim().min(10).max(10000).required().messages({
    "string.min": "Description must be at least 10 characters",
    "string.empty": "Description is required",
  }),
  type: Joi.string().valid("Incident", "Service Request").required().messages({
    "any.only": "Type must be Incident or Service Request",
    "string.empty": "Type is required",
  }),
  category: Joi.string()
    .valid(
      "Hardware",
      "Software",
      "Network/VPN",
      "Email/Collaboration",
      "Access & Permissions",
      "Other"
    )
    .required()
    .messages({
      "any.only": "Invalid category selected",
      "string.empty": "Category is required",
    }),
  subcategory: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Subcategory is required",
  }),
  priority: Joi.string().valid("Low", "High", "Critical").required().messages({
    "any.only": "Priority must be Low, High, or Critical",
    "string.empty": "Priority is required",
  }),
  // Extra fields — optional, validated only when present
  extraFields: Joi.object({
    deviceType: Joi.string().valid("Laptop", "Desktop", "Mobile").allow(null),
    operatingSystem: Joi.string().valid("Windows", "macOS", "Other").allow(null),
    location: Joi.string().valid("Office", "Remote").allow(null),
  }).default({}),
});

const ticketListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string()
    .valid("Created", "Assigned", "Started", "Completed", "Blocked")
    .allow(""),
  category: Joi.string()
    .valid(
      "Hardware",
      "Software",
      "Network/VPN",
      "Email/Collaboration",
      "Access & Permissions",
      "Other"
    )
    .allow(""),
  priority: Joi.string().valid("Low", "High", "Critical").allow(""),
  type: Joi.string().valid("Incident", "Service Request").allow(""),
  search: Joi.string().trim().max(100).allow(""),
  sortBy: Joi.string().valid("createdAt", "updatedAt", "priority").default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

// ── Comment Schema ────────────────────────────────────────────────────────────

const commentCreateSchema = Joi.object({
  body: Joi.string().trim().min(1).max(5000).required().messages({
    "string.empty": "Comment body is required",
    "string.min": "Comment cannot be empty",
  }),
  // Only agents/admins can post internal notes; this is also enforced in the controller
  visibility: Joi.string().valid("public", "internal").default("public"),
});

// ── Status Transition Schemas ─────────────────────────────────────────────────

const completeTicketSchema = Joi.object({
  resolutionSummary: Joi.string().trim().min(10).max(5000).required().messages({
    "string.empty": "Resolution summary is required to complete a ticket",
    "string.min": "Resolution summary must be at least 10 characters",
  }),
});

const blockTicketSchema = Joi.object({
  reason: Joi.string().trim().min(5).max(1000).required().messages({
    "string.empty": "A reason is required to block a ticket",
  }),
});

const unassignTicketSchema = Joi.object({
  description: Joi.string().trim().min(5).max(1000).required().messages({
    "string.empty": "A description is required when unassigning a ticket",
  }),
});

// ── Audit Log Query Schema ────────────────────────────────────────────────────

const auditLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  ticketId: mongoIdRule.allow(""),
  eventType: Joi.string()
    .valid(
      "ticket_created",
      "ticket_assigned",
      "ticket_unassigned",
      "status_changed",
      "comment_added",
      "attachment_added",
      "attachment_deleted",
      "ticket_completed",
      "ticket_blocked",
      "ticket_resumed"
    )
    .allow(""),
  fromDate: Joi.date().iso(),
  toDate: Joi.date().iso().min(Joi.ref("fromDate")),
});

module.exports = {
  userRegisterSchema,
  userLoginSchema,
  ticketCreateSchema,
  ticketListQuerySchema,
  commentCreateSchema,
  completeTicketSchema,
  blockTicketSchema,
  unassignTicketSchema,
  auditLogQuerySchema,
};
