import { useEffect } from "react";
import { X } from "lucide-react";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/**
 * Generic modal. Pass either:
 *   footer={<>...buttons...</>}                custom footer
 * or
 *   onSubmit / submitLabel + cancelLabel       built-in Cancel / Primary footer
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  submitting = false,
  submitDisabled = false,
  size = "md",
  danger = false,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const builtInFooter = onSubmit ? (
    <>
      <button type="button" onClick={onClose} className="btn-secondary">
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || submitDisabled}
        className={danger ? "btn-danger" : "btn-primary"}
      >
        {submitting ? "Working…" : submitLabel}
      </button>
    </>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${SIZES[size] || SIZES.md} border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 text-base leading-6 truncate">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1 transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">{children}</div>
        {(footer || builtInFooter) && (
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap gap-2 justify-end">
            {footer || builtInFooter}
          </div>
        )}
      </div>
    </div>
  );
}
