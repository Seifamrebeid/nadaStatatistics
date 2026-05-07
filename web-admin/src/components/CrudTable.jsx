import { Inbox } from "lucide-react";

/**
 * Generic CRUD table.
 *   columns: [{ key, label, render?, className?, align? }]
 *   actions: row => JSX (right-aligned cell)
 *   empty:   string | JSX shown when rows is empty
 *   compact: tighter row height
 */
export default function CrudTable({
  rows,
  columns,
  actions,
  empty = "No records yet.",
  compact = false,
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Inbox className="h-5 w-5" />
        </div>
        <div className="text-sm text-slate-500">{empty}</div>
      </div>
    );
  }

  const cellPad = compact ? "px-4 py-2" : "px-5 py-3";
  const headPad = compact ? "px-4 py-2.5" : "px-5 py-3";

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-[1] bg-white">
          <tr className="border-b border-slate-200 bg-slate-50/70">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${headPad} text-${c.align || "left"} text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${c.className || ""}`}
              >
                {c.label}
              </th>
            ))}
            {actions && <th className={`${headPad} w-1`}></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr
              key={r.id || i}
              className="hover:bg-slate-50/60 transition-colors"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${cellPad} align-middle text-slate-700 text-${c.align || "left"} ${c.className || ""}`}
                >
                  {c.render ? c.render(r) : (r[c.key] ?? <span className="text-slate-300">—</span>)}
                </td>
              ))}
              {actions && (
                <td className={`${cellPad} text-right whitespace-nowrap`}>
                  {actions(r)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
