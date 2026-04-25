/**
 * App Layout
 *
 * Provides the main shell: sidebar + topbar + main content area.
 * Renders role-appropriate navigation links based on the user's role.
 *
 * Structure:
 * ┌──────────────────────────────────────┐
 * │  Sidebar (fixed, 256px)              │
 * │  ┌──────────────────────────────┐   │
 * │  │  Logo                        │   │
 * │  │  Nav Links (role-filtered)   │   │
 * │  │  User info + Logout          │   │
 * │  └──────────────────────────────┘   │
 * │                                      │
 * │  Main area (flex, full width)        │
 * │  ┌──────────────────────────────┐   │
 * │  │  Topbar (mobile nav)        │   │
 * │  │  Page content (<Outlet>)    │   │
 * │  └──────────────────────────────┘   │
 * └──────────────────────────────────────┘
 */

import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  LayoutDashboard, Ticket, ClipboardList, PlusCircle,
  LogOut, Menu, X, Shield, BarChart2, FileText
} from "lucide-react";
import { logoutUser, selectUser } from "../../store/slices/authSlice";
import { Avatar } from "../common";
import { getRoleBadgeClasses } from "../../utils/helpers";

// ── Navigation config ─────────────────────────────────────────────────────────
// Each entry defines which roles can see the link.
// Rendering filters by the current user's role.
const NAV_LINKS = [
  // ── Requester navigation
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["requester", "agent", "admin"],
  },
  {
    to: "/tickets/new",
    label: "Create Ticket",
    icon: PlusCircle,
    roles: ["requester", "agent", "admin"],
  },
  {
    to: "/tickets/my",
    label: "My Tickets",
    icon: Ticket,
    roles: ["requester", "agent", "admin"],
  },
  // ── Agent navigation
  {
    to: "/agent/queue",
    label: "Ticket Queue",
    icon: ClipboardList,
    roles: ["agent", "admin"],
  },
  {
    to: "/agent/assigned",
    label: "My Work",
    icon: FileText,
    roles: ["agent", "admin"],
  },
  // ── Admin navigation
  {
    to: "/admin/reports",
    label: "Reports",
    icon: BarChart2,
    roles: ["admin"],
  },
  {
    to: "/admin/audit",
    label: "Audit Log",
    icon: Shield,
    roles: ["admin"],
  },
];

// ── Sidebar NavLink styles ────────────────────────────────────────────────────
// React Router's NavLink provides an `isActive` prop; we use it to apply
// active styles without additional state.
const navLinkClass = ({ isActive }) =>
  [
    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150",
    isActive
      ? "bg-primary-50 text-primary-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const Sidebar = ({ isOpen, onClose }) => {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const visibleLinks = NAV_LINKS.filter((link) => link.roles.includes(user?.role));

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/login");
  };

  return (
    <>
      {/* ── Mobile backdrop ───────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* ── Sidebar panel ─────────────────────────────────────────────────── */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200",
          "flex flex-col transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0", // Always visible on desktop
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">
              IT Helpdesk
            </span>
          </div>
          {/* Close button (mobile only) */}
          <button
            className="lg:hidden btn-ghost p-1.5 rounded-lg"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* Role badge */}
          <div className="mb-4 px-3">
            <span className={`badge text-xs capitalize ${getRoleBadgeClasses(user?.role)}`}>
              {user?.role}
            </span>
          </div>

          <ul className="space-y-0.5">
            {visibleLinks.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className={navLinkClass} onClick={onClose}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info + Logout */}
        <div className="border-t border-slate-100 px-3 py-4">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TOPBAR (mobile hamburger + page context)
// ─────────────────────────────────────────────────────────────────────────────

const Topbar = ({ onMenuClick }) => (
  <header className="sticky top-0 z-20 flex items-center gap-4 px-4 sm:px-6 h-14 bg-white border-b border-slate-200 lg:hidden">
    <button
      onClick={onMenuClick}
      className="btn-ghost p-2 rounded-lg"
      aria-label="Open navigation menu"
    >
      <Menu className="w-5 h-5" />
    </button>
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 bg-primary-600 rounded flex items-center justify-center">
        <Ticket className="w-3.5 h-3.5 text-white" />
      </div>
      <span className="font-bold text-slate-900 text-sm">IT Helpdesk</span>
    </div>
  </header>
);

// ─────────────────────────────────────────────────────────────────────────────
// APP LAYOUT (main export)
// ─────────────────────────────────────────────────────────────────────────────

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar — fixed on desktop, slide-in drawer on mobile */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area — left margin on desktop to account for fixed sidebar */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Mobile topbar */}
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content — rendered by the router's <Outlet> */}
        <main className="flex-1 px-4 sm:px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
