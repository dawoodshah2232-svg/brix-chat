/* Brix Chat — widget loader v2 (dependency-free, <15KB).
 *
 * Install:
 *   <script>
 *     window.Brix_API = window.Brix_API || {};
 *     // optional: identify the visitor before load
 *     // window.Brix_API.visitor = { name: "Ayesha", email: "a@example.com", hash: "<hmac>" };
 *   </script>
 *   <script async src="https://YOUR-HOST/brix-chat/widget.js" data-property="bx_..."></script>
 *
 * data-* overrides: data-property (required; legacy data-key also works),
 *   data-color, data-position (bottom-right|bottom-left), data-greeting, data-locale,
 *   data-theme (light|dark|auto — widget color scheme; default follows the
 *   property branding theme set in Admin → Branding).
 *   data-queue="1" — chat queue position: when the property has queue enabled
 *   (also via boot({ queue: true })), the loader shows "You're #N in line —
 *   about X min wait" from the shared queue key below, and forwards the flag
 *   to the widget (?queue=1 + config).
 *
 * JS API (all calls are safe before the widget finishes loading — they queue):
 *   BrixChat('boot', { property, visitor, theme }) // start (auto-boots from data-* if omitted)
 *   BrixChat('config', { prechat, offline, language }) // host overrides forwarded to widget (phase 2)
 *   BrixChat('prompt', { text, delay, dismissAfter })  // proactive teaser bubble, queued (phase 2)
 *   BrixChat('emailTranscript', email)       // ask the widget to send/save a transcript (phase 2)
 *   BrixChat('setLanguage', code)            // en|es|fr|de|ar|ur (phase 2)
 *   BrixChat('setTheme', code)               // light|dark|auto — switch the widget color scheme (phase 3)
 *   BrixChat.show() / .hide() / .toggle()     // launcher visibility
 *   BrixChat.open() / .close()                // chat panel (maximize/minimize aliases)
 *   BrixChat.endChat()                        // end the current chat
 *   BrixChat.popup()                          // open chat in a pop-out window
 *   BrixChat.setVisitor({name,email})         // identify the visitor
 *   BrixChat.setAttributes({...})            // custom key/value metadata (max 50)
 *   BrixChat.addTags([...]) / .removeTags([...])
 *   BrixChat.trackEvent(name, metadata)       // behavioral event
 *   BrixChat.reset()                          // clear the visitor session
 *   BrixChat.getStatus()                      // 'online' | 'away' | 'offline'
 *   BrixChat.isChatOngoing() / .isOpen() / .getUnreadCount()
 *   BrixChat.onReady(fn) .onOpen(fn) .onClose(fn)
 *   BrixChat.onChatStarted(fn) .onChatEnded(fn)
 *   BrixChat.onMessageReceived(fn) .onMessageSent(fn)
 *   BrixChat.onUnreadCountChanged(fn) .onStatusChange(fn)
 *   BrixChat.onSatisfaction(fn)               // CSAT rating after chat end (phase 2)
 *   BrixChat.onRating(fn)                     // CSAT/NPS submitted, { kind, score } (phase 2, Worker D)
 *   BrixChat.onTyping(fn)                     // visitor typing activity (phase 2)
 *   BrixChat('requestCallback', opts?)       // "Request a callback" form modal:
 *     collects name, phone (required), topic and a preferred time window,
 *     stores a callback ticket in the same localStorage shape the dashboard
 *     reads, and confirms "We'll call you back at <time>". Emits
 *     'callbackRequested'. Works even before the chat panel loads.
 *   window events: 'brixchat:ready', 'brixchat:satisfaction', ...
 *
 * Widget → loader events (brixchat:<type>):
 *   ready | open | close | chatStarted | chatEnded | message | typing |
 *   prechatSubmitted | offlineSubmitted | satisfaction | ratingSubmitted |
 *   transcriptRequested | promptShown | promptDismissed | languageChanged |
 *   callbackRequested { ticket_id, queued, values } | // phase 5
 *   status | proactiveTriggers { triggers }  // phase 4 (P4-2): the loader
 *     installs host-page detectors (page_view / top-edge exit_intent /
 *     idle N s / scroll %) with frequency caps in localStorage
 *     (brixchat_trigcap_<id>) + a max-prompts-per-visit guard.
 *
 * Secure mode: pass visitor.hash = HMAC-SHA256(email, property_secret), generated
 * on your server. The loader forwards it to the widget; server-side verification
 * activates with the backend phase (today the hash is accepted and stored).
 *
 * Shared localStorage keys (documented in src/lib/portal.ts):
 *   brixchat_queue_v1 — chat queue: { <propertyId>: [{ id, joinedAt, name? }] },
 *     oldest first. A new joiner's position = 1 + entries already waiting; the
 *     wait estimate shown is (position-1) x 2 minutes, labelled "about".
 *   Callback tickets are stored as ApiTicket-shaped records in the dashboard's
 *   own database — localStorage['brixchat_api_v1'][<workspace>].tickets, with
 *   workspace 'demo' in this build (a production backend resolves the workspace
 *   from the property server-side). That is the exact shape
 *   getApi(workspace).tickets.list() reads, so callback tickets appear in the
 *   dashboard's Tickets page. When that database is absent (e.g. the loader
 *   runs on a third-party host before the app ever booted), the ticket goes to
 *   the honest local fallback 'brixchat_callback_queue_v1' instead of writing
 *   a partial skeleton.
 */
