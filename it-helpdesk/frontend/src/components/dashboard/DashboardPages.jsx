/**
 * Dashboard Pages
 *
 * RequesterDashboard — "My Tickets" list with filters, pagination, and Create button
 * AgentQueue         — Unassigned ticket queue with "Assign to Me" inline action
 * AgentAssigned      — Agent's own assigned tickets
 */

import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Plus, RefreshCw } from "lucide-react";
import { ticketApi, dashboardApi } from "../../services/api";
import { selectUser } from "../../store/slices/authSlice";
import {
  Spinner, EmptyState, ErrorState, Pagination, Badge, PageLoader
} from "../common";
import { TicketFilters, TicketTable } from "../tickets/TicketList";
import { getStatusClasses, getPriorityClasses, formatDate } from "../../utils/helpers";
import { toast } from "react-toastify";

// ── Default filter state ──────────────────────────────────────────────────────
const DEFAULT_FILTERS = { search: "", status: "", category: "", priority: "", type: "" };
const DEFAULT_SORT = { sortBy: "createdAt", sortOrder: "desc" };

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD — used in both dashboards
// ─────────────────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, colorClass = "text-slate-900", isLoading }) => (
  <div className="card p-4">
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    {isLoading
      ? <div className="h-7 w-12 bg-slate-100 animate-pulse rounded" />
      : <p className={`text-2xl font-bold ${colorClass}`}>{value ?? 0}</p>
    }
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// REQUESTER DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const RequesterDashboard = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["requester-dashboard"],
    queryFn: dashboardApi.getRequesterDashboard,
    staleTime: 60_000,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-tickets", filters, sort, page],
    queryFn: () => ticketApi.getMyTickets({ ...filters, ...sort, page, limit: LIMIT }),
    keepPreviousData: true,
  });

  const handleFilterChange = useCallback(({ name, value }) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  }, []);

  const handleSort = (column) => {
    setSort((prev) => ({
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === "desc" ? "asc" : "desc",
    }));
    setPage(1);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Tickets</h1>
          <p className="page-subtitle">Track and manage your support requests</p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/tickets/new")}>
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total" value={stats?.total} isLoading={statsLoading} />
        <StatCard label="Created" value={stats?.byStatus?.Created} isLoading={statsLoading} colorClass="text-slate-600" />
        <StatCard label="In Progress" value={stats?.byStatus?.Started} isLoading={statsLoading} colorClass="text-indigo-600" />
        <StatCard label="Completed" value={stats?.byStatus?.Completed} isLoading={statsLoading} colorClass="text-green-600" />
        <StatCard label="Blocked" value={stats?.byStatus?.Blocked} isLoading={statsLoading} colorClass="text-red-600" />
      </div>

      {/* Ticket list */}
      <div className="card overflow-hidden">
        <TicketFilters filters={filters} onChange={handleFilterChange} onReset={() => { setFilters(DEFAULT_FILTERS); setPage(1); }} />

        {isLoading && !data ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : data?.tickets?.length === 0 ? (
          <EmptyState
            title="No tickets found"
            message="You haven't submitted any support tickets yet, or no tickets match your current filters."
            onAction={() => navigate("/tickets/new")}
            actionLabel="Create Your First Ticket"
          />
        ) : (
          <>
            <TicketTable
              tickets={data.tickets}
              showAssignee
              showRequester={false}
              sortBy={sort.sortBy}
              sortOrder={sort.sortOrder}
              onSort={handleSort}
            />
            <Pagination
              page={page}
              totalPages={data.pagination?.totalPages}
              totalItems={data.pagination?.totalItems}
              limit={LIMIT}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AGENT QUEUE — Unassigned tickets
// ─────────────────────────────────────────────────────────────────────────────

export const AgentQueue = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ sortBy: "createdAt", sortOrder: "asc" }); // Oldest first
  const [page, setPage] = useState(1);
  const LIMIT = 15;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["agent-dashboard"],
    queryFn: dashboardApi.getAgentDashboard,
    staleTime: 30_000,
    refetchInterval: 60_000, // Auto-refresh every minute
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["unassigned-tickets", filters, sort, page],
    queryFn: () => ticketApi.getUnassignedTickets({ ...filters, ...sort, page, limit: LIMIT }),
    keepPreviousData: true,
    refetchInterval: 30_000,
  });

  const assignMutation = useMutation({
    mutationFn: (ticketId) => ticketApi.assignToSelf(ticketId),
    onSuccess: (ticket) => {
      toast.success(`Ticket ${ticket.ticketNumber} assigned to you`);
      queryClient.invalidateQueries(["unassigned-tickets"]);
      queryClient.invalidateQueries(["assigned-tickets"]);
      queryClient.invalidateQueries(["agent-dashboard"]);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFilterChange = useCallback(({ name, value }) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ticket Queue</h1>
          <p className="page-subtitle">Unassigned tickets awaiting pickup</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={refetch}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Agent stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Unassigned" value={stats?.unassignedInQueue} isLoading={statsLoading} colorClass="text-amber-600" />
        <StatCard label="My Assigned" value={stats?.assigned} isLoading={statsLoading} colorClass="text-blue-600" />
        <StatCard label="In Progress" value={stats?.started} isLoading={statsLoading} colorClass="text-indigo-600" />
        <StatCard label="Done Today" value={stats?.completedToday} isLoading={statsLoading} colorClass="text-green-600" />
      </div>

      {/* Queue table with inline assign button */}
      <div className="card overflow-hidden">
        <TicketFilters filters={filters} onChange={handleFilterChange} onReset={() => { setFilters(DEFAULT_FILTERS); setPage(1); }} />

        {isLoading && !data ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : data?.tickets?.length === 0 ? (
          <EmptyState
            title="No unassigned tickets"
            message="The queue is empty — all tickets have been claimed."
          />
        ) : (
          <>
            {/* Custom table with "Assign to Me" column */}
            <div className="table-container rounded-t-none border-t-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Title</th>
                    <th>Requester</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tickets.map((ticket) => (
                    <tr key={ticket._id}>
                      <td>
                        <a href={`/tickets/${ticket._id}`} className="font-mono text-xs text-primary-600 hover:underline font-semibold">
                          {ticket.ticketNumber}
                        </a>
                      </td>
                      <td className="max-w-[180px]">
                        <a href={`/tickets/${ticket._id}`} className="text-slate-900 hover:text-primary-600 font-medium line-clamp-1 block" title={ticket.title}>
                          {ticket.title}
                        </a>
                      </td>
                      <td className="text-xs text-slate-600">
                        {ticket.requester ? `${ticket.requester.firstName} ${ticket.requester.lastName}` : "—"}
                      </td>
                      <td className="text-xs text-slate-600 whitespace-nowrap">{ticket.category}</td>
                      <td>
                        <Badge className={`text-xs ${getPriorityClasses(ticket.priority)}`}>{ticket.priority}</Badge>
                      </td>
                      <td>
                        <Badge className={`text-xs ${getStatusClasses(ticket.status)}`}>{ticket.status}</Badge>
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{formatDate(ticket.createdAt)}</td>
                      <td>
                        <button
                          onClick={() => assignMutation.mutate(ticket._id)}
                          disabled={assignMutation.isPending}
                          className="btn-primary btn-sm text-xs whitespace-nowrap"
                        >
                          {assignMutation.isPending && assignMutation.variables === ticket._id
                            ? <Spinner size="sm" />
                            : null}
                          Assign to Me
                        </button>
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
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AGENT ASSIGNED — My work
// ─────────────────────────────────────────────────────────────────────────────

export const AgentAssigned = () => {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["assigned-tickets", filters, sort, page],
    queryFn: () => ticketApi.getAssignedToMe({ ...filters, ...sort, page, limit: LIMIT }),
    keepPreviousData: true,
  });

  const handleFilterChange = useCallback(({ name, value }) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Work</h1>
          <p className="page-subtitle">Tickets currently assigned to you</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <TicketFilters filters={filters} onChange={handleFilterChange} onReset={() => { setFilters(DEFAULT_FILTERS); setPage(1); }} />

        {isLoading && !data ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : data?.tickets?.length === 0 ? (
          <EmptyState
            title="No assigned tickets"
            message="You don't have any tickets assigned to you currently. Head to the queue to pick one up."
          />
        ) : (
          <>
            <TicketTable
              tickets={data.tickets}
              showAssignee={false}
              showRequester
              sortBy={sort.sortBy}
              sortOrder={sort.sortOrder}
              onSort={(col) => setSort((prev) => ({ sortBy: col, sortOrder: prev.sortBy === col && prev.sortOrder === "desc" ? "asc" : "desc" }))}
            />
            <Pagination
              page={page}
              totalPages={data.pagination?.totalPages}
              totalItems={data.pagination?.totalItems}
              limit={LIMIT}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
};
