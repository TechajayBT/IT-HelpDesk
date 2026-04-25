/**
 * Route Guards
 *
 * Two guard components that wrap routes in the router configuration:
 *
 * 1. ProtectedRoute  — Requires authentication. Redirects to /login if not authenticated.
 * 2. RoleGuard       — Requires specific role(s). Renders a 403 page if role is insufficient.
 *
 * Both components render a full-page loading spinner while auth is bootstrapping
 * (i.e., while we're checking the stored token on page load). This prevents
 * a flash of the login page before the token is validated.
 */

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  selectIsAuthenticated,
  selectAuthLoading,
  selectUserRole,
} from "../../store/slices/authSlice";
import { PageLoader } from "../common";

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ProtectedRoute
 *
 * Wraps routes that require authentication.
 * If the user is not authenticated and auth has finished loading, redirects to /login.
 * Passes the current URL as `state.from` so login can redirect back after success.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<DashboardPage />} />
 *   </Route>
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isLoading = useSelector(selectAuthLoading);
  const location = useLocation();

  // ── Still bootstrapping (checking stored token) ───────────────────────────
  // Show a full-page loader instead of flashing the login page
  if (isLoading) {
    return <PageLoader message="Verifying session..." />;
  }

  // ── Not authenticated ─────────────────────────────────────────────────────
  // Save current path so login can redirect back to it
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ── Authenticated — render children or Outlet ─────────────────────────────
  return children || <React.Fragment />;
};

// ─────────────────────────────────────────────────────────────────────────────
// ROLE GUARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RoleGuard
 *
 * Wraps routes that require specific roles.
 * Must be used INSIDE a ProtectedRoute (assumes user is authenticated).
 *
 * If the user's role is not in `allowedRoles`, renders an "Access Denied" page.
 *
 * @param {string[]} allowedRoles - Roles that may access the wrapped route(s)
 *
 * Usage:
 *   <Route element={<RoleGuard allowedRoles={["admin"]} />}>
 *     <Route path="/admin/audit" element={<AuditPage />} />
 *   </Route>
 */
const RoleGuard = ({ allowedRoles, children }) => {
  const userRole = useSelector(selectUserRole);

  if (!userRole || !allowedRoles.includes(userRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
          <span className="text-4xl">🚫</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 text-sm max-w-md">
          You don't have permission to view this page.
          {allowedRoles.length > 0 && (
            <> This page is restricted to <strong>{allowedRoles.join(", ")}</strong> users.</>
          )}
        </p>
      </div>
    );
  }

  return children || <React.Fragment />;
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PublicRoute
 *
 * For auth pages (Login, Register). Redirects to the appropriate dashboard
 * if the user is ALREADY authenticated — prevents logged-in users from seeing
 * the login page.
 */
const PublicRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isLoading = useSelector(selectAuthLoading);
  const userRole = useSelector(selectUserRole);

  if (isLoading) {
    return <PageLoader message="Loading..." />;
  }

  if (isAuthenticated) {
    // Redirect to role-appropriate home page
    const redirectTo =
      userRole === "agent" || userRole === "admin" ? "/agent/queue" : "/dashboard";
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export { ProtectedRoute, RoleGuard, PublicRoute };
