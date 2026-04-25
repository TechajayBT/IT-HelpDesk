/**
 * API Services
 *
 * Each function maps 1-to-1 with a backend API endpoint.
 * Services return the `data` field from the response envelope,
 * so callers don't need to dig into response.data.data everywhere.
 *
 * Organized into three exported objects:
 *   authApi     — /api/auth/*
 *   ticketApi   — /api/tickets/* and /api/agent/*
 *   dashboardApi — /api/dashboard/* and /api/reports/* and /api/audit-logs
 */

import apiClient from "./apiClient";

// ─────────────────────────────────────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Register a new user account.
   * Returns { user, token } on success — backend auto-logs in after registration.
   */
  register: async (payload) => {
    const res = await apiClient.post("/auth/register", payload);
    return res.data.data; // { user, token }
  },

  /**
   * Authenticate with email/password.
   * Returns { user, token }.
   */
  login: async (email, password) => {
    const res = await apiClient.post("/auth/login", { email, password });
    return res.data.data; // { user, token }
  },

  /**
   * Invalidate the current session.
   * Client is responsible for discarding the stored token after this call.
   */
  logout: async () => {
    await apiClient.post("/auth/logout");
  },

  /**
   * Fetch the current user's profile.
   * Used on app bootstrap to restore user state from a stored token.
   */
  getMe: async () => {
    const res = await apiClient.get("/auth/me");
    return res.data.data.user; // User object
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET API
// ─────────────────────────────────────────────────────────────────────────────

export const ticketApi = {
  /**
   * Create a new ticket (requester action).
   * @param {Object} payload - Validated ticket form data
   */
  createTicket: async (payload) => {
    const res = await apiClient.post("/tickets", payload);
    return res.data.data.ticket;
  },

  /**
   * Fetch the authenticated requester's own tickets with pagination/filters.
   * @param {Object} params - { page, limit, status, category, priority, search, ... }
   * @returns {{ data: Ticket[], pagination: PaginationMeta }}
   */
  getMyTickets: async (params = {}) => {
    const res = await apiClient.get("/tickets/my", { params });
    return { tickets: res.data.data, pagination: res.data.pagination };
  },

  /**
   * Fetch a single ticket by ID.
   * Service enforces RBAC — requesters only get their own tickets.
   */
  getTicketById: async (id) => {
    const res = await apiClient.get(`/tickets/${id}`);
    return res.data.data.ticket;
  },

  /**
   * Get ticket audit/history timeline.
   */
  getTicketHistory: async (id) => {
    const res = await apiClient.get(`/tickets/${id}/history`);
    return res.data.data.history;
  },

  // ── Agent queue endpoints ─────────────────────────────────────────────────

  /**
   * Fetch all unassigned tickets (agent's shared queue).
   */
  getUnassignedTickets: async (params = {}) => {
    const res = await apiClient.get("/agent/tickets/unassigned", { params });
    return { tickets: res.data.data, pagination: res.data.pagination };
  },

  /**
   * Fetch tickets assigned to the current agent.
   */
  getAssignedToMe: async (params = {}) => {
    const res = await apiClient.get("/agent/tickets/assigned-to-me", { params });
    return { tickets: res.data.data, pagination: res.data.pagination };
  },

  // ── Status transitions ────────────────────────────────────────────────────

  /** Agent claims an unassigned ticket (OCC-protected). */
  assignToSelf: async (ticketId) => {
    const res = await apiClient.post(`/tickets/${ticketId}/assign-to-me`);
    return res.data.data.ticket;
  },

  /** Agent unassigns the ticket (requires reason). */
  unassignTicket: async (ticketId, description) => {
    const res = await apiClient.post(`/tickets/${ticketId}/unassign`, { description });
    return res.data.data.ticket;
  },

  /** Agent starts working — Assigned → Started. */
  startTicket: async (ticketId) => {
    const res = await apiClient.post(`/tickets/${ticketId}/start`);
    return res.data.data.ticket;
  },

  /** Agent blocks/puts ticket on hold (requires reason). */
  blockTicket: async (ticketId, reason) => {
    const res = await apiClient.post(`/tickets/${ticketId}/block`, { reason });
    return res.data.data.ticket;
  },

  /** Agent resumes blocked ticket — Blocked → Started. */
  resumeTicket: async (ticketId) => {
    const res = await apiClient.post(`/tickets/${ticketId}/resume`);
    return res.data.data.ticket;
  },

  /** Agent completes ticket (requires resolution summary). */
  completeTicket: async (ticketId, resolutionSummary) => {
    const res = await apiClient.post(`/tickets/${ticketId}/complete`, { resolutionSummary });
    return res.data.data.ticket;
  },

  // ── Comments ──────────────────────────────────────────────────────────────

  /**
   * Add a comment to a ticket.
   * @param {string} ticketId
   * @param {{ body: string, visibility: 'public'|'internal' }} payload
   */
  addComment: async (ticketId, payload) => {
    const res = await apiClient.post(`/tickets/${ticketId}/comments`, payload);
    return res.data.data.comment;
  },

  // ── Attachments ───────────────────────────────────────────────────────────

  /**
   * Upload a file attachment to a ticket.
   * Uses multipart/form-data — NOT JSON.
   * @param {string} ticketId
   * @param {File}   file     - Browser File object from <input type="file">
   * @param {Function} [onProgress] - Optional upload progress callback
   */
  uploadAttachment: async (ticketId, file, onProgress) => {
    const formData = new FormData();
    formData.append("file", file); // Must match multer's field name: "file"

    const res = await apiClient.post(`/tickets/${ticketId}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onProgress
        ? (progressEvent) => {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percent);
          }
        : undefined,
    });
    return res.data.data.attachment;
  },

  /** Delete an attachment (agent/admin only). */
  deleteAttachment: async (attachmentId) => {
    await apiClient.delete(`/attachments/${attachmentId}`);
  },

  /** Download attachment — returns a Blob URL for the browser to open. */
  downloadAttachment: async (attachmentId, originalName) => {
    const res = await apiClient.get(`/attachments/${attachmentId}`, {
      responseType: "blob",
    });
    // Create a temporary <a> element to trigger the browser download
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", originalName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD API
// ─────────────────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getRequesterDashboard: async () => {
    const res = await apiClient.get("/dashboard/requester");
    return res.data.data;
  },

  getAgentDashboard: async () => {
    const res = await apiClient.get("/dashboard/agent");
    return res.data.data;
  },

  getAdminDashboard: async () => {
    const res = await apiClient.get("/dashboard/admin");
    return res.data.data;
  },

  getTicketsByStatus: async () => {
    const res = await apiClient.get("/reports/tickets-by-status");
    return res.data.data;
  },

  getTicketsByCategory: async () => {
    const res = await apiClient.get("/reports/tickets-by-category");
    return res.data.data;
  },

  getAuditLogs: async (params = {}) => {
    const res = await apiClient.get("/audit-logs", { params });
    return { logs: res.data.data, pagination: res.data.pagination };
  },
};
