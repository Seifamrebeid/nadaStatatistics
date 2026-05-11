// Shared exporter — convert any tabular dataset to .xlsx or .pdf.
//
// Usage:
//   import { exportXlsx, exportPdf } from "../lib/reportExport";
//   exportXlsx({ filename: "students.xlsx", sheets: [{ name: "Roster", rows }] });
//   exportPdf ({ filename: "students.pdf",  title: "Students", rows, columns });
//
// Excel sheets accept either an array of objects (auto-derives columns from
// first row's keys) or { columns: [...], rows: [...] } for explicit ordering.

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const stamp = () =>
  new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");

function toAOA(sheet) {
  const rows = sheet.rows || [];
  if (sheet.columns && sheet.columns.length) {
    const head = sheet.columns.map((c) => c.label || c.key);
    const body = rows.map((r) => sheet.columns.map((c) => r[c.key] ?? ""));
    return [head, ...body];
  }
  if (!rows.length) return [["(empty)"]];
  const cols = Object.keys(rows[0]);
  return [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ""))];
}

export function exportXlsx({ filename, sheets }) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(toAOA(sheet));
    XLSX.utils.book_append_sheet(wb, ws, (sheet.name || "Sheet1").slice(0, 31));
  }
  XLSX.writeFile(wb, filename || `report-${stamp()}.xlsx`);
}

export function exportPdf({ filename, title, subtitle, rows, columns, sheets }) {
  // Allow either the single-table form (rows + columns) or the multi-table
  // form (sheets: [{ name, rows, columns }]).
  const tables = sheets || [{ name: title || "Report", rows, columns }];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  let y = 40;
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    if (i > 0) { doc.addPage(); y = 40; }

    if (title || t.name) {
      doc.setFontSize(16);
      doc.setTextColor("#0f172a");
      doc.text(t.name || title || "Report", 40, y);
      y += 18;
    }
    if (subtitle && i === 0) {
      doc.setFontSize(10);
      doc.setTextColor("#64748b");
      doc.text(subtitle, 40, y);
      y += 14;
    }
    doc.setFontSize(8);
    doc.setTextColor("#94a3b8");
    doc.text(`Generated ${new Date().toLocaleString()}`, 40, y);
    y += 14;

    const cols = t.columns && t.columns.length
      ? t.columns
      : (t.rows && t.rows.length ? Object.keys(t.rows[0]).map((k) => ({ key: k, label: k })) : []);
    const head = [cols.map((c) => c.label || c.key)];
    const body = (t.rows || []).map((r) => cols.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }));

    autoTable(doc, {
      head, body, startY: y,
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(filename || `report-${stamp()}.pdf`);
}

// Build the full report sheet bundle (sheets array) so the same data can be
// downloaded as Excel and PDF.
export function reportBundle(title, sections) {
  return {
    sheets: sections.map((s) => ({
      name: s.name,
      columns: s.columns,
      rows: s.rows,
    })),
    title,
  };
}
