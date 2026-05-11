import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Stethoscope, GraduationCap, UserRound, BookOpen,
  Library, Calendar, BarChart3, FileSpreadsheet, Info,
  Settings as SettingsIcon, Search, Bell, Network, Clock, CalendarCheck,
  Play, FileText, ScrollText, Activity, ShieldCheck, LogOut, Menu, X,
  ChevronRight, Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

// ─── Nav config per role ─────────────────────────────────────────────────
const NAV_BY_ROLE = {
  admin: [
    { section: "Overview", items: [
      { to: "/admin",                label: "Dashboard",      icon: LayoutDashboard },
      { to: "/admin/students",       label: "Students",       icon: GraduationCap },
      { to: "/admin/attendance",     label: "Attendance",     icon: CalendarCheck },
    ]},
    { section: "Analytics", items: [
      { to: "/admin/analytics",      label: "Live Analytics", icon: Activity, live: true },
      { to: "/admin/lectures",       label: "Lectures",       icon: FileText },
      { to: "/admin/grades",         label: "Grades",         icon: BarChart3 },
      { to: "/admin/reports",        label: "Reports",        icon: FileSpreadsheet },
    ]},
    { section: "Management", items: [
      { to: "/admin/classes",        label: "Classes",        icon: Library },
      { to: "/admin/subjects",       label: "Subjects",       icon: BookOpen },
      { to: "/admin/weeks",          label: "Weeks",          icon: Calendar },
      { to: "/admin/doctors",        label: "Doctors",        icon: Stethoscope },
      { to: "/admin/admins",         label: "Admins",         icon: ShieldCheck },
      { to: "/admin/parents",        label: "Parents",        icon: UserRound },
      { to: "/admin/student-search", label: "Student Search", icon: Search },
      { to: "/admin/about",          label: "About project",  icon: Info },
      { to: "/admin/settings",       label: "Settings",       icon: SettingsIcon },
    ]},
  ],
  doctor: [
    { section: "Overview", items: [
      { to: "/doctor",                 label: "Dashboard",      icon: LayoutDashboard },
      { to: "/doctor/classes",         label: "My Classes",     icon: Library },
      { to: "/doctor/attendance",      label: "Attendance",     icon: CalendarCheck },
    ]},
    { section: "Live", items: [
      { to: "/doctor/lectures",        label: "Live Classroom", icon: Activity, live: true },
      { to: "/doctor/analytics",       label: "Analytics",      icon: BarChart3 },
      { to: "/doctor/reports",         label: "Reports",        icon: FileSpreadsheet },
    ]},
    { section: "Management", items: [
      { to: "/doctor/subjects",        label: "Subjects",       icon: BookOpen },
      { to: "/doctor/weeks",           label: "Weeks",          icon: Calendar },
      { to: "/doctor/grades",          label: "Grades",         icon: FileText },
      { to: "/doctor/student-search",  label: "Student Search", icon: Search },
      { to: "/doctor/notifications",   label: "Notifications",  icon: Bell },
      { to: "/doctor/hierarchy",       label: "Hierarchy",      icon: Network },
    ]},
  ],
  student: [
    { section: "Learn", items: [
      { to: "/student",             label: "Dashboard",     icon: LayoutDashboard },
      { to: "/student/lectures",    label: "My Lectures",   icon: Play },
      { to: "/student/transcripts", label: "Transcripts",   icon: ScrollText },
      { to: "/student/engagement",  label: "Engagement",    icon: BarChart3 },
    ]},
    { section: "Progress", items: [
      { to: "/student/attendance",  label: "My Attendance", icon: CalendarCheck },
      { to: "/student/grades",      label: "Grades",        icon: GraduationCap },
      { to: "/student/history",     label: "History",       icon: Clock },
      { to: "/student/reports",     label: "Reports",       icon: FileSpreadsheet },
    ]},
    { section: "Explore", items: [
      { to: "/student/doctor-search", label: "Doctor Search", icon: Search },
      { to: "/student/hierarchy",     label: "My Classes",    icon: Network },
    ]},
  ],
  parent: [
    { section: "Overview", items: [
      { to: "/parent",            label: "Dashboard",   icon: LayoutDashboard },
      { to: "/parent/children",   label: "My Children", icon: Users },
    ]},
    { section: "Progress", items: [
      { to: "/parent/attendance", label: "Attendance",  icon: CalendarCheck },
      { to: "/parent/grades",     label: "Grades",      icon: GraduationCap },
    ]},
  ],
};

