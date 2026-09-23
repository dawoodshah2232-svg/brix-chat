// Brix Chat — Conversation Operations pack (local demo state).
// All state lives in per-workspace localStorage keys; nothing leaves the browser.

import { useEffect, useState } from 'react';

// ---------- storage helpers ----------
const PREFIX = 'brixchat_convos_';

function keyOf(base: string, workspace: string): string {
  return `${PREFIX}${base}_${workspace}`;
}

function readJSON<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function readRaw<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    window.dispatchEvent(new Event('brix:storage-full'));
  }
}

/** Per-workspace persisted state hook. */
export function useWorkspaceStorage<T>(base: string, workspace: string, fallback: T) {
  const k = keyOf(base, workspace);
  const [value, setValue] = useState<T>(() => readJSON(k, fallback));
  useEffect(() => setValue(readJSON(k, fallback)), [k]);
  const save = (next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writeJSON(k, v);
      return v;
    });
  };
  return [value, save] as const;
}

// ---------- 1. chat queue ----------
export interface WaitingVisitor {
  id: string;
  name: string;
  department: string;
  waitingSince: number;
}

export interface QueueConfig {
  maxConcurrent: number;
  waiting: WaitingVisitor[];
}

const QUEUE_FALLBACK: QueueConfig = { maxConcurrent: 5, waiting: [] };

export function useQueue(workspace: string, activeChats: number) {
  const [cfg, save] = useWorkspaceStorage<QueueConfig>('queue_v1', workspace, QUEUE_FALLBACK);
  const atCapacity = activeChats >= cfg.maxConcurrent;
  const setMax = (n: number) =>
    save({ ...cfg, maxConcurrent: Math.max(1, Math.min(25, n)) });
  const pushWaiting = (v: WaitingVisitor) => save({ ...cfg, waiting: [...cfg.waiting, v] });
  const dropWaiting = (id: string) => save({ ...cfg, waiting: cfg.waiting.filter((w) => w.id !== id) });
  return { cfg, atCapacity, setMax, pushWaiting, dropWaiting };
}

export function estimatedWaitMins(waiting: WaitingVisitor[], maxConcurrent: number): number {
  if (waiting.length === 0) return 0;
  const position = waiting.length; // next joiner sits at the end
  return Math.max(1, Math.ceil(position / Math.max(1, maxConcurrent)) * 3);
}

// ---------- 2. wrap-up dispositions ----------
export type DispositionCode =
  | 'Resolved'
  | 'Follow-up needed'
  | 'Bug report'
  | 'Billing question'
  | 'Escalated'
  | 'Spam';

export const DISPOSITION_CODES: DispositionCode[] = [
  'Resolved',
  'Follow-up needed',
  'Bug report',
  'Billing question',
  'Escalated',
  'Spam',
];

export interface Disposition {
  code: DispositionCode;
  note: string;
  by: string;
  at: number;
}

const DISP_BASE = 'dispositions_v1';

export function getDisposition(workspace: string, conversationId: string): Disposition | null {
  return readRaw<Record<string, Disposition>>(keyOf(DISP_BASE, workspace), {})[conversationId] ?? null;
}

export function saveDisposition(workspace: string, conversationId: string, d: Disposition): void {
  const all = readRaw<Record<string, Disposition>>(keyOf(DISP_BASE, workspace), {});
  all[conversationId] = d;
  writeJSON(keyOf(DISP_BASE, workspace), all);
}

export function useDisposition(workspace: string, conversationId: string): [Disposition | null, (d: Disposition) => void] {
  const [d, setD] = useState<Disposition | null>(() => getDisposition(workspace, conversationId));
  useEffect(() => setD(getDisposition(workspace, conversationId)), [workspace, conversationId]);
  return [d, (v) => { saveDisposition(workspace, conversationId, v); setD(v); }];
}

// ---------- 3. pinning ----------
const PINS_BASE = 'pins_v1';

