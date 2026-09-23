// Brix Chat — follow-up reminders (Conversation Operations pack, local demo).
// "Remind me in 1h / 4h / tomorrow" → in-app toast when due via the
// existing toast system. Due timestamps persist in localStorage; reminders
// that became due while away fire shortly after the app loads.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReminders } from '../../lib/conversations';
import { toast } from './Toasts';
import { Button, EmptyState, Modal } from '../ui';
import { uid } from '../../lib/utils';

const HOUR = 3600000;

function dueLabel(dueAt: number): string {
  const ms = dueAt - Date.now();
  if (ms <= 0) return 'due now';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `due in ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `due in ${h}h`;
  const d = Math.floor(h / 24);
  return `due in ${d}d`;
}

export function reminderOptions(): Array<{ label: string; ms: number }> {
  return [
    { label: '1h', ms: HOUR },
    { label: '4h', ms: 4 * HOUR },
    { label: 'Tomorrow', ms: 24 * HOUR },
  ];
}

/** Small bell button used in the thread header. */
export function ReminderButton({ workspace, conversationId, visitor }: {
  workspace: string; conversationId: string; visitor: string;
}) {
  const { add } = useReminders(workspace);
  const [open, setOpen] = useState(false);

  const create = (label: string, ms: number) => {
    add({
      id: uid('rem'),
      conversationId,
      visitor,
      dueAt: Date.now() + ms,
      note: label,
    });
    toast.success('Reminder set', `We'll nudge you ${label.toLowerCase()} about ${visitor}.`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Set a follow-up reminder"
        className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-amber-600 transition">
        🔔
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-44 animate-fade-up">
          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Remind me in…</div>
          {reminderOptions().map((o) => (
            <button key={o.label} onClick={() => create(o.label, o.ms)}
              className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 text-sm font-semibold text-slate-700">
              ⏰ {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Watches due reminders with setTimeout and fires toasts. Mount once per workspace. */
export function RemindersWatcher({ workspace }: { workspace: string }) {
  const { reminders, remove } = useReminders(workspace);
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timers: number[] = [];
    for (const r of reminders) {
      if (fired.current.has(r.id)) continue;
      const ms = Math.min(Math.max(0, r.dueAt - Date.now()), 2_147_483_647);
      timers.push(
        window.setTimeout(() => {
          fired.current.add(r.id);
          toast.warning('⏰ Follow-up reminder', `Check back on ${r.visitor} — you asked to be reminded ${r.note.toLowerCase()}.`);
          remove(r.id);
        }, ms),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders.length, workspace]);

  return null;
}

/** Panel listing upcoming reminders; opened from the inbox. */
export function RemindersPanel({ workspace, open, onClose }: {
  workspace: string; open: boolean; onClose: () => void;
}) {
  const { reminders, remove } = useReminders(workspace);
  const navigate = useNavigate();
  const upcoming = [...reminders].sort((a, b) => a.dueAt - b.dueAt);

  return (
    <Modal open={open} onClose={onClose} title={`🔔 Follow-up reminders (${upcoming.length})`}>
      {upcoming.length === 0 ? (
        <EmptyState icon="🔔" title="No reminders yet"
          hint="Open a chat and hit the 🔔 bell to remind yourself in 1h, 4h or tomorrow." />
      ) : (
        <div className="space-y-2.5">
          {upcoming.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{r.visitor}</div>
                <div className="text-xs text-slate-500">{dueLabel(r.dueAt)}</div>
              </div>
              <Button size="sm" variant="secondary"
                onClick={() => { navigate(`/app?c=${r.conversationId}`); onClose(); }}>
                Open chat
              </Button>
              <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-600 text-sm" title="Delete reminder">✕</button>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">
            Reminders fire as in-app toasts in this browser only (local demo).
          </p>
        </div>
      )}
    </Modal>
  );
}
