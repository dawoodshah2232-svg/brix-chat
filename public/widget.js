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
 *   window event: 'brixchat:ready'
 *
 * Secure mode: pass visitor.hash = HMAC-SHA256(email, property_secret), generated
 * on your server. The loader forwards it to the widget; server-side verification
 * activates with the backend phase (today the hash is accepted and stored).
 */
(function () {
  'use strict';

  var WIN = window, DOC = document;
  var NS = 'brixchat';

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

  var cfg = {
    property: dataAttr('property', dataAttr('key', '')),
    color: dataAttr('color', '#4f46e5'),
    position: dataAttr('position', 'bottom-right'),
    greeting: dataAttr('greeting', ''),
    locale: dataAttr('locale', 'en'),
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
  var bubble = null, badge = null, frame = null;

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
    }, { 'aria-label': 'Open chat', id: NS + '-bubble' });
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
    }, { id: NS + '-frame', title: 'Brix Chat' });
    frame.style[side] = '20px';
    frame.src = widgetUrl();
    frame.addEventListener('load', function () {
      if (!state.ready) {
        state.ready = true;
        emit('ready', { property: cfg.property });
        sendCmd('config', {
          greeting: cfg.greeting, locale: cfg.locale,
          visitor: cfg.visitor, attributes: cfg.attributes, tags: cfg.tags
        });
      }
    });

    bubble.addEventListener('click', function () { api.toggle(); });

    DOC.body.appendChild(frame);
    DOC.body.appendChild(bubble);
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
  });

  function setOpen(v) {
    state.open = v;
    if (frame) frame.style.display = v ? 'block' : 'none';
    if (bubble) bubble.innerHTML = v ? ICON_X : ICON_CHAT;
    if (bubble && badge) bubble.appendChild(badge); // keep badge on top after innerHTML swap
    if (v) setUnread(0);
    emit(v ? 'open' : 'close', {});
  }

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
    if (opts.locale) cfg.locale = opts.locale;
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
    show: function () { ensureBoot(); state.hidden = false; if (bubble) bubble.style.display = 'block'; },
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
