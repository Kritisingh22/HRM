/* ============================================================
   CSV export — used by the Export buttons and the Analytics page.
   ============================================================ */

function csvCell(value: unknown): string {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A 2-D array (header + rows) → CSV text. */
export function rowsToCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** The first visible table on screen → CSV text. Falls back to null. */
export function tableToCsv(table: HTMLTableElement): string {
  const out: string[] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = tr.querySelectorAll('th,td');
    if (!cells.length) return;
    const row: string[] = [];
    cells.forEach((c) => row.push(csvCell((c as HTMLElement).innerText)));
    out.push(row.join(','));
  });
  return out.join('\r\n');
}

/** Trigger a browser download for the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const safe = filename.replace(/[^a-z0-9._-]+/gi, '_').toLowerCase();
  const name = safe.endsWith('.csv') ? safe : `${safe}.csv`;
  try {
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
  } catch {
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** Convenience: export a table element directly. */
export function exportTable(table: HTMLTableElement | null, filename: string): boolean {
  if (!table) return false;
  downloadCsv(filename, tableToCsv(table));
  return true;
}
