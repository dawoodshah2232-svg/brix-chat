// Brix Chat — widget route (loaded inside the iframe injected by public/widget.js).
// Phase 2 upgrade: messenger home, pre-chat form, offline form → ticket, proactive
// prompt bubbles, CSAT after chat end, email-transcript request (logged locally),
// meeting-booking block, FAQ quick-links, language selector (en/es/fr/de/ar/ur,
// original translations), business-hours-aware greeting, typing both ways, local
// file-note attachments (no fake upload), full ARIA + keyboard support.
// Worker D: branding (brand_name/tagline/logo/accent_color), two-step CSAT+NPS
// with ratings.create + ratingSubmitted event, pre-chat department chooser with
// routing.routeChat, agent identity in chat header via members.get, transfer
// notices rendered distinctly in the timeline.
//
// ---------------------------------------------------------------------------
// postMessage protocol (all messages: { t: 'brixchat:<type>', cmd?, payload? })
// ---------------------------------------------------------------------------
// Loader → widget commands (brixchat:cmd):
//   config { greeting, locale, visitor, attributes, tags, prechat?, offline? }
//     - prechat/offline are HOST OVERRIDES ({ enabled?, fields? }); WidgetPage
//       merges them over api.propertySettings.get() (falls back to local
//       defaults when the §9 method isn't implemented yet).
//   setVisitor { visitor } | setAttributes { attributes } | setTags { tags }
//   trackEvent { name, metadata }
//   prompt { id?, text, delay?, dismissAfter? }   — proactive bubble (phase 2)
//   emailTranscript { email }                     — request transcript (phase 2)
//   requestCallback                             — open the "Request a callback" form (phase 5)
//   typing { active }                             — host-driven agent typing (phase 2)
//   language { code }                             — UI language override (phase 2)
//   transfer { to?, agent?, department?, note? }   — Worker D: transfer notice in timeline + agent identity
//   endChat | reset                               — unchanged (phase 1)
// Widget → loader events (brixchat:<type>):
//   ready { property, secureHash } | open | close
//   chatStarted { conversation_id, visitor, identity_hash }
//   chatEnded { conversation_id }
//   message { dir: 'in' | 'out', message }
//   typing { active }                             — visitor typing (phase 2)
//   prechatSubmitted { values }                   — phase 2
//   offlineSubmitted { queued, values, ticket? }   — phase 2
//   callbackRequested { queued, ticket_id, values } — phase 5 ("Request a callback" submitted)
//   satisfaction { rating, comment }              — phase 2 (CSAT, kept for back-compat)
//   ratingSubmitted { kind: 'csat'|'nps', score } — phase 2 (Worker D: two-step rating)
//   transcriptRequested { email, chars, saved }   — phase 2
//   promptShown { id } | promptDismissed { id, reason } — phase 2
//   languageChanged { code }                      — phase 2
//   status { status }                             — online/away/offline (phase 2)
// All phase-1 commands/events remain unchanged (100% backward compatible).
//
// Forward compatibility: §9 methods (propertySettings.get, tickets.create,
// notifications.push) are accessed defensively — the widget works fully today
// and picks them up automatically once Worker A lands them in src/lib/api.ts.
//
// Phase 5 — "Request a callback": the chat ⋯ menu and the loader's
// BrixChat('requestCallback') open a small form (name, phone required, topic,
// preferred time window). Submit creates a ticket via api.tickets.create with
// the phone + preferred time in the message (tags: callback, widget), falling
// back to the honest local queue 'brixchat_callback_queue_v1' when the API is
// unreachable — the same pattern as the offline form.
// Phase 5 — chat queue: when the loader passes queue: true (?queue=1), the
// visitor joins the shared queue localStorage['brixchat_queue_v1']
// (Record<propertyId, [{ id, joinedAt, name? }]>, oldest first — helpers in
// src/lib/portal.ts) and the panel shows "You're #N in line — about X min
// wait" with N = 1 + entries already waiting.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApi } from '../lib/api';
import type { ApiArticle, ApiConversation, ApiProperty } from '../lib/api';
import { botReply } from '../lib/bot';
import type { GuideStep } from '../lib/types';
import { uid, fmtTime, cx } from '../lib/utils';
// phase 5: shared chat-queue helpers (key 'brixchat_queue_v1', also used by public/widget.js)
import { joinQueue, leaveQueue, queuePosition } from '../lib/portal';

const NS = 'brixchat';
const EMOJIS = ['😊', '👍', '🙏', '🎉', '❤️', '😅', '👋', '✅'];

/* ------------------------------------------------------------------ */
/* §9 forward-compat access (defensive: works before Worker A lands)   */
/* ------------------------------------------------------------------ */
interface P2PropertySettings {
  greeting_online: string; greeting_away: string; greeting_offline: string;
  offline_form_enabled: boolean; offline_form_fields: string[];
  prechat_enabled: boolean; prechat_fields: string[];
  departments: Array<{ id: string; name: string }>;
  business_hours: Array<{ day: number; open: string; close: string }>;
  timezone: string; blocked: string[];
  widget_color: string; widget_position: 'bottom-right' | 'bottom-left';
  launcher_style: 'bubble' | 'bar'; language: string; booking_url: string;
  // Worker D branding fields (§9 contract via Worker A; optional — defensive
  // until landed; plain widget look is kept when none are set)
  brand_name?: string; tagline?: string; logo_data_url?: string | null;
  theme?: string; accent_color?: string;
}
interface P2Api {
  propertySettings?: { get(propertyId: string): Promise<{ data: P2PropertySettings }> };
  tickets?: { create(input: Record<string, unknown>): Promise<{ data: { id?: string } }> };
  notifications?: { push(type: string, title: string, body: string, link?: string | null): Promise<{ data: unknown }> };
  // §9 ratings (Worker A); defensive until landed — widget keeps working without it
  ratings?: {
    create(input: {
      property_id: string; conversation_id: string; agent_id: string | null;
      kind: 'csat' | 'nps'; score: number; comment?: string;
    }): Promise<{ data: unknown }>;
  };
  // Worker D follow-up: departments, routing, members (Worker A §9) — defensive until landed
  departments?: {
    list(propertyId: string): Promise<{ data: Array<{ id: string; name: string }> | { items: Array<{ id: string; name: string }> } }>;
  };
  routing?: {
    routeChat(propertyId: string, departmentId: string): Promise<{ data: {
      agent_id?: string | null; agent_name?: string | null;
      department_id?: string | null; department_name?: string | null;
    } }>;
  };
  members?: {
    get(agentId: string): Promise<{ data: {
      id: string; display_name?: string; name?: string; title?: string; job_title?: string;
    } }>;
  };
  // Phase 4 (P4-2): proactive triggers — the dashboard worker adds
  // event_config {event, idle_secs, scroll_pct} + frequency_cap {mode, max}
  // to api.triggers; read defensively, the widget works without them.
  triggers?: {
    list(propertyId: string): Promise<{ data: unknown }>;
  };
  // Phase 4 (P4-13): survey config from api feedback settings (dashboard
  // worker adds); read defensively — legacy two-step CSAT→NPS is the fallback.
  feedback?: {
    settings?: {
      get(propertyId: string): Promise<{ data: unknown }>;
    };
  };
}
const p2 = (api: unknown): P2Api => (api ?? {}) as P2Api;

const DEFAULT_SETTINGS: P2PropertySettings = {
  greeting_online: '', greeting_away: '', greeting_offline: '',
  offline_form_enabled: false, offline_form_fields: ['name', 'email', 'message'],
  prechat_enabled: false, prechat_fields: ['name', 'email', 'message'],
  departments: [], business_hours: [], timezone: '', blocked: [],
  widget_color: '', widget_position: 'bottom-right', launcher_style: 'bubble',
  language: 'en', booking_url: '',
};

/* ------------------------------------------------------------------ */
/* Phase 4 — widget-side feature helpers                                */
/* ------------------------------------------------------------------ */

/* P4-2: proactive trigger normalization. Trigger config comes from api
 * triggers (dashboard worker adds event_config + frequency_cap); legacy
 * TriggerEvent values ('visitor.idle', 'page.viewed') are mapped so older
 * rules keep working. The loader (public/widget.js) owns the detectors and
 * the localStorage frequency caps — the widget only forwards normalized defs. */
interface P4TriggerNorm {
  id: string;
  event: 'page_view' | 'exit_intent' | 'idle' | 'scroll_depth';
  text: string;
  idle_secs: number;
  scroll_pct: number;
  frequency_cap: { mode: 'once_session' | 'once_day' | 'max_count'; max: number };
  delay: number;
  max_prompts_per_visit?: number;
}
function normalizeTriggers(raw: unknown): P4TriggerNorm[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: P4TriggerNorm[] = [];
  for (const item of list) {
    const r = (item ?? {}) as Record<string, unknown>;
    if (r.enabled === false) continue;
    const ec = (r.event_config ?? {}) as Record<string, unknown>;
    let event = typeof ec.event === 'string' ? ec.event : '';
    if (!event) {
      const leg = String(r.event ?? '');
      if (leg === 'visitor.idle') event = 'idle';
      else if (leg === 'page.viewed') event = 'page_view';
      else continue; // chat-scoped events never fire from the parent page
    }
    if (event !== 'page_view' && event !== 'exit_intent' && event !== 'idle' && event !== 'scroll_depth') continue;
    let text = '';
    if (Array.isArray(r.actions)) {
      const m = (r.actions as Array<Record<string, unknown>>).find((a) => a && a.kind === 'message');
      if (m) text = String(m.value ?? '');
    }
    if (!text && typeof r.action === 'string') {
      const mm = r.action.match(/^(?:show message|open chat with)\s*:\s*[“"']?(.+?)[”"']?\s*$/i);
      text = (mm ? mm[1] : r.action).slice(0, 300).trim();
    }
    if (!text) continue;
    const fcap = (r.frequency_cap ?? {}) as Record<string, unknown>;
    const mode = fcap.mode === 'once_day' || fcap.mode === 'max_count' ? fcap.mode : 'once_session';
    const mpv = (r as { max_prompts_per_visit?: unknown }).max_prompts_per_visit;
    out.push({
      id: String(r.id ?? ''),
      event: event as P4TriggerNorm['event'],
      text,
      idle_secs: Math.max(5, Math.min(Number(ec.idle_secs ?? 30) || 30, 3600)),
      scroll_pct: Math.max(5, Math.min(Number(ec.scroll_pct ?? 50) || 50, 100)),
      frequency_cap: { mode, max: Math.max(1, Number(fcap.max ?? 1) || 1) },
      delay: Math.max(0, Math.min(Number((r as { delay?: unknown }).delay ?? 0) || 0, 120000)),
      max_prompts_per_visit: mpv != null ? Math.max(1, Number(mpv) || 3) : undefined,
    });
  }
  return out.filter((t) => t.id.length > 0);
}

/* P4-3: client-side KB ranking — title matches weigh 3× body matches. */
interface RankedKb { a: ApiArticle; score: number; snippet: string }
function kbSnippet(body: string, idx: number): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (idx < 0) return clean.length > 140 ? clean.slice(0, 140) + '…' : clean;
  const start = Math.max(0, idx - 55);
  const end = Math.min(clean.length, start + 150);
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '');
}
function rankKb(arts: ApiArticle[], q: string): RankedKb[] {
  const terms = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  if (!terms.length) return [];
  const out: RankedKb[] = [];
  for (const a of arts) {
    const title = a.title.toLowerCase();
    const body = (a.body || '').toLowerCase();
    let score = 0;
    let first = -1;
    let titleHit = false;
    for (const term of terms) {
      const th = title.split(term).length - 1;
      const bh = body.split(term).length - 1;
      if (th > 0) { titleHit = true; score += th * 3; }
      if (bh > 0) {
        score += bh;
        const i = body.indexOf(term);
        if (first < 0 || i < first) first = i;
      }
    }
    if (score <= 0) continue;
    out.push({ a, score: score + (titleHit ? 0.5 : 0), snippet: kbSnippet(a.body || a.title, first) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 5);
}

/* P4-4: guided troubleshooting trees. Article kind/guide_steps are part of
 * the shared types.ts contract; read defensively until the dashboard worker's
 * api.ts pass lands them on ApiArticle. */
function articleKindOf(a: ApiArticle): 'article' | 'guide' {
  return (a as ApiArticle & { kind?: unknown }).kind === 'guide' ? 'guide' : 'article';
}
function guideStepsOf(a: ApiArticle): GuideStep[] {
  const s = (a as ApiArticle & { guide_steps?: unknown }).guide_steps;
  return Array.isArray(s)
    ? (s as GuideStep[]).filter((x) => x && typeof x.id === 'string' && Array.isArray(x.options))
    : [];
}
interface GuideRun {
  article: ApiArticle;
  steps: GuideStep[];
  idx: number;
  trail: number[];
  choices: Array<{ stepId: string; label: string }>;
}

/* P4-13: post-chat survey config (csat 1–5 / nps 0–10 / ces 1–7) with optional
 * comment, suppression cooldown, and delay after resolve. */
interface SurveyConfig {
  type: 'csat' | 'nps' | 'ces';
  comment_enabled: boolean;
  delay_secs: number;
  cooldown_days: number;
}
function normalizeSurvey(raw: unknown): SurveyConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type === 'nps' ? 'nps' : r.type === 'ces' ? 'ces' : r.type === 'csat' ? 'csat' : null;
  if (!type) return null;
  return {
    type,
    comment_enabled: r.comment_enabled !== false,
    delay_secs: Math.max(0, Math.min(Number(r.delay_secs ?? r.delay_after_resolve_secs ?? 0) || 0, 600)),
    cooldown_days: Math.max(0, Number(r.cooldown_days ?? 7) || 7),
  };
}

/* P4-17: voice notes — blob persisted in localStorage, size-capped. */
interface ActiveRecorder { rec: MediaRecorder; startedAt: number; tickId: number; stream: MediaStream }
interface AudioPreview { url: string; blob: Blob; secs: number }
const AUDIO_PREFIX = 'brixchat_audio_v1:';

/** Resolve the persisted playback URL for a voice-note message id (falls back
 *  to an inline URL, e.g. one rendered by the dashboard worker). */
function audioUrlForMessage(messageId: string, fallback: string): string | undefined {
  if (messageId) {
    try {
      const raw = localStorage.getItem(`${AUDIO_PREFIX}${messageId}`);
      if (raw) {
        const u = String((JSON.parse(raw) as { u?: unknown }).u ?? '');
        if (u) return u;
      }
    } catch { /* ignore */ }
  }
  return fallback || undefined;
}

/* ------------------------------------------------------------------ */
/* Language packs — original short UI strings (phase 2, T2.11)         */
/* ------------------------------------------------------------------ */
type Lang = 'en' | 'es' | 'fr' | 'de' | 'ar' | 'ur';
const LANGS: Lang[] = ['en', 'es', 'fr', 'de', 'ar', 'ur'];
const RTL: Record<string, boolean> = { ar: true, ur: true };
const LANG_NAMES: Record<Lang, string> = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', ar: 'العربية', ur: 'اردو',
};

