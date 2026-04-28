// Generic little table for lists of records. Rows are plain objects; the
// parent passes `columns` as [{ key, label, render? }] and `actions` as a
// function returning JSX for the trailing cell.
export default function CrudTable({ rows, columns, actions, empty = "No records yet." }) {
  if (!rows || rows.length === 0) {
    return <div className="text-slate-500 bg-white rounded-lg shadow p-6 text-center">{empty}</div>;
  }
  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            {columns.map((c) => <th key={c.key} className="text-left px-4 py-2 font-medium">{c.label}</th>)}
            {actions && <th className="px-4 py-2 w-1"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-t">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-2 align-middle">
                  {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                </td>
              ))}
              {actions && <td className="px-4 py-2 text-right whitespace-nowrap">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
