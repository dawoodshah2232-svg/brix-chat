/* Brix Chat — embeddable widget loader.
 * Usage:
 *   <script src="https://dawoodshah2232-svg.github.io/brix-chat/widget.js" data-key="demo"></script>
 * Optional: data-color="#4f46e5" data-position="bottom-right"
 * The chat UI itself lives in an iframe at /brix-chat/widget so the host
 * page stays untouched (no CSS/JS collisions, clean uninstall = delete the tag).
 */
(function () {
  'use strict';
  var HOST = 'https://dawoodshah2232-svg.github.io/brix-chat/';

  function currentScript() {
    if (document.currentScript) return document.currentScript;
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  }

  var tag = currentScript();
  var key = tag.getAttribute('data-key') || 'demo';
  var color = tag.getAttribute('data-color') || '#4f46e5';
  var position = tag.getAttribute('data-position') || 'bottom-right';
  var side = position === 'bottom-left' ? 'left' : 'right';

  var NS = 'brixchat';

  function el(tagName, styles) {
    var e = document.createElement(tagName);
    for (var k in styles) e.style[k] = styles[k];
    return e;
  }

  // Launcher bubble
  var bubble = el('button', {
    position: 'fixed', bottom: '20px', zIndex: '2147483000',
    width: '60px', height: '60px', borderRadius: '50%', border: 'none',
    background: 'linear-gradient(135deg,#6366f1,#06b6d4)', cursor: 'pointer',
    boxShadow: '0 10px 30px rgba(79,70,229,.45)', padding: '0',
  });
  bubble.style[side] = '20px';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.id = NS + '-bubble';
  bubble.innerHTML =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="margin:auto;display:block">' +
    '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" fill="white"/></svg>';

  // Chat frame
  var frame = el('iframe', {
    position: 'fixed', bottom: '94px', zIndex: '2147483000',
    width: '380px', height: '560px', maxHeight: 'calc(100vh - 120px)',
    maxWidth: 'calc(100vw - 32px)', border: 'none', borderRadius: '18px',
    boxShadow: '0 24px 70px rgba(2,6,23,.35)', display: 'none', background: '#fff',
  });
  frame.style[side] = '20px';
  frame.id = NS + '-frame';
  frame.title = 'Brix Chat';
  frame.src = HOST + 'widget?key=' + encodeURIComponent(key) + '&color=' + encodeURIComponent(color);

  var open = false;
  bubble.addEventListener('click', function () {
    open = !open;
    frame.style.display = open ? 'block' : 'none';
    bubble.innerHTML = open
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="margin:auto;display:block"><path d="M6 6l12 12M18 6L6 18" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>'
      : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="margin:auto;display:block"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" fill="white"/></svg>';
  });

  // Allow the iframe to ask to close itself
  window.addEventListener('message', function (ev) {
    if (ev.origin !== 'https://dawoodshah2232-svg.github.io') return;
    if (ev.data === NS + ':close' && open) bubble.click();
  });

  document.body.appendChild(frame);
  document.body.appendChild(bubble);
})();
