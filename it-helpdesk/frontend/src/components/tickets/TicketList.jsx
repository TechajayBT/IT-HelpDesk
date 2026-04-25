/**
 * Ticket List Components
 *
 * Reusable components for displaying tickets in table/list format.
 *
 * Exported:
 * - TicketFilters   — Search + filter toolbar above the table
 * - TicketTable     — Responsive table with sortable columns
 * - StatusProgressBar — Visual workflow progress indicator
 */

import React from "react";
import { Link } from "react-router-dom";
import { Search, Filter, SortAsc, SortDesc } from "lucide-react";
import { Badge } from "../common";
import {
  getStatusClasses,
  getPriorityClasses,
  formatDate,
  STATUS_STEPS,
} from "../../utils/helpers";

// ── Category → Subcategory mapping (mirrors backend validation) ───────────────
export const CATEGORY_SUBCATEGORIES = {
  Hardware: ["Laptop Issue", "Desktop Issue", "Peripheral Device", "Hardware Replacement", "Other Hardware"],
  Software: ["Application Crash", "Installation Request", "License Issue", "Performance Issue", "Other Software"],
  "Network/VPN": ["VPN Connection", "Wi-Fi Issue", "Slow Internet", "Network Drive Access", "Other Network"],
  "Email/Collaboration": ["Email Not Working", "Calendar Issue", "Teams/Slack Issue", "Distribution List", "Other Collaboration"],
  "Access & Permissions": ["Account Locked", "Password Reset", "New Access Request", "Permission Change", "Other Access"],
  Other: ["General Inquiry", "Other"],
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StatusProgressBar
 *
 * Shows the ticket's position in the Created → Assigned → Started → Completed
 * workflow as a horizontal progress track.
 *
 * Blocked status is shown as a separate indicator below the bar.
 */
export const StatusProgressBar = ({ status }) => {
  const isBlocked = status === "Blocked";
  const activeIndex = STATUS_STEPS.indexOf(isBlocked ? "Started" : status);

  return (
    <div className="w-full">
      {isBlocked && (
        <div className="mb-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          This ticket is currently blocked / on hold
        </div>
      )}
      <div className="flex items-center gap-0 w-full">
        {STATUS_STEPS.map((step, idx) => {
          const isComplete = idx < activeIndex;
          const isActive = idx === activeIndex && !isBlocked;

          return (
            <React.Fragment key={step}>
              {/* Step node */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={[
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                    isComplete
                      ? "bg-primary-600 border-primary-600 text-white"
                      : isActive
                      ? "bg-primary-100 border-primary-600 text-primary-700"
                      : "bg-white border-slate-300 text-slate-400",
                  ].join(" ")}
                >
                  {isComplete ? "✓" : idx + 1}
                </div>
                <span
                  className={[
                    "mt-1 text-xs whitespace-nowrap font-medium hidden sm:block",
                    isActive ? "text-primary-700" : isComplete ? "text-primary-600" : "text-slate-400",
                  ].join(" ")}
                >
                  {step}
                </span>
              </div>
              {/* Connector line between steps */}
              {idx < STATUS_STEPS.length - 1 && (
                <div
                  className={[
                    "flex-1 h-0.5 mx-1 rounded transition-colors",
                    idx < activeIndex ? "bg-primary-600" : "bg-slate-200",
                  ].join(" ")}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET FILTERS TOOLBAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TicketFilters
 *
 * Search + filter controls row for ticket lists.
 * Controlled component: all filter state lives in the parent page.
 *
 * @param {Object}   filters   - Current filter values { search, status, category, priority, type }
 * @param {Function} onChange  - Called with { name, value } when any filter changes
 * @param {Function} onReset   - Called when "Clear" is clicked
 */
export const TicketFilters = ({ filters, onChange, onReset }) => {
  const handleChange = (e) => {
    onChange({ name: e.target.name, value: e.target.value });
  };

  const hasActiveFilters = filters.search || filters.status || filters.category || filters.priority || filters.type;

  return (
    <div className="flex flex-wrap items-center gap-2 p-4 bg-slate-50 border-b border-slate-200 rounded-t-xl">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          name="search"
          type="text"
          value={filters.search}
          onChange={handleChange}
          placeholder="Search by ID or title..."
          className="form-input pl-8 py-2 text-xs h-9"
        />
      </div>

      {/* Status filter */}
      <select
        name="status"
        value={filters.status}
        onChange={handleChange}
        className="form-select text-xs h-9 py-0 w-auto pr-8"
        aria-label="Filter by status"
      >
        <option value="">All Statuses</option>
        {["Created", "Assigned", "Started", "Completed", "Blocked"].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Priority filter */}
      <select
        name="priority"
        value={filters.priority}
        onChange={handleChange}
        className="form-select text-xs h-9 py-0 w-auto pr-8"
        aria-label="Filter by priority"
      >
        <option value="">All Priorities</option>
        {["Low", "High", "Critical"].map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {/* Category filter */}
      <select
        name="category"
        value={filters.category}
        onChange={handleChange}
        className="form-select text-xs h-9 py-0 w-auto pr-8"
        aria-label="Filter by category"
      >
        <option value="">All Categories</option>
        {Object.keys(CATEGORY_SUBCATEGORIES).map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Type filter */}
      <select
        name="type"
        value={filters.type}
        onChange={handleChange}
        className="form-select text-xs h-9 py-0 w-auto pr-8"
        aria-label="Filter by type"
      >
        <option value="">All Types</option>
        <option value="Incident">Incident</option>
        <option value="Service Request">Service Request</option>
      </select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button onClick={onReset} className="btn-ghost btn-sm text-xs">
          <Filter className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET TABLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TicketTable
 *
 * Responsive table for displaying a list of tickets.
 * Links each ticket ID/title to the ticket detail page.
 *
 * @param {Array}   tickets    - Array of ticket objects
 * @param {boolean} showAssignee - Show "Assigned To" column (hidden on requester view)
 * @param {boolean} showRequester - Show "Requester" column (shown on agent queue)
 * @param {string}  sortBy     - Currently sorted column key
 * @param {string}  sortOrder  - "asc" | "desc"
 * @param {Function} onSort    - Called with column key when header is clicked
 */
export const TicketTable = ({
  tickets = [],
  showAssignee = true,
  showRequester = false,
  sortBy,
  sortOrder,
  onSort,
}) => {
  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <SortAsc className="w-3 h-3 text-slate-300" />;
    return sortOrder === "asc"
      ? <SortAsc className="w-3 h-3 text-primary-500" />
      : <SortDesc className="w-3 h-3 text-primary-500" />;
  };

  const SortableHeader = ({ column, children }) => (
    <th
      className="cursor-pointer hover:bg-slate-100 transition-colors select-none"
      onClick={() => onSort && onSort(column)}
    >
      <div className="flex items-center gap-1 px-4 py-3">
        {children}
        <SortIcon column={column} />
      </div>
    </th>
  );

  return (
    <div className="table-container rounded-t-none border-t-0">
      <table className="table">
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>Title</th>
            {showRequester && <th>Requester</th>}
            <th>Type</th>
            <th>Category</th>
            <SortableHeader column="priority">Priority</SortableHeader>
            <th>Status</th>
            {showAssignee && <th>Assigned To</th>}
            <SortableHeader column="createdAt">Created</SortableHeader>
            <SortableHeader column="updatedAt">Updated</SortableHeader>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket._id}>
              {/* Ticket ID — links to detail page */}
              <td>
                <Link
                  to={`/tickets/${ticket._id}`}
                  className="font-mono text-xs text-primary-600 hover:underline font-semibold"
                >
                  {ticket.ticketNumber}
                </Link>
              </td>

              {/* Title */}
              <td className="max-w-[200px]">
                <Link
                  to={`/tickets/${ticket._id}`}
                  className="text-slate-900 hover:text-primary-600 font-medium line-clamp-1 block"
                  title={ticket.title}
                >
                  {ticket.title}
                </Link>
              </td>

              {/* Requester (agent queue only) */}
              {showRequester && (
                <td className="text-xs text-slate-600">
                  {ticket.requester
                    ? `${ticket.requester.firstName} ${ticket.requester.lastName}`
                    : "—"}
                </td>
              )}

              {/* Type */}
              <td>
                <Badge className="bg-slate-100 text-slate-600 text-xs whitespace-nowrap">
                  {ticket.type}
                </Badge>
              </td>

              {/* Category */}
              <td className="text-xs text-slate-600 whitespace-nowrap">
                {ticket.category}
              </td>

              {/* Priority */}
              <td>
                <Badge className={`text-xs ${getPriorityClasses(ticket.priority)}`}>
                  {ticket.priority}
                </Badge>
              </td>

              {/* Status */}
              <td>
                <Badge className={`text-xs ${getStatusClasses(ticket.status)}`}>
                  {ticket.status}
                </Badge>
              </td>

              {/* Assigned To */}
              {showAssignee && (
                <td className="text-xs text-slate-600">
                  {ticket.assignee
                    ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
                    : <span className="text-slate-400 italic">Unassigned</span>}
                </td>
              )}

              {/* Created */}
              <td className="text-xs text-slate-500 whitespace-nowrap">
                {formatDate(ticket.createdAt)}
              </td>

              {/* Updated */}
              <td className="text-xs text-slate-500 whitespace-nowrap">
                {formatDate(ticket.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
