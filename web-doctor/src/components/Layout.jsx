import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/lectures", label: "Lectures" },
  { to: "/analytics", label: "Analytics" },
  { to: "/notifications", label: "Notifications" },
  { to: "/settings", label: "Settings" },
  { to: "/profile", label: "Profile" },
];

export default function Layout() {
  const { profile } = useAuth();
  const nav = useNavigate();
  async function handleLogout() {
    await signOut(auth);
    nav("/login", { replace: true });
  }
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">
            Classroom Emotions · Doctor
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-80">{profile?.email}</span>
            <button
              onClick={handleLogout}
              className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="bg-brand-dark text-sm">
          <div className="max-w-7xl mx-auto px-4 flex gap-4 overflow-x-auto">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `py-2 border-b-2 whitespace-nowrap ${
                    isActive
                      ? "border-white"
                      : "border-transparent hover:border-white/40"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
