/**
 * Ticket Status Transition Rules
 *
 * Single source of truth for valid status transitions.
 * Both the API (service layer) and the frontend use the same rules.
 *
 * The transition map is a directed graph where:
 *   key   = current status
 *   value = array of statuses the current status can transition TO
 *
 * Canonical flow:
 *   Created → Assigned → Started → Completed
 *   Any state → Blocked
 *   Blocked → Started (resume)
 */

// ── Transition adjacency map ──────────────────────────────────────────────────
const VALID_TRANSITIONS = {
  Created: ["Assigned", "Blocked"],
  Assigned: ["Started", "Blocked"],
  Started: ["Completed", "Blocked"],
  Completed: [], // Terminal state — cannot transition out
  Blocked: ["Started"], // Resume only to Started
};

/**
 * isValidTransition
 *
 * Checks whether moving a ticket from `currentStatus` to `targetStatus` is
 * allowed by the business rules defined above.
 *
 * @param {string} currentStatus - The ticket's current status
 * @param {string} targetStatus  - The desired new status
 * @returns {boolean}
 */
const isValidTransition = (currentStatus, targetStatus) => {
  const allowedNext = VALID_TRANSITIONS[currentStatus];
  if (!allowedNext) return false; // Unknown current status
  return allowedNext.includes(targetStatus);
};

/**
 * getValidTransitions
 *
 * Returns the list of statuses a ticket can transition TO from its current state.
 * Used by the frontend to decide which action buttons to enable/disable.
 *
 * @param {string} currentStatus
 * @returns {string[]}
 */
const getValidTransitions = (currentStatus) => {
  return VALID_TRANSITIONS[currentStatus] || [];
};

/**
 * STATUS_LABELS
 * Maps internal status values to human-readable display labels.
 */
const STATUS_LABELS = {
  Created: "Created",
  Assigned: "Assigned",
  Started: "In Progress",
  Completed: "Completed",
  Blocked: "Blocked / On-hold",
};

/**
 * TICKET_CATEGORIES
 * Category → Subcategory mapping used for both validation and UI dropdown population.
 */
const TICKET_CATEGORIES = {
  Hardware: [
    "Laptop Issue",
    "Desktop Issue",
    "Peripheral Device",
    "Hardware Replacement",
    "Other Hardware",
  ],
  Software: [
    "Application Crash",
    "Installation Request",
    "License Issue",
    "Performance Issue",
    "Other Software",
  ],
  "Network/VPN": [
    "VPN Connection",
    "Wi-Fi Issue",
    "Slow Internet",
    "Network Drive Access",
    "Other Network",
  ],
  "Email/Collaboration": [
    "Email Not Working",
    "Calendar Issue",
    "Teams/Slack Issue",
    "Distribution List",
    "Other Collaboration",
  ],
  "Access & Permissions": [
    "Account Locked",
    "Password Reset",
    "New Access Request",
    "Permission Change",
    "Other Access",
  ],
  Other: ["General Inquiry", "Other"],
};

module.exports = {
  VALID_TRANSITIONS,
  isValidTransition,
  getValidTransitions,
  STATUS_LABELS,
  TICKET_CATEGORIES,
};
