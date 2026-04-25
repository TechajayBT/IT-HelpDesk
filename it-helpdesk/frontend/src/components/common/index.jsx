/**
 * Common Reusable UI Components
 *
 * Atomic, stateless components used throughout the app.
 * Each component is a single responsibility unit.
 *
 * Components exported:
 * - Badge         — Colored label chip for status/priority/role
 * - Spinner       — Loading indicator
 * - EmptyState    — "No data found" placeholder with optional CTA
 * - ErrorState    — API error with retry button
 * - Modal         — Accessible dialog wrapper
 * - ConfirmModal  — Reusable confirmation dialog (delete/unassign actions)
 * - Avatar        — Initials-based user avatar
 * - PageLoader    — Full-page loading state
 */

import React from "react";
import { AlertCircle, RefreshCw, Plus, X } from "lucide-react";
import { getInitials } from "../../utils/helpers";

// ─────────────────────────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Badge
 * Renders a small colored pill.
 *
 * @param {string} children  - Text content
 * @param {string} className - Additional Tailwind classes (for color variants)
 */
export const Badge = ({ children, className = "" }) => (
  <span className={`badge ${className}`}>
    {children}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spinner
 * Animated loading indicator.
 *
 * @param {"sm"|"md"|"lg"} size
 * @param {string}         className
 */
export const Spinner = ({ size = "md", className = "" }) => {
  const sizeMap = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };
  return (
    <div
      className={`spinner ${sizeMap[size]} border-2 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const PageLoader = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <Spinner size="lg" />
    <p className="text-sm text-slate-500">{message}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EmptyState
 * Shown when a list has no items.
 *
 * @param {string}    title   - Primary message ("No tickets found")
 * @param {string}    message - Supporting text
 * @param {Function}  [onAction]   - Optional CTA click handler
 * @param {string}    [actionLabel] - CTA button text
 */
export const EmptyState = ({ title = "No data found", message, onAction, actionLabel = "Create New" }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {/* Decorative icon container */}
    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
      <AlertCircle className="w-8 h-8 text-slate-400" />
    </div>
    <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
    {message && <p className="text-sm text-slate-500 max-w-sm mb-6">{message}</p>}
    {onAction && (
      <button onClick={onAction} className="btn-primary">
        <Plus className="w-4 h-4" />
        {actionLabel}
      </button>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ERROR STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ErrorState
 * Shown when an API call fails. Provides a retry button.
 */
export const ErrorState = ({ message = "Something went wrong. Please try again.", onRetry }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
      <AlertCircle className="w-8 h-8 text-red-400" />
    </div>
    <h3 className="text-base font-semibold text-slate-900 mb-1">Failed to load</h3>
    <p className="text-sm text-slate-500 max-w-sm mb-6">{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="btn-secondary">
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// INLINE ERROR BANNER
// ─────────────────────────────────────────────────────────────────────────────

export const ErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modal
 *
 * Accessible dialog overlay. Closes on backdrop click and Escape key.
 *
 * @param {boolean}  isOpen   - Controls visibility
 * @param {Function} onClose  - Called when user dismisses the modal
 * @param {string}   title    - Modal heading
 * @param {ReactNode} children - Modal body content
 * @param {"sm"|"md"|"lg"|"xl"} [size]
 */
export const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  // Handle Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll while modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeMap = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Modal panel */}
      <div className={`relative w-full ${sizeMap[size]} bg-white rounded-2xl shadow-modal animate-fade-in`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="btn-ghost p-2 -mr-2 rounded-lg"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM MODAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ConfirmModal
 *
 * Reusable confirmation dialog for destructive actions.
 *
 * @param {boolean}   isOpen
 * @param {Function}  onClose
 * @param {Function}  onConfirm  - Called when user clicks confirm
 * @param {string}    title
 * @param {string}    message
 * @param {string}    [confirmLabel]
 * @param {boolean}   [isDanger]   - If true, shows confirm button in red
 * @param {boolean}   [isLoading]  - Shows spinner on confirm button
 */
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  isDanger = false,
  isLoading = false,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
    {message && <p className="text-sm text-slate-600 mb-6">{message}</p>}
    <div className="flex gap-3 justify-end">
      <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className={isDanger ? "btn-danger" : "btn-primary"}
        disabled={isLoading}
      >
        {isLoading && <Spinner size="sm" />}
        {confirmLabel}
      </button>
    </div>
  </Modal>
);

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Avatar
 * Displays user initials in a colored circle.
 */
export const Avatar = ({ firstName = "", lastName = "", size = "md", className = "" }) => {
  const sizeMap = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-base",
  };
  const initials = getInitials(firstName, lastName);

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-primary-100 text-primary-700 font-semibold flex-shrink-0 ${sizeMap[size]} ${className}`}
      aria-label={`${firstName} ${lastName}`}
    >
      {initials}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pagination
 * Previous/Next controls with page info.
 */
export const Pagination = ({ page, totalPages, totalItems, limit, onPageChange }) => {
  if (totalPages <= 1) return null;

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{startItem}–{endItem}</span> of{" "}
        <span className="font-medium text-slate-700">{totalItems}</span> results
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="btn-secondary btn-sm"
        >
          Previous
        </button>
        <span className="btn-secondary btn-sm cursor-default select-none pointer-events-none">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="btn-secondary btn-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
};
