/**
 * Ticket Detail Page
 *
 * Displays full ticket information including:
 * - Header with status badges and metadata
 * - Status progress bar
 * - Agent Workbench panel (assign, transition, resolve) — agents only
 * - Description (read-only)
 * - Comments thread (public only for requesters; all for agents)
 * - Attachments list
 * - Audit history timeline
 *
 * The page adapts its capabilities based on the user's role:
 * - Requester: read-only + add public comment + upload attachment
 * - Agent: full workbench + public/internal comments
 */

import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import {
  ArrowLeft, Paperclip, Send, Clock, User, Tag, AlertTriangle,
  CheckCircle, Download, Trash2, Lock
} from "lucide-react";
import { ticketApi } from "../../services/api";
import { selectUser } from "../../store/slices/authSlice";
import {
  Badge, Spinner, PageLoader, ErrorState, Modal, ConfirmModal, Avatar
} from "../common";
import { StatusProgressBar } from "./TicketList";
import {
  getStatusClasses, getPriorityClasses, formatDateTime, timeAgo, formatFileSize
} from "../../utils/helpers";
import { toast } from "react-toastify";

// ─────────────────────────────────────────────────────────────────────────────
// AGENT WORKBENCH PANEL
// Shown only to agents/admins. Contains all status transition actions.
// ─────────────────────────────────────────────────────────────────────────────

