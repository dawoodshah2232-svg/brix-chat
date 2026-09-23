// Brix Chat — transcript PDF export (Conversation Operations pack, local demo).
// Opens a print-optimized transcript in a new window and calls
// window.print() — the user picks "Save as PDF" in their browser's dialog.

import type { Conversation } from '../../lib/types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bubbleBg(from: string): string {
  if (from === 'agent') return '#4f46e5';
  if (from === 'ai') return '#7c3aed';
  if (from === 'system') return '#e2e8f0';
  return '#ffffff';
}

function bubbleText(from: string): string {
  return from === 'agent' || from === 'ai' ? '#ffffff' : '#0f172a';
}

export default function TranscriptExport({ conv }: { conv: Conversation }) {
  const openPrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;
    const rows = conv.messages
      .map((m) => {
        const t = new Date(m.ts).toLocaleString();
        const who = m.from === 'visitor' ? conv.visitor : m.from === 'agent' ? (m.name ?? 'Agent') : m.from === 'ai' ? 'Brix AI' : 'System';
        const body = m.kind === 'file'
          ? `📎 ${esc(m.fileName ?? 'Attachment')} ${esc(m.fileSize ?? '')}`
          : m.kind === 'voice' ? `🎙 Voice message (${m.durationSec ?? 0}s)`
          : m.kind === 'rating' ? `⭐ Rated ${m.rating}/5`
          : esc(m.text);
        if (m.from === 'system') {
          return `<div style="text-align:center;margin:8px 0"><span style="display:inline-block;background:#e2e8f0;border-radius:999px;padding:4px 14px;font-size:11px;color:#475569">${body}</span></div>`;
        }
        const align = m.from === 'visitor' ? 'left' : 'right';
        return `<div style="text-align:${align};margin:6px 0">
          <div style="display:inline-block;max-width:70%;background:${bubbleBg(m.from)};color:${bubbleText(m.from)};border:${m.from === 'visitor' ? '1px solid #e2e8f0' : 'none'};border-radius:14px;padding:8px 14px;font-size:13px;text-align:left">
            <div style="font-size:10px;opacity:0.7;margin-bottom:2px">${esc(who)} · ${esc(t)}</div>
            <div style="white-space:pre-wrap">${body || '<i>(no text)</i>'}</div>
          </div>
        </div>`;
      })
      .join('\n');

    const tagList = conv.tags.length ? ` · Tags: ${conv.tags.map(esc).join(', ')}` : '';
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Chat transcript — ${esc(conv.visitor)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color:#0f172a; margin:0; }
  .brand { background:#4f46e5; color:#fff; padding:22px 32px; }
  .brand h1 { margin:0; font-size:20px; }
  .brand p { margin:4px 0 0; font-size:12px; opacity:0.85; }
  .meta { padding:14px 32px; font-size:12px; color:#475569; border-bottom:1px solid #e2e8f0; }
  .msgs { padding:20px 32px 60px; }
  @media print { .noprint { display:none; } }
</style></head>
<body>
  <div class="brand">
    <h1>Brix Chat — Conversation transcript</h1>
    <p>Exported ${esc(new Date().toLocaleString())}</p>
  </div>
  <div class="meta">
    Visitor: <strong>${esc(conv.visitor)}</strong> · ${esc(conv.city)}, ${esc(conv.country)} ·
    ${esc(conv.department)}${tagList}${conv.rating ? ` · CSAT ${conv.rating}/5` : ''}<br>
    Started ${esc(new Date(conv.createdAt).toLocaleString())} · ${conv.messages.length} messages
  </div>
  <div class="msgs">${rows}</div>
  <div class="noprint" style="position:fixed;bottom:20px;right:20px">
    <button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer">🖨 Print / save as PDF</button>
  </div>
  <script>setTimeout(function(){window.print()},600);</scr` + `ipt>
</body></html>`);
    win.document.close();
  };

  return (
    <button
      onClick={openPrint}
      title="Export transcript — save as PDF via your browser's print dialog"
      className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brix-600 transition text-sm"
      aria-label="Export transcript as PDF"
    >
      🖨
    </button>
  );
}
