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
 *   data-color, data-position (bottom-right|bottom-left), data-greeting, data-locale.
 *
 * JS API (all calls are safe before the widget finishes loading — they queue):
 *   BrixChat('boot', { property, visitor })   // start (auto-boots from data-* if omitted)
 *   BrixChat('config', { prechat, offline, language }) // host overrides forwarded to widget (phase 2)
 *   BrixChat('prompt', { text, delay, dismissAfter })  // proactive teaser bubble, queued (phase 2)
 *   BrixChat('emailTranscript', email)       // ask the widget to send/save a transcript (phase 2)
 *   BrixChat('setLanguage', code)            // en|es|fr|de|ar|ur (phase 2)
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
 *   BrixChat.onTyping(fn)                     // visitor typing activity (phase 2)
 *   window events: 'brixchat:ready', 'brixchat:satisfaction', ...
 *
 * Secure mode: pass visitor.hash = HMAC-SHA256(email, property_secret), generated
 * on your server. The loader forwards it to the widget; server-side verification
 * activates with the backend phase (today the hash is accepted and stored).
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

  var cfg = {
    property: dataAttr('property', dataAttr('key', '')),
    color: dataAttr('color', '#4f46e5'),
    position: dataAttr('position', 'bottom-right'),
    greeting: dataAttr('greeting', ''),
    locale: validLocale,
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
    tags: []
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
      boxShadow: '0 24px 70px rgba(2,6,23,.35)', display: 'none', background: '#fff'
    }, { id: NS + '-frame', title: t('chatPanel'), role: 'dialog', 'aria-modal': 'false', 'aria-label': t('chatPanel'), tabindex: '-1' });
    frame.style[side] = '20px';
    frame.src = widgetUrl();
    frame.addEventListener('load', function () {
      if (!state.ready) {
        state.ready = true;
        emit('ready', { property: cfg.property });
        sendCmd('config', {
          greeting: cfg.greeting, locale: cfg.locale,
          visitor: cfg.visitor, attributes: cfg.attributes, tags: cfg.tags,
          prechat: cfg.prechat, offline: cfg.offline // phase 2 host overrides
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
      background: '#fff', borderRadius: '14px', padding: '12px 36px 12px 14px',
      boxShadow: '0 12px 32px rgba(2,6,23,.22)', fontSize: '13px', color: '#1e293b',
      fontFamily: 'system-ui,sans-serif', lineHeight: '1.45', cursor: 'pointer',
      border: '1px solid rgba(99,102,241,.18)', animation: NS + '-pop .25s ease-out'
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

  function widgetUrl() {
    var q = 'property=' + encodeURIComponent(cfg.property) +
      '&color=' + encodeURIComponent(cfg.color) +
      '&locale=' + encodeURIComponent(cfg.locale) +
      '&v=' + encodeURIComponent(cfg.visitor.name) +
      '&e=' + encodeURIComponent(cfg.visitor.email) +
      '&h=' + encodeURIComponent(cfg.visitor.hash) +
      (cfg.greeting ? '&greeting=' + encodeURIComponent(cfg.greeting) : '');
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
    else if (type === 'typing') { emit('typing', p); }
    else if (type === 'prechatSubmitted') { emit('prechatSubmitted', p); }
    else if (type === 'offlineSubmitted') { emit('offlineSubmitted', p); }
    else if (type === 'transcriptRequested') { emit('transcriptRequested', p); }
    else if (type === 'promptShown') { emit('promptShown', p); }
    else if (type === 'promptDismissed') { emit('promptDismissed', p); }
    else if (type === 'languageChanged') { emit('languageChanged', p); }
    else if (type === 'status') { state.status = p.status || state.status; emit('statusChange', state.status); }
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
    if (opts.prechat) cfg.prechat = opts.prechat;   // phase 2 host overrides
    if (opts.offline) cfg.offline = opts.offline;   // phase 2 host overrides
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
