/**
 * Admin Pages — Reports & Audit Log
 *
 * AdminReportsPage  : System-wide KPIs + status/category charts + user counts
 * AuditLogPage      : Paginated audit log with event type and date range filters
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { dashboardApi } from "../../services/api";
import {
  Spinner, EmptyState, ErrorState, Pagination, Badge, PageLoader
} from "../common";
import { formatDateTime, getStatusClasses } from "../../utils/helpers";

// ── Colour palette for charts ─────────────────────────────────────────────────
const STATUS_COLORS = {
  Created:   "#94a3b8",
  Assigned:  "#60a5fa",
  Started:   "#818cf8",
  Completed: "#34d399",
  Blocked:   "#f87171",
};

const CATEGORY_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f97316",
];

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, colorClass = "text-slate-900", isLoading }) => (
  <div className="card p-5">
    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{label}</p>
    {isLoading
      ? <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
      : <p className={`text-3xl font-bold ${colorClass}`}>{value ?? 0}</p>
    }
    {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN REPORTS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export const AdminReportsPage = () => {
  const { data: adminStats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: dashboardApi.getAdminDashboard,
    staleTime: 60_000,
  });

  const { data: byStatus = [], isLoading: statusLoading } = useQuery({
    queryKey: ["tickets-by-status"],
    queryFn: dashboardApi.getTicketsByStatus,
    staleTime: 60_000,
  });

  const { data: byCategory = [], isLoading: catLoading } = useQuery({
    queryKey: ["tickets-by-category"],
    queryFn: dashboardApi.getTicketsByCategory,
    staleTime: 60_000,
  });

  if (statsLoading && !adminStats) return <PageLoader message="Loading reports..." />;
  if (statsError) return <ErrorState message="Failed to load admin stats." />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">System-wide ticket metrics and distributions</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Open Tickets"    value={adminStats?.openCount}        isLoading={statsLoading} colorClass="text-primary-700" />
        <KpiCard label="Unassigned"      value={adminStats?.unassignedCount}   isLoading={statsLoading} colorClass="text-amber-600" />
        <KpiCard label="High Priority"   value={adminStats?.highPriorityCount} isLoading={statsLoading} colorClass="text-red-600" />
        <KpiCard label="Done This Week"  value={adminStats?.completedThisWeek} isLoading={statsLoading} colorClass="text-green-600" />
        <KpiCard
          label="Total Agents"
          value={adminStats?.users?.agent}
          sub={`${adminStats?.users?.requester ?? 0} requesters`}
          isLoading={statsLoading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Status distribution bar chart */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Tickets by Status</h3>
          {statusLoading
            ? <div className="h-48 flex items-center justify-center"><Spinner /></div>
            : byStatus.length === 0
            ? <EmptyState title="No data" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byStatus} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {byStatus.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] || "#94a3b8"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Category distribution pie chart */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Tickets by Category</h3>
          {catLoading
            ? <div className="h-48 flex items-center justify-center"><Spinner /></div>
            : byCategory.length === 0
            ? <EmptyState title="No data" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ category, percent }) =>
                      `${category} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {byCategory.map((entry, idx) => (
                      <Cell
                        key={entry.category}
                        fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    formatter={(value, name) => [value, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* User breakdown table */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">User Breakdown</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { role: "Requesters", count: adminStats?.users?.requester ?? 0, colorClass: "text-sky-600" },
            { role: "Agents",     count: adminStats?.users?.agent     ?? 0, colorClass: "text-violet-600" },
            { role: "Admins",     count: adminStats?.users?.admin     ?? 0, colorClass: "text-rose-600" },
          ].map(({ role, count, colorClass }) => (
            <div key={role} className="py-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className={`text-2xl font-bold mb-1 ${colorClass}`}>{count}</p>
              <p className="text-xs text-slate-500">{role}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG PAGE
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS = {
  ticket_created:    "Ticket Created",
  ticket_assigned:   "Assigned",
  ticket_unassigned: "Unassigned",
  status_changed:    "Status Changed",
  comment_added:     "Comment Added",
  attachment_added:  "Attachment Added",
  attachment_deleted:"Attachment Deleted",
  ticket_completed:  "Completed",
  ticket_blocked:    "Blocked",
  ticket_resumed:    "Resumed",
};

const EVENT_ICONS = {
  ticket_created:    "🎫",
  ticket_assigned:   "👤",
  ticket_unassigned: "↩️",
  status_changed:    "🔄",
  comment_added:     "💬",
  attachment_added:  "📎",
  attachment_deleted:"🗑️",
  ticket_completed:  "✅",
  ticket_blocked:    "🚫",
  ticket_resumed:    "▶️",
};

export const AuditLogPage = () => {
  const [filters, setFilters] = useState({ eventType: "", fromDate: "", toDate: "" });
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit-logs", filters, page],
    queryFn: () => dashboardApi.getAuditLogs({ ...filters, page, limit: LIMIT }),
    keepPreviousData: true,
  });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Complete, append-only record of all system actions</p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-xl">
          {/* Event type filter */}
          <select
            name="eventType"
            value={filters.eventType}
            onChange={handleFilterChange}
            className="form-select text-xs h-9 py-0 w-auto pr-8"
          >
            <option value="">All Events</option>
            {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              name="fromDate"
              value={filters.fromDate}
              onChange={handleFilterChange}
              className="form-input text-xs h-9 py-0 w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              name="toDate"
              value={filters.toDate}
              onChange={handleFilterChange}
              className="form-input text-xs h-9 py-0 w-auto"
            />
          </div>

          {(filters.eventType || filters.fromDate || filters.toDate) && (
            <button
              onClick={() => { setFilters({ eventType: "", fromDate: "", toDate: "" }); setPage(1); }}
              className="btn-ghost btn-sm text-xs"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Log table */}
      <div className="card overflow-hidden">
        {isLoading && !data
          ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : isError
          ? <ErrorState message={error?.message} onRetry={refetch} />
          : data?.logs?.length === 0
          ? <EmptyState title="No audit events found" message="Try adjusting your filters." />
          : (
            <>
              <div className="table-container rounded-t-none border-0">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Ticket</th>
                      <th>Actor</th>
                      <th>Details</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map((log) => (
                      <tr key={log._id}>
                        {/* Event type */}
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="text-base">{EVENT_ICONS[log.eventType] || "•"}</span>
                            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                              {EVENT_TYPE_LABELS[log.eventType] || log.eventType}
                            </span>
                          </div>
                          {/* Transition arrow */}
                          {log.fromValue && log.toValue && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400 ml-7">
                              <Badge className={`text-xs ${getStatusClasses(log.fromValue)}`}>{log.fromValue}</Badge>
                              <span>→</span>
                              <Badge className={`text-xs ${getStatusClasses(log.toValue)}`}>{log.toValue}</Badge>
                            </div>
                          )}
                        </td>

                        {/* Ticket reference */}
                        <td>
                          {log.ticketId ? (
                            <a
                              href={`/tickets/${log.ticketId._id}`}
                              className="font-mono text-xs text-primary-600 hover:underline font-semibold"
                            >
                              {log.ticketId.ticketNumber || "—"}
                            </a>
                          ) : "—"}
                        </td>

                        {/* Actor */}
                        <td className="text-xs text-slate-700">
                          {log.actor
                            ? `${log.actor.firstName} ${log.actor.lastName}`
                            : "System"}
                        </td>

                        {/* Details preview */}
                        <td className="max-w-[220px]">
                          {log.details
                            ? <p className="text-xs text-slate-500 line-clamp-2">{log.details}</p>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>

                        {/* Timestamp */}
                        <td className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                totalPages={data.pagination?.totalPages}
                totalItems={data.pagination?.totalItems}
                limit={LIMIT}
                onPageChange={setPage}
              />
            </>
          )
        }
      </div>
    </div>
  );
};
