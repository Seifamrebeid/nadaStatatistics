/**
 * Reusable filter bar.
 *
 * Props:
 *   value          { search, [fieldKey]: string, dateFrom, dateTo, ... }
 *   onChange(next)
 *   onReset()
 *   searchPlaceholder
 *   selects        Array<{ key, label, options: Array<{value,label}> | string[] }>
 *   dateRange      { key } | false   (key is the row field used for filtering)
 *   total          number of total rows
 *   shown          number of rows after filter
 */
export default function FilterBar({
  value,
  onChange,
  onReset,
  searchPlaceholder = "Search...",
  selects = [],
  dateRange = false,
  total,
  shown,
}) {
  const set = (k, v) => onChange({ ...value, [k]: v });

  return (
    <div className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[180px]">
        <span className="text-xs text-slate-500 block mb-1">Search</span>
        <input
          value={value.search ?? ""}
          onChange={(e) => set("search", e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </label>

      {selects.map((sel) => {
        const opts = (sel.options || []).map((o) =>
          typeof o === "string" ? { value: o, label: o } : o,
        );
        return (
          <label key={sel.key} className="min-w-[140px]">
            <span className="text-xs text-slate-500 block mb-1">{sel.label}</span>
            <select
              value={value[sel.key] ?? ""}
              onChange={(e) => set(sel.key, e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">All</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      {dateRange && (
        <>
          <label className="min-w-[140px]">
            <span className="text-xs text-slate-500 block mb-1">From</span>
            <input
              type="date"
              value={value.dateFrom ?? ""}
              onChange={(e) => set("dateFrom", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="min-w-[140px]">
            <span className="text-xs text-slate-500 block mb-1">To</span>
            <input
              type="date"
              value={value.dateTo ?? ""}
              onChange={(e) => set("dateTo", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </label>
        </>
      )}

      <button
        type="button"
        onClick={onReset}
        className="text-sm px-3 py-2 border rounded hover:bg-slate-50"
      >
        Reset
      </button>

      {typeof total === "number" && (
        <div className="ml-auto text-xs text-slate-500 self-center">
          Showing {shown ?? total} of {total}
        </div>
      )}
    </div>
  );
}

/**
 * Convenience: build a filter predicate for an array of rows.
 *
 *   const f = makeFilter({
 *     search: { fields: ["title", "id"] },
 *     selects: [{ key: "status", field: "status" }],
 *     dateRange: { key: "scheduled_at" },
 *   })(filters);
 *   const filtered = rows.filter(f);
 */
export function makeFilter({ search, selects = [], dateRange } = {}) {
  return (filters) => (row) => {
    if (filters.search && search?.fields?.length) {
      const q = String(filters.search).toLowerCase();
      const hit = search.fields.some((f) => {
        const v = row?.[f];
        return v != null && String(v).toLowerCase().includes(q);
      });
      if (!hit) return false;
    }

    for (const sel of selects) {
      const want = filters[sel.key];
      if (!want) continue;
      const got = row?.[sel.field ?? sel.key];
      if (String(got ?? "") !== String(want)) return false;
    }

    if (dateRange?.key) {
      const raw = row?.[dateRange.key];
      const t = raw ? new Date(raw).getTime() : NaN;
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom + "T00:00:00").getTime();
        if (Number.isNaN(t) || t < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo + "T23:59:59").getTime();
        if (Number.isNaN(t) || t > to) return false;
      }
    }

    return true;
  };
}

/**
 * Hook-friendly default state shape.
 */
export const emptyFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
};

/**
 * Build distinct dropdown options from a list of rows for a given field.
 */
export function distinctOptions(rows, field) {
  const seen = new Set();
  for (const r of rows || []) {
    const val = r?.[field];
    if (val !== undefined && val !== null && val !== "") seen.add(String(val));
  }
  return Array.from(seen).sort().map((v) => ({ value: v, label: v }));
}
