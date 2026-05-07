/**
 * Consistent page header used at the top of every admin page.
 *
 *   <PageHeader
 *     title="Students"
 *     subtitle="Manage student accounts and enrollments."
 *     actions={<button className="btn-primary">+ New student</button>}
 *   />
 */
export default function PageHeader({ title, subtitle, eyebrow, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">{subtitle}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
