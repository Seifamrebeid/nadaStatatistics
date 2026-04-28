import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-semibold text-slate-400">404</h1>
      <p className="text-slate-600 mt-2">Page not found.</p>
      <Link to="/" className="inline-block mt-4 text-brand hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
