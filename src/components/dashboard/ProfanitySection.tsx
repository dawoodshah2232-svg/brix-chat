// Brix Chat — profanity filter settings section (Conversation Operations pack).
// Appended as a new section inside Settings; local demo state.

import { useState } from 'react';
import { useStore } from '../../lib/store';
import { getProfanityConfig, saveProfanityConfig } from '../../lib/conversations';
import { Card, Input, Label, Toggle } from '../ui';

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-base font-display font-bold text-slate-900">{children}</h2>;
}

export default function ProfanitySection() {
  const { effectiveWorkspaceId } = useStore();
  const ws = effectiveWorkspaceId();
  const [cfg, setCfg] = useState(() => getProfanityConfig(ws));

  const update = (next: { enabled: boolean; words: string[] }) => {
    saveProfanityConfig(ws, next);
    setCfg(next);
  };

  return (
    <Card className="p-6">
      <SectionTitle>Profanity filter</SectionTitle>
      <div className="divide-y divide-slate-100 mt-2">
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Filter profanity in visitor messages</div>
            <div className="text-xs text-slate-500">
              When on, matched words are masked with • in the chat thread. Only affects this browser (local demo).
            </div>
          </div>
          <Toggle checked={cfg.enabled} onChange={(v) => update({ ...cfg, enabled: v })} label="Profanity filter" />
        </div>
        <div className="py-3">
          <Label>Word list</Label>
          <p className="text-xs text-slate-500 mb-2">
            Comma-separated. Matching is case-insensitive. Keep it professional — this is a workplace tool.
          </p>
          <Input
            value={cfg.words.join(', ')}
            onChange={(e) => update({ ...cfg, words: e.target.value.split(',').map((w) => w.trim()).filter(Boolean) })}
            placeholder="damn, hell, …"
          />
        </div>
      </div>
    </Card>
  );
}
