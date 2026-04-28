import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { mismatchError, setMismatchError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setMismatchError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // AuthContext takes over from here: role-mismatch gate runs, then
      // either admits (redirects via AppRoutes) or signs back out.
    } catch (ex) {
      setErr(ex.message.replace(/^Firebase:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold text-center">Doctor Portal</h1>
        <p className="text-sm text-slate-500 text-center mt-1">
          Sign in with your doctor account
        </p>

        {mismatchError && (
          <div className="mt-4 px-3 py-2 bg-amber-100 border border-amber-300 text-amber-900 text-sm rounded">
            {mismatchError}
          </div>
        )}
        {err && (
          <div className="mt-4 px-3 py-2 bg-red-100 border border-red-300 text-red-900 text-sm rounded">
            {err}
          </div>
        )}

        <label className="block mt-4">
          <span className="text-sm text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <label className="block mt-3">
          <span className="text-sm text-slate-600">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full bg-brand hover:bg-brand-dark text-white rounded py-2 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-xs text-slate-500 text-center mt-4">
          Use email/password for now.
        </p>
      </form>
    </div>
  );
}
