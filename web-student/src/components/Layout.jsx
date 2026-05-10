import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Play,
  Radio,
  BarChart2,
  CalendarCheck,
  GraduationCap,
  Clock,
  Search,
  Network,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronRight,
  FileText,
} from "lucide-react";

/* ── Nav structure ─────────────────────────────────── */
const NAV_SECTIONS = [
  {
    title: "My Learning",
    items: [
      { to: "/",           label: "Dashboard",     icon: LayoutDashboard, end: true },
      { to: "/lectures",   label: "My Lectures",   icon: Play },
      { to: "/transcripts", label: "Transcripts",   icon: FileText },
      { to: "/engagement",  label: "Engagement",   icon: BarChart2 },
    ],
  },
  {
    title: "Progress",
    items: [
      { to: "/attendance", label: "My Attendance", icon: CalendarCheck },
      { to: "/grades",     label: "Grades",        icon: GraduationCap },
      { to: "/history",    label: "History",       icon: Clock },
    ],
  },
  {
    title: "Explore",
    items: [
      { to: "/doctor-search", label: "Doctor Search", icon: Search },
      { to: "/hierarchy",     label: "My Classes",    icon: Network },
    ],
  },
];

/* ── Sidebar nav item ──────────────────────────────── */
function NavItem({ to, label, icon: Icon, end = false, live = false, onClick }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) =>
          `group flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-all duration-150 border ${
            isActive
              ? "nav-active border-transparent"
              : "border-transparent text-slate-400 hover:bg-white/[.07] hover:text-slate-200"
          }`
        }
      >
        {({ isActive }) => (
          <>
            {/* icon bubble */}
            <span
              className={`nav-item-icon h-7 w-7 flex items-center justify-center rounded-lg shrink-0 transition-colors ${
                isActive
                  ? "bg-blue-500/30"
                  : "bg-white/[.06] group-hover:bg-white/[.10]"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 transition-colors ${
                  isActive ? "text-blue-300" : "text-slate-400 group-hover:text-slate-200"
                }`}
              />
            </span>

            {/* label */}
            <span
              className={`nav-item-label flex-1 tracking-tight transition-colors ${
                isActive ? "text-blue-100 font-bold" : "font-medium"
              }`}
            >
              {label}
            </span>

            {/* live badge */}
            {live && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold shrink-0">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-blue-400 inline-block" />
                1 live
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

/* ── Main layout ───────────────────────────────────── */
export default function Layout() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await signOut(auth);
    nav("/login", { replace: true });
  }

  const displayName = profile?.name || profile?.email || "Student";
  const initials = displayName.slice(0, 2).toUpperCase();

  /* breadcrumb: derive page title from pathname */
  function PageBreadcrumb() {
    const path = window.location.pathname.replace(/^\//, "") || "dashboard";
    const title =
      path === ""
        ? "Dashboard"
        : path
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <span className="text-slate-400">Student Portal</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        <span className="text-slate-700 font-semibold">{title}</span>
      </div>
    );
  }

  /* ── Sidebar content (shared between desktop + mobile) */
  const sidebarContent = (
    <div className="sidebar-bg h-full flex flex-col w-60">
      {/* Logo */}
      <div className="h-16 px-4 flex items-center justify-between shrink-0 z-10 relative">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-900/40 shrink-0">
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white tracking-tight">Classroom AI</div>
            <div className="text-[10px] text-blue-300/80 -mt-0.5 font-medium tracking-wide">
              Student Portal
            </div>
          </div>
        </Link>
        <button
          className="lg:hidden text-slate-400 hover:text-white transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5 relative z-10">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Motivational footer strip */}
      <div className="relative z-10 mx-3 mb-3 rounded-xl bg-gradient-to-br from-blue-600/25 to-indigo-600/15 border border-blue-500/20 px-3 py-2.5">
        <p className="text-[11px] font-semibold text-blue-200 leading-snug">
          Keep it up! Your engagement this week is improving.
        </p>
        <p className="text-[10px] text-blue-400/70 mt-0.5">Stay curious, stay focused.</p>
      </div>

      {/* User card */}
      <div className="relative z-10 border-t border-white/[.06] p-3 shrink-0">
        <div className="flex items-center gap-2.5 px-1 py-1.5 rounded-xl hover:bg-white/[.05] transition-colors">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-xs font-bold text-white shadow shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{displayName}</div>
            <div className="text-[10px] text-slate-400 truncate">{profile?.email}</div>
          </div>
          <span className="text-[10px] font-bold text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded-full">
            Student
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="mt-1.5 w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:bg-white/[.07] hover:text-red-300 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "var(--page-bg)" }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen w-60">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col transform transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="topbar-glass h-14 flex items-center px-4 lg:px-6 sticky top-0 z-20 shrink-0 gap-3">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden text-slate-500 hover:text-slate-900 transition-colors mr-1"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb */}
          <div className="hidden sm:block">
            <PageBreadcrumb />
          </div>

          <div className="flex-1" />

          {/* Search bar */}
          <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-1.5 w-48 xl:w-64 border border-slate-200/80">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search anything..."
              className="bg-transparent text-xs text-slate-600 placeholder:text-slate-400 outline-none w-full"
            />
          </div>

          {/* Bell */}
          <button className="relative h-8 w-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200">
            <Bell className="h-4 w-4 text-slate-500" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500 border border-white" />
          </button>

          {/* Avatar */}
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-xs font-bold text-white shadow shrink-0">
            {initials}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
