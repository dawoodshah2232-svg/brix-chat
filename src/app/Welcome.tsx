// Brix Chat — first-run onboarding wizard (/app/welcome).
// 4 steps: brand → team → install snippet → test chat. Skippable at any
// point; completion sets localStorage 'brixchat_onboarded_<workspaceId>'.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { copyText } from '../lib/utils';
import { Button, Card, Input, Label, Select } from '../components/ui';
import { cx } from '../lib/utils';

const BRAND_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const STEPS = ['Brand', 'Team', 'Install', 'Test'] as const;

function onboardKey(ws: string): string {
  return `brixchat_onboarded_${ws}`;
}

function markOnboarded(ws: string): void {
  try {
    localStorage.setItem(onboardKey(ws), '1');
  } catch {
    /* ignore */
  }
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={cx(
            'h-1.5 rounded-full flex-1 transition-all',
            i < step ? 'bg-brix-600' : i === step ? 'bg-brix-400' : 'bg-slate-200',
          )}
        />
      ))}
    </div>
  );
}

export default function Welcome() {
  const { session, effectiveWorkspaceId } = useStore();
  const navigate = useNavigate();
  const ws = effectiveWorkspaceId();
  const [step, setStep] = useState(0);

  // Step 1 — brand
  const [wsName, setWsName] = useState(ws);
  const [brandColor, setBrandColor] = useState('#4f46e5');
  const [tagline, setTagline] = useState('We reply in minutes, not days.');

  // Step 2 — team
  const [team, setTeam] = useState<Array<{ name: string; role: string }>>([]);
  const [tName, setTName] = useState('');
  const [tRole, setTRole] = useState('Agent');

  // Step 3 — install
  const [copied, setCopied] = useState(false);
  const embed = `<script>\n  window.Brix_API = window.Brix_API || {};\n</script>\n<script async src="${typeof window !== 'undefined' ? window.location.origin : ''}${import.meta.env.BASE_URL}widget.js" data-property="${ws}"></script>`;

  // Step 4 — test checklist
  const [sentMsg, setSentMsg] = useState(false);
  const [replied, setReplied] = useState(false);

  const finish = () => {
    try {
      localStorage.setItem(
        `brixchat_welcome_${ws}`,
        JSON.stringify({ wsName, brandColor, tagline, team }),
      );
    } catch {
      /* ignore */
    }
    markOnboarded(ws);
    navigate('/app', { replace: true });
  };
  const skip = () => {
    markOnboarded(ws);
    navigate('/app', { replace: true });
  };

  const copySnippet = async () => {
    await copyText(embed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canNext = step === 3 ? sentMsg && replied : true;

  return (
    <div className="min-h-full grid place-items-center p-4 sm:p-8 bg-slate-50">
      <Card className="w-full max-w-2xl p-6 sm:p-8 skeleton-fade">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-brix-600 mb-1">
              Welcome{session?.displayName ? `, ${session.displayName}` : ''}
            </div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">
              Set up {wsName || 'your workspace'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={skip} className="shrink-0 text-slate-500">
            Skip tour →
          </Button>
        </div>

        <StepDots step={step} />

        <div className="mt-6 min-h-[280px]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Workspace name</Label>
                <Input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Acme Support" />
              </div>
              <div>
                <Label>Brand color</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBrandColor(c)}
                      aria-label={`Brand color ${c}`}
                      aria-pressed={brandColor === c}
                      className={cx(
                        'w-9 h-9 rounded-full border-2 transition',
                        brandColor === c ? 'border-ink-950 scale-110' : 'border-transparent hover:scale-105',
                      )}
                      style={{ background: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-9 h-9 rounded-full cursor-pointer border border-slate-200 p-0.5"
                    title="Custom color"
                    aria-label="Custom brand color"
                  />
                </div>
              </div>
              <div>
                <Label>Widget tagline</Label>
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="We reply in minutes, not days." />
              </div>
              <p className="text-xs text-slate-500">
                These seed your widget's first-run look — fine-tune everything later under Branding.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                {team.length === 0 && (
                  <p className="text-sm text-slate-500">No teammates added yet — you can do this later from Settings → Team.</p>
                )}
                {team.map((m, i) => (
                  <div key={`${m.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5">
                    <span className="text-sm font-semibold text-slate-900">{m.name}</span>
                    <span className="text-xs text-slate-500">{m.role}</span>
                    <button
                      type="button"
                      onClick={() => setTeam(team.filter((_, j) => j !== i))}
                      aria-label={`Remove ${m.name}`}
                      className="ml-auto w-7 h-7 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-rose-600 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Teammate name…" onKeyDown={(e) => e.key === 'Enter' && tName.trim() && setTeam([...team, { name: tName.trim(), role: tRole }])} />
                <Select value={tRole} onChange={(e) => setTRole(e.target.value)} className="w-28 shrink-0">
                  <option>Agent</option>
                  <option>Admin</option>
                </Select>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!tName.trim()) return;
                    setTeam([...team, { name: tName.trim(), role: tRole }]);
                    setTName('');
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
                <span className="font-semibold">Honest note:</span> invites send by email once an email provider is
                connected. For now, team members join with the workspace passcode from Settings → Team.
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Paste this snippet before the closing <code className="font-mono text-xs bg-slate-100 px-1 rounded">&lt;/body&gt;</code> tag
                on your site. It loads the widget for property key <code className="font-mono text-xs bg-slate-100 px-1 rounded">{ws}</code>.
              </p>
              <pre className="rounded-2xl bg-ink-950 text-slate-200 text-xs p-4 overflow-x-auto slim-scroll whitespace-pre-wrap break-all">
                {embed}
              </pre>
              <Button variant="secondary" onClick={copySnippet}>{copied ? '✓ Copied' : 'Copy snippet'}</Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Prove it works end to end — tick both boxes when done.</p>
              <a
                href={`${import.meta.env.BASE_URL}widget`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 hover:border-brix-300 hover:shadow-md transition"
              >
                <span>
                  <span className="block text-sm font-bold text-slate-900">1 · Open the widget demo</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Opens in a new tab — send a message as a visitor.</span>
                </span>
                <span className="text-brix-600 font-bold text-sm shrink-0">Open ↗</span>
              </a>
              {[
                { v: sentMsg, set: setSentMsg, label: '2 · Send a message as a visitor', hint: 'Type anything in the demo widget and hit send.' },
                { v: replied, set: setReplied, label: '3 · Reply as an agent', hint: 'Find the chat in the Inbox and answer it.' },
              ].map((c) => (
                <label key={c.label} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brix-300 transition">
                  <input
                    type="checkbox"
                    checked={c.v}
                    onChange={(e) => c.set(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded accent-brix-600 shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-900">{c.label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="text-slate-500">
            ← Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next →
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canNext}>
              Finish setup ✓
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
