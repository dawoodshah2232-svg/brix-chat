// Brix Chat — Install: embed snippet per property + JS API quick reference.

import { useEffect, useState } from 'react';
import { Button, Card, Select } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import type { ApiProperty } from '../lib/api';

const JS_API: Array<[string, string]> = [
  ['Open / close', 'BrixChat.open();\nBrixChat.close();\nBrixChat.toggle();'],
  ['Identify a visitor', 'BrixChat.identify({\n  name: "Ayesha Khan",\n  email: "ayesha@example.com"\n});'],
  ['Track an event', 'BrixChat.track("purchase", { value: 99 });'],
  ['Prefill + prompt', 'BrixChat.prefill("I need help with…");\nBrixChat.prompt("pricing-help");'],
];

export default function Install() {
  const { api } = useClientApi();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');

  useEffect(() => {
    if (!api) return;
    api.properties.list().then(({ data }) => {
      setProps(data);
      if (data.length && !propId) setPropId(data[0].id);
    }).catch(() => {});
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const prop = props.find((p) => p.id === propId);
  const snippet = prop
    ? `<!-- Brix Chat — paste before </body> -->\n<script\n  src="https://cdn.brixchat.com/widget.js"\n  data-key="${prop.public_key}"\n  async\n></script>`
    : '';

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error('Copy failed — select the text manually.');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Install</h1>
          <p className="text-sm text-slate-500 mt-1">Embed the chat widget on your website in under a minute.</p>
        </div>
        <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="min-w-48">
          {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-900">1 · Embed snippet</h2>
          <Button size="sm" variant="secondary" onClick={() => copy(snippet, 'Snippet')} disabled={!snippet}>Copy snippet</Button>
        </div>
        <pre className="rounded-xl bg-ink-950 text-slate-100 text-xs font-mono p-4 overflow-x-auto whitespace-pre">{snippet || 'Add a website in Properties first.'}</pre>
        <p className="text-xs text-slate-500 mt-3">
          Paste this before the closing <code className="font-mono">{'</body>'}</code> tag on every page where you want chat.
          The <code className="font-mono">data-key</code> identifies your website — keep it as-is unless you regenerate it in Properties.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-slate-900 mb-1">2 · JavaScript API</h2>
        <p className="text-sm text-slate-500 mb-4">Control the widget from your own code after the snippet loads.</p>
        <div className="grid md:grid-cols-2 gap-4">
          {JS_API.map(([title, code]) => (
            <div key={title} className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-sm font-semibold text-slate-700">{title}</span>
                <button onClick={() => copy(code, 'Code')} className="text-xs font-bold text-brix-700 hover:underline">Copy</button>
              </div>
              <pre className="p-3.5 text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre">{code}</pre>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-slate-900 mb-1">3 · Verify</h2>
        <p className="text-sm text-slate-500">
          Open your site and click the chat bubble — send a test message and it will appear in your{' '}
          <span className="font-semibold text-slate-700">Inbox</span> within seconds. If the bubble does not appear,
          check that the snippet is on the page and the property is enabled in Properties.
        </p>
      </Card>
    </div>
  );
}
