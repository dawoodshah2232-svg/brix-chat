// Brix Chat — chat queue bar (Conversation Operations pack, local queue tools).
// Shows waiting visitors with position numbers, estimated wait and
// department, plus an agent capacity control ("max concurrent chats per agent").

import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useQueue, estimatedWaitMins } from '../../lib/conversations';
import { Avatar, Badge, Button, Input, Label, Select } from '../ui';
import { cx, timeAgo, uid } from '../../lib/utils';

export default function QueueBar() {
  const { data, effectiveWorkspaceId } = useStore();
  const ws = effectiveWorkspaceId();
  const openChats = data.conversations.filter((c) => c.status === 'open').length;
  const { cfg, atCapacity, setMax, pushWaiting, dropWaiting } = useQueue(ws, openChats);
  const [visitorName, setVisitorName] = useState('');
  const [visitorDept, setVisitorDept] = useState(data.settings.departments[0] ?? 'Sales');
  const [showSettings, setShowSettings] = useState(false);

  const wait = estimatedWaitMins(cfg.waiting, cfg.maxConcurrent);

  const addTestVisitor = () => {
    const name = visitorName.trim() || 'Test visitor';
    pushWaiting({ id: uid('queue'), name, department: visitorDept, waitingSince: Date.now() });
    setVisitorName('');
  };

  return (
    <div className="shrink-0 border-b border-slate-200/80 bg-white">
      <div className="px-4 py-2.5 flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          ⏳ Queue
        </span>
        {cfg.waiting.length > 0 ? (
          <Badge tone="amber">{cfg.waiting.length} waiting</Badge>
        ) : (
          <span className="text-xs text-slate-500">no one waiting</span>
        )}
        <span className="text-xs text-slate-500">
          est. wait <strong className="text-slate-800">~{wait} min</strong>
        </span>
        <span className={cx('text-xs font-semibold', atCapacity ? 'text-rose-600' : 'text-emerald-600')}>
          {atCapacity ? '⚠ At capacity' : `✓ ${cfg.maxConcurrent - openChats} slots free`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5">
            <Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="Add test visitor…"
              className="py-1 text-xs w-32" onKeyDown={(e) => { if (e.key === 'Enter') addTestVisitor(); }} />
            <Select value={visitorDept} onChange={(e) => setVisitorDept(e.target.value)} className="py-1 text-xs max-w-24">
              {data.settings.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Button size="sm" variant="secondary" onClick={addTestVisitor}>+ Queue</Button>
          </div>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="text-xs font-semibold text-brix-600 hover:text-brix-700"
            aria-label="Queue capacity settings"
          >
            ⚙ Capacity: {cfg.maxConcurrent}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="px-4 pb-3 flex items-center gap-3 border-t border-slate-100 pt-3">
          <div className="flex-1 max-w-xs">
            <Label>Max concurrent chats per agent</Label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={1} max={25} value={cfg.maxConcurrent}
                onChange={(e) => setMax(Number(e.target.value))}
                className="flex-1 accent-brix-600"
                aria-label="Max concurrent chats per agent"
              />
              <Input type="number" min={1} max={25} value={cfg.maxConcurrent}
                onChange={(e) => setMax(Number(e.target.value) || 1)} className="w-16 py-1 text-sm" />
            </div>
          </div>
          <p className="text-xs text-slate-500 max-w-sm">
            When open chats reach this number, the bar shows an honest <strong>at capacity</strong> state and new visitors wait in line. Saved in this browser.
          </p>
        </div>
      )}

      {cfg.waiting.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 flex gap-2.5 overflow-x-auto slim-scroll">
          {cfg.waiting.map((w, i) => (
            <div key={w.id}
              className="shrink-0 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="w-6 h-6 grid place-items-center rounded-full bg-brix-600 text-white text-[11px] font-extrabold">
                {i + 1}
              </span>
              <Avatar name={w.name} size="sm" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate max-w-28">{w.name}</div>
                <div className="text-[11px] text-slate-500">{w.department} · waiting {timeAgo(w.waitingSince)}</div>
              </div>
              <button onClick={() => dropWaiting(w.id)} title="Remove from queue"
                className="text-slate-500 hover:text-slate-700 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}

      {cfg.waiting.length === 0 && atCapacity && (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2.5">
          <span className="text-xs text-rose-700 font-medium">
            At capacity ({openChats}/{cfg.maxConcurrent} open chats) — no one is queued right now. New visitors will join the line automatically.
          </span>
        </div>
      )}
    </div>
  );
}