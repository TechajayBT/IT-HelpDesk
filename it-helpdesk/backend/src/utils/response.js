/**
 * API Response Helpers
 *
 * Enforces a consistent response envelope across all endpoints:
 *
 * Success:
 *   { success: true, message: "...", data: {...} }
 *
 * Paginated list:
 *   { success: true, data: [...], pagination: { page, limit, totalPages, totalItems } }
 *
 * Error (from error middleware):
 *   { success: false, error: { code, message, details } }
 *
 * Why a helper module?
 * - Ensures every response follows the same shape — no per-controller formatting
 * - Changing the envelope format is a one-file change
 * - Makes unit testing easier (check helper in isolation)
 */

/**
 * Send a successful response.
 *
 * @param {import("express").Response} res
 * @param {Object} options
 * @param {*}      options.data       - Payload to include under "data"
 * @param {string} [options.message]  - Optional human-readable message
 * @param {number} [options.statusCode=200] - HTTP status code
 */
const sendSuccess = (res, { data = null, message = "Success", statusCode = 200 } = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send a paginated list response.
 *
 * @param {import("express").Response} res
 * @param {Object} options
 * @param {Array}  options.data       - Array of items for the current page
 * @param {number} options.page       - Current page (1-indexed)
 * @param {number} options.limit      - Items per page
 * @param {number} options.totalItems - Total items across all pages
 * @param {string} [options.message]
 */
const sendPaginated = (res, { data, page, limit, totalItems, message = "Success" }) => {
  const totalPages = Math.ceil(totalItems / limit);
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
};

/**
 * Send a created (201) response.
 * Convenience wrapper around sendSuccess for POST endpoints.
 */
const sendCreated = (res, { data = null, message = "Created successfully" } = {}) => {
  return sendSuccess(res, { data, message, statusCode: 201 });
};

module.exports = { sendSuccess, sendPaginated, sendCreated };