(function () {
  'use strict';

  var WIN = window, DOC = document;
  var NS = 'brixchat';

  /* ---------- language packs (original short UI strings, phase 2) ---------- */
  var LANGS = {
    en: { openChat: 'Open chat', closeChat: 'Close chat', chatPanel: 'Brix chat panel', dismiss: 'Dismiss', startChat: 'Chat now', typing: 'typing' },
    es: { openChat: 'Abrir chat', closeChat: 'Cerrar chat', chatPanel: 'Panel de chat de Brix', dismiss: 'Descartar', startChat: 'Chatear ahora', typing: 'escribiendo' },
    fr: { openChat: 'Ouvrir le chat', closeChat: 'Fermer le chat', chatPanel: 'Panneau de chat Brix', dismiss: 'Ignorer', startChat: 'Discuter', typing: 'écrit' },
    de: { openChat: 'Chat öffnen', closeChat: 'Chat schließen', chatPanel: 'Brix-Chat-Fenster', dismiss: 'Verwerfen', startChat: 'Jetzt chatten', typing: 'tippt' },
    ar: { openChat: 'فتح المحادثة', closeChat: 'إغلاق المحادثة', chatPanel: 'لوحة محادثة بريكس', dismiss: 'تجاهل', startChat: 'تحدث الآن', typing: 'يكتب' },
    ur: { openChat: 'چیٹ کھولیں', closeChat: 'چیٹ بند کریں', chatPanel: 'برکس چیٹ پینل', dismiss: 'نظر انداز کریں', startChat: 'ابھی چیٹ کریں', typing: 'لکھ رہا ہے' }
  };
  var RTL = { ar: 1, ur: 1 };
  function langPack(code) { return LANGS[code] || LANGS.en; }

  /* ---------- pre-boot queue ---------- */
  var queued = [];
  function BrixChat() { queued.push(Array.prototype.slice.call(arguments)); }
  var prev = WIN.BrixChat;
  if (prev && prev.q) queued = prev.q;
  BrixChat.q = queued;
  WIN.BrixChat = BrixChat;

  /* ---------- config ---------- */
  function currentScript() {
    if (DOC.currentScript) return DOC.currentScript;
    var s = DOC.getElementsByTagName('script');
    return s[s.length - 1];
  }
  var tag = currentScript();
  function dataAttr(name, def) {
    var v = tag && tag.getAttribute ? tag.getAttribute('data-' + name) : null;
    return v === null || v === undefined ? def : v;
  }
  var host = (function () {
    try {
      var src = tag && tag.src ? tag.src : '';
      if (src) return src.slice(0, src.lastIndexOf('/') + 1);
    } catch (e) { /* ignore */ }
    return 'https://dawoodshah2232-svg.github.io/brix-chat/';
  })();
  var hostOrigin = (function () {
    try {
      var a = DOC.createElement('a');
      a.href = host;
      return a.protocol + '//' + a.host;
    } catch (e) { return '*'; }
  })();

  var prebootVisitor = (WIN.Brix_API && WIN.Brix_API.visitor) || {};

  var validLocale = (function (l) { return LANGS[l] ? l : 'en'; })(dataAttr('locale', 'en'));
  function t(key) { var p = langPack(cfg.locale); return p[key] !== undefined ? p[key] : LANGS.en[key]; }

  var validTheme = function (th) { return th === 'light' || th === 'dark' || th === 'auto' ? th : ''; };

  var cfg = {
    property: dataAttr('property', dataAttr('key', '')),
    color: dataAttr('color', '#4f46e5'),
    position: dataAttr('position', 'bottom-right'),
    greeting: dataAttr('greeting', ''),
    locale: validLocale,
    theme: validTheme(dataAttr('theme', '')), // phase 3: widget color scheme override
    // phase 2: host overrides for the widget's pre-chat / offline forms,
    // forwarded to the iframe; WidgetPage merges them over property settings
    prechat: null,   // { enabled?: boolean, fields?: string[] }
    offline: null,   // { enabled?: boolean, fields?: string[] }
    visitor: {
      name: prebootVisitor.name || '',
      email: prebootVisitor.email || '',
      hash: prebootVisitor.hash || '' // secure-mode HMAC; verified server-side later
    },
    attributes: {},
    tags: [],
    // phase 5: "Request a callback" + chat queue — data-queue="1" or boot({ queue: true })
    queue: dataAttr('queue', '') === '1'
  };

  /* ---------- state ---------- */
  var state = {
    booted: false,
    ready: false,
    open: false,
    hidden: false,
    unread: 0,
    chatOngoing: false,
    status: 'online'
  };

  /* ---------- callbacks ---------- */
  var cbs = {};
  function on(evt, fn) {
    if (typeof fn !== 'function') return;
    (cbs[evt] = cbs[evt] || []).push(fn);
    if (evt === 'ready' && state.ready) fn();
  }
  function emit(evt, data) {
    (cbs[evt] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { /* host error — never break the widget */ }
    });
    try {
      WIN.dispatchEvent(new CustomEvent(NS + ':' + evt, { detail: data }));
    } catch (e) { /* older browsers */ }
  }

  /* ---------- DOM ---------- */
  var bubble = null, badge = null, frame = null, teaserWrap = null;

  function el(name, styles, attrs) {
    var e = DOC.createElement(name);
    for (var k in styles) e.style[k] = styles[k];
    if (attrs) for (var a in attrs) e.setAttribute(a, attrs[a]);
    return e;
  }

  var ICON_CHAT = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="margin:auto;display:block"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" fill="white"/></svg>';
  var ICON_X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin:auto;display:block"><path d="M6 6l12 12M18 6L6 18" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>';

  /* phase 3: loader-side dark check (mirrors the widget's own resolution for
   * the iframe shell + proactive teaser; the widget re-resolves inside too) */
  function loaderDark() {
    if (cfg.theme === 'dark') return true;
    if (cfg.theme === 'auto' && typeof WIN.matchMedia === 'function') {
      try { return WIN.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
    }
    return false;
  }

  function buildDom() {
    var side = cfg.position === 'bottom-left' ? 'left' : 'right';

    bubble = el('button', {
      position: 'fixed', bottom: '20px', zIndex: '2147483000',
      width: '60px', height: '60px', borderRadius: '50%', border: 'none',
      background: 'linear-gradient(135deg,#6366f1,#06b6d4)', cursor: 'pointer',
      boxShadow: '0 10px 30px rgba(79,70,229,.45)', padding: '0'
    }, { 'aria-label': t('openChat'), 'aria-expanded': 'false', id: NS + '-bubble' });
    bubble.style[side] = '20px';
    bubble.innerHTML = ICON_CHAT;

    badge = el('span', {
      position: 'absolute', top: '-4px', right: '-4px',
      minWidth: '22px', height: '22px', padding: '0 5px',
      borderRadius: '11px', background: '#f43f5e', color: '#fff',
      fontSize: '12px', fontWeight: '700', lineHeight: '22px', textAlign: 'center',
      display: 'none', fontFamily: 'system-ui,sans-serif', boxSizing: 'border-box'
    }, { id: NS + '-badge' });
    bubble.style.position = 'fixed';
    bubble.appendChild(badge);

    frame = el('iframe', {
      position: 'fixed', bottom: '94px', zIndex: '2147483000',
      width: '380px', height: '560px', maxHeight: 'calc(100vh - 120px)',
      maxWidth: 'calc(100vw - 32px)', border: 'none', borderRadius: '18px',
      boxShadow: '0 24px 70px rgba(2,6,23,.35)', display: 'none', background: loaderDark() ? '#020617' : '#fff'
    }, { id: NS + '-frame', title: t('chatPanel'), role: 'dialog', 'aria-modal': 'false', 'aria-label': t('chatPanel'), tabindex: '-1', allow: 'microphone' }); // P4-17
    frame.style[side] = '20px';
    frame.src = widgetUrl();
    frame.addEventListener('load', function () {
      if (!state.ready) {
        state.ready = true;
        emit('ready', { property: cfg.property });
        sendCmd('config', {
          greeting: cfg.greeting, locale: cfg.locale,
          visitor: cfg.visitor, attributes: cfg.attributes, tags: cfg.tags,
          prechat: cfg.prechat, offline: cfg.offline, // phase 2 host overrides
          queue: cfg.queue // phase 5: chat queue position
        });
      }
    });

    bubble.addEventListener('click', function () { api.toggle(); });

    // phase 2: proactive-prompt teaser container (sits above the launcher)
    teaserWrap = el('div', {
      position: 'fixed', bottom: '94px', zIndex: '2147482999',
      maxWidth: '260px', display: 'none'
    }, { id: NS + '-teaser', role: 'status', 'aria-live': 'polite' });
    teaserWrap.style[side] = '20px';
    if (RTL[cfg.locale]) teaserWrap.style.direction = 'rtl';

    DOC.body.appendChild(frame);
    DOC.body.appendChild(teaserWrap);
    DOC.body.appendChild(bubble);
    applyLang();
    maybeShowQueue(); // phase 5: queue position teaser when queue: true
    // keyframes for the prompt teaser entrance
    try {
      var st = DOC.createElement('style');
      st.setAttribute('data-' + NS, '1');
      st.textContent = '@keyframes ' + NS + '-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}';
      DOC.head.appendChild(st);
    } catch (e) { /* ignore */ }
  }

  /* phase 2: re-label loader UI after a language change */
  function applyLang() {
    if (bubble) {
      bubble.setAttribute('aria-label', state.open ? t('closeChat') : t('openChat'));
      bubble.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    }
    if (frame) {
      frame.setAttribute('title', t('chatPanel'));
      frame.setAttribute('aria-label', t('chatPanel'));
    }
    if (teaserWrap && RTL[cfg.locale]) teaserWrap.style.direction = 'rtl';
    else if (teaserWrap) teaserWrap.style.direction = '';
  }

  /* ---------- proactive prompts (phase 2, queued, dismissible) ---------- */
  var promptQueue = [], activePrompt = null, promptSeq = 0;

  function queuePrompt(opts) {
    opts = opts || {};
    var text = String(opts.text || '').slice(0, 300);
    if (!text) return;
    promptQueue.push({
      id: opts.id || ('p' + (++promptSeq)),
      text: text,
      delay: Math.max(0, Math.min(opts.delay || 4000, 120000)),
      dismissAfter: opts.dismissAfter === 0 ? 0 : Math.max(5000, Math.min(opts.dismissAfter || 15000, 300000))
    });
    pumpPrompts();
  }

  function pumpPrompts() {
    if (activePrompt || !promptQueue.length || !state.booted || state.hidden || state.open) return;
    var p = promptQueue.shift();
    activePrompt = p;
    p.timer = setTimeout(function () { showPrompt(p); }, p.delay);
  }

  function showPrompt(p) {
    if (!teaserWrap || state.open) { activePrompt = null; pumpPrompts(); return; }
    teaserWrap.innerHTML = '';
    teaserWrap.style.display = 'block';

    var card = el('div', {
      background: loaderDark() ? '#0f172a' : '#fff', borderRadius: '14px', padding: '12px 36px 12px 14px',
      boxShadow: '0 12px 32px rgba(2,6,23,.22)', fontSize: '13px', color: loaderDark() ? '#e2e8f0' : '#1e293b',
      fontFamily: 'system-ui,sans-serif', lineHeight: '1.45', cursor: 'pointer',
      border: loaderDark() ? '1px solid rgba(148,163,184,.25)' : '1px solid rgba(99,102,241,.18)',
      animation: NS + '-pop .25s ease-out'
    });
    if (RTL[cfg.locale]) { card.style.padding = '12px 14px 12px 36px'; }
    card.textContent = p.text;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', p.text + ' — ' + t('startChat'));
    var openIt = function () { dismissPrompt(p, 'open'); api.open(); };
    card.addEventListener('click', openIt);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } });

    var x = el('button', {
      position: 'absolute', top: '6px', right: '8px', border: 'none', background: 'transparent',
      color: '#94a3b8', fontSize: '15px', cursor: 'pointer', padding: '2px 4px', lineHeight: '1'
    }, { 'aria-label': t('dismiss') });
    if (RTL[cfg.locale]) { x.style.right = 'auto'; x.style.left = '8px'; }
    x.textContent = '×';
    x.addEventListener('click', function (e) { e.stopPropagation(); dismissPrompt(p, 'dismiss'); });

    card.style.position = 'relative';
    card.appendChild(x);
    teaserWrap.appendChild(card);
    emit('promptShown', { id: p.id });
    if (p.dismissAfter > 0) {
      p.autoTimer = setTimeout(function () { dismissPrompt(p, 'auto'); }, p.dismissAfter);
    }
  }

  function dismissPrompt(p, reason) {
    if (activePrompt !== p) return;
    clearTimeout(p.timer); clearTimeout(p.autoTimer);
    activePrompt = null;
    if (teaserWrap) { teaserWrap.style.display = 'none'; teaserWrap.innerHTML = ''; }
    emit('promptDismissed', { id: p.id, reason: reason });
    pumpPrompts();
  }

  /* phase 4 (P4-2): proactive triggers — defs arrive via the
   * 'proactiveTriggers' event; detectors observe the host page. Caps persist
   * in localStorage as brixchat_trigcap_<id>; max-prompts-per-visit (default
   * 3) caps chattiness. */
  var trigClean = [];
  var trigSess = (function () {
    try {
      var s = WIN.sessionStorage.getItem('brixchat_sid_v1');
      if (!s) { s = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); WIN.sessionStorage.setItem('brixchat_sid_v1', s); }
      return s;
    } catch (e) { return 's' + Date.now().toString(36); }
  })();
  function trigKey(id) { return 'brixchat_trigcap_' + String(id).slice(0, 64); }
  function trigToday() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function trigRead(id) {
    try { var r = WIN.localStorage.getItem(trigKey(id)); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  function trigWrite(id, rec) { try { WIN.localStorage.setItem(trigKey(id), JSON.stringify(rec)); } catch (e) {} }
  function trigVisits() {
    try { return parseInt(WIN.sessionStorage.getItem('brixchat_pvisit_v1') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function trigFire(tg) {
    if (state.open || state.chatOngoing) return; // already engaged — never interrupt
    var cap = tg.frequency_cap || {}, rec = trigRead(tg.id), mode = cap.mode || 'once_session';
    if (mode === 'once_day' ? (rec && rec.d === trigToday())
      : mode === 'max_count' ? (rec && (rec.c || 0) >= (cap.max || 1))
      : (rec && rec.s === trigSess)) return; // cap hit
    if (trigVisits() >= (tg.max_prompts_per_visit || 3)) return; // global guard
    rec = rec || { c: 0 };
    rec.c++; rec.d = trigToday(); rec.s = trigSess;
    trigWrite(tg.id, rec);
    try { WIN.sessionStorage.setItem('brixchat_pvisit_v1', String(trigVisits() + 1)); } catch (e) {}
    queuePrompt({ id: 'trig:' + tg.id, text: tg.text, delay: tg.delay || 0 });
  }
  function installProactiveTriggers(list) {
    trigClean.forEach(function (fn) { try { fn(); } catch (e) {} });
    trigClean = [];
    (list || []).forEach(function (tg) {
      if (!tg || !tg.id || !tg.text) return;
      var ev = tg.event, acts;
      if (ev === 'page_view') {
        var to = setTimeout(function () { trigFire(tg); }, 0);
        trigClean.push(function () { clearTimeout(to); });
      } else if (ev === 'exit_intent') {
        // desktop only: cursor leaves the document through the top edge
        var fine = false;
        try { fine = WIN.matchMedia('(pointer: fine)').matches; } catch (e) {}
        if (!fine) return;
        var onOut = function (e) { if (!e.relatedTarget && (e.clientY || 0) <= 0) trigFire(tg); };
        DOC.addEventListener('mouseout', onOut);
        trigClean.push(function () { DOC.removeEventListener('mouseout', onOut); });
      } else if (ev === 'idle') {
        var ms = Math.max(5000, Math.min((tg.idle_secs || 30) * 1000, 3600000)), ito = null;
        var arm = function () { clearTimeout(ito); ito = setTimeout(function () { trigFire(tg); }, ms); };
        acts = ['mousemove', 'keydown', 'scroll', 'touchstart', 'mousedown'];
        acts.forEach(function (n) { DOC.addEventListener(n, arm, { passive: true }); });
        arm();
        trigClean.push(function () { clearTimeout(ito); acts.forEach(function (n) { DOC.removeEventListener(n, arm); }); });
      } else if (ev === 'scroll_depth') {
        var pct = Math.max(5, Math.min(tg.scroll_pct || 50, 100));
        var onScroll = function () {
          var h = DOC.documentElement;
          if (h.scrollHeight > 0 && ((h.scrollTop || 0) + h.clientHeight) / h.scrollHeight * 100 >= pct) trigFire(tg);
        };
        DOC.addEventListener('scroll', onScroll, { passive: true });
        trigClean.push(function () { DOC.removeEventListener('scroll', onScroll); });
      }
    });
  }

  /* ---------- phase 5: "Request a callback" (loader-side form modal) ----------
   * The ticket is stored as an ApiTicket-shaped record in the dashboard's own
   * localStorage database — localStorage['brixchat_api_v1'][workspace].tickets,
   * workspace 'demo' in this build — the exact shape
   * getApi(workspace).tickets.list() reads, so the callback appears in the
   * dashboard's Tickets page. When that database is absent (e.g. the loader
   * runs on a third-party host before the app ever booted), the ticket goes
   * to the honest local fallback 'brixchat_callback_queue_v1' instead of
   * writing a partial skeleton. */
  var CALLBACK_TOPICS = ['General question', 'Sales', 'Billing', 'Technical support', 'Something else'];
  var CALLBACK_WHENS = [
    { v: 'within-hour', label: 'Within 1 hour' },
    { v: 'afternoon', label: 'Today afternoon' },
    { v: 'tomorrow', label: 'Tomorrow morning' },
    { v: 'custom', label: 'Pick date/time' }
  ];
  var cbOverlay = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cbWhenLabel(when, custom) {
    if (when === 'within-hour') return 'within the hour';
    if (when === 'afternoon') return 'this afternoon';
    if (when === 'tomorrow') return 'tomorrow morning';
    if (custom) {
      var d = new Date(custom);
      if (!isNaN(d.getTime())) {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
        return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ', ' + hh + ':' + mm;
      }
      return custom;
    }
    return 'a convenient time';
  }

  function storeCallbackTicket(f) {
    var now = new Date();
    var iso = now.toISOString();
    var ticket = {
      id: 't_' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 8),
      property_id: cfg.property || null,
      subject: 'Callback request from ' + (f.name || 'Website visitor'),
      requester_name: f.name || 'Website visitor',
      requester_email: '',
      message: 'Phone: ' + f.phone + '\nTopic: ' + f.topic + '\nPreferred time: ' + f.whenLabel +
        '\n\nRequested through the website widget.',
      status: 'new',
      priority: f.when === 'within-hour' ? 'high' : 'medium',
      assignee_id: null,
      sla_due: null,
      conversation_id: null,
      tags: ['callback', 'widget'],
      category_id: null,
      parent_id: null,
      relation: null,
      created_at: iso,
      updated_at: iso
    };
    var inDashboard = false;
    try {
      var raw = WIN.localStorage.getItem('brixchat_api_v1');
      if (raw) {
        var map = JSON.parse(raw);
        if (map && map.demo && Array.isArray(map.demo.tickets)) {
          map.demo.tickets.unshift(ticket);
          WIN.localStorage.setItem('brixchat_api_v1', JSON.stringify(map));
          inDashboard = true;
        }
      }
    } catch (e) { /* storage unavailable — fall through to the local queue */ }
    if (!inDashboard) {
      try {
        var qraw = WIN.localStorage.getItem('brixchat_callback_queue_v1');
        var q = qraw ? JSON.parse(qraw) : [];
        if (!Array.isArray(q)) q = [];
        q.unshift({ ticket: ticket, at: Date.now() });
        WIN.localStorage.setItem('brixchat_callback_queue_v1', JSON.stringify(q.slice(0, 50)));
      } catch (e2) { /* ignore */ }
    }
    return { id: ticket.id, inDashboard: inDashboard };
  }

  function closeCallbackModal() {
    if (cbOverlay && cbOverlay.parentNode) cbOverlay.parentNode.removeChild(cbOverlay);
    cbOverlay = null;
  }

  function showCallbackDone(whenLabel) {
    if (!cbOverlay) return;
    var dark = loaderDark();
    var card = cbOverlay.querySelector('#' + NS + '-cb-card');
    card.innerHTML =
      '<div style="text-align:center;padding:12px 4px">' +
      '<div style="font-size:40px;margin-bottom:8px" aria-hidden>📞</div>' +
      '<div style="font-size:17px;font-weight:800;margin-bottom:6px">Request received</div>' +
      '<div style="font-size:14px;color:' + (dark ? '#cbd5e1' : '#475569') + '">We\'ll call you back at ' + escapeHtml(whenLabel) + '.</div>' +
      '<button id="' + NS + '-cb-done" style="margin-top:16px;padding:10px 28px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff;font-size:14px;font-weight:700;cursor:pointer">Done</button>' +
      '</div>';
    card.querySelector('#' + NS + '-cb-done').addEventListener('click', closeCallbackModal);
  }

  function openCallbackModal() {
    ensureBoot();
    closeCallbackModal();
    var dark = loaderDark();
    var inputCss = 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid ' +
      (dark ? '#334155;background:#020617;color:#e2e8f0' : '#cbd5e1;background:#fff;color:#0f172a') +
      ';font-size:14px;font-family:system-ui,sans-serif;outline:none;margin-top:4px';
    var labelCss = 'display:block;font-size:11px;font-weight:700;margin-top:12px;color:' +
      (dark ? '#94a3b8' : '#475569') + ';text-transform:uppercase;letter-spacing:.04em';

    cbOverlay = el('div', {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '2147483001',
      background: 'rgba(2,6,23,.55)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '16px', fontFamily: 'system-ui,sans-serif'
    }, { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Request a callback' });
    cbOverlay.innerHTML =
      '<div id="' + NS + '-cb-card" style="width:340px;max-width:100%;border-radius:16px;padding:20px;background:' +
      (dark ? '#0f172a;color:#e2e8f0' : '#ffffff;color:#1e293b') + ';box-shadow:0 24px 70px rgba(2,6,23,.35);animation:' + NS + '-pop .25s ease-out">' +
      '<div style="font-size:17px;font-weight:800;margin-bottom:2px">Request a callback</div>' +
      '<div style="font-size:13px;color:' + (dark ? '#94a3b8' : '#64748b') + ';margin-bottom:4px">Leave your number — we will call you back.</div>' +
      '<form id="' + NS + '-cb-form">' +
      '<label style="' + labelCss + '">Name<input name="name" type="text" autocomplete="name" style="' + inputCss + '"></label>' +
      '<label style="' + labelCss + '">Phone number *<input name="phone" type="tel" autocomplete="tel" required style="' + inputCss + '" placeholder="+971 50 123 4567"></label>' +
      '<label style="' + labelCss + '">Topic<select name="topic" style="' + inputCss + '">' +
      CALLBACK_TOPICS.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></label>' +
      '<label style="' + labelCss + '">Preferred time<select name="when" style="' + inputCss + '">' +
      CALLBACK_WHENS.map(function (x) { return '<option value="' + x.v + '">' + x.label + '</option>'; }).join('') + '</select></label>' +
      '<div id="' + NS + '-cb-custom" style="display:none"><label style="' + labelCss + '">Pick date/time<input name="custom" type="datetime-local" style="' + inputCss + '"></label></div>' +
      '<div id="' + NS + '-cb-err" role="alert" style="display:none;color:#f43f5e;font-size:12px;font-weight:600;margin-top:10px"></div>' +
      '<button type="submit" style="width:100%;margin-top:14px;padding:12px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff;font-size:14px;font-weight:700;cursor:pointer">Request callback</button>' +
      '<button type="button" id="' + NS + '-cb-cancel" style="width:100%;margin-top:8px;padding:8px;border:none;background:transparent;color:' + (dark ? '#94a3b8' : '#64748b') + ';font-size:12px;cursor:pointer;text-decoration:underline">Cancel</button>' +
      '</form></div>';

    var form = cbOverlay.querySelector('#' + NS + '-cb-form');
    var whenSel = form.querySelector('[name=when]');
    var customWrap = cbOverlay.querySelector('#' + NS + '-cb-custom');
    var err = cbOverlay.querySelector('#' + NS + '-cb-err');
    whenSel.addEventListener('change', function () { customWrap.style.display = whenSel.value === 'custom' ? 'block' : 'none'; });
    cbOverlay.querySelector('#' + NS + '-cb-cancel').addEventListener('click', closeCallbackModal);
    cbOverlay.addEventListener('click', function (e) { if (e.target === cbOverlay) closeCallbackModal(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.querySelector('[name=name]').value.trim().slice(0, 80);
      var phone = form.querySelector('[name=phone]').value.trim().slice(0, 32);
      var topic = form.querySelector('[name=topic]').value;
      var when = whenSel.value;
      var custom = form.querySelector('[name=custom]').value;
      if (phone.replace(/\D/g, '').length < 7) {
        err.textContent = 'Please enter a valid phone number.';
        err.style.display = 'block';
        return;
      }
      err.style.display = 'none';
      var whenLabel = cbWhenLabel(when, custom);
      var stored = storeCallbackTicket({ name: name, phone: phone, topic: topic, when: when, whenLabel: whenLabel });
      emit('callbackRequested', {
        ticket_id: stored.id, queued: !stored.inDashboard,
        values: { name: name, phone: phone, topic: topic, when: whenLabel }
      });
      showCallbackDone(whenLabel);
    });
    DOC.body.appendChild(cbOverlay);
  }

  /* ---------- phase 5: chat queue position (shared key, documented above) ---------- */
  function readQueue() {
    try {
      var raw = WIN.localStorage.getItem('brixchat_queue_v1');
      if (!raw) return [];
      var map = JSON.parse(raw);
      var list = map && map[cfg.property];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function queueWaitText(position) {
    var mins = Math.max(1, (position - 1) * 2); // (position-1) x 2 min, labelled "about"
    return 'You\'re #' + position + ' in line — about ' + mins + ' min wait';
  }
  var queueShown = false;
  function maybeShowQueue() {
    if (!cfg.queue || queueShown || state.hidden) return;
    var waiting = readQueue();
    if (!waiting.length) return; // nobody ahead — nothing to show
    queueShown = true;
    // Prospective position if the visitor starts a chat now: 1 + already waiting.
    queuePrompt({ id: 'queue', text: queueWaitText(waiting.length + 1), delay: 1200, dismissAfter: 0 });
  }

  function widgetUrl() {
    var q = 'property=' + encodeURIComponent(cfg.property) +
      '&color=' + encodeURIComponent(cfg.color) +
      '&locale=' + encodeURIComponent(cfg.locale) +
      (cfg.theme ? '&theme=' + encodeURIComponent(cfg.theme) : '') + // phase 3
      '&v=' + encodeURIComponent(cfg.visitor.name) +
      '&e=' + encodeURIComponent(cfg.visitor.email) +
      '&h=' + encodeURIComponent(cfg.visitor.hash) +
      (cfg.greeting ? '&greeting=' + encodeURIComponent(cfg.greeting) : '') +
      (cfg.queue ? '&queue=1' : ''); // phase 5: queue position display
    return host + 'widget?' + q;
  }

  /* ---------- bridge ---------- */
  function sendCmd(cmd, payload) {
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ t: NS + ':cmd', cmd: cmd, payload: payload || {} }, hostOrigin === '*' ? '*' : hostOrigin);
    } catch (e) { /* ignore */ }
  }

  WIN.addEventListener('message', function (ev) {
    if (!frame || ev.source !== frame.contentWindow) return;
    var d = ev.data;
    if (!d || d.t === undefined || String(d.t).indexOf(NS + ':') !== 0) return;
    var type = String(d.t).slice(NS.length + 1);
    var p = d.payload || {};
    if (type === 'open') { setOpen(true); }
    else if (type === 'close') { setOpen(false); }
    else if (type === 'chatStarted') { state.chatOngoing = true; emit('chatStarted', p); }
    else if (type === 'chatEnded') { state.chatOngoing = false; emit('chatEnded', p); }
    else if (type === 'message') {
      if (p.dir === 'in') {
        emit('messageReceived', p.message);
        if (!state.open) setUnread(state.unread + 1);
      } else {
        emit('messageSent', p.message);
      }
    }
    // phase 2 events from the widget (all backward compatible additions)
    else if (type === 'satisfaction') { emit('satisfaction', p); }
    else if (type === 'ratingSubmitted') { emit('ratingSubmitted', p); } // phase 2 (Worker D): two-step rating
    else if (type === 'typing') { emit('typing', p); }
    else if (type === 'prechatSubmitted') { emit('prechatSubmitted', p); }
    else if (type === 'offlineSubmitted') { emit('offlineSubmitted', p); }
    else if (type === 'transcriptRequested') { emit('transcriptRequested', p); }
    else if (type === 'promptShown') { emit('promptShown', p); }
    else if (type === 'promptDismissed') { emit('promptDismissed', p); }
    else if (type === 'languageChanged') { emit('languageChanged', p); }
    else if (type === 'status') { state.status = p.status || state.status; emit('statusChange', state.status); }
    else if (type === 'proactiveTriggers') { installProactiveTriggers(p.triggers); } // P4-2
  });

  function setOpen(v) {
    state.open = v;
    if (frame) frame.style.display = v ? 'block' : 'none';
    if (bubble) bubble.innerHTML = v ? ICON_X : ICON_CHAT;
    if (bubble && badge) bubble.appendChild(badge); // keep badge on top after innerHTML swap
    if (v) {
      setUnread(0);
      if (activePrompt) dismissPrompt(activePrompt, 'open'); // opening chat consumes the teaser
      try { if (frame) frame.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    } else {
      try { if (bubble) bubble.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      pumpPrompts(); // panel closed — a queued teaser may now show
    }
    applyLang();
    emit(v ? 'open' : 'close', {});
  }

  /* phase 2: Escape closes the panel; Tab cycles lightly between launcher and frame */
  DOC.addEventListener('keydown', function (e) {
    if (!state.booted || state.hidden) return;
    if (e.key === 'Escape' && state.open) { api.close(); return; }
    if (e.key === 'Tab' && state.open && frame && DOC.activeElement === bubble && !e.shiftKey) {
      e.preventDefault();
      try { frame.focus(); } catch (err) { /* ignore */ }
    }
  });

  function setUnread(n) {
    state.unread = n;
    if (badge) {
      badge.style.display = n > 0 ? 'block' : 'none';
      badge.textContent = n > 99 ? '99+' : String(n);
    }
    emit('unreadCountChanged', n);
  }

  /* ---------- public API ---------- */
  function ensureBoot() {
    if (!state.booted) boot({});
  }

  function boot(opts) {
    opts = opts || {};
    if (opts.property) cfg.property = opts.property;
    if (opts.color) cfg.color = opts.color;
    if (opts.position) cfg.position = opts.position;
    if (opts.greeting) cfg.greeting = opts.greeting;
    if (opts.locale && LANGS[opts.locale]) { cfg.locale = opts.locale; applyLang(); }
    if (opts.theme && validTheme(opts.theme)) cfg.theme = opts.theme; // phase 3: boot-time theme override
    if (opts.prechat) cfg.prechat = opts.prechat;   // phase 2 host overrides
    if (opts.offline) cfg.offline = opts.offline;   // phase 2 host overrides
    if (opts.queue !== undefined) cfg.queue = !!opts.queue; // phase 5: chat queue position
    if (opts.visitor) {
      cfg.visitor.name = opts.visitor.name || cfg.visitor.name;
      cfg.visitor.email = opts.visitor.email || cfg.visitor.email;
      cfg.visitor.hash = opts.visitor.hash || cfg.visitor.hash;
    }
    if (state.booted) {
      if (frame) { frame.src = widgetUrl(); state.ready = false; }
      return;
    }
    state.booted = true;
    if (DOC.readyState === 'loading') {
      DOC.addEventListener('DOMContentLoaded', buildDom);
    } else {
      buildDom();
    }
  }

  var api = {
    boot: function (opts) { boot(opts || {}); },
    /* phase 2: host config overrides (pre-chat/offline/language) — forwarded to the widget */
    config: function (opts) {
      ensureBoot(); opts = opts || {};
      if (opts.prechat) cfg.prechat = opts.prechat;
      if (opts.offline) cfg.offline = opts.offline;
      if (opts.language && LANGS[opts.language]) { cfg.locale = opts.language; applyLang(); }
      if (opts.locale && LANGS[opts.locale]) { cfg.locale = opts.locale; applyLang(); }
      sendCmd('config', { locale: cfg.locale, prechat: cfg.prechat, offline: cfg.offline });
    },
    /* phase 2: proactive prompt bubble (queued, auto-dismisses) */
    prompt: function (opts) { ensureBoot(); queuePrompt(opts || {}); },
    /* phase 2: ask the widget to save/email the chat transcript */
    emailTranscript: function (email) { ensureBoot(); sendCmd('emailTranscript', { email: String(email || '') }); },
    /* phase 5: "Request a callback" — loader-side form modal; the ticket is
     * stored in the same localStorage shape the dashboard reads (see header).
     * Emits 'callbackRequested'. The widget panel has its own copy of this
     * form (chat menu → "Request a callback"); the loader command below is
     * the host-side entry point and works even before the panel loads. */
    requestCallback: function () { ensureBoot(); openCallbackModal(); },
    /* phase 3: switch the widget color scheme (light|dark|auto) — reloads the panel */
    setTheme: function (code) {
      ensureBoot();
      if (!validTheme(code)) return false;
      cfg.theme = code;
      if (frame) { frame.style.background = loaderDark() ? '#020617' : '#fff'; frame.src = widgetUrl(); state.ready = false; }
      return true;
    },
    /* phase 2: switch the widget UI language */
    setLanguage: function (code) {
      ensureBoot();
      if (!LANGS[code]) return false;
      cfg.locale = code; applyLang();
      sendCmd('language', { code: code });
      return true;
    },
    show: function () { ensureBoot(); state.hidden = false; if (bubble) bubble.style.display = 'block'; pumpPrompts(); },
    hide: function () { ensureBoot(); state.hidden = true; if (bubble) bubble.style.display = 'none'; if (frame) frame.style.display = 'none'; state.open = false; },
    toggle: function () { ensureBoot(); setOpen(!state.open); },
    open: function () { ensureBoot(); setOpen(true); },
    close: function () { ensureBoot(); setOpen(false); },
    maximize: function () { api.open(); },
    minimize: function () { api.close(); },
    endChat: function () { ensureBoot(); sendCmd('endChat'); state.chatOngoing = false; emit('chatEnded', {}); },
    popup: function () { ensureBoot(); WIN.open(widgetUrl(), NS + '-popup', 'width=400,height=620'); },
    setVisitor: function (v) {
      ensureBoot(); v = v || {};
      if (v.name) cfg.visitor.name = v.name;
      if (v.email) cfg.visitor.email = v.email;
      if (v.hash) cfg.visitor.hash = v.hash;
      sendCmd('setVisitor', { visitor: cfg.visitor });
    },
    setAttributes: function (attrs) {
      ensureBoot(); attrs = attrs || {};
      var keys = Object.keys(attrs).slice(0, 50);
      keys.forEach(function (k) { cfg.attributes[String(k).slice(0, 64)] = String(attrs[k]).slice(0, 255); });
      sendCmd('setAttributes', { attributes: cfg.attributes });
    },
    addTags: function (tags) {
      ensureBoot();
      (tags || []).forEach(function (t) {
        t = String(t).trim().toLowerCase();
        if (t && cfg.tags.indexOf(t) === -1) cfg.tags.push(t);
      });
      sendCmd('setTags', { tags: cfg.tags });
    },
    removeTags: function (tags) {
      ensureBoot();
      (tags || []).forEach(function (t) {
        var i = cfg.tags.indexOf(String(t).trim().toLowerCase());
        if (i !== -1) cfg.tags.splice(i, 1);
      });
      sendCmd('setTags', { tags: cfg.tags });
    },
    trackEvent: function (name, metadata) {
      ensureBoot();
      sendCmd('trackEvent', { name: String(name), metadata: metadata || {} });
      try { (WIN._brixEvents = WIN._brixEvents || []).push({ name: name, metadata: metadata || {}, at: Date.now() }); } catch (e) { /* ignore */ }
    },
    reset: function () {
      cfg.visitor = { name: '', email: '', hash: '' };
      cfg.attributes = {};
      cfg.tags = [];
      state.chatOngoing = false;
      setUnread(0);
      sendCmd('reset');
    },
    getStatus: function () { return state.status; },
    isChatOngoing: function () { return state.chatOngoing; },
    isOpen: function () { return state.open; },
    isHidden: function () { return state.hidden; },
    getUnreadCount: function () { return state.unread; },
    onReady: function (fn) { on('ready', fn); },
    onOpen: function (fn) { on('open', fn); },
    onClose: function (fn) { on('close', fn); },
    onChatStarted: function (fn) { on('chatStarted', fn); },
    onChatEnded: function (fn) { on('chatEnded', fn); },
    onMessageReceived: function (fn) { on('messageReceived', fn); },
    onMessageSent: function (fn) { on('messageSent', fn); },
    onUnreadCountChanged: function (fn) { on('unreadCountChanged', fn); },
    onStatusChange: function (fn) { on('statusChange', fn); },
    onSatisfaction: function (fn) { on('satisfaction', fn); }, // phase 2: CSAT after chat end
    onRating: function (fn) { on('ratingSubmitted', fn); },     // phase 2 (Worker D): { kind: 'csat'|'nps', score }
    onTyping: function (fn) { on('typing', fn); },             // phase 2: visitor typing activity
    onPromptShown: function (fn) { on('promptShown', fn); },
    onPromptDismissed: function (fn) { on('promptDismissed', fn); },
    _config: function () { return cfg; }
  };

  function runCommand(name, args) {
    if (name === 'boot') { api.boot(args[0]); return; }
    if (typeof api[name] === 'function') { api[name].apply(null, args); return; }
    // 'on' style: BrixChat('on', 'open', fn)
    if (name === 'on' && typeof args[1] === 'function') { on(args[0], args[1]); }
  }

  function dispatch() {
    var a = Array.prototype.slice.call(arguments);
    if (typeof a[0] === 'string') { runCommand(a[0], a.slice(1)); return; }
  }
  for (var k in api) dispatch[k] = api[k];
  dispatch.q = queued;

  WIN.BrixChat = dispatch;

  /* replay pre-boot calls */
  var autoBoot = dataAttr('autoboot', '1') !== '0';
  queued.forEach(function (args) { dispatch.apply(null, args); });
  queued.length = 0;
  if (autoBoot && !state.booted) boot({});
})();
