/**
 * Utility Functions
 *
 * Pure helper functions used across multiple components.
 * No side effects, no imports from the app — easy to unit test.
 */

import { format, formatDistanceToNow, parseISO } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// DATE FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatDate
 * Formats an ISO date string for display in the ticket table.
 * Example: "Apr 11, 2026"
 */
export const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    return format(parseISO(dateString), "MMM d, yyyy");
  } catch {
    return "Invalid date";
  }
};

/**
 * formatDateTime
 * Formats an ISO date string with time for the audit/history timeline.
 * Example: "Apr 11, 2026 at 14:32"
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return "—";
  try {
    return format(parseISO(dateString), "MMM d, yyyy 'at' HH:mm");
  } catch {
    return "Invalid date";
  }
};

/**
 * timeAgo
 * Returns a relative time string like "2 hours ago" or "3 days ago".
 * Used in comment threads and activity feeds.
 */
export const timeAgo = (dateString) => {
  if (!dateString) return "";
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch {
    return "";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BADGE COLOR HELPERS
// These return Tailwind class strings for colored badges.
// Centralised here so changing a color updates every badge in the app.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getStatusClasses
 * Returns Tailwind classes for the given ticket status badge.
 *
 * @param {string} status - "Created" | "Assigned" | "Started" | "Completed" | "Blocked"
 * @returns {string} - Combined Tailwind class string
 */
export const getStatusClasses = (status) => {
  const map = {
    Created:   "bg-slate-100 text-slate-700 border border-slate-200",
    Assigned:  "bg-blue-50  text-blue-700  border border-blue-200",
    Started:   "bg-indigo-50 text-indigo-700 border border-indigo-200",
    Completed: "bg-green-50 text-green-700 border border-green-200",
    Blocked:   "bg-red-50   text-red-700   border border-red-200",
  };
  return map[status] || "bg-slate-100 text-slate-600";
};

/**
 * getPriorityClasses
 * Returns Tailwind classes for the given ticket priority badge.
 *
 * @param {string} priority - "Low" | "High" | "Critical"
 * @returns {string}
 */
export const getPriorityClasses = (priority) => {
  const map = {
    Low:      "bg-slate-100 text-slate-600 border border-slate-200",
    High:     "bg-amber-50  text-amber-700 border border-amber-200",
    Critical: "bg-red-50    text-red-700   border border-red-200",
  };
  return map[priority] || "bg-slate-100 text-slate-600";
};

/**
 * getRoleBadgeClasses
 * Returns Tailwind classes for user role badges.
 */
export const getRoleBadgeClasses = (role) => {
  const map = {
    requester: "bg-sky-50    text-sky-700    border border-sky-200",
    agent:     "bg-violet-50 text-violet-700 border border-violet-200",
    admin:     "bg-rose-50   text-rose-700   border border-rose-200",
  };
  return map[role] || "bg-slate-100 text-slate-600";
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET STATUS FLOW HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered status steps for the progress bar. */
export const STATUS_STEPS = ["Created", "Assigned", "Started", "Completed"];

/**
 * getStatusStepIndex
 * Returns the 0-based index of a status in the progress bar.
 * Returns 0 for "Blocked" (same position as current — doesn't advance).
 */
export const getStatusStepIndex = (status) => {
  if (status === "Blocked") return -1; // Special state shown separately
  return STATUS_STEPS.indexOf(status);
};

// ─────────────────────────────────────────────────────────────────────────────
// MISC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * truncate
 * Truncates a string to a given length with an ellipsis.
 */
export const truncate = (str, maxLen = 80) => {
  if (!str) return "";
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
};

/**
 * formatFileSize
 * Converts bytes to a human-readable string.
 * Example: 1536000 → "1.5 MB"
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * buildQueryString
 * Converts an object of params to a URL query string, omitting empty values.
 * Example: { page: 1, status: "", priority: "High" } → "page=1&priority=High"
 */
export const buildQueryString = (params) => {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
  );
  return new URLSearchParams(filtered).toString();
};

/**
 * getInitials
 * Returns up to 2 initials from a full name for avatar display.
 * Example: "John Agent" → "JA"
 */
export const getInitials = (firstName = "", lastName = "") => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};
