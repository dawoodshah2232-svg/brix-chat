// Brix Chat — CSV/JSON import & export for admin lists.
// Small RFC-4180-ish CSV parser (quotes, commas, newlines), row validation,
// and download helpers. No dependencies.

import { useState } from 'react';
import { Button, Input, Label, Modal } from '../ui';
import { cx } from '../../lib/utils';

/** Parse CSV text into rows (arrays of strings). Handles quoted fields. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const push = () => { row.push(field); field = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') push();
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { push(); rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { push(); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Map header row + data rows to objects keyed by lowercased header. */
export function rowsToObjects(rows: string[][]): { headers: string[]; objects: Array<Record<string, string>> } {
  if (rows.length === 0) return { headers: [], objects: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return {
    headers,
    objects: rows.slice(1).map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
      return o;
    }),
  };
}

/** Escape a CSV cell. */
function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build CSV text from headers + row objects. */
export function toCSV<T extends Record<string, unknown>>(headers: string[], rows: T[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','));
  return lines.join('\n');
}

/** Trigger a browser download of a text file. */
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

export function exportCSV<T extends Record<string, unknown>>(filename: string, headers: string[], rows: T[]) {
  downloadFile(filename, toCSV(headers, rows), 'text/csv;charset=utf-8');
}

export function exportJSON(filename: string, data: unknown) {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json');
}

export interface ImportRowError {
  row: number; // 1-based data-row number (excluding header)
  message: string;
}

/**
 * Generic import modal: file picker → parse CSV or JSON → validate rows →
 * show row-level errors → import the valid ones.
 */
export function ImportModal<T>({
  open,
  onClose,
  title,
  acceptCSV = true,
  validate,
  onImport,
  template,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  acceptCSV?: boolean;
  /** Returns an error message per invalid row, or null when valid. Also normalizes the row. */
  validate: (obj: Record<string, string>, rowNum: number) => string | null;
  /** Called with the valid normalized rows. */
  onImport: (rows: Array<Record<string, string>>) => Promise<void>;
  /** Shown as a downloadable template hint. */
  template: string;
}) {
  const [raw, setRaw] = useState('');
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [parsed, setParsed] = useState<Array<Record<string, string>>>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const reset = () => {
    setRaw(''); setErrors([]); setValidCount(0); setParsed([]); setBusy(false); setFileName('');
  };

  const analyze = (text: string) => {
    const t = text.trim();
    let objects: Array<Record<string, string>> = [];
    try {
      if (t.startsWith('[') || t.startsWith('{')) {
        const j = JSON.parse(t);
        const arr = Array.isArray(j) ? j : [j];
        objects = arr.map((o: unknown) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) out[String(k).toLowerCase()] = String(v ?? '');
          return out;
        });
      } else {
        objects = rowsToObjects(parseCSV(text)).objects;
      }
    } catch {
      setErrors([{ row: 0, message: 'Could not parse the file — check it is valid CSV or JSON.' }]);
      setParsed([]);
      setValidCount(0);
      return;
    }
    if (objects.length === 0) {
      setErrors([{ row: 0, message: 'No data rows found in the file.' }]);
      setParsed([]);
      setValidCount(0);
      return;
    }
    const errs: ImportRowError[] = [];
    objects.forEach((o, i) => {
      const msg = validate(o, i + 1);
      if (msg) errs.push({ row: i + 1, message: msg });
    });
    setErrors(errs);
    setParsed(objects);
    setValidCount(objects.length - errs.length);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result ?? '');
      setRaw(text);
      analyze(text);
    };
    r.readAsText(f);
  };

  const doImport = async () => {
    if (parsed.length === 0 || validCount === 0) return;
    setBusy(true);
    try {
      const badRows = new Set(errors.map((e) => e.row));
      const valid = parsed.filter((_, i) => !badRows.has(i + 1));
      await onImport(valid);
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={title} wide>
      <div className="space-y-4">
        <div>
          <Label>File</Label>
          <label className="inline-block px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold cursor-pointer hover:bg-slate-700">
            Choose {acceptCSV ? 'CSV or JSON' : 'JSON'} file
            <input
              type="file"
              accept={acceptCSV ? '.csv,.json,text/csv,application/json' : '.json,application/json'}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {fileName && <span className="ml-3 text-sm text-slate-500 font-mono">{fileName}</span>}
          <p className="text-xs text-slate-400 mt-2">Expected columns: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{template}</code></p>
        </div>

        {raw && (
          <div className={cx(
            'rounded-2xl border px-4 py-3 text-sm font-semibold',
            errors.length === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900',
          )}>
            {parsed.length} row{parsed.length === 1 ? '' : 's'} found · <strong>{validCount}</strong> valid
            {errors.length > 0 && <> · <strong>{errors.length}</strong> with errors (only valid rows will be imported)</>}
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 overflow-hidden">
            <div className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-rose-700">Row errors</div>
            <ul className="max-h-48 overflow-auto slim-scroll px-4 pb-3 space-y-1.5">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i} className="text-[13px] text-rose-900">
                  <span className="font-mono font-bold">Row {e.row}:</span> {e.message}
                </li>
              ))}
              {errors.length > 50 && <li className="text-xs text-rose-600">…and {errors.length - 50} more</li>}
            </ul>
          </div>
        )}

        {parsed.length > 0 && validCount > 0 && (
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500">Preview (first 5 valid rows)</div>
            <div className="overflow-auto slim-scroll max-h-48">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    {Object.keys(parsed[0]).map((h) => <th key={h} className="px-3 py-2 font-semibold font-mono">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsed.filter((_, i) => !errors.some((e) => e.row === i + 1)).slice(0, 5).map((o, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {Object.keys(parsed[0]).map((h) => <td key={h} className="px-3 py-2 text-slate-700 max-w-[200px] truncate">{o[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={doImport} disabled={busy || validCount === 0}>
            {busy ? 'Importing…' : `Import ${validCount} row${validCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Paste-based textarea variant is intentionally not offered: file input keeps formats honest. */
export function useImportState() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
