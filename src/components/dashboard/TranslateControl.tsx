// Brix Chat — real-time translation toggle UI (Conversation Operations pack, local demo).
// No provider is configured yet, so this shows an honest notice and a
// "demo mode" that marks messages "translated (demo)".

import { useState } from 'react';
import { useStore } from '../../lib/store';
import { TRANSLATE_LANGUAGES, useTranslateState } from '../../lib/conversations';
import { Badge, Button } from '../ui';
import { maskProfanity } from '../../lib/conversations';

export function TranslateControl() {
  const { effectiveWorkspaceId } = useStore();
  const ws = effectiveWorkspaceId();
  const [state, save] = useTranslateState(ws);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Translation (local demo)"
        className={`w-8 h-8 grid place-items-center rounded-lg transition text-sm ${
          state.enabled ? 'bg-brix-100 text-brix-700' : 'text-slate-500 hover:bg-slate-100 hover:text-brix-600'
        }`}
        aria-label="Toggle translation"
      >
        🌐
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 animate-fade-up">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-900">Translate messages</span>
            <Button size="sm" variant={state.enabled ? 'secondary' : 'primary'}
              onClick={() => save({ ...state, enabled: !state.enabled })}>
              {state.enabled ? 'Turn off' : 'Try demo'}
            </Button>
          </div>
          <select
            value={state.language}
            onChange={(e) => save({ ...state, language: e.target.value })}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none mb-3"
          >
            {TRANSLATE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <strong>Local demo:</strong> no translation provider is connected. Connect an AI provider in <strong>Developers</strong> to enable live translation.
          </div>
        </div>
      )}
    </div>
  );
}

/** Render one chat message's text with demo translation + profanity masking applied. */
export function TranslatedText({ text }: { text: string }) {
  const { effectiveWorkspaceId } = useStore();
  const ws = effectiveWorkspaceId();
  const [state] = useTranslateState(ws);
  if (!state.enabled || !text.trim()) return <>{maskProfanity(text, ws)}</>;
  const lang = TRANSLATE_LANGUAGES.find((l) => l.code === state.language)?.label ?? 'Spanish';
  return (
    <span>
      <span className="block">{maskProfanity(text, ws)}</span>
      <Badge tone="indigo" className="mt-1.5">🌐 translated to {lang} (demo)</Badge>
    </span>
  );
}
