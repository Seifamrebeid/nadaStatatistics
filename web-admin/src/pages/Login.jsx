import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, ShieldCheck, Sparkles, BarChart3, AlertCircle } from "lucide-react";
import Spinner from "../components/Spinner";

export default function Login() {
  const { mismatchError, setMismatchError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setMismatchError(null); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (ex) {
      setErr(ex.message.replace(/^Firebase:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-10 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Classroom Emotions</div>
            <div className="text-xs text-white/60">Admin Console</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Operate the platform with confidence.
          </h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed">
            Manage doctors, students, and classes; monitor engagement signals; and review
            system-wide analytics — all from a single secure workspace.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span className="text-white/80">Role-gated access for admins only</span>
            </li>
            <li className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 text-emerald-300" />
              <span className="text-white/80">Live engagement & gesture analytics</span>
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              <span className="text-white/80">Built for fast, daily admin workflows</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} Classroom Emotions
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="font-semibold text-slate-900">Classroom Emotions</div>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your admin account to continue.</p>

          {mismatchError && (
            <div className="mt-5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{mismatchError}</span>
            </div>
          )}
          {err && (
            <div className="mt-5 px-3.5 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="mt-6">
            <label className="label">Email</label>
            <input
              type="email"
              required
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
            />
          </div>
          <div className="mt-4">
            <label className="label">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full mt-6 py-2.5">
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-slate-400 text-center mt-6">
            Face sign-in is intentionally disabled for admins.
          </p>
        </form>
      </div>
    </div>
  );
}
