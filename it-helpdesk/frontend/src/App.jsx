/**
 * App.jsx — Root Application Component
 *
 * Sets up:
 * 1. Redux Provider         — global state (auth)
 * 2. React Query Provider   — server state caching for tickets/dashboard
 * 3. BrowserRouter          — client-side routing
 * 4. Route structure        — public routes, protected routes, role-guarded routes
 * 5. Toast notifications    — global toast container from react-toastify
 * 6. bootstrapAuth dispatch — validates stored JWT on every page load
 *
 * Route structure:
 *   /login                 → LoginPage          (public, redirects if already authed)
 *   /register              → RegisterPage       (public, redirects if already authed)
 *   /                      → (redirect to /dashboard or /agent/queue based on role)
 *
 *   Protected (require auth):
 *   /dashboard             → RequesterDashboard (all roles)
 *   /tickets/new           → CreateTicketPage   (requester, agent, admin)
 *   /tickets/my            → RequesterDashboard (requester, agent, admin)
 *   /tickets/:id           → TicketDetailPage   (all roles — service enforces ownership)
 *   /agent/queue           → AgentQueue         (agent, admin)
 *   /agent/assigned        → AgentAssigned      (agent, admin)
 *   /admin/reports         → AdminReports       (admin)
 *   /admin/audit           → AuditLog           (admin)
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { LoginPage, RegisterPage } from "./components/auth/AuthPages";
import { ProtectedRoute, PublicRoute, RoleGuard } from "./components/auth/RouteGuards";
import { AdminReportsPage, AuditLogPage } from "./components/dashboard/AdminPages";
import { AgentAssigned, AgentQueue, RequesterDashboard } from "./components/dashboard/DashboardPages";
import AppLayout from "./components/layout/AppLayout";
import CreateTicketPage from "./components/tickets/CreateTicket";
import TicketDetailPage from "./components/tickets/TicketDetail";
import store from "./store";
import { bootstrapAuth, selectUserRole } from "./store/slices/authSlice";
import "./styles/index.css";

// ── React Query client configuration ─────────────────────────────────────────
// - staleTime: how long data is considered fresh (no refetch during this window)
// - retry: don't retry on 401/403/404 — these are expected failures
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30 seconds
      retry: (failCount, error) => {
        if ([401, 403, 404].includes(error?.status)) return false;
        return failCount < 2;
      },
      refetchOnWindowFocus: false, // Don't refetch on tab switch (saves bandwidth)
    },
  },
});

// AdminReportsPage and AuditLogPage are imported from AdminPages.jsx

// ── Smart redirect component ──────────────────────────────────────────────────
// Sends users to their role-appropriate home page
const RoleRedirect = () => {
  const role = useSelector(selectUserRole);
  if (role === "agent" || role === "admin") return <Navigate to="/agent/queue" replace />;
  return <Navigate to="/dashboard" replace />;
};

// ── AppBootstrap ──────────────────────────────────────────────────────────────
// Dispatches bootstrapAuth once on mount to validate any stored token.
// Must be a child of Provider so it can use useDispatch.
const AppBootstrap = ({ children }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    // On every app load, check if there's a stored token and validate it.
    // This restores the user's session across page refreshes.
    dispatch(bootstrapAuth());
  }, [dispatch]);

  return children;
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────

const App = () => {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppBootstrap>
            <Routes>
              {/* ── Public routes (auth pages) ───────────────────────── */}
              <Route
                path="/login"
                element={<PublicRoute><LoginPage /></PublicRoute>}
              />
              <Route
                path="/register"
                element={<PublicRoute><RegisterPage /></PublicRoute>}
              />

              {/* ── Protected routes (require authentication) ────────── */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Root redirect based on role */}
                <Route index element={<RoleRedirect />} />

                {/* ── All-role routes ──────────────────────────────── */}
                <Route path="dashboard" element={<RequesterDashboard />} />
                <Route path="tickets/my" element={<RequesterDashboard />} />
                <Route
                  path="tickets/new"
                  element={
                    <RoleGuard allowedRoles={["requester", "agent", "admin"]}>
                      <CreateTicketPage />
                    </RoleGuard>
                  }
                />
                <Route path="tickets/:id" element={<TicketDetailPage />} />

                {/* ── Agent routes ─────────────────────────────────── */}
                <Route
                  path="agent/queue"
                  element={
                    <RoleGuard allowedRoles={["agent", "admin"]}>
                      <AgentQueue />
                    </RoleGuard>
                  }
                />
                <Route
                  path="agent/assigned"
                  element={
                    <RoleGuard allowedRoles={["agent", "admin"]}>
                      <AgentAssigned />
                    </RoleGuard>
                  }
                />

                {/* ── Admin routes ─────────────────────────────────── */}
                <Route
                  path="admin/reports"
                  element={
                    <RoleGuard allowedRoles={["admin"]}>
                      <AdminReportsPage />
                    </RoleGuard>
                  }
                />
                <Route
                  path="admin/audit"
                  element={
                    <RoleGuard allowedRoles={["admin"]}>
                      <AuditLogPage />
                    </RoleGuard>
                  }
                />

                {/* 404 catch-all */}
                <Route
                  path="*"
                  element={
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                      <div className="text-6xl mb-4">404</div>
                      <h2 className="text-xl font-semibold text-slate-900 mb-2">Page not found</h2>
                      <p className="text-slate-500 text-sm">The page you're looking for doesn't exist.</p>
                    </div>
                  }
                />
              </Route>

              {/* Catch-all for unauthenticated users hitting unknown paths */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </AppBootstrap>
        </BrowserRouter>

        {/* Global toast notification container */}
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          theme="light"
          toastClassName="text-sm font-medium"
        />
      </QueryClientProvider>
    </Provider>
  );
};

export default App;
