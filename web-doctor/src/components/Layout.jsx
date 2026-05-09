import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Network,
  BookOpen,
  Building2,
  CalendarDays,
  Presentation,
  BarChart3,
  Bell,
  Search,
  Award,
  ClipboardList,
  UserCircle,
  LogOut,
  Menu,
  X,
  Stethoscope,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/hierarchy", label: "Hierarchy", icon: Network },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/classes", label: "Classes", icon: Building2 },
  { to: "/weeks", label: "Weeks", icon: CalendarDays },
  { to: "/lectures", label: "Lectures", icon: Presentation },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/grades", label: "Grades", icon: Award },
  { to: "/attendance", label: "Attendance", icon: ClipboardList },
  { to: "/student-search", label: "Student Search", icon: Search },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Profile", icon: UserCircle },
];

export default function Layout() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await signOut(auth);
    nav("/login", { replace: true });
  }

  const initials = (profile?.name || profile?.email || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-sm">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">
                Classroom
              </div>
              <div className="text-[11px] text-slate-500 -mt-0.5">
                Emotions · Doctor
              </div>
            </div>
          </Link>
          <button
            className="lg:hidden text-slate-500 hover:text-slate-900"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </div>
          <ul className="space-y-0.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-4 w-4 ${isActive ? "text-brand-600" : "text-slate-400"}`}
                      />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">
                {profile?.name || "Doctor"}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {profile?.email}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center px-4 lg:px-6 sticky top-0 z-20">
          <button
            className="lg:hidden mr-3 text-slate-600 hover:text-slate-900"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-3 text-sm">
            <span className="text-slate-500">{profile?.email}</span>
            <span className="badge bg-brand-50 text-brand-700">Doctor</span>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