const ROLE_META = {
  admin:   { label: "Admin",   subtitle: "Admin Portal" },
  doctor:  { label: "Doctor",  subtitle: "Doctor Portal" },
  student: { label: "Student", subtitle: "Student Portal" },
  parent:  { label: "Parent",  subtitle: "Parent Portal" },
};

// ─── NavItem (uses .nav-active / .nav-item-icon / .nav-item-label classes
// from index.css — they pick up the role's brand color automatically) ──
function NavItem({ to, label, icon: Icon, live, end, onClose }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 cursor-pointer relative
         ${isActive
           ? "nav-active"
           : "border border-transparent hover:bg-white/[.06] hover:border-white/10"
         }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`nav-item-icon h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
              ${isActive ? "" : "bg-white/[.07] group-hover:bg-white/[.12]"}`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "" : "text-white/50 group-hover:text-white/80"}`} />
          </span>
          <span
            className={`nav-item-label flex-1 transition-colors
              ${isActive ? "" : "text-white/60 group-hover:text-white/90 font-medium"}`}
          >
            {label}
          </span>
          {live && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 live-dot inline-block" />
              Live
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ profile, sections, onClose, onLogout }) {
  const meta = ROLE_META[profile?.role] || ROLE_META.admin;
  const initials = (profile?.name || profile?.email || "?")
    .split(/[\s@.]/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="sidebar-bg h-full flex flex-col w-60 overflow-hidden">
      {/* Logo */}
      <div className="relative z-10 px-4 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
            style={{ background: "linear-gradient(135deg, rgb(var(--brand-grad-from)) 0%, rgb(var(--brand-grad-to)) 100%)" }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-sm leading-tight truncate">Classroom AI</div>
            <div className="text-white/40 text-[10px] font-medium tracking-wide">{meta.subtitle}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden text-white/70 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Profile chip */}
      <div className="relative z-10 mx-3 mb-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: "linear-gradient(135deg, rgb(var(--brand-grad-from)), rgb(var(--brand-grad-to)))" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white text-xs font-semibold truncate">
            {profile?.name || profile?.email}
          </div>
          <div className="text-white/40 text-[10px] truncate">{meta.label}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {sections.map((sec) => (
          <div key={sec.section}>
            <div className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
              {sec.section}
            </div>
            <ul className="space-y-1">
              {sec.items.map((it) => (
                <li key={it.to}>
                  <NavItem
                    to={it.to}
                    label={it.label}
                    icon={it.icon}
                    live={it.live}
                    end={it.to === `/${profile?.role}`}
                    onClose={onClose}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="relative z-10 px-3 py-3 border-t border-white/10">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] text-sm font-medium transition"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Breadcrumb crumbs ──────────────────────────────────────────────────
function Crumbs({ pathname, role }) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className={i === parts.length - 1 ? "text-slate-900 font-semibold capitalize" : "capitalize"}>
            {p.replace(/-/g, " ")}
          </span>
          {i < parts.length - 1 && <ChevronRight className="h-3 w-3" />}
        </span>
      ))}
    </div>
  );
}

// ─── Main Layout ────────────────────────────────────────────────────────
export default function Layout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sections = NAV_BY_ROLE[profile?.role] || [];

  // Drive per-role CSS variables via body[data-role="..."]
  useEffect(() => {
    if (profile?.role) {
      document.body.dataset.role = profile.role;
    }
    return () => { delete document.body.dataset.role; };
  }, [profile?.role]);

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block sticky top-0 h-screen shrink-0">
        <SidebarContent
          profile={profile}
          sections={sections}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          />
          <aside className="lg:hidden fixed top-0 left-0 z-40 h-screen">
            <SidebarContent
              profile={profile}
              sections={sections}
              onClose={() => setSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="topbar-glass sticky top-0 z-20 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-100 bg-white"
          >
            <Menu className="h-4 w-4 text-slate-700" />
          </button>
          <div className="flex-1 min-w-0">
            <Crumbs pathname={location.pathname} role={profile?.role} />
          </div>
          <NavLink to="/profile" className="text-sm text-slate-700 hover:text-slate-900 truncate max-w-[200px]">
            {profile?.name || profile?.email}
          </NavLink>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
