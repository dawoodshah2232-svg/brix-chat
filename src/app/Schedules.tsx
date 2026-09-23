// Brix Chat — working schedules + holiday calendar (Conversation Operations pack, local demo).
// Per-agent weekly online hours, property-level holidays ("holidays show as offline").

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import {
  DAY_KEYS, DAY_LABELS, agentOnlineNow, defaultAgentSchedule, useScheduleState,
} from '../lib/conversations';
import type { AgentSchedule, DayKey, DayHours, Holiday } from '../lib/conversations';
import { Avatar, Button, EmptyState, Input, Label, PageHeader, SectionCard, useConfirm } from '../components/ui';
import { cx, uid } from '../lib/utils';

function DayCell({ hours, onChange }: { hours: DayHours; onChange: (h: DayHours) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 p-2.5 space-y-1.5">
      <button
        onClick={() => onChange({ ...hours, on: !hours.on })}
        className={cx('w-full text-[11px] font-bold rounded-lg py-1 transition',
          hours.on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}
      >
        {hours.on ? 'ONLINE' : 'OFF'}
      </button>
      {hours.on && (
        <div className="flex items-center gap-1">
          <input type="time" value={hours.start} onChange={(e) => onChange({ ...hours, start: e.target.value })}
            className="w-full text-[11px] border border-slate-200 rounded-lg px-1 py-1 outline-none focus:border-brix-500" />
          <span className="text-slate-300 text-[10px]">–</span>
          <input type="time" value={hours.end} onChange={(e) => onChange({ ...hours, end: e.target.value })}
            className="w-full text-[11px] border border-slate-200 rounded-lg px-1 py-1 outline-none focus:border-brix-500" />
        </div>
      )}
    </div>
  );
}

export default function Schedules() {
  const { data, effectiveWorkspaceId } = useStore();
  const ws = effectiveWorkspaceId();
  const [state, save] = useScheduleState(ws);
  const { confirm, dialog } = useConfirm();
  const [agent, setAgent] = useState('');
  const [hName, setHName] = useState('');
  const [hDate, setHDate] = useState('');

  const schedules = useMemo(() => {
    const existing = new Map(state.schedules.map((s) => [s.agent, s]));
    return data.settings.team.map((t) => existing.get(t.name) ?? defaultAgentSchedule(t.name));
  }, [state.schedules, data.settings.team]);

  const upsert = (agentName: string, days: AgentSchedule['days']) => {
    save((prev) => {
      const found = prev.schedules.some((s) => s.agent === agentName);
      const schedules = found
        ? prev.schedules.map((s) => (s.agent === agentName ? { agent: agentName, days } : s))
        : [...prev.schedules, { agent: agentName, days }];
      return { ...prev, schedules };
    });
  };

  const setDay = (agentName: string, day: DayKey, hours: DayHours) => {
    const s = schedules.find((x) => x.agent === agentName) ?? defaultAgentSchedule(agentName);
    upsert(agentName, { ...s.days, [day]: hours });
  };

  const addHoliday = () => {
    if (!hName.trim() || !hDate) return;
    const h: Holiday = { id: uid('hol'), name: hName.trim(), date: hDate };
    save((prev) => ({ ...prev, holidays: [...prev.holidays, h].sort((a, b) => a.date.localeCompare(b.date)) }));
    setHName(''); setHDate('');
  };

  const now = new Date();

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Working schedules"
        subtitle="Per-agent online hours and property holidays. Local demo — saved in this browser."
      />

      <SectionCard
        title="Agent availability"
        subtitle="Visitors see agents as offline outside these hours."
      >
        {schedules.length === 0 && (
          <EmptyState icon="👥" title="No agents yet" hint="Add teammates in Team first, then set their hours here." />
        )}
        <div className="space-y-4">
          {schedules.map((s) => {
            const online = agentOnlineNow(s, now, state.holidays);
            return (
              <div key={s.agent} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={s.agent} size="sm" />
                  <span className="text-sm font-bold text-slate-900">{s.agent}</span>
                  <span className={cx('text-[11px] font-bold px-2 py-0.5 rounded-full',
                    online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>
                    {online ? '● online now' : '○ offline now'}
                  </span>
                  <button
                    onClick={() => upsert(s.agent, defaultAgentSchedule(s.agent).days)}
                    className="ml-auto text-[11px] font-semibold text-brix-600 hover:text-brix-700"
                  >
                    Reset to 9–5 weekdays
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {DAY_KEYS.map((d) => (
                    <div key={d}>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{DAY_LABELS[d]}</div>
                      <DayCell hours={s.days[d]} onChange={(h) => setDay(s.agent, d, h)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {data.settings.team.length === 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Agent name" className="max-w-xs" />
            <Button size="sm" variant="secondary" onClick={() => {
              if (!agent.trim()) return;
              upsert(agent.trim(), defaultAgentSchedule(agent.trim()).days);
              setAgent('');
            }}>+ Add</Button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="🏖 Holiday calendar"
        subtitle="Property-level. Holidays show as offline for every agent."
        action={<span className="text-[11px] font-semibold text-slate-500">{state.holidays.length} holidays</span>}
      >
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex-1 min-w-40">
            <Label>Holiday name</Label>
            <Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. New Year's Day" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} />
          </div>
          <Button onClick={addHoliday} disabled={!hName.trim() || !hDate}>+ Add holiday</Button>
        </div>
        {state.holidays.length === 0 ? (
          <EmptyState icon="🏖" title="No holidays yet" hint="Add public holidays — every agent shows as offline on these dates." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {state.holidays.map((h) => {
              const d = new Date(h.date + 'T00:00:00');
              const isPast = d.getTime() < new Date().setHours(0, 0, 0, 0);
              return (
                <div key={h.id}
                  className={cx('flex items-center gap-3 rounded-xl border px-4 py-3',
                    isPast ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 bg-white')}>
                  <div className="text-center shrink-0 w-10">
                    <div className="text-[10px] font-bold uppercase text-rose-500">
                      {d.toLocaleDateString(undefined, { month: 'short' })}
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 leading-none">{d.getDate()}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{h.name}</div>
                    <div className="text-[11px] text-slate-500">{d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric' })}</div>
                  </div>
                  <button
                    onClick={() => confirm({
                      title: 'Delete holiday',
                      body: `Remove "${h.name}" from the holiday calendar?`,
                      action: () => save((prev) => ({ ...prev, holidays: prev.holidays.filter((x) => x.id !== h.id) })),
                    })}
                    className="text-slate-500 hover:text-rose-600 text-sm" title="Delete holiday"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {dialog}
    </div>
  );
}
