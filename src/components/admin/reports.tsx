// Brix Chat — scheduled reports (admin).
// Local mode: schedules and run history are stored in this browser.
// Email delivery is honestly labeled BACKEND-PHASE — nothing is actually sent.

import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select } from '../ui';
import { useConfirm } from '../ui';
import { cx } from '../../lib/utils';
import { exportCSV } from './importExport';
import { useToast } from './toast';

export interface ReportSchedule {
  id: string;
  name: string;
  kind: 'overview' | 'ratings' | 'tickets' | 'audit';
  frequency: 'daily' | 'weekly';
  recipients: string[]; // email addresses — used only when backend delivery lands
  created_at: string;
  last_run_at: string | null;
}

export interface ReportRun {
  id: string;
  schedule_id: string;
  schedule_name: string;
  ran_at: string;
  status: 'scheduled' | 'delivered';
  note: string;
}

const LS_KEY = (workspace: string) => `brix.admin.reportSchedules.${workspace}`;
const LS_RUNS = (workspace: string) => `brix.admin.reportRuns.${workspace}`;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const KIND_LABELS: Record<ReportSchedule['kind'], string> = {
  overview: 'Workspace overview',
  ratings: 'Ratings (CSAT/NPS)',
  tickets: 'Tickets',
  audit: 'Audit log',
};

export function ScheduledReportsPanel({ workspace }: { workspace: string }) {
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ReportSchedule['kind']>('overview');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('weekly');
  const [recipients, setRecipients] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setSchedules(loadJSON(LS_KEY(workspace), []));
    setRuns(loadJSON(LS_RUNS(workspace), []));
  }, [workspace]);

  const persist = (s: ReportSchedule[], r: ReportRun[]) => {
    setSchedules(s);
    setRuns(r);
    try {
      localStorage.setItem(LS_KEY(workspace), JSON.stringify(s));
      localStorage.setItem(LS_RUNS(workspace), JSON.stringify(r));
    } catch { /* ignore */ }
  };

  const validEmails = (list: string): string[] =>
    list.split(/[,\n;]/).map((e) => e.trim()).filter(Boolean);

  const create = () => {
    setFormError('');
    if (!name.trim()) { setFormError('Give the schedule a name.'); return; }
    const emails = validEmails(recipients);
    const bad = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad.length > 0) { setFormError(`Not a valid email: ${bad[0]}`); return; }
    const s: ReportSchedule = {
      id: `rep_${Date.now().toString(36)}`,
      name: name.trim(), kind, frequency, recipients: emails,
      created_at: new Date().toISOString(), last_run_at: null,
    };
    persist([...schedules, s], runs);
    setCreating(false);
    setName(''); setRecipients('');
    toast(`Report schedule "${s.name}" created`);
  };

  const remove = (s: ReportSchedule) => {
    confirm({
      title: 'Delete schedule?',
      body: `"${s.name}" will stop being logged. Past run entries are kept.`,
      action: () => {
        persist(schedules.filter((x) => x.id !== s.id), runs);
        toast('Schedule deleted');
      },
    });
  };

  /** Local "run": records a run entry honestly labeled as scheduled (no email sent). */
  const runNow = (s: ReportSchedule) => {
    const run: ReportRun = {
      id: `run_${Date.now().toString(36)}`,
      schedule_id: s.id,
      schedule_name: s.name,
      ran_at: new Date().toISOString(),
      status: 'scheduled',
      note: s.recipients.length > 0
        ? `Would email ${s.recipients.join(', ')} — queued for the backend phase.`
        : 'No recipients configured — report would be generated locally.',
    };
    persist(
      schedules.map((x) => (x.id === s.id ? { ...x, last_run_at: run.ran_at } : x)),
      [run, ...runs].slice(0, 100),
    );
    toast(`"${s.name}" logged as a scheduled run`);
  };

  const exportRuns = () => {
    exportCSV(
      `brix-report-runs-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ran_at', 'schedule_name', 'status', 'note'],
      runs.map((r) => ({ ran_at: r.ran_at, schedule_name: r.schedule_name, status: r.status, note: r.note })),
    );
    toast('Run history exported as CSV');
  };

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-bold text-xl">Scheduled reports</h2>
        <Badge tone="amber">BACKEND-PHASE · email delivery not real yet</Badge>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Configure daily/weekly report schedules. Runs are logged locally and honestly — actual email delivery activates with the backend phase.
      </p>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 mb-6 flex gap-3 items-start">
        <span className="text-lg">📬</span>
        <p className="text-[13px] leading-relaxed text-amber-900">
          <strong>Local mode honesty.</strong> Nothing is emailed from this browser. Schedules and their run history are stored locally;
          when the backend phase lands, recipients configured below will start receiving these reports automatically.
        </p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-900">Schedules <span className="text-xs font-semibold text-slate-400">({schedules.length})</span></h3>
        <Button size="sm" onClick={() => setCreating(true)}>+ New schedule</Button>
      </div>

      {schedules.length === 0 ? (
        <EmptyState icon="📊" title="No report schedules yet" hint="Create one to get a daily or weekly summary." />
      ) : (
        <div className="space-y-3 mb-8">
          {schedules.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{s.name}</span>
                    <Badge tone="indigo">{KIND_LABELS[s.kind]}</Badge>
                    <Badge tone={s.frequency === 'daily' ? 'cyan' : 'slate'}>{s.frequency}</Badge>
                    <Badge tone="amber">BACKEND-PHASE</Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {s.recipients.length > 0 ? `To: ${s.recipients.join(', ')}` : 'No recipients yet'} ·{' '}
                    {s.last_run_at ? `Last run ${new Date(s.last_run_at).toLocaleString()}` : 'Never run'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => runNow(s)}>Run now</Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(s)} className="text-rose-600">Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-900">Run log <span className="text-xs font-semibold text-slate-400">({runs.length})</span></h3>
        {runs.length > 0 && <Button variant="ghost" size="sm" onClick={exportRuns}>Export CSV</Button>}
      </div>
      {runs.length === 0 ? (
        <EmptyState icon="🧾" title="No runs yet" hint="Use “Run now” on a schedule to log a run." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Ran at</th>
                <th className="px-4 py-2.5 font-semibold">Schedule</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 30).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(r.ran_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-semibold">{r.schedule_name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={r.status === 'delivered' ? 'green' : 'amber'}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={creating} onClose={() => { setCreating(false); setFormError(''); }} title="New report schedule">
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monday ratings digest" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Report</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as ReportSchedule['kind'])}>
                {(Object.keys(KIND_LABELS) as Array<ReportSchedule['kind']>).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Recipients (comma separated)</Label>
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="ops@company.com, support@company.com" />
            <p className="text-[11px] text-slate-400 mt-1.5">Stored with the schedule. Emails go out only after the backend phase — for now they're just listed in the run log.</p>
          </div>
          {formError && <p className="text-sm text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setCreating(false); setFormError(''); }}>Cancel</Button>
            <Button onClick={create}>Create schedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
