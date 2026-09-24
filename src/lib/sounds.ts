// Brix Chat — notification sounds (WebAudio, no audio assets) + per-agent
// notification preferences persisted in localStorage ('brixchat_notify_v1').
//
// UX ELEVATION pack: three generated tones (Chime, Pop, Subtle), volume
// control, and a helper that fires the full incoming-message fan-out
// (toast + tone + desktop Notification) honoring the agent's prefs.

import { toast } from '../components/dashboard/Toasts';

export type ToneId = 'chime' | 'pop' | 'subtle';

export const TONES: Array<{ id: ToneId; label: string; hint: string }> = [
  { id: 'chime', label: 'Chime', hint: 'Bright two-note chime' },
  { id: 'pop', label: 'Pop', hint: 'Short playful pop' },
  { id: 'subtle', label: 'Subtle', hint: 'Quiet soft ping' },
];

export type NotifyEvent = 'newMessage' | 'assigned' | 'mention';

export interface NotifyPrefs {
  sound: boolean;
  tone: ToneId;
  volume: number; // 0..1
  desktop: boolean;
  events: Record<NotifyEvent, boolean>;
}

const KEY = 'brixchat_notify_v1';

export function defaultNotifyPrefs(): NotifyPrefs {
  return {
    sound: true,
    tone: 'chime',
    volume: 0.7,
    desktop: false,
    events: { newMessage: true, assigned: true, mention: true },
  };
}

/** Preferences are stored per agent: { [agentName]: NotifyPrefs }. */
export function loadNotifyPrefs(agent: string): NotifyPrefs {
  const d = defaultNotifyPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const all = JSON.parse(raw) as Record<string, Partial<NotifyPrefs>>;
    const p = all?.[agent];
    if (!p) return d;
    return {
      sound: p.sound ?? d.sound,
      tone: p.tone ?? d.tone,
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : d.volume,
      desktop: p.desktop ?? d.desktop,
      events: { ...d.events, ...(p.events ?? {}) },
    };
  } catch {
    return d;
  }
}

export function saveNotifyPrefs(agent: string, prefs: NotifyPrefs): void {
  try {
    const raw = localStorage.getItem(KEY);
    const all: Record<string, NotifyPrefs> = raw ? (JSON.parse(raw) as Record<string, NotifyPrefs>) : {};
    all[agent] = prefs;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — prefs stay in memory for this session */
  }
}

// ---------- WebAudio tone generation ----------

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    if (ctx && ctx.state !== 'closed') return ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

function note(
  ac: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType,
  peak: number,
) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Play a generated notification tone. Fire-and-forget; never throws. */
export function playTone(tone: ToneId, volume = 0.7): void {
  try {
    const ac = audioCtx();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    const t = ac.currentTime + 0.02;
    const v = Math.min(1, Math.max(0, volume)) * 0.5; // keep it polite
    if (tone === 'chime') {
      note(ac, 659.25, t, 0.35, 'sine', v);
      note(ac, 987.77, t + 0.12, 0.5, 'sine', v * 0.9);
    } else if (tone === 'pop') {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.2);
    } else {
      note(ac, 440, t, 0.28, 'sine', v * 0.55);
    }
  } catch {
    /* audio unavailable */
  }
}

// ---------- desktop notifications ----------

export function desktopPermission(): NotificationPermission {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

/** Ask the browser for Notification permission. Returns the resulting state. */
export async function requestDesktopPermission(): Promise<NotificationPermission> {
  try {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission;
  } catch {
    return 'denied';
  }
}

/** Focuses the dashboard tab/window and opens the relevant conversation.
 *  Cross-tab selection is not possible from a Notification click — the most
 *  the platform allows is focusing this window and navigating inside it. */
function focusConversation(convId?: string, fallbackLink = '/app'): void {
  try {
    window.focus();
    if (convId) {
      window.dispatchEvent(new CustomEvent('brix:focus-conversation', { detail: { convId } }));
    } else {
      window.location.href = fallbackLink;
    }
  } catch {
    /* ignore */
  }
}

/** Message ids already raised as desktop notifications this session (dedupe). */
const firedNotificationIds = new Set<string>();

/** Clear the session dedupe set (tests / sign-out). */
export function resetNotificationDedupe(): void {
  firedNotificationIds.clear();
}

/** Tab/window is not the thing the agent is looking at right now. */
function isBackgrounded(): boolean {
  try {
    return document.hidden || !document.hasFocus();
  } catch {
    return true;
  }
}

function showDesktop(
  title: string,
  body: string,
  opts: { link?: string; tag?: string; convId?: string } = {},
): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (opts.tag) {
      if (firedNotificationIds.has(opts.tag)) return; // already raised — no duplicate
      firedNotificationIds.add(opts.tag);
    }
    const n = new Notification(title, {
      body,
      tag: opts.tag, // replaces a same-tag notification instead of stacking
      requireInteraction: false,
    } as NotificationOptions);
    n.onclick = () => {
      focusConversation(opts.convId, opts.link ?? '/app');
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export const EVENT_LABELS: Record<NotifyEvent, string> = {
  newMessage: 'New visitor message',
  assigned: 'Chat assigned to me',
  mention: 'Mention in a note',
};

export interface IncomingMessageOpts {
  /** Stable message id — used to dedupe repeat fires. */
  messageId?: string;
  /** Conversation id — clicking the notification opens this thread. */
  convId?: string;
  /** In-app fallback route when no convId is given. */
  link?: string;
  /** Bypass the hidden-tab gate (used by the Settings preview button). */
  preview?: boolean;
}

/** Truncate a message preview for notification bodies (~80 chars). */
export function truncatePreview(text: string, max = 80): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Full incoming-message fan-out for a simulated/live visitor message.
 * Honors the agent's prefs: plays the tone (if sound on), shows a toast,
 * and raises a desktop Notification — the desktop Notification only when
 * desktop notifications are enabled, permission is 'granted', and the tab
 * is in the background (or the caller explicitly passes preview: true).
 * Never fires for blank/empty texts; dedupes repeat fires per message id.
 */
export function fireIncomingMessage(
  agent: string,
  visitor: string,
  text: string,
  link = '/app',
  opts: IncomingMessageOpts = {},
): void {
  if (!text.trim()) return; // e.g. rating-only messages have no preview text
  const p = loadNotifyPrefs(agent);
  if (!p.events.newMessage) return;
  if (p.sound) playTone(p.tone, p.volume);
  const body = truncatePreview(text);
  toast.info(`New message from ${visitor}`, body);
  if (p.desktop && Notification.permission === 'granted' && (opts.preview || isBackgrounded())) {
    showDesktop(`New message from ${visitor}`, body, {
      link: opts.link ?? link,
      tag: opts.messageId ?? `incoming-${Date.now()}`,
      convId: opts.convId,
    });
  }
}

/** Generic event fan-out (assignment / mention) honoring prefs. */
export function fireNotifyEvent(agent: string, event: NotifyEvent, title: string, body?: string): void {
  const p = loadNotifyPrefs(agent);
  if (!p.events[event]) return;
  if (p.sound) playTone(p.tone, p.volume);
  toast.info(title, body);
  if (p.desktop && Notification.permission === 'granted' && isBackgrounded()) {
    showDesktop(title, body ?? '', { tag: `notify-${event}-${Date.now()}` });
  }
}
