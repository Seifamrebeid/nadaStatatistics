import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, ShieldCheck, Sparkles, BarChart3, AlertCircle } from "lucide-react";
import Spinner from "../components/Spinner";

const QUICK_ACCOUNTS = [
  { role: "admin",   label: "Admin",   email: "admin@classroom.local",      password: "123456789",
    color: "bg-rose-100 text-rose-800 hover:bg-rose-200 border-rose-200" },
  { role: "doctor",  label: "Doctor",  email: "khaled.mostafa@nada.edu",      password: "Doctor@123",
    color: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-200" },
  { role: "student", label: "Student", email: "nadasoska2005@gmail.com",    password: "123456789",
    color: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200" },
  { role: "parent",  label: "Parent",  email: "seif.amr.ebeid05@gmail.com", password: "123456789",
    color: "bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200" },
];

export default function Login() {
  const { mismatchError, setMismatchError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  function quickFill(acc) {
    setEmail(acc.email);
    setPassword(acc.password);
    setErr(null);
    setMismatchError(null);
  }

  async function quickSignIn(acc) {
    setEmail(acc.email);
    setPassword(acc.password);
    setErr(null); setMismatchError(null); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, acc.email, acc.password);
    } catch (ex) {
      setErr(ex.message.replace(/^Firebase:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

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
          <img
            src="/logo.png"
            alt="EDU Link"
            className="h-12 w-12 rounded-xl ring-1 ring-white/20 bg-white/5 object-cover"
          />
          <div>
            <div className="font-bold text-lg tracking-tight">
              EDU <span className="text-white/70">Link</span>
            </div>
            <div className="text-xs text-white/60">Connect · Learn · Grow · Succeed</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            One platform. Four roles. Real-time insight.
          </h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed">
            EDU Link brings admins, doctors, students and parents into a single workspace —
            face-aware attendance, live engagement, and shared analytics.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span className="text-white/80">Role-gated portal — admin, doctor, student, parent</span>
            </li>
            <li className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 text-emerald-300" />
              <span className="text-white/80">Live engagement & gesture analytics</span>
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              <span className="text-white/80">Built for fast, daily classroom workflows</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} EDU Link
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <img src="/logo.png" alt="EDU Link" className="h-10 w-10 rounded-lg object-cover" />
            <div className="font-bold text-slate-900 text-lg tracking-tight">
              EDU <span className="text-slate-500">Link</span>
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in or pick a role below to log in instantly.</p>

          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Quick sign-in
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACCOUNTS.map((acc) => (
                <div key={acc.role} className={`rounded-lg border p-2.5 ${acc.color}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{acc.label}</div>
                    <button
                      type="button"
                      onClick={() => quickFill(acc)}
                      title="Just fill the form"
                      className="text-[10px] font-semibold underline-offset-2 hover:underline opacity-75"
                    >
                      fill
                    </button>
                  </div>
                  <div className="text-[11px] mt-0.5 truncate opacity-80" title={acc.email}>
                    {acc.email}
                  </div>
                  <button
                    type="button"
                    onClick={() => quickSignIn(acc)}
                    disabled={busy}
                    className="mt-1.5 w-full rounded-md bg-white/70 px-2 py-1 text-xs font-bold border border-current/20 hover:bg-white disabled:opacity-50"
                  >
                    Sign in →
                  </button>
                </div>
              ))}
            </div>
          </div>

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
            Demo passwords: doctor <code>Doctor@123</code> · others <code>123456789</code>
          </p>
        </form>
      </div>
    </div>
  );
}
