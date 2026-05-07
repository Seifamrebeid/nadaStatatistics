import { Inbox } from "lucide-react";

export default function CrudTable({ rows, columns, actions, empty = "No records yet." }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="card p-10 flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Inbox className="h-5 w-5" />
        </div>
        <div className="text-sm text-slate-500">{empty}</div>
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            {columns.map((c) => (
              <th
                key={c.key}
                className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                {c.label}
              </th>
            ))}
            {actions && <th className="px-5 py-3 w-1"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.id || i} className="hover:bg-slate-50/60 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className="px-5 py-3 align-middle text-slate-700">
                  {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                </td>
              ))}
              {actions && (
                <td className="px-5 py-3 text-right whitespace-nowrap">{actions(r)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
