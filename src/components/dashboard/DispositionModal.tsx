// Brix Chat — wrap-up disposition modal (Conversation Operations pack, local demo).
// A disposition code is required when resolving a conversation.

import { useState } from 'react';
import { DISPOSITION_CODES, saveDisposition } from '../../lib/conversations';
import type { Disposition, DispositionCode } from '../../lib/conversations';
import { Button, Label, Modal, Textarea } from '../ui';
import { cx } from '../../lib/utils';

interface Props {
  open: boolean;
  workspace: string;
  conversationId: string;
  visitor: string;
  agentName: string;
  onDone: (d: Disposition) => void;
  onClose: () => void;
}

export default function DispositionModal({ open, workspace, conversationId, visitor, agentName, onDone, onClose }: Props) {
  const [code, setCode] = useState<DispositionCode>('Resolved');
  const [note, setNote] = useState('');

  const submit = () => {
    const d: Disposition = { code, note: note.trim(), by: agentName, at: Date.now() };
    saveDisposition(workspace, conversationId, d);
    onDone(d);
  };

  return (
    <Modal open={open} onClose={onClose} title="Close conversation">
      <p className="text-sm text-slate-600 mb-4">
        Wrap up the chat with <strong>{visitor}</strong> — pick a disposition code so the team can report on outcomes.
      </p>
      <Label>Disposition code (required)</Label>
      <div className="flex flex-wrap gap-2 mb-4">
        {DISPOSITION_CODES.map((c) => (
          <button key={c} onClick={() => setCode(c)}
            className={cx(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
              code === c ? 'bg-brix-600 text-white border-brix-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
            )}>
            {c}
          </button>
        ))}
      </div>
      <Label>Wrap-up note (optional)</Label>
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="One line for the record — e.g. “sent refund receipt by email”" />
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>Keep open</Button>
        <Button onClick={submit}>✓ Resolve with “{code}”</Button>
      </div>
    </Modal>
  );
}
