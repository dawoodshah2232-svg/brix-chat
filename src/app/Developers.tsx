// Brix Chat — Developers: API keys (scopes, show-once, rotate, revoke) and
// webhooks (CRUD, event catalog, secret rotation, delivery log, test-fire).

import { useEffect, useState } from 'react';
import { Button, Card, Input, Label, Modal, Select, Badge, EmptyState, Tabs, useConfirm } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import { useStore } from '../lib/store';
import type { ApiKeyRecord, ApiWebhook, ApiDelivery, ApiProperty } from '../lib/api';
import { samplePayload } from '../lib/api';

import { timeAgo, cx } from '../lib/utils';

const SCOPES = ['chat:read', 'chat:write', 'contacts:read', 'contacts:write', 'tickets:read', 'tickets:write', 'metrics:read', 'webhooks:read', 'webhooks:write'];
const EVENTS = ['chat.started', 'chat.ended', 'message.created', 'conversation.assigned', 'ticket.created', 'ticket.status_changed', 'ticket.sla_breached', 'rating.created', 'campaign.sent', 'goal.completed'];

function ShowOnce({ title, value, hint, onDone }: { title: string; value: string; hint: string; onDone: () => void }) {
  return (
    <Modal open onClose={onDone} title={title}>
      <p className="text-sm text-slate-600">{hint}</p>
      <code className="block mt-3 p-3 rounded-xl bg-ink-950 text-emerald-300 font-mono text-xs break-all">{value}</code>
      <p className="text-xs text-amber-700 font-semibold mt-2">Copy it now — it will not be shown again.</p>
      <div className="flex justify-end mt-4">
        <Button onClick={onDone}>I copied it</Button>
      </div>
    </Modal>
  );
}