const AgentWorkbench = ({ ticket, onUpdate }) => {
  const queryClient = useQueryClient();

  // Modal states for actions that require additional input
  const [completeModal, setCompleteModal] = useState(false);
  const [blockModal, setBlockModal] = useState(false);
  const [unassignModal, setUnassignModal] = useState(false);
  const [resolutionText, setResolutionText] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [unassignDesc, setUnassignDesc] = useState("");

  const invalidateTicket = () => {
    queryClient.invalidateQueries(["ticket", ticket._id]);
    queryClient.invalidateQueries(["ticket-history", ticket._id]);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: () => ticketApi.assignToSelf(ticket._id),
    onSuccess: (updated) => { toast.success("Ticket assigned to you"); onUpdate(updated); invalidateTicket(); },
    onError: (err) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: () => ticketApi.startTicket(ticket._id),
    onSuccess: (updated) => { toast.success("Ticket started"); onUpdate(updated); invalidateTicket(); },
    onError: (err) => toast.error(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: () => ticketApi.completeTicket(ticket._id, resolutionText),
    onSuccess: (updated) => {
      toast.success("Ticket completed"); setCompleteModal(false); onUpdate(updated); invalidateTicket();
    },
    onError: (err) => toast.error(err.message),
  });

  const blockMutation = useMutation({
    mutationFn: () => ticketApi.blockTicket(ticket._id, blockReason),
    onSuccess: (updated) => {
      toast.success("Ticket blocked"); setBlockModal(false); onUpdate(updated); invalidateTicket();
    },
    onError: (err) => toast.error(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => ticketApi.resumeTicket(ticket._id),
    onSuccess: (updated) => { toast.success("Ticket resumed"); onUpdate(updated); invalidateTicket(); },
    onError: (err) => toast.error(err.message),
  });

  const unassignMutation = useMutation({
    mutationFn: () => ticketApi.unassignTicket(ticket._id, unassignDesc),
    onSuccess: (updated) => {
      toast.success("Ticket unassigned"); setUnassignModal(false); onUpdate(updated); invalidateTicket();
    },
    onError: (err) => toast.error(err.message),
  });

  const isCompleted = ticket.status === "Completed";

  return (
    <div className="card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
        Agent Workbench
      </h3>

      {/* Assignment section */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Assignment</p>
        {!ticket.assignee ? (
          <button
            className="btn-primary w-full btn-sm"
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending || isCompleted}
          >
            {assignMutation.isPending ? <Spinner size="sm" /> : null}
            Assign to Me
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Assigned to {ticket.assignee.firstName} {ticket.assignee.lastName}
            </div>
            {!isCompleted && (
              <button
                className="btn-ghost btn-sm w-full text-xs text-red-600 hover:bg-red-50"
                onClick={() => setUnassignModal(true)}
              >
                Unassign
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status transitions */}
      {!isCompleted && ticket.status !== "Created" && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Actions</p>
          <div className="space-y-2">
            {ticket.status === "Assigned" && (
              <button
                className="btn-primary w-full btn-sm"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                {startMutation.isPending ? <Spinner size="sm" /> : null}
                Start Working
              </button>
            )}
            {ticket.status === "Started" && (
              <button
                className="btn-primary w-full btn-sm"
                onClick={() => setCompleteModal(true)}
                disabled={isCompleted}
              >
                Mark as Complete
              </button>
            )}
            {ticket.status === "Blocked" && (
              <button
                className="btn-primary w-full btn-sm"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                {resumeMutation.isPending ? <Spinner size="sm" /> : null}
                Resume Ticket
              </button>
            )}
            {ticket.status !== "Blocked" && ticket.status !== "Completed" && (
              <button
                className="btn-secondary w-full btn-sm text-red-600 hover:bg-red-50 border-red-200"
                onClick={() => setBlockModal(true)}
              >
                Block / Put on Hold
              </button>
            )}
          </div>
        </div>
      )}

      {/* Complete modal */}
      <Modal isOpen={completeModal} onClose={() => setCompleteModal(false)} title="Complete Ticket">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Please provide a resolution summary before closing this ticket.</p>
          <div>
            <label className="form-label">Resolution Summary <span className="text-red-500">*</span></label>
            <textarea
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              rows={4}
              className="form-textarea"
              placeholder="Describe how the issue was resolved..."
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary btn-sm" onClick={() => setCompleteModal(false)}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || resolutionText.trim().length < 10}
            >
              {completeMutation.isPending ? <Spinner size="sm" /> : null}
              Complete
            </button>
          </div>
        </div>
      </Modal>

      {/* Block modal */}
      <Modal isOpen={blockModal} onClose={() => setBlockModal(false)} title="Block Ticket">
        <div className="space-y-4">
          <div>
            <label className="form-label">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
              className="form-textarea"
              placeholder="Why is this ticket being blocked?"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary btn-sm" onClick={() => setBlockModal(false)}>Cancel</button>
            <button
              className="btn-danger btn-sm"
              onClick={() => blockMutation.mutate()}
              disabled={blockMutation.isPending || blockReason.trim().length < 5}
            >
              Block Ticket
            </button>
          </div>
        </div>
      </Modal>

      {/* Unassign modal */}
      <Modal isOpen={unassignModal} onClose={() => setUnassignModal(false)} title="Unassign Ticket">
        <div className="space-y-4">
          <div>
            <label className="form-label">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={unassignDesc}
              onChange={(e) => setUnassignDesc(e.target.value)}
              rows={3}
              className="form-textarea"
              placeholder="Why are you unassigning this ticket?"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary btn-sm" onClick={() => setUnassignModal(false)}>Cancel</button>
            <button
              className="btn-danger btn-sm"
              onClick={() => unassignMutation.mutate()}
              disabled={unassignMutation.isPending || unassignDesc.trim().length < 5}
            >
              Unassign
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMENT THREAD
// ─────────────────────────────────────────────────────────────────────────────

const CommentThread = ({ ticketId, comments, isAgent }) => {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("public");

  const addCommentMutation = useMutation({
    mutationFn: () => ticketApi.addComment(ticketId, { body, visibility }),
    onSuccess: () => {
      setBody(""); setVisibility("public");
      queryClient.invalidateQueries(["ticket", ticketId]);
      toast.success("Comment added");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">
        Comments ({comments.length})
      </h3>

      {/* Comment list */}
      <div className="space-y-4 mb-6">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No comments yet. Be the first to add one.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment._id} className={[
              "flex gap-3 p-4 rounded-xl",
              comment.visibility === "internal"
                ? "bg-amber-50 border border-amber-200"
                : "bg-slate-50 border border-slate-100",
            ].join(" ")}>
              <Avatar
                firstName={comment.author?.firstName}
                lastName={comment.author?.lastName}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium text-slate-900">
                    {comment.author?.firstName} {comment.author?.lastName}
                  </span>
                  <Badge className={`text-xs ${comment.author?.role === "agent" ? "bg-violet-50 text-violet-600 border border-violet-200" : "bg-sky-50 text-sky-600 border border-sky-200"}`}>
                    {comment.author?.role}
                  </Badge>
                  {comment.visibility === "internal" && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      <Lock className="w-2.5 h-2.5" /> Internal note
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-auto">{timeAgo(comment.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add comment composer */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Write a comment..."
          className="w-full px-4 py-3 text-sm text-slate-700 resize-none border-0 focus:outline-none focus:ring-0"
        />
        <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border-t border-slate-100">
          {isAgent && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={visibility === "internal"}
                onChange={(e) => setVisibility(e.target.checked ? "internal" : "public")}
                className="rounded text-primary-600"
              />
              <Lock className="w-3 h-3" />
              Internal note (hidden from requester)
            </label>
          )}
          {!isAgent && <span />}
          <button
            onClick={() => body.trim() && addCommentMutation.mutate()}
            disabled={!body.trim() || addCommentMutation.isPending}
            className="btn-primary btn-sm"
          >
            {addCommentMutation.isPending ? <Spinner size="sm" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET HISTORY TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

const TicketHistory = ({ ticketId }) => {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["ticket-history", ticketId],
    queryFn: () => ticketApi.getTicketHistory(ticketId),
  });

  const EVENT_ICONS = {
    ticket_created: "🎫",
    ticket_assigned: "👤",
    ticket_unassigned: "↩️",
    status_changed: "🔄",
    comment_added: "💬",
    attachment_added: "📎",
    attachment_deleted: "🗑️",
    ticket_completed: "✅",
    ticket_blocked: "🚫",
    ticket_resumed: "▶️",
  };

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Activity History</h3>
      {history.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No history yet.</p>
      ) : (
        <ol className="relative border-l-2 border-slate-200 space-y-4 ml-3">
          {history.map((event) => (
            <li key={event._id} className="ml-5 relative">
              {/* Timeline dot */}
              <span className="absolute -left-8 flex items-center justify-center w-5 h-5 bg-white border-2 border-slate-200 rounded-full text-xs">
                {EVENT_ICONS[event.eventType] || "•"}
              </span>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-700">
                    {event.actor?.firstName} {event.actor?.lastName}
                  </span>
                  <span className="text-xs text-slate-500">
                    {event.eventType.replace(/_/g, " ")}
                    {event.fromValue && event.toValue && (
                      <> · <span className="text-slate-400">{event.fromValue}</span> → <span className="text-slate-700">{event.toValue}</span></>
                    )}
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">{timeAgo(event.createdAt)}</span>
                </div>
                {event.details && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.details}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TICKET DETAIL PAGE
// ─────────────────────────────────────────────────────────────────────────────

const TicketDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const isAgent = user?.role === "agent" || user?.role === "admin";

  const { data: ticket, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => ticketApi.getTicketById(id),
    retry: (failCount, err) => err.status !== 403 && err.status !== 404 && failCount < 2,
  });

  const queryClient = useQueryClient();

  // Called by the workbench after a status change to update the cached ticket
  const handleTicketUpdate = (updated) => {
    queryClient.setQueryData(["ticket", id], updated);
  };

  if (isLoading) return <PageLoader message="Loading ticket..." />;

  if (isError) {
    if (error?.status === 404) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="text-5xl mb-4">🎫</div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Ticket not found</h2>
          <p className="text-slate-500 text-sm mb-6">This ticket doesn't exist or has been removed.</p>
          <button className="btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" /> Go back
          </button>
        </div>
      );
    }
    return <ErrorState message={error?.message} onRetry={refetch} />;
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back button */}
      <button
        className="btn-ghost btn-sm mb-4 -ml-2"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                {ticket.ticketNumber}
              </span>
              <Badge className={`text-xs ${getStatusClasses(ticket.status)}`}>{ticket.status}</Badge>
              <Badge className={`text-xs ${getPriorityClasses(ticket.priority)}`}>{ticket.priority}</Badge>
            </div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{ticket.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {[
                { icon: Tag, label: `${ticket.category} › ${ticket.subcategory}` },
                { icon: User, label: `${ticket.requester?.firstName} ${ticket.requester?.lastName}` },
                { icon: Clock, label: formatDateTime(ticket.createdAt) },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <StatusProgressBar status={ticket.status} />
        </div>
      </div>

      {/* ── Main layout: content + sidebar ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left column: description + comments + history ─────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Description</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>

            {/* Extra fields */}
            {ticket.extraFields && Object.values(ticket.extraFields).some(Boolean) && (
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(ticket.extraFields).map(([key, val]) =>
                  val ? (
                    <div key={key}>
                      <p className="text-xs text-slate-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                      <p className="text-sm font-medium text-slate-700">{val}</p>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Resolution summary */}
            {ticket.resolutionSummary && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Resolution Summary
                </p>
                <p className="text-sm text-green-800">{ticket.resolutionSummary}</p>
              </div>
            )}
          </div>

          {/* Attachments */}
          {ticket.attachments?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Attachments ({ticket.attachments.length})
              </h3>
              <ul className="space-y-2">
                {ticket.attachments.map((att) => (
                  <li key={att._id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="w-7 h-7 bg-primary-100 rounded flex items-center justify-center flex-shrink-0">
                      <Paperclip className="w-3.5 h-3.5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{att.originalName}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(att.size)}</p>
                    </div>
                    {isAgent && (
                      <button
                        onClick={() => ticketApi.downloadAttachment(att._id, att.originalName)}
                        className="btn-ghost p-1.5 text-slate-500 hover:text-primary-600"
                        aria-label="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Comments */}
          <div className="card p-5">
            <CommentThread
              ticketId={ticket._id}
              comments={ticket.comments || []}
              isAgent={isAgent}
            />
          </div>

          {/* History */}
          <div className="card p-5">
            <TicketHistory ticketId={ticket._id} />
          </div>
        </div>

        {/* ── Right column: metadata + workbench ────────────────────────── */}
        <div className="space-y-4">
          {/* Metadata card */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Ticket Details</h3>
            {[
              { label: "Type", value: ticket.type },
              { label: "Assigned To", value: ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : "Unassigned" },
              { label: "Requester", value: `${ticket.requester?.firstName} ${ticket.requester?.lastName}` },
              { label: "Last Updated", value: formatDateTime(ticket.updatedAt) },
              ...(ticket.completedAt ? [{ label: "Completed", value: formatDateTime(ticket.completedAt) }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-sm font-medium text-slate-700">{value}</p>
              </div>
            ))}
          </div>

          {/* Agent Workbench */}
          {isAgent && (
            <AgentWorkbench ticket={ticket} onUpdate={handleTicketUpdate} />
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPage;