const STR: Record<Lang, Record<string, string>> = {
  en: {
    welcome: 'Hi there 👋', startChat: 'Start chat', leaveMessage: 'Leave a message', startChatAnyway: 'Start chat anyway',
    prechatTitle: 'Start the conversation', prechatHint: 'Tell us a little about yourself so we can help faster.',
    name: 'Name', email: 'Email', phone: 'Phone', department: 'Department', selectDepartment: 'Select a department',
    message: 'Message', submit: 'Submit', sending: 'Sending…',
    offlineTitle: "We're away", offlineHint: 'Leave a message and we will get back to you soon.',
    offlineDone: 'Message received', offlineDoneHint: 'Thanks — we will reply as soon as we are back.',
    csatTitle: 'How was this chat?', csatHint: 'Your feedback helps us improve.', csatThanks: 'Thanks for your feedback!',
    step1of2: 'Step 1 of 2', step2of2: 'Step 2 of 2',
    npsTitle: 'How likely are you to recommend us?', npsHint: '0 = not at all · 10 = definitely',
    chooseTeam: 'Choose a team', chattingWith: 'Chatting with',
    transferredTo: 'Chat transferred to', transferNote: 'note',
    commentPh: 'Anything we should know? (optional)', skip: 'Skip',
    transcriptTitle: 'Email transcript', transcriptPh: 'you@example.com', transcriptSend: 'Send',
    transcriptDone: 'Saved ✓', transcriptHint: 'Saved on this device — we will email it once email sending is enabled (backend phase).',
    bookMeeting: 'Book a meeting', faqTitle: 'Quick answers', languageLabel: 'Language', menuLabel: 'Chat menu',
    requestCallback: 'Request a callback',
    callbackTitle: 'Request a callback', callbackHint: 'Leave your number and we will call you back.',
    callbackName: 'Name', callbackPhone: 'Phone number', callbackTopic: 'Topic', callbackWhen: 'Preferred time',
    callbackWithinHour: 'Within 1 hour', callbackAfternoon: 'Today afternoon', callbackTomorrow: 'Tomorrow morning',
    callbackPickTime: 'Pick date/time', callbackCustomPh: 'Choose date and time', callbackSubmit: 'Request callback',
    callbackPhoneErr: 'Please enter a valid phone number.',
    callbackDoneTitle: 'Request received', callbackDoneText: "We'll call you back at {time}.",
    callbackBack: 'Back',
    queueLine: "You're #{n} in line — about {m} min wait",
    endChat: 'End chat', chatEnded: 'Chat ended', chatEndedHint: 'Thanks for chatting with us. Start a new chat any time.',
    newChat: 'Start new chat', attachFile: 'Attach a file', emojiBtn: 'Emoji', typeMessage: 'Type your message…',
    sendBtn: 'Send', minimizeBtn: 'Minimize chat', dismiss: 'Dismiss', closeChat: 'Close chat', openChat: 'Open chat',
    chatPanel: 'Brix chat panel', onlineNow: 'Online — replies instantly', offlineNow: 'Currently away',
    fileNote: '— file sharing arrives with the backend phase; your file note was added to this chat.',
    kbSearchPh: 'Search help articles…', kbResults: 'Top matches', kbNoResults: 'No matches found',
    kbNoResultsHint: 'Try different words — or start a chat and we’ll help directly.',
    kbBackToResults: 'Back to results', kbGuide: 'Guide',
    guideBack: 'Back', guideRestart: 'Start over',
    guideStillStuck: 'Still stuck? Start a chat and we’ll pick up where you left off.',
    guideYourPath: 'Your path',
    cesTitle: 'How easy was it to get help?', cesHint: '1 = very difficult · 7 = very easy',
    audioRec: 'Record a voice note', audioRecording: 'Recording…', audioStop: 'Stop',
    audioSend: 'Send voice note', audioCancel: 'Cancel', audioPreview: 'Preview',
    audioDenied: 'Microphone access was denied — check your browser permissions.',
    audioQuotaWarn: 'Voice-note storage is full — the oldest notes were removed.',
  },
  es: {
    welcome: '¡Hola! 👋', startChat: 'Iniciar chat', leaveMessage: 'Dejar un mensaje', startChatAnyway: 'Iniciar chat igualmente',
    prechatTitle: 'Inicia la conversación', prechatHint: 'Cuéntanos un poco sobre ti para ayudarte más rápido.',
    name: 'Nombre', email: 'Correo electrónico', phone: 'Teléfono', department: 'Departamento', selectDepartment: 'Elige un departamento',
    message: 'Mensaje', submit: 'Enviar', sending: 'Enviando…',
    offlineTitle: 'No estamos disponibles', offlineHint: 'Deja un mensaje y te responderemos pronto.',
    offlineDone: 'Mensaje recibido', offlineDoneHint: 'Gracias — te responderemos en cuanto volvamos.',
    csatTitle: '¿Cómo fue este chat?', csatHint: 'Tu opinión nos ayuda a mejorar.', csatThanks: '¡Gracias por tu opinión!',
    step1of2: 'Paso 1 de 2', step2of2: 'Paso 2 de 2',
    npsTitle: '¿Qué probabilidad hay de que nos recomiendes?', npsHint: '0 = nada · 10 = seguro',
    chooseTeam: 'Elige un equipo', chattingWith: 'Hablando con',
    transferredTo: 'Chat transferido a', transferNote: 'nota',
    commentPh: '¿Algo que debamos saber? (opcional)', skip: 'Omitir',
    transcriptTitle: 'Enviar conversación por correo', transcriptPh: 'tu@ejemplo.com', transcriptSend: 'Enviar',
    transcriptDone: 'Guardado ✓', transcriptHint: 'Guardado en este dispositivo — lo enviaremos cuando el correo esté activado (fase backend).',
    bookMeeting: 'Reservar una cita', faqTitle: 'Respuestas rápidas', languageLabel: 'Idioma', menuLabel: 'Menú del chat',
    endChat: 'Terminar chat', chatEnded: 'Chat terminado', chatEndedHint: 'Gracias por chatear con nosotros. Inicia uno nuevo cuando quieras.',
    newChat: 'Iniciar nuevo chat', attachFile: 'Adjuntar un archivo', emojiBtn: 'Emojis', typeMessage: 'Escribe tu mensaje…',
    sendBtn: 'Enviar', minimizeBtn: 'Minimizar chat', dismiss: 'Descartar', closeChat: 'Cerrar chat', openChat: 'Abrir chat',
    chatPanel: 'Panel de chat de Brix', onlineNow: 'En línea — respuesta inmediata', offlineNow: 'Ausentes ahora mismo',
    fileNote: '— el envío de archivos llega con la fase backend; tu nota se añadió a este chat.',
    kbSearchPh: 'Buscar en los artículos de ayuda…', kbResults: 'Mejores resultados', kbNoResults: 'Sin resultados',
    kbNoResultsHint: 'Prueba con otras palabras — o inicia un chat y te ayudamos directamente.',
    kbBackToResults: 'Volver a los resultados', kbGuide: 'Guía',
    guideBack: 'Atrás', guideRestart: 'Empezar de nuevo',
    guideStillStuck: '¿Sigues atascado? Inicia un chat y retomamos donde lo dejaste.',
    guideYourPath: 'Tu recorrido',
    cesTitle: '¿Qué tan fácil fue obtener ayuda?', cesHint: '1 = muy difícil · 7 = muy fácil',
    audioRec: 'Grabar una nota de voz', audioRecording: 'Grabando…', audioStop: 'Detener',
    audioSend: 'Enviar nota de voz', audioCancel: 'Cancelar', audioPreview: 'Vista previa',
    audioDenied: 'Se denegó el acceso al micrófono — revisa los permisos de tu navegador.',
    audioQuotaWarn: 'El almacenamiento de notas de voz está lleno — se eliminaron las más antiguas.',
  },
  fr: {
    welcome: 'Bonjour 👋', startChat: 'Démarrer le chat', leaveMessage: 'Laisser un message', startChatAnyway: 'Démarrer quand même',
    prechatTitle: 'Démarrer la conversation', prechatHint: 'Dites-nous en un peu plus sur vous pour une aide plus rapide.',
    name: 'Nom', email: 'E-mail', phone: 'Téléphone', department: 'Service', selectDepartment: 'Choisir un service',
    message: 'Message', submit: 'Envoyer', sending: 'Envoi…',
    offlineTitle: 'Nous sommes absents', offlineHint: 'Laissez un message, nous vous répondrons vite.',
    offlineDone: 'Message reçu', offlineDoneHint: 'Merci — nous répondrons dès notre retour.',
    csatTitle: 'Comment s’est passé ce chat ?', csatHint: 'Votre avis nous aide à progresser.', csatThanks: 'Merci pour votre avis !',
    step1of2: 'Étape 1 sur 2', step2of2: 'Étape 2 sur 2',
    npsTitle: 'Quelle est la probabilité que vous nous recommandiez ?', npsHint: '0 = pas du tout · 10 = tout à fait',
    chooseTeam: 'Choisir une équipe', chattingWith: 'En discussion avec',
    transferredTo: 'Chat transféré à', transferNote: 'note',
    commentPh: 'Quelque chose à nous signaler ? (facultatif)', skip: 'Passer',
    transcriptTitle: 'Recevoir la conversation par e-mail', transcriptPh: 'vous@exemple.com', transcriptSend: 'Envoyer',
    transcriptDone: 'Enregistré ✓', transcriptHint: 'Enregistré sur cet appareil — envoyé par e-mail dès l’activation (phase backend).',
    bookMeeting: 'Réserver un rendez-vous', faqTitle: 'Réponses rapides', languageLabel: 'Langue', menuLabel: 'Menu du chat',
    endChat: 'Terminer le chat', chatEnded: 'Chat terminé', chatEndedHint: 'Merci d’avoir discuté avec nous. Revenez quand vous voulez.',
    newChat: 'Démarrer un nouveau chat', attachFile: 'Joindre un fichier', emojiBtn: 'Émojis', typeMessage: 'Écrivez votre message…',
    sendBtn: 'Envoyer', minimizeBtn: 'Réduire le chat', dismiss: 'Ignorer', closeChat: 'Fermer le chat', openChat: 'Ouvrir le chat',
    chatPanel: 'Panneau de chat Brix', onlineNow: 'En ligne — réponse immédiate', offlineNow: 'Actuellement absents',
    fileNote: '— le partage de fichiers arrive avec la phase backend ; votre note a été ajoutée à ce chat.',
    kbSearchPh: 'Rechercher dans les articles d’aide…', kbResults: 'Meilleurs résultats', kbNoResults: 'Aucun résultat',
    kbNoResultsHint: 'Essayez d’autres mots — ou démarrez un chat, nous vous aiderons directement.',
    kbBackToResults: 'Retour aux résultats', kbGuide: 'Guide',
    guideBack: 'Retour', guideRestart: 'Recommencer',
    guideStillStuck: 'Toujours bloqué ? Démarrez un chat, nous reprendrons où vous en étiez.',
    guideYourPath: 'Votre parcours',
    cesTitle: 'Était-il facile d’obtenir de l’aide ?', cesHint: '1 = très difficile · 7 = très facile',
    audioRec: 'Enregistrer un message vocal', audioRecording: 'Enregistrement…', audioStop: 'Arrêter',
    audioSend: 'Envoyer le message vocal', audioCancel: 'Annuler', audioPreview: 'Aperçu',
    audioDenied: 'Accès au microphone refusé — vérifiez les autorisations de votre navigateur.',
    audioQuotaWarn: 'Le stockage des messages vocaux est plein — les plus anciens ont été supprimés.',
  },
  de: {
    welcome: 'Hallo 👋', startChat: 'Chat starten', leaveMessage: 'Nachricht hinterlassen', startChatAnyway: 'Trotzdem chatten',
    prechatTitle: 'Gespräch starten', prechatHint: 'Erzählen Sie uns kurz von sich, damit wir schneller helfen können.',
    name: 'Name', email: 'E-Mail', phone: 'Telefon', department: 'Abteilung', selectDepartment: 'Abteilung wählen',
    message: 'Nachricht', submit: 'Senden', sending: 'Wird gesendet…',
    offlineTitle: 'Wir sind gerade nicht da', offlineHint: 'Hinterlassen Sie eine Nachricht — wir melden uns bald.',
    offlineDone: 'Nachricht erhalten', offlineDoneHint: 'Danke — wir antworten, sobald wir zurück sind.',
    csatTitle: 'Wie war dieser Chat?', csatHint: 'Ihr Feedback hilft uns, besser zu werden.', csatThanks: 'Danke für Ihr Feedback!',
    step1of2: 'Schritt 1 von 2', step2of2: 'Schritt 2 von 2',
    npsTitle: 'Wie wahrscheinlich würden Sie uns weiterempfehlen?', npsHint: '0 = gar nicht · 10 = auf jeden Fall',
    chooseTeam: 'Team wählen', chattingWith: 'Im Gespräch mit',
    transferredTo: 'Chat übertragen an', transferNote: 'Notiz',
    commentPh: 'Gibt es etwas, das wir wissen sollten? (optional)', skip: 'Überspringen',
    transcriptTitle: 'Chatverlauf per E-Mail', transcriptPh: 'sie@beispiel.de', transcriptSend: 'Senden',
    transcriptDone: 'Gespeichert ✓', transcriptHint: 'Auf diesem Gerät gespeichert — Versand per E-Mail folgt mit der Backend-Phase.',
    bookMeeting: 'Termin buchen', faqTitle: 'Kurze Antworten', languageLabel: 'Sprache', menuLabel: 'Chat-Menü',
    endChat: 'Chat beenden', chatEnded: 'Chat beendet', chatEndedHint: 'Danke für das Gespräch. Starten Sie jederzeit einen neuen Chat.',
    newChat: 'Neuen Chat starten', attachFile: 'Datei anhängen', emojiBtn: 'Emojis', typeMessage: 'Nachricht eingeben…',
    sendBtn: 'Senden', minimizeBtn: 'Chat minimieren', dismiss: 'Verwerfen', closeChat: 'Chat schließen', openChat: 'Chat öffnen',
    chatPanel: 'Brix-Chat-Fenster', onlineNow: 'Online — antwortet sofort', offlineNow: 'Gerade abwesend',
    fileNote: '— Dateifreigabe kommt mit der Backend-Phase; Ihre Notiz wurde diesem Chat hinzugefügt.',
    kbSearchPh: 'Hilfeartikel durchsuchen…', kbResults: 'Top-Treffer', kbNoResults: 'Keine Treffer',
    kbNoResultsHint: 'Versuchen Sie es mit anderen Wörtern — oder starten Sie einen Chat, wir helfen direkt.',
    kbBackToResults: 'Zurück zu den Ergebnissen', kbGuide: 'Anleitung',
    guideBack: 'Zurück', guideRestart: 'Von vorn beginnen',
    guideStillStuck: 'Kommen Sie nicht weiter? Starten Sie einen Chat — wir machen dort weiter, wo Sie aufgehört haben.',
    guideYourPath: 'Ihr Weg',
    cesTitle: 'Wie einfach war es, Hilfe zu bekommen?', cesHint: '1 = sehr schwierig · 7 = sehr einfach',
    audioRec: 'Sprachnotiz aufnehmen', audioRecording: 'Aufnahme…', audioStop: 'Stopp',
    audioSend: 'Sprachnotiz senden', audioCancel: 'Abbrechen', audioPreview: 'Vorschau',
    audioDenied: 'Mikrofonzugriff verweigert — prüfen Sie die Browser-Berechtigungen.',
    audioQuotaWarn: 'Der Sprachnotiz-Speicher ist voll — die ältesten Notizen wurden entfernt.',
  },
  ar: {
    welcome: 'مرحبًا 👋', startChat: 'بدء المحادثة', leaveMessage: 'اترك رسالة', startChatAnyway: 'بدء المحادثة على أي حال',
    prechatTitle: 'ابدأ المحادثة', prechatHint: 'أخبرنا قليلًا عنك لنتمكن من مساعدتك بشكل أسرع.',
    name: 'الاسم', email: 'البريد الإلكتروني', phone: 'الهاتف', department: 'القسم', selectDepartment: 'اختر القسم',
    message: 'الرسالة', submit: 'إرسال', sending: 'جارٍ الإرسال…',
    offlineTitle: 'نحن غير متاحين', offlineHint: 'اترك رسالة وسنرد عليك قريبًا.',
    offlineDone: 'تم استلام الرسالة', offlineDoneHint: 'شكرًا — سنرد عليك فور عودتنا.',
    csatTitle: 'كيف كانت هذه المحادثة؟', csatHint: 'ملاحظاتك تساعدنا على التحسن.', csatThanks: 'شكرًا لملاحظاتك!',
    step1of2: 'الخطوة 1 من 2', step2of2: 'الخطوة 2 من 2',
    npsTitle: 'ما مدى احتمال أن توصي بنا؟', npsHint: '0 = إطلاقًا · 10 = بالتأكيد',
    chooseTeam: 'اختر الفريق', chattingWith: 'تتحدث مع',
    transferredTo: 'تم تحويل المحادثة إلى', transferNote: 'ملاحظة',
    commentPh: 'هل هناك ما يجب أن نعرفه؟ (اختياري)', skip: 'تخطي',
    transcriptTitle: 'إرسال نسخة بالبريد', transcriptPh: 'you@example.com', transcriptSend: 'إرسال',
    transcriptDone: 'تم الحفظ ✓', transcriptHint: 'محفوظة على هذا الجهاز — سنرسلها بالبريد عند تفعيل الإرسال (مرحلة الخادم).',
    bookMeeting: 'حجز موعد', faqTitle: 'إجابات سريعة', languageLabel: 'اللغة', menuLabel: 'قائمة المحادثة',
    endChat: 'إنهاء المحادثة', chatEnded: 'انتهت المحادثة', chatEndedHint: 'شكرًا لمحادثتنا. ابدأ محادثة جديدة في أي وقت.',
    newChat: 'بدء محادثة جديدة', attachFile: 'إرفاق ملف', emojiBtn: 'رموز تعبيرية', typeMessage: 'اكتب رسالتك…',
    sendBtn: 'إرسال', minimizeBtn: 'تصغير المحادثة', dismiss: 'تجاهل', closeChat: 'إغلاق المحادثة', openChat: 'فتح المحادثة',
    chatPanel: 'لوحة محادثة بريكس', onlineNow: 'متصل — يرد فورًا', offlineNow: 'غير متاح حاليًا',
    fileNote: '— مشاركة الملفات قادمة مع مرحلة الخادم؛ تمت إضافة ملاحظتك إلى هذه المحادثة.',
    kbSearchPh: 'ابحث في مقالات المساعدة…', kbResults: 'أفضل النتائج', kbNoResults: 'لا توجد نتائج',
    kbNoResultsHint: 'جرّب كلمات مختلفة — أو ابدأ محادثة وسنساعدك مباشرة.',
    kbBackToResults: 'العودة إلى النتائج', kbGuide: 'دليل',
    guideBack: 'رجوع', guideRestart: 'البدء من جديد',
    guideStillStuck: 'ما زلت عالقًا؟ ابدأ محادثة وسنكمل من حيث توقفت.',
    guideYourPath: 'مسارك',
    cesTitle: 'ما مدى سهولة الحصول على المساعدة؟', cesHint: '1 = صعب جدًا · 7 = سهل جدًا',
    audioRec: 'تسجيل ملاحظة صوتية', audioRecording: 'جارٍ التسجيل…', audioStop: 'إيقاف',
    audioSend: 'إرسال الملاحظة الصوتية', audioCancel: 'إلغاء', audioPreview: 'معاينة',
    audioDenied: 'تم رفض الوصول إلى الميكروفون — تحقق من أذونات المتصفح.',
    audioQuotaWarn: 'مساحة تخزين الملاحظات الصوتية ممتلئة — تمت إزالة أقدم الملاحظات.',
  },
  ur: {
    welcome: 'سلام 👋', startChat: 'چیٹ شروع کریں', leaveMessage: 'پیغام چھوڑیں', startChatAnyway: 'بہر حال چیٹ شروع کریں',
    prechatTitle: 'گفتگو شروع کریں', prechatHint: 'اپنے بارے میں تھوڑا بتائیں تاکہ ہم جلد مدد کر سکیں۔',
    name: 'نام', email: 'ای میل', phone: 'فون', department: 'شعبہ', selectDepartment: 'شعبہ منتخب کریں',
    message: 'پیغام', submit: 'جمع کرائیں', sending: 'بھیجا جا رہا ہے…',
    offlineTitle: 'ہم دستیاب نہیں ہیں', offlineHint: 'پیغام چھوڑیں، ہم جلد جواب دیں گے۔',
    offlineDone: 'پیغام موصول ہوا', offlineDoneHint: 'شکریہ — واپسی پر ہم جواب دیں گے۔',
    csatTitle: 'یہ چیٹ کیسی رہی؟', csatHint: 'آپ کی رائے ہمیں بہتر بناتی ہے۔', csatThanks: 'آپ کی رائے کا شکریہ!',
    step1of2: 'مرحلہ 1 از 2', step2of2: 'مرحلہ 2 از 2',
    npsTitle: 'آپ ہماری سفارش کرنے کا کتنا امکان ہے؟', npsHint: '0 = بالکل نہیں · 10 = یقیناً',
    chooseTeam: 'ٹیم منتخب کریں', chattingWith: 'سے بات کر رہے ہیں',
    transferredTo: 'چیٹ منتقل کر دی گئی', transferNote: 'نوٹ',
    commentPh: 'کیا ہمیں کچھ معلوم ہونا چاہیے؟ (اختیاری)', skip: 'چھوڑیں',
    transcriptTitle: 'ای میل ٹرانسکرپٹ', transcriptPh: 'you@example.com', transcriptSend: 'بھیجیں',
    transcriptDone: 'محفوظ ✓', transcriptHint: 'اس ڈیوائس پر محفوظ — ای میل بھیجنا بیک اینڈ مرحلے میں فعال ہوگا۔',
    bookMeeting: 'میٹنگ بک کریں', faqTitle: 'فوری جوابات', languageLabel: 'زبان', menuLabel: 'چیٹ مینیو',
    endChat: 'چیٹ ختم کریں', chatEnded: 'چیٹ ختم ہوئی', chatEndedHint: 'بات کرنے کا شکریہ۔ کسی بھی وقت نئی چیٹ شروع کریں۔',
    newChat: 'نئی چیٹ شروع کریں', attachFile: 'فائل منسلک کریں', emojiBtn: 'ایموجی', typeMessage: 'اپنا پیغام لکھیں…',
    sendBtn: 'بھیجیں', minimizeBtn: 'چیٹ چھوٹا کریں', dismiss: 'نظر انداز کریں', closeChat: 'چیٹ بند کریں', openChat: 'چیٹ کھولیں',
    chatPanel: 'برکس چیٹ پینل', onlineNow: 'آن لائن — فوری جواب', offlineNow: 'فی الحال دستیاب نہیں',
    fileNote: '— فائل شیئرنگ بیک اینڈ مرحلے کے ساتھ آئے گی؛ آپ کا نوٹ اس چیٹ میں شامل کر دیا گیا ہے۔',
    kbSearchPh: 'مدد کے مضامین تلاش کریں…', kbResults: 'بہترین نتائج', kbNoResults: 'کوئی نتیجہ نہیں ملا',
    kbNoResultsHint: 'مختلف الفاظ آزمائیں — یا چیٹ شروع کریں، ہم براہِ راست مدد کریں گے۔',
    kbBackToResults: 'نتائج پر واپس', kbGuide: 'رہنما',
    guideBack: 'واپس', guideRestart: 'نئے سرے سے شروع کریں',
    guideStillStuck: 'اب بھی پھنسے ہیں؟ چیٹ شروع کریں، ہم وہیں سے جاری رکھیں گے جہاں آپ رکے تھے۔',
    guideYourPath: 'آپ کا راستہ',
    cesTitle: 'مدد حاصل کرنا کتنا آسان تھا؟', cesHint: '1 = بہت مشکل · 7 = بہت آسان',
    audioRec: 'صوتی نوٹ ریکارڈ کریں', audioRecording: 'ریکارڈ ہو رہا ہے…', audioStop: 'روکیں',
    audioSend: 'صوتی نوٹ بھیجیں', audioCancel: 'منسوخ کریں', audioPreview: 'پیش نظارہ',
    audioDenied: 'مائیکروفون تک رسائی مسترد کر دی گئی — براؤزر کی اجازتیں چیک کریں۔',
    audioQuotaWarn: 'صوتی نوٹوں کی اسٹوریج بھر گئی ہے — قدیم ترین نوٹ ہٹا دیے گئے۔',
  },
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
interface WMsg {
  id: string; from: 'visitor' | 'agent' | 'system'; text: string; ts: number;
  kind?: 'transfer' | 'audio'; transferTo?: string; transferNote?: string;
  audioUrl?: string; audioSecs?: number; // phase 4 (P4-17): voice-note playback
}
interface Prompt { id: string; text: string; dismissAfter: number }
interface HostOverride { enabled?: boolean; fields?: string[] }

function postToParent(type: string, payload: Record<string, unknown> = {}) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ t: `${NS}:${type}`, payload }, '*');
  } catch { /* not embedded */ }
}