export default function Developers() {
  const { api } = useClientApi();
  const { session } = useStore();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<'keys' | 'webhooks'>('keys');
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [hooks, setHooks] = useState<ApiWebhook[]>([]);
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [keyDraft, setKeyDraft] = useState<{ name: string; scopes: string[] } | null>(null);
  const [hookDraft, setHookDraft] = useState<Partial<ApiWebhook> | null>(null);
  const [shown, setShown] = useState<{ title: string; value: string; hint: string } | null>(null);
  const [logFor, setLogFor] = useState<ApiWebhook | null>(null);
  const [deliveries, setDeliveries] = useState<ApiDelivery[]>([]);
  const [testEvent, setTestEvent] = useState('message.created');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!api) return;
    try {
      const [{ data: k }, { data: p }] = await Promise.all([api.apiKeys.list(), api.properties.list()]);
      setKeys(k);
      setProps(p);
      if (p.length && !propId) setPropId(p[0].id);
    } catch { /* ignore */ }
  };
  const refreshHooks = async () => {
    if (!api || !propId) return;
    try {
      const { data } = await api.webhooks.list(propId);
      setHooks(data);
    } catch { /* ignore */ }
  };
  useEffect(() => { refresh(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshHooks(); }, [api, propId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!api || !logFor) return;
    api.deliveries.list(logFor.id).then(({ data }) => setDeliveries(data.items)).catch(() => setDeliveries([]));
  }, [api, logFor]);

  const createKey = async () => {
    if (!api || !keyDraft?.name.trim() || !keyDraft.scopes.length) return;
    setBusy(true);
    try {
      const { data } = await api.apiKeys.create({ name: keyDraft.name.trim(), scopes: keyDraft.scopes });
      setShown({ title: 'API key created', value: data.key, hint: `${data.record.name} — keep this secret.` });
      setKeyDraft(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the key.');
    } finally {
      setBusy(false);
    }
  };

  const rotateKey = (k: ApiKeyRecord) => {
    if (!api) return;
    confirm({
      title: 'Rotate API key?',
      body: `Rotate “${k.name}”? The old key stops working immediately.`,
      action: () => { void doRotateKey(k); },
    });
  };

  const doRotateKey = async (k: ApiKeyRecord) => {
    if (!api) return;
    try {
      const { data } = await api.apiKeys.rotate(k.id);
      setShown({ title: 'Key rotated', value: data.key, hint: `New key for ${k.name}.` });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rotate the key.');
    }
  };

  const revokeKey = (k: ApiKeyRecord) => {
    if (!api) return;
    confirm({
      title: 'Revoke API key?',
      body: `Revoke “${k.name}”? Applications using it will stop working.`,
      action: () => { void doRevokeKey(k); },
    });
  };

  const doRevokeKey = async (k: ApiKeyRecord) => {
    if (!api) return;
    try {
      await api.apiKeys.revoke(k.id);
      toast.success('Key revoked.');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke the key.');
    }
  };

  const saveHook = async () => {
    if (!api || !hookDraft?.url?.trim() || !hookDraft.events?.length) return;
    setBusy(true);
    try {
      if (hookDraft.id) {
        await api.webhooks.update(hookDraft.id, { url: hookDraft.url.trim(), events: hookDraft.events, enabled: hookDraft.enabled ?? true });
        toast.success('Webhook updated.');
      } else {
        const { data } = await api.webhooks.create({ property_id: propId, url: hookDraft.url.trim(), events: hookDraft.events });
        setShown({ title: 'Webhook created', value: data.secret, hint: `Signing secret for ${data.webhook.url} — verify the X-Brix-Signature header with it.` });
        toast.success('Webhook added.');
      }
      setHookDraft(null);
      refreshHooks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the webhook.');
    } finally {
      setBusy(false);
    }
  };

  const rotateSecret = (w: ApiWebhook) => {
    if (!api) return;
    confirm({
      title: 'Rotate signing secret?',
      body: `Rotate the signing secret for ${w.url}? Update your endpoint to verify with the new one.`,
      action: () => { void doRotateSecret(w); },
    });
  };

  const doRotateSecret = async (w: ApiWebhook) => {
    if (!api) return;
    try {
      const { data } = await api.webhooks.rotateSecret(w.id);
      setShown({ title: 'Secret rotated', value: data.secret, hint: `New signing secret for ${w.url}.` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rotate the secret.');
    }
  };

  const removeHook = (w: ApiWebhook) => {
    if (!api) return;
    confirm({
      title: 'Delete webhook?',
      body: `Delete the webhook ${w.url}? You will stop receiving events there.`,
      action: () => { void doRemoveHook(w); },
    });
  };

  const doRemoveHook = async (w: ApiWebhook) => {
    if (!api) return;
    try {
      await api.webhooks.remove(w.id);
      toast.success('Webhook deleted.');
      refreshHooks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the webhook.');
    }
  };

  const testFire = async (w: ApiWebhook) => {
    if (!api) return;
    try {
      const { data } = await api.deliveries.testFire(w.id, testEvent);
      toast.success(`Test ${testEvent} delivered (${data.delivery.http_status ?? 'simulated'}).`);
      if (logFor?.id === w.id) {
        const { data: d } = await api.deliveries.list(w.id);
        setDeliveries(d.items);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test fire failed.');
    }
  };

  const toggleScope = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {dialog}
      {shown && <ShowOnce title={shown.title} value={shown.value} hint={shown.hint} onDone={() => setShown(null)} />}
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Developers</h1>
        <p className="text-sm text-slate-500 mt-1">API keys and webhooks for this workspace. Signed in as {session?.displayName}.</p>
      </div>
      <Tabs tabs={[{ id: 'keys', label: `API keys (${keys.length})` }, { id: 'webhooks', label: `Webhooks (${hooks.length})` }]} active={tab} onChange={setTab} />

      {tab === 'keys' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setKeyDraft({ name: '', scopes: ['chat:read'] })}>+ New API key</Button>
          </div>
          {keys.length === 0 ? (
            <Card><EmptyState icon="🔑" title="No API keys" hint="Create a key to call the Brix Chat API from your backend." /></Card>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <Card key={k.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{k.name}</span>
                        <Badge tone={k.revoked ? 'rose' : 'green'}>{k.revoked ? 'Revoked' : 'Active'}</Badge>
                        <code className="font-mono text-xs text-slate-500">{k.prefix}…</code>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {k.scopes.map((s) => <span key={s} className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-mono text-slate-600">{s}</span>)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5">
                        Used {k.usage_count}× · Last used {k.last_used_at ? timeAgo(new Date(k.last_used_at).getTime()) : 'never'}
                      </div>
                    </div>
                    {!k.revoked && (
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="secondary" onClick={() => rotateKey(k)}>Rotate</Button>
                        <Button size="sm" variant="ghost" onClick={() => revokeKey(k)}>Revoke</Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="min-w-48">
              {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Button onClick={() => setHookDraft({ url: '', events: ['message.created'], enabled: true })} disabled={!propId}>+ New webhook</Button>
          </div>
          {hooks.length === 0 ? (
            <Card><EmptyState icon="🪝" title="No webhooks" hint="Get an HTTP POST every time something happens in chat." /></Card>
          ) : (
            <div className="space-y-3">
              {hooks.map((w) => (
                <Card key={w.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-900 truncate">{w.url}</span>
                        <Badge tone={w.enabled ? 'green' : 'slate'}>{w.enabled ? 'Enabled' : 'Paused'}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {w.events.map((e) => <span key={e} className="px-2 py-0.5 rounded-full bg-indigo-50 text-[11px] font-mono text-indigo-700">{e}</span>)}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap">
                      <Select value={testEvent} onChange={(e) => setTestEvent(e.target.value)} className="text-xs max-w-44">
                        {EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </Select>
                      <Button size="sm" variant="secondary" onClick={() => { void testFire(w); }}>Test fire</Button>
                      <Button size="sm" variant="secondary" onClick={() => setLogFor(w)}>Deliveries</Button>
                      <Button size="sm" variant="secondary" onClick={() => setHookDraft(w)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => rotateSecret(w)}>🔐</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeHook(w)}>🗑</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={!!keyDraft} onClose={() => setKeyDraft(null)} title="New API key">
        <div className="space-y-4">
          <div>
            <Label>Key name</Label>
            <Input value={keyDraft?.name ?? ''} onChange={(e) => setKeyDraft((v) => v && { ...v, name: e.target.value })} placeholder="Backend sync" />
          </div>
          <div>
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {SCOPES.map((s) => (
                <label key={s} className={cx('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-mono cursor-pointer transition', keyDraft?.scopes.includes(s) ? 'border-brix-500 bg-brix-50 text-brix-800' : 'border-slate-200 text-slate-600')}>
                  <input type="checkbox" checked={keyDraft?.scopes.includes(s)} onChange={() => setKeyDraft((v) => v && { ...v, scopes: toggleScope(v.scopes, s) })} className="accent-brix-600" />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setKeyDraft(null)}>Cancel</Button>
            <Button onClick={createKey} disabled={busy || !keyDraft?.name.trim() || !keyDraft?.scopes.length}>{busy ? 'Creating…' : 'Create key'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!hookDraft} onClose={() => setHookDraft(null)} title={hookDraft?.id ? 'Edit webhook' : 'New webhook'}>
        <div className="space-y-4">
          <div>
            <Label>Endpoint URL</Label>
            <Input value={hookDraft?.url ?? ''} onChange={(e) => setHookDraft((v) => v && { ...v, url: e.target.value })} placeholder="https://acme.example/hooks/brix" />
          </div>
          <div>
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-2 mt-1 max-h-56 overflow-y-auto slim-scroll">
              {EVENTS.map((e) => (
                <label key={e} className={cx('flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono cursor-pointer transition', hookDraft?.events?.includes(e) ? 'border-brix-500 bg-brix-50 text-brix-800' : 'border-slate-200 text-slate-600')}>
                  <input type="checkbox" checked={hookDraft?.events?.includes(e)} onChange={() => setHookDraft((v) => v && { ...v, events: toggleScope(v.events ?? [], e) })} className="accent-brix-600" />
                  {e}
                </label>
              ))}
            </div>
          </div>
          {hookDraft?.id && (
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={hookDraft.enabled ?? true} onChange={(e) => setHookDraft((v) => v && { ...v, enabled: e.target.checked })} className="w-4 h-4 accent-brix-600" />
              Enabled
            </label>
          )}
          <div>
            <Label>Sample payload</Label>
            <pre className="mt-1 p-3 rounded-xl bg-slate-100 text-[11px] font-mono text-slate-600 overflow-x-auto max-h-40 overflow-y-auto slim-scroll">{JSON.stringify(samplePayload(testEvent), null, 2)}</pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHookDraft(null)}>Cancel</Button>
            <Button onClick={saveHook} disabled={busy || !hookDraft?.url?.trim() || !hookDraft?.events?.length}>{busy ? 'Saving…' : 'Save webhook'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!logFor} onClose={() => setLogFor(null)} title={`Deliveries — ${logFor?.url}`}>
        <div className="space-y-2 max-h-96 overflow-y-auto slim-scroll">
          {deliveries.length === 0 && <p className="text-sm text-slate-500">No deliveries yet. Use “Test fire” to send one.</p>}
          {deliveries.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <code className="font-mono font-bold text-slate-800">{d.event}</code>
                <Badge tone={d.status === 'delivered' ? 'green' : d.status === 'failed' ? 'rose' : 'amber'}>{d.status}</Badge>
                <span className="text-slate-400">{d.http_status ?? '—'} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}</span>
                <span className="ml-auto text-slate-400">{timeAgo(new Date(d.created_at).getTime())}</span>
              </div>
              {d.note && <div className="text-xs text-slate-500 mt-1">{d.note}</div>}
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="secondary" onClick={() => setLogFor(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
