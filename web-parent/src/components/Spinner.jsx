import { Loader2 } from "lucide-react";

const sizes = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export default function Spinner({ size = "md", className = "" }) {
  return (
    <Loader2
      className={`${sizes[size] || sizes.md} animate-spin text-brand-600 ${className}`}
    />
  );
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner size="xl" />
      <div className="text-sm">{label}</div>
    </div>
  );
}

export function InlineLoader({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
      <Spinner size="md" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
