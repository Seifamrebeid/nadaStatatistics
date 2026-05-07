import { useState } from "react";
import {
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import {
  Stethoscope,
  ScanFace,
  Activity,
  Users,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import Spinner from "../components/Spinner";

export default function Login() {
  const { mismatchError, setMismatchError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setMismatchError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (ex) {
      setErr(ex.message.replace(/^Firebase:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithFace() {
    setErr(null);
    setMismatchError(null);
    setFaceBusy(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const image = await new ImageCapture(track).grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Failed to capture face image");

      const fd = new FormData();
      fd.append("role", "doctor");
      fd.append("file", blob, "face.jpg");
      const { data } = await api.post("/api/auth/face-login", fd);
      const token = Array.isArray(data.custom_token)
        ? data.custom_token[0]
        : data.custom_token;
      if (!token) throw new Error("No custom token returned");
      await signInWithCustomToken(auth, token);
    } catch (ex) {
      setErr(
        ex.response?.data?.error || ex.message.replace(/^Firebase:\s*/, ""),
      );
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setFaceBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-10 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Classroom Emotions</div>
            <div className="text-xs text-white/60">Doctor Workspace</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Teach with insight, not guesswork.
          </h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed">
            Run live classrooms, review per-student engagement, and act on
            real-time emotion signals — all from one focused workspace.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-indigo-300" />
              <span className="text-white/80">Live engagement & gesture stream</span>
            </li>
            <li className="flex items-center gap-3">
              <Users className="h-4 w-4 text-indigo-300" />
              <span className="text-white/80">Class, week, and student-level analytics</span>
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-indigo-300" />
              <span className="text-white/80">Face sign-in for fast lecture starts</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} Classroom Emotions
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div className="font-semibold text-slate-900">Classroom Emotions</div>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">Welcome back, Doctor</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with email/password — or use your face.
          </p>

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

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <div className="flex-1 h-px bg-slate-200" />
            <span>OR</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={signInWithFace}
            disabled={faceBusy}
            className="btn-secondary w-full py-2.5"
          >
            {faceBusy ? <Spinner size="sm" /> : <ScanFace className="h-4 w-4" />}
            {faceBusy ? "Scanning face…" : "Sign in with face"}
          </button>

          <p className="text-xs text-slate-400 text-center mt-6">
            Doctors can sign in with email/password or face recognition.
          </p>
        </form>
      </div>
    </div>
  );
}