/** Phase 5: human label for the callback "preferred time" window. */
function cbWhenLabel(when: string, custom: string): string {
  if (when === 'within-hour') return 'within the hour';
  if (when === 'afternoon') return 'this afternoon';
  if (when === 'tomorrow') return 'tomorrow morning';
  if (custom) {
    const d = new Date(custom);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return custom;
  }
  return 'a convenient time';
}

/** True when "now" falls inside the property's business hours (honest best-effort:
 *  computed in the property timezone via Intl; falls back to open when unknown). */
function withinHours(bh: P2PropertySettings['business_hours'], tz: string): boolean {
  if (!bh || bh.length === 0) return true;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday ?? '');
    const seg = bh.find((b) => b.day === dayIdx);
    if (!seg || !seg.open || !seg.close) return false;
    const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
    const now = toMin(`${parts.hour}:${parts.minute}`);
    return now >= toMin(seg.open) && now <= toMin(seg.close);
  } catch {
    return true;
  }
}

const validLang = (c: string | null): c is Lang => (LANGS as string[]).includes(c ?? '');

type Stage = 'loading' | 'home' | 'prechat' | 'offline' | 'callback' | 'chat' | 'ended';

export default function WidgetPage() {
  const [params] = useSearchParams();
  const api = getApi('demo', 'widget');

  const propertyKey = params.get('property') || params.get('key') || '';
  // phase 5: chat queue position — enabled by the loader flag (data-queue / boot({ queue: true }) → ?queue=1)
  const queueEnabled = params.get('queue') === '1';
  const queueProp = propertyKey || 'demo';
  const paramColor = params.get('color') || '';
  const paramGreeting = params.get('greeting') || '';
  const paramLocale = params.get('locale') || '';
  const visitorName = params.get('v') || '';
  const visitorEmail = params.get('e') || '';
  const visitorHash = params.get('h') || '';
  // Worker D (phase 3): widget color scheme. Precedence: ?theme= URL param
  // (loader data-theme / boot {theme}) → property branding theme → the last
  // choice stored for this property → light. 'auto' follows the OS setting
  // via prefers-color-scheme and is the only mode that consults it.
  const paramTheme = (params.get('theme') || '').toLowerCase();
  const THEME_KEY = `brixchat_widget_theme_v1:${propertyKey}`;
  const validTheme = (v: string) => v === 'light' || v === 'dark' || v === 'auto';

  const [property, setProperty] = useState<ApiProperty | null>(null);
  const [settings, setSettings] = useState<P2PropertySettings>(DEFAULT_SETTINGS);
  const [hostPrechat, setHostPrechat] = useState<HostOverride | null>(null);
  const [hostOffline, setHostOffline] = useState<HostOverride | null>(null);
  const [propError, setPropError] = useState('');
  const [stage, setStage] = useState<Stage>('loading');
  const [conv, setConv] = useState<ApiConversation | null>(null);
  const [msgs, setMsgs] = useState<WMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);       // simulated agent typing
  const [typingExt, setTypingExt] = useState(false); // host-driven agent typing
  const [showEmoji, setShowEmoji] = useState(false);
  const [menu, setMenu] = useState<null | 'main' | 'transcript'>(null);
  const [transcriptEmail, setTranscriptEmail] = useState('');
  const [transcriptDone, setTranscriptDone] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [faq, setFaq] = useState<ApiArticle[]>([]);
  const [faqOpen, setFaqOpen] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [formVals, setFormVals] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [sendingForm, setSendingForm] = useState(false);
  const [offlineDone, setOfflineDone] = useState(false);
  // phase 5: "Request a callback" form state
  const [cbName, setCbName] = useState('');
  const [cbPhone, setCbPhone] = useState('');
  const [cbTopic, setCbTopic] = useState('General question');
  const [cbWhen, setCbWhen] = useState('within-hour');
  const [cbCustom, setCbCustom] = useState('');
  const [cbErr, setCbErr] = useState('');
  const [cbSending, setCbSending] = useState(false);
  const [cbDoneLabel, setCbDoneLabel] = useState(''); // preferred-time label shown in the confirmation
  const [cbReturn, setCbReturn] = useState<'home' | 'chat'>('home');
  // phase 5: chat queue — entry id + live 1-based position in the shared queue
  const [queueId, setQueueId] = useState('');
  const [queuePos, setQueuePos] = useState(0);
  // phase 5: refs so the unmount cleanup below sees the current queue entry
  const queueIdRef = useRef('');
  const queuePropRef = useRef(queueProp);
  useEffect(() => {
    queueIdRef.current = queueId;
    queuePropRef.current = queueProp;
  }, [queueId, queueProp]);
  useEffect(() => () => {
    if (queueIdRef.current) leaveQueue(queuePropRef.current, queueIdRef.current);
  }, []);
  const [ratingComment, setRatingComment] = useState('');
  const [rateStep, setRateStep] = useState<'csat' | 'nps' | 'done'>('csat');
  const [csat, setCsat] = useState(0);
  const [nps, setNps] = useState(-1);
  const [depts, setDepts] = useState<Array<{ id: string; name: string }>>([]);
  const [deptId, setDeptId] = useState('');
  const [assignedAgent, setAssignedAgent] = useState<{ name: string; title: string } | null>(null);
  // Phase 4 widget features (P4-2/P4-3/P4-4/P4-13/P4-17)
  const [kbArticles, setKbArticles] = useState<ApiArticle[]>([]);
  const [kbQ, setKbQ] = useState('');
  const [kbArticle, setKbArticle] = useState<ApiArticle | null>(null);
  const [guideRun, setGuideRun] = useState<GuideRun | null>(null);
  const [guideStuck, setGuideStuck] = useState(false);
  const [surveyCfg, setSurveyCfg] = useState<SurveyConfig | null>(null);
  const [surveyReady, setSurveyReady] = useState(true);
  const [surveySuppressed, setSurveySuppressed] = useState(false);
  const [surveyKey, setSurveyKey] = useState('');
  const [surveyScore, setSurveyScore] = useState(-1); // -1 = no selection (NPS 0 is valid)
  const [recorder, setRecorder] = useState<ActiveRecorder | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const [audioPreview, setAudioPreview] = useState<AudioPreview | null>(null);
  const [audioWarn, setAudioWarn] = useState('');
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const s = localStorage.getItem('brixchat_widget_lang_v1');
      return validLang(s) ? s : 'en';
    } catch { return 'en'; }
  });
  // Persisted per-property theme choice (light/dark/auto); explicit param or
  // property-branding values overwrite it.
  const [storedTheme, setStoredTheme] = useState<string>(() => {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch { return ''; }
  });
  const [osDark, setOsDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches : false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const rawTheme = validTheme(paramTheme) ? paramTheme
    : validTheme(settings.theme || '') ? (settings.theme as string)
    : validTheme(storedTheme) ? storedTheme : 'light';
  const dark = rawTheme === 'dark' || (rawTheme === 'auto' && osDark);
  // Persist the resolved choice per property so the next visit matches.
  useEffect(() => {
    const chosen = validTheme(paramTheme) ? paramTheme
      : validTheme(settings.theme || '') ? (settings.theme as string) : '';
    if (chosen && chosen !== storedTheme) {
      try { localStorage.setItem(THEME_KEY, chosen); } catch { /* ignore */ }
      setStoredTheme(chosen);
    }
  }, [paramTheme, settings.theme, storedTheme, THEME_KEY]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const typingTimer = useRef<number>(0);
  const convRef = useRef<ApiConversation | null>(null);
  const chatStartedRef = useRef(false);
  const stageRef = useRef<Stage>('loading');
  const surveyCfgRef = useRef<SurveyConfig | null>(null);
  const recRef = useRef<ActiveRecorder | null>(null);
  // Phase 4: chat-start context (search tag / guide path) — set synchronously
  // before beginChat so pre-chat forms don't lose it across re-renders.
  const pendingCtxRef = useRef<{ tag?: string | null; firstVisitorMessage?: string | null } | null>(null);
  stageRef.current = stage;
  convRef.current = conv;

  const t = (k: string) => STR[lang][k] ?? STR.en[k] ?? k;
  const accent = paramColor || settings.widget_color || property?.widget_config.color || '#4f46e5';
  const w = property?.widget_config;
  // Worker D: branding — primary = widget_color, secondary = accent_color.
  // When no branding is set the pre-existing default theme is untouched.
  const hasBranding = Boolean(settings.brand_name || settings.logo_data_url || settings.accent_color);
  const agentDisplayName = w?.agent_name ?? 'Support';
  const brandName = settings.brand_name || agentDisplayName;
  const tagline = settings.tagline || '';
  const logoUrl = settings.logo_data_url || null;
  const accent2 = settings.accent_color || '#06b6d4';
  const agentInitials = agentDisplayName.split(' ').map((x) => x[0]).slice(0, 2).join('');
  const headerGradient = `linear-gradient(135deg, ${accent}, ${accent2})`;

  const prechatCfg = useMemo(() => ({
    enabled: hostPrechat?.enabled ?? settings.prechat_enabled,
    fields: hostPrechat?.fields ?? settings.prechat_fields,
  }), [hostPrechat, settings]);
  const offlineCfg = useMemo(() => ({
    enabled: hostOffline?.enabled ?? settings.offline_form_enabled,
    fields: hostOffline?.fields ?? settings.offline_form_fields,
  }), [hostOffline, settings]);

  const inHours = useMemo(() => withinHours(settings.business_hours, settings.timezone), [settings]);
  const status: 'online' | 'offline' = inHours ? 'online' : 'offline';
  const greeting =
    paramGreeting ||
    (status === 'online' ? settings.greeting_online : settings.greeting_offline) ||
    w?.greeting ||
    t('welcome');

  const setLanguage = (code: string) => {
    if (!validLang(code)) return;
    setLang(code);
    try { localStorage.setItem('brixchat_widget_lang_v1', code); } catch { /* ignore */ }
    postToParent('languageChanged', { code });
  };

  /* ---------- resolve property + settings ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyKey) {
        setPropError('Missing property key. Add data-property="bx_…" to the embed snippet.');
        return;
      }
      try {
        const { data: p } = await api.properties.getByPublicKey(propertyKey);
        if (cancelled) return;
        setProperty(p);
        // §9 settings — defensive: missing until Worker A lands
        let s = DEFAULT_SETTINGS;
        try {
          const ps = p2(api).propertySettings;
          if (ps) { const { data } = await ps.get(p.id); s = { ...DEFAULT_SETTINGS, ...data }; }
        } catch { /* keep defaults — widget still works */ }
        if (cancelled) return;
        setSettings(s);
        if (validLang(paramLocale)) { setLang(paramLocale); }
        else if (!localStorage.getItem('brixchat_widget_lang_v1') && validLang(s.language)) { setLang(s.language); }
        // Departments (Worker D follow-up): prefer api.departments.list, fall back to settings.departments
        try {
          const dep = p2(api).departments;
          let list: Array<{ id: string; name: string }> | null = null;
          if (dep) {
            const { data } = await dep.list(p.id);
            const items = Array.isArray(data) ? data : data.items;
            if (Array.isArray(items) && items.length) list = items.map((d) => ({ id: String(d.id), name: String(d.name) }));
          }
          if (!list && s.departments?.length) list = s.departments.map((d) => ({ id: String(d.id), name: String(d.name) }));
          if (!cancelled && list) setDepts(list);
        } catch { /* departments are optional */ }
        // KB articles: top 3 feed the FAQ quick-links, the full published set
        // feeds the phase-4 in-widget search (P4-3) + guide stepper (P4-4).
        try {
          const { data: kb } = await api.kb.list({ status: 'published', limit: 200 });
          if (!cancelled) { setFaq(kb.items.slice(0, 3)); setKbArticles(kb.items); }
        } catch { /* optional */ }
        // Phase 4 (P4-13): survey config — legacy two-step CSAT→NPS stays the
        // fallback until the dashboard worker lands the api feedback settings.
        try {
          const fb = p2(api).feedback;
          let raw: unknown = null;
          if (fb?.settings?.get) {
            const { data } = await fb.settings.get(p.id);
            raw = data;
          }
          if (!raw) raw = (s as unknown as { survey?: unknown }).survey ?? null;
          const sc = normalizeSurvey(raw);
          if (!cancelled && sc) { setSurveyCfg(sc); surveyCfgRef.current = sc; }
        } catch { /* legacy two-step fallback */ }
        // Phase 4 (P4-2): proactive triggers → forwarded to the loader (parent
        // page), which owns the exit-intent / idle / scroll-depth detectors and
        // the localStorage frequency caps (key brixchat_trigcap_<triggerId>).
        try {
          const tg = p2(api).triggers;
          if (tg?.list) {
            const { data } = await tg.list(p.id);
            const items = Array.isArray(data) ? data : ((data as { items?: unknown }).items ?? []);
            const norm = normalizeTriggers(items);
            if (!cancelled && norm.length) postToParent('proactiveTriggers', { triggers: norm });
          }
        } catch { /* triggers land with the dashboard worker's api pass */ }
        if (cancelled) return;
        setStage('home');
        postToParent('ready', { property: propertyKey, secureHash: Boolean(visitorHash) });
        postToParent('status', { status: withinHours(s.business_hours, s.timezone) ? 'online' : 'offline' });
      } catch {
        if (!cancelled) setPropError(`Unknown property key "${propertyKey}". Check the embed snippet in Admin → Install.`);
      }
    })();
    const pending = timers.current;
    return () => { cancelled = true; pending.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyKey]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, typing, typingExt, stage]);

  /* ---------- parent commands ---------- */
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { t?: string; cmd?: string; payload?: Record<string, unknown> };
      if (!d || d.t !== `${NS}:cmd`) return;
      const payload = d.payload ?? {};
      switch (d.cmd) {
        case 'config': {
          const v = payload.visitor as { name?: string; email?: string; hash?: string } | undefined;
          if (v?.name || v?.email) {
            setAttributes((a) => ({ ...a, _visitor_name: v.name ?? '', _visitor_email: v.email ?? '' }));
          }
          if (payload.prechat) setHostPrechat(payload.prechat as HostOverride);
          if (payload.offline) setHostOffline(payload.offline as HostOverride);
          if (typeof payload.locale === 'string' && validLang(payload.locale)) setLang(payload.locale);
          break;
        }
        case 'language': {
          const code = payload.code as string;
          if (validLang(code)) setLanguage(code);
          break;
        }
        case 'prompt': {
          const p = payload as { id?: string; text?: string; delay?: number; dismissAfter?: number };
          const text = String(p.text ?? '').slice(0, 300);
          if (!text) break;
          const id = p.id || uid('prompt');
          const delay = Math.max(0, Math.min(Number(p.delay) || 0, 120000));
          timers.current.push(window.setTimeout(() => {
            setPrompts((q) => [...q, { id, text, dismissAfter: p.dismissAfter === 0 ? 0 : Math.max(5000, Math.min(Number(p.dismissAfter) || 20000, 300000)) }]);
            postToParent('promptShown', { id });
          }, delay));
          break;
        }
        case 'emailTranscript': {
          const em = String((payload as { email?: string }).email ?? '').trim();
          if (em) void requestTranscript(em);
          else if (stageRef.current === 'chat') { setMenu('transcript'); setTranscriptDone(false); }
          break;
        }
        case 'requestCallback': { // phase 5
          openCallback(stageRef.current === 'chat' ? 'chat' : 'home');
          break;
        }
        case 'typing':
          setTypingExt(Boolean((payload as { active?: boolean }).active));
          break;
        case 'transfer': {
          // Worker D follow-up: host/agent-side transfer → distinct notice in the timeline
          const pl = payload as { to?: string; agent?: string; department?: string; note?: string };
          const to = String(pl.to ?? pl.agent ?? pl.department ?? '').slice(0, 120);
          const note = String(pl.note ?? '').slice(0, 300);
          pushLocal({ from: 'system', kind: 'transfer', text: '', transferTo: to || undefined, transferNote: note || undefined });
          if (pl.agent) resolveAgent(null, pl.agent).then(setAssignedAgent).catch(() => {});
          break;
        }
        case 'setVisitor': {
          const v = payload.visitor as { name?: string; email?: string } | undefined;
          if (v) setAttributes((a) => ({ ...a, _visitor_name: v.name ?? '', _visitor_email: v.email ?? '' }));
          break;
        }
        case 'setAttributes':
          setAttributes((a) => ({ ...a, ...((payload.attributes as Record<string, string>) ?? {}) }));
          break;
        case 'setTags':
          setTags((payload.tags as string[]) ?? []);
          break;
        case 'trackEvent':
          setAttributes((a) => ({ ...a, _last_event: String((payload as { name?: string }).name ?? '') }));
          break;
        case 'endChat':
          void endChat();
          break;
        case 'reset':
          window.location.reload();
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Escape closes the panel (ARIA) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') postToParent('close');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- chat core ---------- */
  const pushLocal = (m: Omit<WMsg, 'id' | 'ts'>) =>
    setMsgs((prev) => [...prev, { ...m, id: uid('w'), ts: Date.now() }]);

  /* ---------- agent identity (Worker D follow-up) ---------- */
  // Resolve the routed/assigned agent's display name + job title for the chat
  // header. api.members.get (Worker A §9) is optional — falls back to the
  // name the router returned, then to the brand name in the header.
  const resolveAgent = async (agentId: string | null, fallbackName: string | null) => {
    let name = fallbackName ?? '';
    let title = '';
    try {
      const m = p2(api).members;
      if (m && agentId) {
        const { data } = await m.get(agentId);
        name = data.display_name ?? data.name ?? name;
        title = data.title ?? data.job_title ?? '';
      }
    } catch { /* keep the router's name */ }
    return name ? { name, title } : null;
  };

  // phase 5: keep the displayed queue position live while the visitor waits
  useEffect(() => {
    if (!queueEnabled || !queueId || stage !== 'chat') return;
    const iv = window.setInterval(() => {
      const p = queuePosition(queueProp, queueId);
      setQueuePos(p);
      if (p === 0) { setQueueId(''); window.clearInterval(iv); }
    }, 10000);
    return () => window.clearInterval(iv);
  }, [queueEnabled, queueId, stage, queueProp]);

  const beginChat = async (opts?: { tag?: string | null; firstVisitorMessage?: string | null }) => {
    const p = property;
    if (!p) return;
    setStage('chat');
    // phase 5: join the shared chat queue when the property has it enabled
    if (queueEnabled) {
      const { id, position } = joinQueue(queueProp, formVals.name || visitorName || undefined);
      setQueueId(id);
      setQueuePos(position);
    }
    const { data: c } = await api.conversations.startSession(p.id, {
      name: formVals.name || visitorName || undefined,
      email: formVals.email || visitorEmail || undefined,
      page_url: document.referrer || '',
    });
    if (c.messages[0]) c.messages[0].text = greeting;
    // Worker D follow-up: route by chosen department, then resolve the agent
    let agentId: string | null = c.agent_id ?? null;
    let agentName: string | null = c.agent_name ?? null;
    let deptName: string | undefined = formVals.department || undefined;
    if (deptId) {
      try {
        const rt = p2(api).routing;
        if (rt) {
          const { data: r } = await rt.routeChat(p.id, deptId);
          agentId = r.agent_id ?? agentId;
          agentName = r.agent_name ?? agentName;
          deptName = r.department_name ?? deptName;
        }
      } catch { /* routing is best-effort; chat continues unrouted */ }
    }
    if (agentId || agentName) {
      const resolved = await resolveAgent(agentId, agentName);
      if (resolved) setAssignedAgent(resolved);
    }
    // P4-3: tag the new conversation (e.g. the searched query) — best-effort.
    const extraTags = [...new Set([...tags, ...(opts?.tag ? [opts.tag] : [])])];
    let convTags = c.tags;
    if (extraTags.length) {
      try {
        const { data: updated } = await api.conversations.setTags(c.id, extraTags);
        convTags = updated.tags;
      } catch { /* tags are best-effort */ }
    }
    setConv({ ...c, agent_id: agentId, agent_name: agentName, department: deptName ?? c.department, tags: convTags });
    setMsgs(c.messages.map((m) => {
      // transfer notices (Worker A may mark them kind:'transfer' or metadata.transfer)
      const raw = m as unknown as { kind?: string; metadata?: Record<string, unknown> };
      const isTransfer = raw.kind === 'transfer' || Boolean(raw.metadata?.transfer);
      // phase 4 (P4-17): voice notes arrive as kind 'audio' with the playback
      // URL / duration in metadata (dashboard worker's ChatThread pass).
      const isAudio = raw.kind === 'audio';
      const meta = raw.metadata ?? {};
      return {
        id: m.id,
        from: m.sender === 'visitor' ? 'visitor' : m.sender === 'system' ? 'system' : 'agent',
        text: m.text, ts: new Date(m.created_at).getTime(),
        kind: isTransfer ? ('transfer' as const) : isAudio ? ('audio' as const) : undefined,
        transferTo: isTransfer ? String(meta.transfer_to ?? meta.to ?? '') || undefined : undefined,
        transferNote: isTransfer ? String(meta.note ?? '') || undefined : undefined,
        audioUrl: isAudio ? audioUrlForMessage(String(meta.audio_message_id ?? ''), String(meta.audio_url ?? '')) : undefined,
        audioSecs: isAudio ? Number(meta.audio_duration_secs ?? 0) || undefined : undefined,
      } as WMsg;
    }));
    const firstMsg = opts?.firstVisitorMessage;
    if (firstMsg) {
      // P4-4: escalated guide path — posted as the visitor's first message so
      // the transcript shows exactly where they were in the guide.
      const text = firstMsg.slice(0, 500);
      pushLocal({ from: 'visitor', text });
      postToParent('message', { dir: 'out', message: { text } });
      void api.conversations.sendMessage(c.id, { sender: 'visitor', text }).catch(() => {});
      if (!chatStartedRef.current) {
        chatStartedRef.current = true;
        postToParent('chatStarted', {
          conversation_id: c.id,
          visitor: { name: c.visitor_name, attributes, tags: convTags },
          identity_hash: Boolean(visitorHash),
        });
      }
    }
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  const send = (text: string) => {
    const tx = text.trim();
    if (!tx || !convRef.current) return;
    const c = convRef.current;
    pushLocal({ from: 'visitor', text: tx });
    setInput('');
    postToParent('message', { dir: 'out', message: { text: tx } });
    if (!chatStartedRef.current) {
      chatStartedRef.current = true;
      postToParent('chatStarted', {
        conversation_id: c.id,
        visitor: { name: c.visitor_name, attributes, tags },
        identity_hash: Boolean(visitorHash),
      });
    }
    void api.conversations.sendMessage(c.id, { sender: 'visitor', text: tx });
    setTyping(true);
    const reply = botReply(tx);
    timers.current.push(window.setTimeout(() => {
      const cc = convRef.current;
      setTyping(false);
      pushLocal({ from: 'agent', text: reply });
      postToParent('message', { dir: 'in', message: { text: reply } });
      if (cc) void api.conversations.sendMessage(cc.id, { sender: 'agent', text: reply });
    }, 1200 + Math.random() * 1200));
  };

  const onInput = (v: string) => {
    setInput(v);
    postToParent('typing', { active: true });
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => postToParent('typing', { active: false }), 2500);
  };

  const endChat = async () => {
    // phase 5: leave the shared chat queue
    if (queueId) {
      leaveQueue(queueProp, queueId);
      setQueueId('');
      setQueuePos(0);
    }
    const c = convRef.current;
    if (c) {
      await api.conversations.setStatus(c.id, 'closed');
      postToParent('chatEnded', { conversation_id: c.id });
    } else {
      postToParent('chatEnded', {});
    }
    // P4-13: suppression (no re-survey of the same contact within the
    // cooldown) + configurable delay after resolve before the survey shows.
    const sc = surveyCfgRef.current;
    if (sc) {
      const contactKey = (visitorEmail || formVals.email || visitorHash || 'anon').toLowerCase();
      const key = `brixchat_survey_last_v1:${propertyKey}:${contactKey}`;
      let last = 0;
      try { last = Number(localStorage.getItem(key)) || 0; } catch { /* ignore */ }
      if (last && Date.now() - last < (sc.cooldown_days || 7) * 86400000) {
        setSurveySuppressed(true);
      } else {
        setSurveySuppressed(false);
        setSurveyKey(key);
      }
      const delayMs = Math.max(0, Math.min((sc.delay_secs || 0) * 1000, 300000));
      setSurveyReady(delayMs === 0);
      if (delayMs > 0) timers.current.push(window.setTimeout(() => setSurveyReady(true), delayMs));
    } else {
      setSurveySuppressed(false);
      setSurveyReady(true);
      setSurveyKey('');
    }
    setSurveyScore(0);
    setRatingComment('');
    setStage('ended');
  };

  /* ---------- two-step rating: CSAT 1–5 → NPS 0–10 (Worker D) ---------- */
  // Defensive: ratings.create (Worker A §9) is optional until landed; the
  // satisfaction event + conversation rating keep working either way.
  const postRating = (kind: 'csat' | 'nps', score: number, comment: string) => {
    const c = convRef.current;
    const r = p2(api).ratings;
    if (c && r) {
      void r.create({
        property_id: c.property_id,
        conversation_id: c.id,
        agent_id: c.agent_id,
        kind, score,
        comment: comment.trim() || undefined,
      }).catch(() => { /* local-only: never break the widget on a write failure */ });
    }
    if (c) {
      postToParent('ratingSubmitted', { kind, score, conversation_id: c.id });
    } else {
      postToParent('ratingSubmitted', { kind, score });
    }
  };

  const submitCsat = () => {
    const c = convRef.current;
    if (c && csat > 0) void api.conversations.setRating(c.id, csat);
    postToParent('satisfaction', { rating: csat, comment: ratingComment.trim() });
    postRating('csat', csat, ratingComment);
    setRateStep('nps');
  };

  const submitNps = () => {
    postRating('nps', nps, ratingComment);
    pushLocal({ from: 'system', text: t('csatThanks') });
    setRateStep('done');
  };

  /* ---------- phase 4: configured survey (P4-13: csat | nps | ces) ---------- */
  // ratings.create (api §9) only models csat/nps; a CES answer is emitted via
  // ratingSubmitted and logged locally until the backend phase models it.
  const submitSurvey = () => {
    const sc = surveyCfgRef.current;
    if (!sc || surveyScore < 0) return;
    const c = convRef.current;
    const comment = ratingComment.trim();
    if (c && sc.type === 'csat') void api.conversations.setRating(c.id, surveyScore).catch(() => {});
    if (c && sc.type !== 'ces') {
      postRating(sc.type, surveyScore, comment);
    } else {
      postToParent('ratingSubmitted', { kind: sc.type, score: surveyScore, ...(c ? { conversation_id: c.id } : {}) });
    }
    if (sc.type === 'csat') postToParent('satisfaction', { rating: surveyScore, comment });
    if (surveyKey) {
      try { localStorage.setItem(surveyKey, String(Date.now())); } catch { /* ignore */ }
    }
    setRateStep('done');
  };

  /* ---------- phase 4: in-widget KB search (P4-3) + guide trees (P4-4) ---------- */
  const kbResults = useMemo(() => rankKb(kbArticles, kbQ), [kbArticles, kbQ]);

  const openKbArticle = (a: ApiArticle) => {
    const steps = guideStepsOf(a);
    if (articleKindOf(a) === 'guide' && steps.length) {
      setGuideRun({ article: a, steps, idx: 0, trail: [0], choices: [] });
      setGuideStuck(false);
      setKbArticle(null);
    } else {
      setKbArticle(a);
      setGuideRun(null);
    }
  };

  const closeKb = () => {
    setKbArticle(null);
    setGuideRun(null);
    setGuideStuck(false);
  };

  /** "Still need help → start chat": the searched query lands on the new
   *  conversation as a tag (P4-3 acceptance). */
  const startChatFromSearch = () => {
    const q = kbQ.trim().slice(0, 40);
    setKbQ('');
    closeKb();
    startFromHome(q ? { tag: `search:${q.toLowerCase()}` } : undefined);
  };

  const chooseGuideOption = (i: number) => {
    setGuideStuck(false);
    setGuideRun((g) => {
      if (!g) return g;
      const step = g.steps[g.idx];
      const opt = step?.options[i];
      if (!opt) return g;
      const ni = g.steps.findIndex((s) => s.id === opt.next_step_id);
      if (ni < 0) return g;
      return {
        ...g,
        idx: ni,
        trail: [...g.trail, ni],
        choices: [...g.choices, { stepId: step.id, label: opt.label }],
      };
    });
  };

  const guideBack = () => {
    setGuideStuck(false);
    setGuideRun((g) => {
      if (!g || g.trail.length < 2) return g;
      const trail = g.trail.slice(0, -1);
      return { ...g, idx: trail[trail.length - 1], trail, choices: g.choices.slice(0, -1) };
    });
  };

  /** Abandon mid-guide → suggest chat with the visited path attached (P4-4). */
  const escalateFromGuide = () => {
    const g = guideRun;
    if (!g) return;
    const path = g.choices.map((c) => c.label).join(' → ');
    const firstVisitorMessage =
      `I followed the guide “${g.article.title}”` +
      (path ? ` (my path: ${path})` : '') +
      ' and I still need help.';
    closeKb();
    setKbQ('');
    startFromHome({ tag: `guide:${g.article.slug}`, firstVisitorMessage });
  };

  /* ---------- phase 4: voice notes (P4-17) ---------- */
  const startRecording = async () => {
    setAudioWarn('');
    if (recRef.current) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-mic');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const startedAt = Date.now();
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        setAudioPreview({ url: URL.createObjectURL(blob), blob, secs });
      };
      rec.start();
      const tickId = window.setInterval(() => {
        const s = Math.round((Date.now() - startedAt) / 1000);
        setRecSecs(s);
        if (s >= 120) void stopRecording(); // 2-minute cap per note
      }, 500);
      const active: ActiveRecorder = { rec, startedAt, tickId, stream };
      recRef.current = active;
      setRecorder(active);
      setRecSecs(0);
    } catch {
      setAudioWarn(t('audioDenied'));
    }
  };

  const stopRecording = () => {
    const r = recRef.current;
    if (!r) return;
    window.clearInterval(r.tickId);
    recRef.current = null;
    setRecorder(null);
    if (r.rec.state !== 'inactive') r.rec.stop(); // onstop builds the preview
    else r.stream.getTracks().forEach((tr) => tr.stop());
  };

  const cancelRecording = () => {
    const r = recRef.current;
    if (r) {
      window.clearInterval(r.tickId);
      recRef.current = null;
      setRecorder(null);
      r.rec.onstop = null; // don't build a preview for a cancelled take
      try { if (r.rec.state !== 'inactive') r.rec.stop(); } catch { /* ignore */ }
      r.stream.getTracks().forEach((tr) => tr.stop());
    }
    setAudioPreview(null);
    setRecSecs(0);
  };

  /** Persist the blob in localStorage, size-capped: oldest notes are evicted
   *  first; a clear warning shows when nothing more fits. */
  const persistAudioBlob = (id: string, blob: Blob, secs: number) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const key = `${AUDIO_PREFIX}${id}`;
      const entry = JSON.stringify({ u: dataUrl, s: secs, at: Date.now() });
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          localStorage.setItem(key, entry);
          // swap the in-memory object URL for the persisted data URL
          setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, audioUrl: dataUrl } : m)));
          return;
        } catch {
          try {
            let oldest: string | null = null;
            let oldestAt = Infinity;
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith(AUDIO_PREFIX) && k !== key) {
                try {
                  const at = Number((JSON.parse(localStorage.getItem(k) || '{}') as { at?: unknown }).at) || 0;
                  if (at < oldestAt) { oldestAt = at; oldest = k; }
                } catch { /* ignore */ }
              }
            }
            if (oldest) {
              localStorage.removeItem(oldest);
              setAudioWarn(t('audioQuotaWarn'));
              continue; // retry the write once after evicting
            }
          } catch { /* ignore */ }
          setAudioWarn(t('audioQuotaWarn'));
          return;
        }
      }
      setAudioWarn(t('audioQuotaWarn'));
    };
    reader.onerror = () => setAudioWarn(t('audioQuotaWarn'));
    reader.readAsDataURL(blob);
  };

  const sendAudio = () => {
    const pv = audioPreview;
    const c = convRef.current;
    if (!pv || !c) return;
    const id = uid('w');
    const label = `[voice note · ${pv.secs}s]`;
    setMsgs((prev) => [...prev, {
      id, from: 'visitor', text: label, ts: Date.now(),
      kind: 'audio' as const, audioUrl: pv.url, audioSecs: pv.secs,
    }]);
    postToParent('message', { dir: 'out', message: { text: label, kind: 'audio', audio_duration_secs: pv.secs } });
    // Shared contract (types.ts) adds kind 'audio'; api.ts MsgKind gains it on
    // the dashboard worker's pass — sendMessage stores kind verbatim (no validation).
    void api.conversations.sendMessage(c.id, {
      sender: 'visitor',
      text: label,
      kind: 'audio' as 'voice',
      metadata: { audio_duration_secs: pv.secs, audio_message_id: id },
    }).catch(() => { /* voice metadata is best-effort; the note already rendered locally */ });
    if (!chatStartedRef.current) {
      chatStartedRef.current = true;
      postToParent('chatStarted', {
        conversation_id: c.id,
        visitor: { name: c.visitor_name, attributes, tags },
        identity_hash: Boolean(visitorHash),
      });
    }
    persistAudioBlob(id, pv.blob, pv.secs);
    setAudioPreview(null);
    setRecSecs(0);
    setAudioWarn('');
  };

  /* ---------- pre-chat form ---------- */
  const startFromHome = (opts?: { tag?: string | null; firstVisitorMessage?: string | null }) => {
    setFormVals({}); setFormErr(''); setDeptId('');
    pendingCtxRef.current = opts ?? null;
    if (prechatCfg.enabled) setStage('prechat');
    else void beginChat(pendingCtxRef.current ?? undefined);
  };

  const submitPrechat = (e: React.FormEvent) => {
    e.preventDefault();
    const required = prechatCfg.fields.filter((f) => ['name', 'email', 'message'].includes(f));
    for (const f of required) {
      if (!formVals[f]?.trim()) { setFormErr(`${t(f)} — required`); return; }
      if (f === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formVals.email)) { setFormErr(`${t('email')} — invalid`); return; }
    }
    setFormErr('');
    postToParent('prechatSubmitted', { values: formVals });
    void beginChat(pendingCtxRef.current ?? undefined);
    pendingCtxRef.current = null;
  };

  /* ---------- offline form → ticket (defensive) ---------- */
  const submitOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    const req = offlineCfg.fields.filter((f) => ['name', 'email', 'message'].includes(f));
    const bad = req.some((f) => !formVals[f]?.trim())
      || (req.includes('email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formVals.email ?? ''));
    if (bad) { setFormErr(t('offlineHint')); return; }
    setFormErr(''); setSendingForm(true);
    const payload = {
      property_id: property?.id ?? '',
      subject: `Offline message from ${formVals.name}`,
      message: formVals.message,
      requester_name: formVals.name, requester_email: formVals.email,
      status: 'open', priority: 'medium',
    };
    let ticketId: string | undefined; let queued = false;
    try {
      const tk = p2(api).tickets;
      if (tk && property) {
        const { data } = await tk.create(payload);
        ticketId = data.id;
      } else {
        throw new Error('no-tickets-api');
      }
    } catch {
      // tickets.create not implemented yet (Worker A) — queue locally, honestly
      queued = true;
      try {
        const raw = localStorage.getItem('brixchat_offline_queue_v1');
        const q = raw ? (JSON.parse(raw) as unknown[]) : [];
        q.unshift({ ...payload, at: Date.now() });
        localStorage.setItem('brixchat_offline_queue_v1', JSON.stringify(q.slice(0, 50)));
      } catch { /* ignore */ }
    }
    setSendingForm(false);
    setOfflineDone(true);
    postToParent('offlineSubmitted', { queued, ticket_id: ticketId, values: { name: formVals.name, email: formVals.email } });
  };

  /* ---------- phase 5: "Request a callback" → ticket (defensive) ---------- */
  const openCallback = (from: 'home' | 'chat') => {
    setCbName(visitorName || formVals.name || '');
    setCbPhone('');
    setCbTopic('General question');
    setCbWhen('within-hour');
    setCbCustom('');
    setCbErr('');
    setCbSending(false);
    setCbDoneLabel('');
    setCbReturn(from);
    setMenu(null);
    setStage('callback');
  };

  const submitCallback = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = cbPhone.trim();
    if (phone.replace(/\D/g, '').length < 7) { setCbErr(t('callbackPhoneErr')); return; }
    const name = cbName.trim() || visitorName || formVals.name || 'Website visitor';
    const whenLabel = cbWhenLabel(cbWhen, cbCustom);
    setCbErr('');
    setCbSending(true);
    const payload = {
      property_id: property?.id ?? '',
      subject: `Callback request from ${name}`,
      message: `Phone: ${phone}\nTopic: ${cbTopic}\nPreferred time: ${whenLabel}\n\nRequested through the website widget.`,
      requester_name: name,
      requester_email: visitorEmail || formVals.email || '',
      priority: cbWhen === 'within-hour' ? 'high' : 'medium',
      tags: ['callback', 'widget'],
    };
    let ticketId: string | undefined; let queued = false;
    try {
      const tk = p2(api).tickets;
      if (tk && property) {
        const { data } = await tk.create(payload);
        ticketId = data.id;
      } else {
        throw new Error('no-tickets-api');
      }
    } catch {
      // same honest fallback as the offline form: queue locally
      queued = true;
      try {
        const raw = localStorage.getItem('brixchat_callback_queue_v1');
        const q = raw ? (JSON.parse(raw) as unknown[]) : [];
        q.unshift({ ...payload, at: Date.now() });
        localStorage.setItem('brixchat_callback_queue_v1', JSON.stringify(q.slice(0, 50)));
      } catch { /* ignore */ }
    }
    setCbSending(false);
    setCbDoneLabel(whenLabel);
    postToParent('callbackRequested', { queued, ticket_id: ticketId, values: { name, phone } });
  };

  /* ---------- transcript (logged locally; email = backend phase) ---------- */
  const requestTranscript = async (email: string) => {
    const em = email.trim();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return;
    const text = msgs.map((m) => `[${new Date(m.ts).toLocaleString()}] ${m.from}: ${m.text}`).join('\n');
    try {
      const n = p2(api).notifications;
      if (n) await n.push('system', 'Transcript requested', `Visitor asked for the transcript at ${em} (${text.length} chars). Email sending activates with the backend phase.`);
    } catch { /* optional */ }
    try {
      const raw = localStorage.getItem('brixchat_transcript_requests_v1');
      const q = raw ? (JSON.parse(raw) as unknown[]) : [];
      q.unshift({ email: em, chars: text.length, at: Date.now(), transcript: text.slice(0, 20000) });
      localStorage.setItem('brixchat_transcript_requests_v1', JSON.stringify(q.slice(0, 20)));
    } catch { /* ignore */ }
    setTranscriptDone(true);
    postToParent('transcriptRequested', { email: em, chars: text.length, saved: true });
  };

  /* ---------- attachment: honest local file-note, no fake upload ---------- */
  const onFile = () => {
    const f = fileRef.current?.files?.[0];
    if (!f || !convRef.current) return;
    const note = `📎 ${f.name} ${t('fileNote')}`;
    pushLocal({ from: 'visitor', text: note });
    postToParent('message', { dir: 'out', message: { text: note, kind: 'file-note', filename: f.name } });
    void api.conversations.sendMessage(convRef.current.id, { sender: 'visitor', text: note });
    if (fileRef.current) fileRef.current.value = '';
  };

  const dismissPrompt = (id: string, reason: string) => {
    setPrompts((q) => q.filter((p) => p.id !== id));
    postToParent('promptDismissed', { id, reason });
  };

  /* ---------- form field renderer (pre-chat + offline share it) ---------- */
  const renderField = (f: string) => {
    const val = formVals[f] ?? '';
    const set = (v: string) => setFormVals((p) => ({ ...p, [f]: v }));
    const label = t(f) === f ? f : t(f);
    const cls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500 bg-white dark:bg-slate-900';
    if (f === 'department' && depts.length) {
      return (
        <label key={f} className="block">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{t('chooseTeam')}</span>
          <select value={deptId} onChange={(e) => {
            const id = e.target.value;
            setDeptId(id);
            // keep formVals.department as the human-readable name (back-compat for prechatSubmitted)
            set(depts.find((x) => x.id === id)?.name ?? '');
          }} className={cls} aria-label={t('chooseTeam')}>
            <option value="">{t('chooseTeam')}</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      );
    }
    if (f === 'message') {
      return (
        <label key={f} className="block">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{t('message')}</span>
          <textarea value={val} onChange={(e) => set(e.target.value)} rows={3} className={cx(cls, 'resize-none')} aria-label={t('message')} />
        </label>
      );
    }
    return (
      <label key={f} className="block">
        <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</span>
        <input value={val} onChange={(e) => set(e.target.value)}
          type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
          autoComplete={f === 'email' ? 'email' : f === 'name' ? 'name' : 'off'}
          className={cls} aria-label={label} />
      </label>
    );
  };

  /* ================================================================== */
  if (propError) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl mb-3" aria-hidden>🧱</div>
          <div className="font-bold text-slate-900 dark:text-slate-50 mb-1">Widget not configured</div>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{propError}</p>
        </div>
      </div>
    );
  }

  if (!property || !w || stage === 'loading') {
    return (
      <div className="h-screen w-screen grid place-items-center bg-white dark:bg-slate-900" role="status" aria-label="Loading">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="typing-dot w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
          ))}
        </div>
      </div>
    );
  }

  const radius = w.bubble === 'pill' ? 24 : w.bubble === 'square' ? 6 : 16;
  const showAgentTyping = typing || typingExt;

  /* P4-4: guided troubleshooting stepper — options branch between steps,
   *  Back walks the visited trail, and abandoning mid-guide offers chat with
   *  the visited path attached. */
  const renderGuide = () => {
    const g = guideRun;
    if (!g) return null;
    const step = g.steps[g.idx];
    if (!step) return null;
    const terminal = step.options.length === 0;
    const exitGuide = () => {
      if (g.choices.length > 0 && !terminal) setGuideStuck(true);
      else closeKb();
    };
    return (
      <div>
        <button onClick={exitGuide}
          className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline">
          ← {t('kbBackToResults')}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: accent }}>{t('kbGuide')}</span>
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">{g.article.title}</h1>
        </div>
        {guideStuck ? (
          <div className="mt-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('guideStillStuck')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('guideYourPath')}: {g.choices.map((c) => c.label).join(' → ')}
            </p>
            <button onClick={escalateFromGuide}
              className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: accent }}>
              💬 {t('startChat')}
            </button>
            <button onClick={() => setGuideStuck(false)}
              className="mt-2 w-full text-xs text-slate-400 dark:text-slate-500 underline">{t('dismiss')}</button>
          </div>
        ) : (
          <div className="mt-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">{step.title}</h2>
            {step.body && (
              <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap">{step.body}</p>
            )}
            {!terminal ? (
              <div className="mt-3 space-y-2" role="group" aria-label={step.title}>
                {step.options.map((o, i) => (
                  <button key={i} onClick={() => chooseGuideOption(i)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 text-start hover:border-brix-400">
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={escalateFromGuide}
                className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: accent }}>
                💬 {t('startChat')}
              </button>
            )}
            <div className="mt-3 flex items-center gap-2">
              {g.trail.length > 1 && (
                <button onClick={guideBack}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  ← {t('guideBack')}
                </button>
              )}
              <button
                onClick={() => { setGuideStuck(false); setGuideRun({ ...g, idx: 0, trail: [0], choices: [] }); }}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 underline">
                {t('guideRestart')}
              </button>
            </div>
            {g.choices.length > 0 && (
              <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                {t('guideYourPath')}: {g.choices.map((c) => c.label).join(' → ')}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  /* branded header strip for pre-chat / offline forms (only when branding set) */
  const BrandStrip = () => hasBranding ? (
    <div className="-mx-5 -mt-6 mb-4 px-5 py-2.5 flex items-center gap-2.5" style={{ background: headerGradient }}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover bg-white/20 shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center text-white text-xs font-bold shrink-0" aria-hidden>
          {agentInitials}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-white text-sm font-bold leading-tight truncate">{brandName}</div>
        {tagline && <div className="text-white/85 text-[11px] leading-tight truncate">{tagline}</div>}
      </div>
    </div>
  ) : null;

  return (
    <div className={cx('h-screen w-screen flex flex-col bg-white dark:bg-slate-900 overflow-hidden brix-widget-panel', dark && 'dark')}
      style={{ fontFamily: 'Inter, system-ui, sans-serif', colorScheme: dark ? 'dark' : 'light' }}
      dir={RTL[lang] ? 'rtl' : 'ltr'} role="dialog" aria-modal="false" aria-label={t('chatPanel')}>
      {/* header */}
      <div className="px-4 py-3.5 flex items-center gap-3 text-white shrink-0" style={{ background: headerGradient }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white/20 shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center font-bold shrink-0" aria-hidden>
            {agentInitials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {stage === 'chat' && assignedAgent ? (
            <>
              <div className="font-bold text-[15px] leading-tight truncate">{t('chattingWith')} {assignedAgent.name}</div>
              <div className="text-xs text-white/85 truncate">
                {assignedAgent.title || (status === 'online' ? t('onlineNow') : t('offlineNow'))}
              </div>
            </>
          ) : (
            <>
              <div className="font-bold text-[15px] leading-tight truncate">{brandName}</div>
              <div className="text-xs text-white/85 flex items-center gap-1.5">
                <span className="relative flex w-2 h-2" aria-hidden>
                  <span className={cx('absolute inline-flex h-full w-full rounded-full', status === 'online' ? 'bg-emerald-300 animate-ping-soft' : 'bg-amber-300')} />
                  <span className={cx('relative inline-flex rounded-full h-2 w-2', status === 'online' ? 'bg-emerald-300' : 'bg-amber-300')} />
                </span>
                {status === 'online' ? t('onlineNow') : t('offlineNow')}
              </div>
              {tagline && <div className="text-[11px] text-white/80 leading-tight truncate mt-0.5">{tagline}</div>}
            </>
          )}
        </div>
        {(stage === 'chat') && (
          <button onClick={() => setMenu(menu === 'main' ? null : 'main')}
            className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/20 text-white/90 font-bold"
            aria-label={t('menuLabel')} aria-expanded={menu !== null}>⋯</button>
        )}
        <button onClick={() => postToParent('close')}
          className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/20 text-white/90"
          aria-label={t('closeChat')}>✕</button>
      </div>

      {/* chat menu */}
      {menu && stage === 'chat' && (
        <div className="absolute top-16 end-3 z-20 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1" role="menu">
          {menu === 'main' ? (
            <>
              <div className="px-2 py-1 text-xs font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">{t('menuLabel')}</div>
              <button onClick={() => { setMenu('transcript'); setTranscriptDone(false); }}
                className="w-full text-start px-3 py-2 rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-200" role="menuitem">
                ✉️ {t('transcriptTitle')}
              </button>
              {/* phase 5: "Request a callback" */}
              <button onClick={() => openCallback('chat')}
                className="w-full text-start px-3 py-2 rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-200" role="menuitem">
                📞 {t('requestCallback')}
              </button>
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                <span aria-hidden>🌐</span>
                <select value={lang} onChange={(e) => setLanguage(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none" aria-label={t('languageLabel')}>
                  {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
                </select>
              </label>
              <button onClick={() => { setMenu(null); void endChat(); }}
                className="w-full text-start px-3 py-2 rounded-xl text-sm hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400" role="menuitem">
                ⏻ {t('endChat')}
              </button>
            </>
          ) : (
            <>
              {hasBranding && (
                <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-100 dark:border-slate-800 mb-1">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0" style={{ background: accent }} aria-hidden>{agentInitials}</div>
                  )}
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{brandName}</span>
                </div>
              )}
              <div className={cx('px-2 py-1 text-xs font-bold uppercase tracking-wide', !hasBranding && 'text-slate-500 dark:text-slate-400 dark:text-slate-500')}
                style={{ color: hasBranding ? accent : undefined }}>{t('transcriptTitle')}</div>
              {transcriptDone ? (
                <div className="px-2 py-2">
                  <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t('transcriptDone')}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{t('transcriptHint')}</p>
                  <button onClick={() => setMenu(null)} className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300 underline">{t('dismiss')}</button>
                </div>
              ) : (
                <div className="px-2 py-1 space-y-2">
                  <input value={transcriptEmail} onChange={(e) => setTranscriptEmail(e.target.value)}
                    type="email" placeholder={t('transcriptPh')} aria-label={t('email')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-brix-500/40" />
                  <div className="flex gap-2">
                    <button onClick={() => void requestTranscript(transcriptEmail)} disabled={!transcriptEmail.trim()}
                      className="flex-1 px-3 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: accent }}>
                      {t('transcriptSend')}
                    </button>
                    <button onClick={() => setMenu('main')} className="px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800">{t('dismiss')}</button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{t('transcriptHint')}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================ HOME ============================ */}
      {stage === 'home' && (
        <div className="relative flex-1 overflow-y-auto slim-scroll px-5 py-6 bg-slate-50 dark:bg-slate-950">
          <div className="text-center mb-5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-14 h-14 mx-auto rounded-full object-cover mb-3 shadow-lg" />
            ) : (
              <div className="w-14 h-14 mx-auto rounded-full grid place-items-center text-white text-xl font-bold mb-3"
                style={{ background: headerGradient }} aria-hidden>
                {agentInitials}
              </div>
            )}
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{greeting}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{status === 'online' ? t('onlineNow') : t('offlineNow')}</p>
          </div>

          <div className="space-y-2.5">
            {status === 'offline' && offlineCfg.enabled ? (
              <>
                <button onClick={() => { setFormVals({}); setFormErr(''); setOfflineDone(false); setStage('offline'); }}
                  className="w-full py-3 rounded-2xl text-white font-semibold text-sm shadow-lg" style={{ background: accent }}>
                  ✉️ {t('leaveMessage')}
                </button>
                <button onClick={() => startFromHome()}
                  className="w-full py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-sm text-slate-700 dark:text-slate-200">
                  {t('startChatAnyway')}
                </button>
              </>
            ) : (
              <button onClick={() => startFromHome()} autoFocus
                className="w-full py-3 rounded-2xl text-white font-semibold text-sm shadow-lg" style={{ background: accent }}>
                💬 {t('startChat')}
              </button>
            )}
            {settings.booking_url && (
              <a href={settings.booking_url} target="_blank" rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-sm text-slate-700 dark:text-slate-200 text-center">
                📅 {t('bookMeeting')}
              </a>
            )}
          </div>

          {/* P4-3: in-widget KB search — client-side ranked, top 5 answer cards */}
          {kbArticles.length > 0 && (
            <div className="mt-5" role="search">
              <input
                value={kbQ}
                onChange={(e) => setKbQ(e.target.value)}
                placeholder={t('kbSearchPh')}
                aria-label={t('kbSearchPh')}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500"
              />
              {kbQ.trim().length > 0 && (kbResults.length > 0 ? (
                <div className="mt-3">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2">{t('kbResults')}</h2>
                  <div className="space-y-2">
                    {kbResults.map((r) => (
                      <button key={r.a.id} onClick={() => openKbArticle(r.a)}
                        className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70 rounded-xl px-3.5 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.a.title}</span>
                          {articleKindOf(r.a) === 'guide' && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: accent }}>{t('kbGuide')}</span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5"
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.snippet}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70 rounded-xl p-4 text-center">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('kbNoResults')}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('kbNoResultsHint')}</p>
                  <button onClick={startChatFromSearch}
                    className="mt-3 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: accent }}>
                    💬 {t('startChat')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {faq.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-2">{t('faqTitle')}</h2>
              <div className="space-y-2">
                {faq.map((a) => (
                  <div key={a.id} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70 rounded-xl overflow-hidden"
                    style={hasBranding ? { borderLeft: `3px solid ${accent}` } : undefined}>
                    <button onClick={() => setFaqOpen(faqOpen === a.id ? null : a.id)}
                      className="w-full text-start px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center justify-between gap-2"
                      aria-expanded={faqOpen === a.id}>
                      <span className="truncate">{a.title}</span>
                      <span className="text-slate-400 dark:text-slate-500 text-xs shrink-0">{faqOpen === a.id ? '▴' : '▾'}</span>
                    </button>
                    {faqOpen === a.id && (
                      <div className="px-3.5 pb-3 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto slim-scroll">
                        {a.body || a.title}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500" aria-hidden>🌐</span>
            <select value={lang} onChange={(e) => setLanguage(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 outline-none" aria-label={t('languageLabel')}>
              {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
            </select>
          </div>
          {w.show_branding && (
            <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-4">Powered by <span className="font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500">Brix Chat</span></p>
          )}
          {/* P4-3/P4-4: in-widget article view + guided troubleshooting stepper */}
          {(kbArticle || guideRun) && (
            <div className="absolute inset-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto slim-scroll px-5 py-6">
              {kbArticle ? (
                <div>
                  <button onClick={closeKb}
                    className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline">
                    ← {t('kbBackToResults')}
                  </button>
                  <h1 className="text-base font-bold text-slate-900 dark:text-slate-50">{kbArticle.title}</h1>
                  <div className="mt-2 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {kbArticle.body || kbArticle.title}
                  </div>
                  <button onClick={() => { closeKb(); startFromHome(); }}
                    className="mt-5 w-full py-3 rounded-2xl text-white font-semibold text-sm shadow-lg" style={{ background: accent }}>
                    💬 {t('startChat')}
                  </button>
                </div>
              ) : renderGuide()}
            </div>
          )}
        </div>
      )}

      {/* ========================== PRE-CHAT ========================== */}
      {stage === 'prechat' && (
        <div className="flex-1 overflow-y-auto slim-scroll px-5 py-6 bg-slate-50 dark:bg-slate-950">
          <BrandStrip />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">{t('prechatTitle')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-1 mb-5">{t('prechatHint')}</p>
          <form onSubmit={submitPrechat} className="space-y-3.5">
            {prechatCfg.fields.map(renderField)}
            {depts.length > 0 && !prechatCfg.fields.includes('department') && renderField('department')}
            {formErr && <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">{formErr}</p>}
            <button type="submit" className="w-full py-3 rounded-2xl text-white font-semibold text-sm shadow-lg" style={{ background: accent }}>
              {t('submit')}
            </button>
            <button type="button" onClick={() => setStage('home')} className="w-full text-xs text-slate-400 dark:text-slate-500 underline">{t('dismiss')}</button>
          </form>
        </div>
      )}

      {/* ========================== OFFLINE ========================== */}
      {stage === 'offline' && (
        <div className="flex-1 overflow-y-auto slim-scroll px-5 py-6 bg-slate-50 dark:bg-slate-950">
          <BrandStrip />
          {offlineDone ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3" aria-hidden>✅</div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('offlineDone')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{t('offlineDoneHint')}</p>
              <button onClick={() => setStage('home')} className="mt-5 text-sm font-semibold underline" style={{ color: accent }}>{t('dismiss')}</button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">{t('offlineTitle')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-1 mb-5">{t('offlineHint')}</p>
              <form onSubmit={submitOffline} className="space-y-3.5">
                {offlineCfg.fields.map(renderField)}
                {formErr && <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">{formErr}</p>}
                <button type="submit" disabled={sendingForm}
                  className="w-full py-3 rounded-2xl text-white font-semibold text-sm shadow-lg disabled:opacity-50" style={{ background: accent }}>
                  {sendingForm ? t('sending') : t('submit')}
                </button>
                <button type="button" onClick={() => setStage('home')} className="w-full text-xs text-slate-400 dark:text-slate-500 underline">{t('dismiss')}</button>
              </form>
            </>
          )}
        </div>
      )}

      {/* ============================ CALLBACK (phase 5) ============================ */}
      {stage === 'callback' && (
        <div className="flex-1 overflow-y-auto slim-scroll px-5 py-6 bg-slate-50 dark:bg-slate-950">
          <BrandStrip />
          {cbDoneLabel ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3" aria-hidden>📞</div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('callbackDoneTitle')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('callbackDoneText').replace('{time}', cbDoneLabel)}</p>
              <button onClick={() => setStage(cbReturn)} className="mt-5 text-sm font-semibold underline" style={{ color: accent }}>{t('callbackBack')}</button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50 text-center">{t('callbackTitle')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1 mb-5">{t('callbackHint')}</p>
              <form onSubmit={submitCallback} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{t('callbackName')}</label>
                  <input value={cbName} onChange={(e) => setCbName(e.target.value)} autoComplete="name"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{t('callbackPhone')} *</label>
                  <input value={cbPhone} onChange={(e) => setCbPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+971 50 123 4567"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{t('callbackTopic')}</label>
                  <select value={cbTopic} onChange={(e) => setCbTopic(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none bg-white dark:bg-slate-900">
                    {['General question', 'Sales', 'Billing', 'Technical support', 'Something else'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{t('callbackWhen')}</label>
                  <select value={cbWhen} onChange={(e) => setCbWhen(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none bg-white dark:bg-slate-900">
                    <option value="within-hour">{t('callbackWithinHour')}</option>
                    <option value="afternoon">{t('callbackAfternoon')}</option>
                    <option value="tomorrow">{t('callbackTomorrow')}</option>
                    <option value="custom">{t('callbackPickTime')}</option>
                  </select>
                </div>
                {cbWhen === 'custom' && (
                  <div>
                    <input value={cbCustom} onChange={(e) => setCbCustom(e.target.value)} type="datetime-local" aria-label={t('callbackCustomPh')}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none bg-white dark:bg-slate-900" />
                  </div>
                )}
                {cbErr && <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">{cbErr}</p>}
                <button type="submit" disabled={cbSending}
                  className="w-full py-3 rounded-2xl text-white font-semibold text-sm shadow-lg disabled:opacity-50" style={{ background: accent }}>
                  {cbSending ? t('sending') : t('callbackSubmit')}
                </button>
                <button type="button" onClick={() => setStage(cbReturn)} className="w-full text-xs text-slate-400 dark:text-slate-500 underline">{t('callbackBack')}</button>
              </form>
            </>
          )}
        </div>
      )}

      {/* ============================ CHAT ============================ */}
      {stage === 'chat' && (
        <>
          {/* phase 5: chat queue position */}
          {queueEnabled && queuePos > 0 && (
            <div className="mx-4 mt-3 rounded-xl border border-brix-200 bg-brix-50 dark:bg-slate-800 dark:border-slate-700 px-3.5 py-2.5 text-[13px] font-semibold text-brix-800 dark:text-slate-200 text-center" role="status">
              ⏳ {t('queueLine').replace('{n}', String(queuePos)).replace('{m}', String(Math.max(1, (queuePos - 1) * 2)))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto slim-scroll px-4 py-4 space-y-3 bg-slate-50 dark:bg-slate-950" role="log" aria-live="polite" aria-label={t('chatPanel')}>
            {msgs.map((m) => m.kind === 'transfer' ? (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[11px] text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700/60 px-3 py-1.5 rounded-full">
                  🔀 {t('transferredTo')}{m.transferTo ? ` ${m.transferTo}` : ''}{m.transferNote ? ` — ${t('transferNote')}: ${m.transferNote}` : ''}
                </span>
              </div>
            ) : m.from === 'system' ? (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 bg-slate-200/70 dark:bg-slate-700/60 px-3 py-1 rounded-full">{m.text}</span>
              </div>
            ) : (
              <div key={m.id} className={cx('flex', m.from === 'visitor' ? 'justify-end' : 'justify-start')}>
                <div className="max-w-[82%]">
                  <div className={cx('px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm break-words', m.from === 'visitor' ? 'text-white' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800')}
                    style={{ borderRadius: radius, background: m.from === 'visitor' ? accent : undefined }}>
                    {m.kind === 'audio' && m.audioUrl ? (
                      <span className="block">
                        <audio controls preload="metadata" src={m.audioUrl} className="w-52 max-w-full"
                          aria-label={`${t('audioPreview')} · ${m.audioSecs ?? 0}s`} />
                        <span className="block text-[10px] opacity-70 mt-1">🎙️ {m.audioSecs ?? 0}s</span>
                      </span>
                    ) : (
                      m.text
                    )}
                  </div>
                  <div className={cx('text-[10px] text-slate-400 dark:text-slate-500 mt-1', m.from === 'visitor' ? 'text-right' : 'text-left')}>
                    {fmtTime(m.ts)}
                  </div>
                </div>
              </div>
            ))}
            {showAgentTyping && (
              <div className="flex justify-start" aria-label="typing">
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 shadow-sm flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* proactive prompt bubbles */}
          {prompts.map((p) => (
            <div key={p.id} className="px-4 pb-1 bg-slate-50 dark:bg-slate-950 shrink-0">
              <div className="relative bg-white dark:bg-slate-900 border border-brix-200 dark:border-brix-700 rounded-2xl px-3.5 py-2.5 text-[13px] text-slate-800 dark:text-slate-100 shadow-md animate-fade-up" role="status"
                style={hasBranding ? { borderColor: accent } : undefined}>
                {p.text}
                <button onClick={() => dismissPrompt(p.id, 'dismiss')}
                  className="absolute -top-2 -end-2 w-6 h-6 rounded-full bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 text-xs grid place-items-center"
                  aria-label={t('dismiss')}>✕</button>
              </div>
            </div>
          ))}

          {/* input */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            {recorder && (
              <div className="mb-2 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900" role="status">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping-soft shrink-0" aria-hidden />
                <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">{t('audioRecording')} {recSecs}s</span>
                <span className="flex-1" />
                <button onClick={stopRecording}
                  className="px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold" style={{ background: accent }}>
                  {t('audioStop')}
                </button>
                <button onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:underline">
                  {t('audioCancel')}
                </button>
              </div>
            )}
            {audioPreview && (
              <div className="mb-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700" role="group" aria-label={t('audioPreview')}>
                <audio controls src={audioPreview.url} className="w-full"
                  aria-label={`${t('audioPreview')} · ${audioPreview.secs}s`} />
                <div className="flex gap-2 mt-2">
                  <button onClick={sendAudio}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: accent }}>
                    {t('audioSend')} · {audioPreview.secs}s
                  </button>
                  <button onClick={cancelRecording}
                    className="px-4 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    {t('audioCancel')}
                  </button>
                </div>
              </div>
            )}
            {audioWarn && <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400" role="alert">{audioWarn}</p>}
            {showEmoji && (
              <div className="grid grid-cols-8 gap-1 mb-2 p-2 bg-slate-50 dark:bg-slate-950 rounded-xl">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => { setInput((v) => v + e); setShowEmoji(false); inputRef.current?.focus(); }}
                    className="text-xl hover:scale-125 transition-transform" aria-label={e}>{e}</button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => void startRecording()} disabled={recorder !== null || audioPreview !== null}
                className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 text-lg shrink-0 disabled:opacity-40"
                aria-label={t('audioRec')}>🎙️</button>
              <button onClick={() => setShowEmoji((v) => !v)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 text-lg shrink-0" aria-label={t('emojiBtn')} aria-expanded={showEmoji}>😊</button>
              <button onClick={() => fileRef.current?.click()} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500 shrink-0" aria-label={t('attachFile')}>📎</button>
              <input ref={fileRef} type="file" className="hidden" onChange={onFile} aria-hidden tabIndex={-1} />
              <input ref={inputRef}
                value={input}
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(input)}
                placeholder={t('typeMessage')}
                aria-label={t('typeMessage')}
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500"
              />
              <button onClick={() => send(input)} disabled={!input.trim()}
                className="w-10 h-10 rounded-full grid place-items-center text-white disabled:opacity-40 shrink-0"
                style={{ background: accent }} aria-label={t('sendBtn')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12l14-7-4 14-4-5-6-2z" fill="currentColor" /></svg>
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              {w.show_branding ? (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Powered by <span className="font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500">Brix Chat</span></span>
              ) : <span />}
              <button onClick={() => void endChat()} className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 underline">{t('endChat')}</button>
            </div>
          </div>
        </>
      )}

      {/* ============================ ENDED + CSAT ============================ */}
      {stage === 'ended' && (
        <div className="flex-1 overflow-y-auto slim-scroll px-5 py-6 bg-slate-50 dark:bg-slate-950">
          <div className="text-center mb-5">
            <div className="text-4xl mb-3" aria-hidden>👋</div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t('chatEnded')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{t('chatEndedHint')}</p>
          </div>
          {rateStep !== 'done' && !surveySuppressed && surveyReady ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
              {surveyCfg ? (
                /* P4-13: configured survey — CSAT 1–5, NPS 0–10, or CES 1–7 */
                <>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 text-center">
                    {t(surveyCfg.type === 'ces' ? 'cesTitle' : surveyCfg.type === 'nps' ? 'npsTitle' : 'csatTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-1 mb-4">
                    {t(surveyCfg.type === 'ces' ? 'cesHint' : surveyCfg.type === 'nps' ? 'npsHint' : 'csatHint')}
                  </p>
                  {surveyCfg.type === 'csat' ? (
                    <div className="flex justify-center gap-2 mb-4" role="radiogroup" aria-label={t('csatTitle')}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setSurveyScore(n)} role="radio" aria-checked={surveyScore === n}
                          className={cx('text-3xl transition-transform hover:scale-125 rounded-lg', surveyScore >= n && surveyScore >= 0 ? '' : 'grayscale opacity-40')}
                          style={hasBranding && surveyScore >= n && surveyScore >= 0 ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
                          aria-label={`${n} / 5`}>⭐</button>
                      ))}
                    </div>
                  ) : surveyCfg.type === 'nps' ? (
                    <div className="grid grid-cols-11 gap-1 mb-4" role="radiogroup" aria-label={t('npsTitle')}>
                      {Array.from({ length: 11 }, (_, n) => (
                        <button key={n} onClick={() => setSurveyScore(n)} role="radio" aria-checked={surveyScore === n}
                          className={cx('h-9 rounded-lg text-sm font-bold transition-colors',
                            surveyScore === n ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700')}
                          style={surveyScore === n ? { background: accent } : undefined}
                          aria-label={String(n)}>{n}</button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1 mb-4" role="radiogroup" aria-label={t('cesTitle')}>
                      {Array.from({ length: 7 }, (_, i) => {
                        const n = i + 1;
                        return (
                          <button key={n} onClick={() => setSurveyScore(n)} role="radio" aria-checked={surveyScore === n}
                            className={cx('h-9 rounded-lg text-sm font-bold transition-colors',
                              surveyScore === n ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700')}
                            style={surveyScore === n ? { background: accent } : undefined}
                            aria-label={String(n)}>{n}</button>
                        );
                      })}
                    </div>
                  )}
                  {surveyCfg.comment_enabled && (
                    <textarea value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} rows={2}
                      placeholder={t('commentPh')} aria-label={t('commentPh')}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 resize-none mb-3" />
                  )}
                  <div className="flex gap-2">
                    <button onClick={submitSurvey} disabled={surveyScore < 0}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: accent }}>
                      {t('submit')}
                    </button>
                    <button onClick={() => setRateStep('done')} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800">
                      {t('skip')}
                    </button>
                  </div>
                </>
              ) : (
                /* legacy two-step CSAT → NPS (fallback while no survey config exists) */
                <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 text-center mb-2">
                {t(rateStep === 'csat' ? 'step1of2' : 'step2of2')}
              </p>
              {rateStep === 'csat' ? (
                <>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 text-center">{t('csatTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-1 mb-4">{t('csatHint')}</p>
                  <div className="flex justify-center gap-2 mb-4" role="radiogroup" aria-label={t('csatTitle')}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setCsat(n)} role="radio" aria-checked={csat === n}
                        className={cx('text-3xl transition-transform hover:scale-125 rounded-lg', csat >= n ? '' : 'grayscale opacity-40')}
                        style={hasBranding && csat >= n ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
                        aria-label={`${n} / 5`}>⭐</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={submitCsat} disabled={csat === 0}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: accent }}>
                      {t('submit')}
                    </button>
                    <button onClick={() => setRateStep('nps')} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800">
                      {t('skip')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 text-center">{t('npsTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-1 mb-4">{t('npsHint')}</p>
                  <div className="grid grid-cols-11 gap-1 mb-4" role="radiogroup" aria-label={t('npsTitle')}>
                    {Array.from({ length: 11 }, (_, n) => (
                      <button key={n} onClick={() => setNps(n)} role="radio" aria-checked={nps === n}
                        className={cx('h-9 rounded-lg text-sm font-bold transition-colors',
                          nps === n ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700')}
                        style={nps === n ? { background: accent } : undefined}
                        aria-label={String(n)}>{n}</button>
                    ))}
                  </div>
                  <textarea value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} rows={2}
                    placeholder={t('commentPh')} aria-label={t('commentPh')}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 resize-none mb-3" />
                  <div className="flex gap-2">
                    <button onClick={submitNps} disabled={nps < 0}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: accent }}>
                      {t('submit')}
                    </button>
                    <button onClick={() => setRateStep('done')} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800">
                      {t('skip')}
                    </button>
                  </div>
                </>
              )}
                </>
              )}
            </div>
          ) : rateStep === 'done' ? (
            <div className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-5">{t('csatThanks')}</div>
          ) : null}
          <button onClick={() => window.location.reload()}
            className="w-full py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-sm text-slate-700 dark:text-slate-200">
            💬 {t('newChat')}
          </button>
          {w.show_branding && (
            <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-4">Powered by <span className="font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500">Brix Chat</span></p>
          )}
        </div>
      )}
    </div>
  );
}
