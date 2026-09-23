import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { Tone } from '../lib/bot';
import { summarizeThread, rewriteTone } from '../lib/bot';
import { suggestReplies, type SuggestionSource } from '../lib/suggest';
import { Badge, Button, Card, EmptyState, Label, Textarea } from '../components/ui';

const TONES: Array<{ id: Tone; label: string; icon: string }> = [
  { id: 'professional', label: 'Professional', icon: '💼' },
  { id: 'friendly', label: 'Friendly', icon: '😊' },
  { id: 'concise', label: 'Concise', icon: '✂️' },
];

const SOURCE_BADGE: Record<SuggestionSource, string> = {
  kb: '📚 Help center',
  canned: '⚡ Canned',
  followup: '💬 Follow-up',
  tone: '🎨 Draft',
};

export default function Copilot({ convId, onInsert }: { convId: string; onInsert: (text: string) => void }) {
  const { getConversation, data } = useStore();
  const [section, setSection] = useState<'replies' | 'summary' | 'tone' | null>('replies');
  const [draft, setDraft] = useState('');
  const [rewritten, setRewritten] = useState('');

  const conv = getConversation(convId);
  const lastVisitorText = useMemo(() => {
    const msgs = conv?.messages.filter((m) => m.from === 'visitor') ?? [];
    return msgs[msgs.length - 1]?.text ?? '';
  }, [conv]);

  const suggestions = useMemo(
    () =>
      conv && lastVisitorText
        ? suggestReplies({
            visitorName: conv.visitor,
            department: conv.department,
            messages: conv.messages,
            canned: data.canned,
            articles: data.articles,
          })
        : [],
    [conv, lastVisitorText, data.canned, data.articles],
  );
  const summary = useMemo(
    () => (conv ? summarizeThread(conv.messages, conv.visitor) : ''),
    [conv],
  );

  if (!conv) return <EmptyState icon="✨" title="No conversation" />;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <div className="font-display font-bold text-slate-900">AI Copilot</div>
          <Badge tone="cyan" className="ml-auto">simulated</Badge>
        </div>
        <p className="text-xs text-slate-500 mt-1">Draft help powered by on-device simulation — click any draft to insert it into your reply.</p>
      </div>

      <div className="flex-1 overflow-y-auto slim-scroll p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'replies', label: '💡 Replies' },
            { id: 'summary', label: '📝 Summary' },
            { id: 'tone', label: '🎨 Tone' },
          ] as const).map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(section === s.id ? null : s.id)}
              className={section === s.id
                ? 'px-2 py-2 rounded-xl text-xs font-bold bg-brix-600 text-white shadow-md shadow-brix-600/25'
                : 'px-2 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200'}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === 'replies' && (
          <div className="space-y-2 animate-fade-up">
            {suggestions.length === 0 && <div className="text-xs text-slate-500">No visitor message yet to reply to.</div>}
            {suggestions.map((sg) => (
              <Card key={sg.id} className="p-3 cursor-pointer hover:border-brix-300 hover:shadow-md transition group" >
                <div onClick={() => onInsert(sg.text)}>
                  <div className="text-[11px] font-bold text-slate-500 mb-1">{SOURCE_BADGE[sg.source]} · {sg.label}</div>
                  <div className="text-[13px] text-slate-800 leading-relaxed">{sg.text}</div>
                  <div className="text-[11px] font-bold text-brix-600 mt-1.5 opacity-0 group-hover:opacity-100 transition">Click to insert →</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {section === 'summary' && (
          <Card className="p-4 animate-fade-up">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Thread summary</div>
            <pre className="text-[13px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{summary}</pre>
          </Card>
        )}

        {section === 'tone' && (
          <div className="space-y-2.5 animate-fade-up">
            <div>
              <Label>Your draft</Label>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Paste or type a reply to rewrite…" />
            </div>
            <div className="flex gap-2">
              {TONES.map((t) => (
                <Button key={t.id} size="sm" variant="secondary" disabled={!draft.trim()}
                  onClick={() => setRewritten(rewriteTone(draft, t.id, conv.visitor))}>
                  {t.icon} {t.label}
                </Button>
              ))}
            </div>
            {rewritten && (
              <Card className="p-3 bg-violet-50 border-violet-200">
                <div className="text-[13px] text-slate-800 leading-relaxed">{rewritten}</div>
                <Button size="sm" className="mt-2 w-full" onClick={() => onInsert(rewritten)}>Insert into reply</Button>
              </Card>
            )}
          </div>
        )}

        {!section && (
          <EmptyState icon="✨" title="Pick a copilot tool" hint="Suggested replies, thread summaries, or tone rewrites." />
        )}
      </div>
    </div>
  );
}