export function usePins(workspace: string) {
  const [pins, save] = useWorkspaceStorage<string[]>('pins_v1', workspace, []);
  const isPinned = (id: string) => pins.includes(id);
  const toggle = (id: string) =>
    save((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return { pins, isPinned, toggle };
}

export { PINS_BASE };

// ---------- 4. follow-up reminders ----------
export interface FollowUpReminder {
  id: string;
  conversationId: string;
  visitor: string;
  dueAt: number;
  note: string;
}

export function useReminders(workspace: string) {
  const [reminders, save] = useWorkspaceStorage<FollowUpReminder[]>('reminders_v1', workspace, []);
  const add = (r: FollowUpReminder) => save((xs) => [...xs, r].sort((a, b) => a.dueAt - b.dueAt));
  const remove = (id: string) => save((xs) => xs.filter((x) => x.id !== id));
  return { reminders, add, remove };
}

// ---------- 5. profanity filter ----------
export interface ProfanityConfig {
  enabled: boolean;
  words: string[];
}

const DEFAULT_WORDS = ['damn', 'hell', 'crap', 'stupid', 'hate', 'shut up', 'idiot', 'suck'];

export function getProfanityConfig(workspace: string): ProfanityConfig {
  return readJSON(keyOf('profanity_v1', workspace), { enabled: false, words: DEFAULT_WORDS } as ProfanityConfig);
}

export function saveProfanityConfig(workspace: string, cfg: ProfanityConfig): void {
  writeJSON(keyOf('profanity_v1', workspace), { ...cfg, words: cfg.words.map((w) => w.trim()).filter(Boolean) });
}

/** Mask configured profanity with bullet characters. Case-insensitive word match. */
export function maskProfanity(text: string, workspace: string): string {
  const cfg = getProfanityConfig(workspace);
  if (!cfg.enabled || cfg.words.length === 0) return text;
  const words = cfg.words.map((w) => w.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (words.length === 0) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.replace(re, (m) => '•'.repeat([...m].length));
}

// ---------- 6. schedules + holidays ----------
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export interface DayHours { on: boolean; start: string; end: string }

export interface AgentSchedule {
  agent: string;
  days: Record<DayKey, DayHours>;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // yyyy-mm-dd
}

export interface ScheduleState {
  schedules: AgentSchedule[];
  holidays: Holiday[];
}

const DEFAULT_DAYS = (): Record<DayKey, DayHours> => ({
  mon: { on: true, start: '09:00', end: '17:00' },
  tue: { on: true, start: '09:00', end: '17:00' },
  wed: { on: true, start: '09:00', end: '17:00' },
  thu: { on: true, start: '09:00', end: '17:00' },
  fri: { on: true, start: '09:00', end: '17:00' },
  sat: { on: false, start: '09:00', end: '17:00' },
  sun: { on: false, start: '09:00', end: '17:00' },
});

export function defaultAgentSchedule(agent: string): AgentSchedule {
  return { agent, days: DEFAULT_DAYS() };
}

export function useScheduleState(workspace: string) {
  const [state, save] = useWorkspaceStorage<ScheduleState>('schedules_v1', workspace, {
    schedules: [], holidays: [],
  });
  return [state, save] as const;
}

export function isHoliday(state: ScheduleState, date: Date): Holiday | null {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return state.holidays.find((h) => h.date === iso) ?? null;
}

export function agentOnlineNow(schedule: AgentSchedule, now: Date, holidays: Holiday[]): boolean {
  const tmp: ScheduleState = { schedules: [], holidays };
  if (isHoliday(tmp, now)) return false; // holidays show as offline
  const dayIdx = (now.getDay() + 6) % 7; // monday-first
  const d = schedule.days[DAY_KEYS[dayIdx]];
  if (!d.on) return false;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return d.start <= hhmm && hhmm <= d.end;
}

// ---------- 7. KB visibility (internal articles) ----------
export type KbVisibility = 'public' | 'internal';

export function useKbVisibility() {
  const k = 'brixchat_kbvis_v1';
  const [map, setMap] = useState<Record<string, KbVisibility>>(() => readRaw(k, {} as Record<string, KbVisibility>));
  const get = (id: string): KbVisibility => map[id] ?? 'public';
  const set = (id: string, v: KbVisibility) => {
    setMap((prev) => {
      const next = { ...prev, [id]: v };
      writeJSON(k, next);
      return next;
    });
  };
  return { get, set };
}

/** Raw read for pages that don't use the hook (public KB page). */
export function getKbVisibility(id: string): KbVisibility {
  return readRaw<Record<string, KbVisibility>>('brixchat_kbvis_v1', {})[id] ?? 'public';
}

// ---------- 9. translation toggle ----------
export interface TranslateState {
  enabled: boolean;
  language: string;
}

export const TRANSLATE_LANGUAGES = [
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
];

export function useTranslateState(workspace: string) {
  const [state, save] = useWorkspaceStorage<TranslateState>('translate_v1', workspace, {
    enabled: false, language: 'es',
  });
  return [state, save] as const;
}
