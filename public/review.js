/* review.js: the client portal's markup overlay, carried by PREVIEW builds of
   a client's site (client portal B-2; CLIENT-LIFECYCLE-SPEC B2.3, B4).

   IT DOES NOTHING unless all three hold:
     1. the page is inside a frame;
     2. the frame's parent is the PORTAL: the one origin this file trusts is
        the origin it was served from (its own <script src>), so the tag must
        point at the portal's own /review.js and nothing on the page can widen
        it;
     3. the portal says hello with a one-time nonce AND the exact host this
        page is on (the portal only frames the preview URL the owner saved,
        on a host Settings allows).
   Opened directly, on the live site, or framed by anyone else: no listener
   does anything, nothing is drawn, nothing is sent.

   It holds no login and no token, reads no cookie or storage, and talks only
   to that one origin (postMessage with an explicit targetOrigin, never "*").
   What it sends is what a pin needs: the page path, a CSS selector, the
   element's visible text (200 characters), where on the element the click
   was, the viewport, and a best-effort screenshot of what is on screen.
   The client types their note in the PORTAL, never into this page. */
(function () {
  'use strict';
  var w = window, d = document;
  if (w.__ptReview) return;
  var parentWin;
  try { parentWin = w.parent; } catch (e) { return; }
  if (!parentWin || parentWin === w) return;                   /* 1. not framed: inert */
  var me = d.currentScript, TRUSTED;
  try { TRUSTED = new URL(me && me.src).origin; } catch (e) { return; }
  if (!/^https:\/\/[^/]+$/.test(TRUSTED)) return;             /* served over https, or nothing */
  w.__ptReview = true;

  var nonce = null, picking = false, pins = [], layer = null, root = null, box = null, temp = null, lastPath = '';
  var Z = '2147483647';
  var pathNow = function () { return (location.pathname + location.search).slice(0, 500) || '/'; };
  var send = function (m) { m.src = 'pt-review'; m.nonce = nonce; try { parentWin.postMessage(m, TRUSTED); } catch (e) { /* the portal went away */ } };

  w.addEventListener('message', function (e) {
    if (e.source !== parentWin || e.origin !== TRUSTED) return; /* 2. only the portal */
    var m = e.data;
    if (!m || typeof m !== 'object' || m.src !== 'pt-portal') return;
    if (m.type === 'hello') {                                  /* 3. the handshake */
      if (typeof m.nonce !== 'string' || m.nonce.length < 16 || m.host !== location.host) return;
      nonce = m.nonce; lastPath = pathNow(); ensureLayer();
      send({ type: 'ready', path: lastPath, title: String(d.title || '').slice(0, 120) });
      return;
    }
    if (!nonce || m.nonce !== nonce) return;
    if (m.type === 'mode') setPicking(!!m.on);
    else if (m.type === 'pins') { pins = Array.isArray(m.pins) ? m.pins.slice(0, 200) : []; clearTemp(); drawPins(); }
  });

  /* ---------------------------------------------------------- the layer */
  function ensureLayer() {
    if (layer) return;
    layer = d.createElement('div');
    layer.setAttribute('data-pt-review', '');
    layer.style.cssText = 'all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:' + Z + ';pointer-events:none';
    root = layer.attachShadow ? layer.attachShadow({ mode: 'closed' }) : layer;
    var st = d.createElement('style');
    st.textContent = '.box{position:fixed;border:2px solid #FB6926;background:rgba(251,105,38,.08);border-radius:4px;pointer-events:none;display:none;z-index:' + Z + '}'
      + '.pin{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#CC4A0A;color:#fff;font:700 12px/26px -apple-system,Segoe UI,Arial,sans-serif;text-align:center;box-shadow:0 0 0 3px #fff,0 4px 10px rgba(0,0,0,.35);pointer-events:none}'
      + '.pin.done{background:#1f8a55}.pin.tmp{background:#2E9BFF}';
    root.appendChild(st);
    box = d.createElement('div'); box.className = 'box'; root.appendChild(box);
    d.documentElement.appendChild(layer);
    var redraw = function () { if (pins.length || temp) w.requestAnimationFrame(drawPins); };
    w.addEventListener('scroll', redraw, true);
    w.addEventListener('resize', redraw);
    /* a site that changes page without reloading */
    setInterval(function () { var p = pathNow(); if (p !== lastPath) { lastPath = p; pins = []; clearTemp(); drawPins(); send({ type: 'page', path: p, title: String(d.title || '').slice(0, 120) }); } }, 800);
  }
  var ours = function (el) { return el === layer || (layer && layer.contains(el)); };

  function setPicking(on) {
    picking = on;
    if (box) box.style.display = 'none';
    d.documentElement.style.cursor = on ? 'crosshair' : '';
  }
  d.addEventListener('mousemove', function (e) {
    if (!picking || !box) return;
    var el = e.target;
    if (!el || el.nodeType !== 1 || ours(el)) { box.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    box.style.display = 'block'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  }, true);
  var swallow = function (e) { if (picking) { e.preventDefault(); e.stopPropagation(); } };
  d.addEventListener('submit', swallow, true);
  d.addEventListener('click', function (e) {
    if (!picking) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    if (!el || el.nodeType !== 1 || ours(el)) return;
    var p = pinOf(el, e);
    var key = String(Date.now()) + Math.random().toString(36).slice(2, 8);
    temp = { selector: p.selector, x_pct: p.x_pct, y_pct: p.y_pct };
    setPicking(false); drawPins();
    send({ type: 'pin', key: key, pin: p });
    shot().then(function (data) { send({ type: 'shot', key: key, data: data }); });
  }, true);

  /* ------------------------------------------------------------- a pin */
  function cssEsc(s) { return w.CSS && w.CSS.escape ? w.CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; }); }
  function uniqueId(el) { try { return el.id && d.querySelectorAll('#' + cssEsc(el.id)).length === 1; } catch (e) { return false; } }
  /** A selector that finds this element again: its own unique id, else a
   *  tag:nth-of-type path up to the nearest unique id (or <body>). Classes
   *  are left out on purpose: builders generate and rename them. */
  function selectorOf(el) {
    if (uniqueId(el)) return '#' + cssEsc(el.id);
    var parts = [], cur = el;
    while (cur && cur.nodeType === 1 && cur !== d.documentElement && parts.length < 14) {
      if (cur !== el && uniqueId(cur)) { parts.unshift('#' + cssEsc(cur.id)); break; }
      var tag = cur.tagName.toLowerCase();
      if (tag === 'body') { parts.unshift('body'); break; }
      var i = 1, n = 0, sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      if (cur.parentElement) for (var k = 0; k < cur.parentElement.children.length; k++) if (cur.parentElement.children[k].tagName === cur.tagName) n++;
      parts.unshift(n > 1 ? tag + ':nth-of-type(' + i + ')' : tag);
      cur = cur.parentElement;
    }
    return parts.join(' > ').slice(0, 600);
  }
  function textOf(el) {
    var t = (typeof el.innerText === 'string' ? el.innerText : '') || el.textContent || el.getAttribute('alt') || el.getAttribute('aria-label') || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  var clamp = function (v) { return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10; };
  function pinOf(el, e) {
    var r = el.getBoundingClientRect();
    var vw = w.innerWidth || 0, vh = w.innerHeight || 0;
    return {
      path: pathNow(), selector: selectorOf(el), snippet: textOf(el),
      x_pct: r.width ? clamp(((e.clientX - r.left) / r.width) * 100) : 50,
      y_pct: r.height ? clamp(((e.clientY - r.top) / r.height) * 100) : 50,
      vw: vw, vh: vh, device: vw < 600 ? 'phone' : vw < 1024 ? 'tablet' : 'desktop',
    };
  }
  function clearTemp() { temp = null; }
  function drawPins() {
    if (!root) return;
    var old = root.querySelectorAll('.pin');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var all = pins.slice();
    if (temp) all.push({ n: '+', selector: temp.selector, x_pct: temp.x_pct, y_pct: temp.y_pct, tmp: true });
    for (var j = 0; j < all.length; j++) {
      var p = all[j], el = null;
      try { el = p && p.selector ? d.querySelector(String(p.selector)) : null; } catch (e) { el = null; }
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var dot = d.createElement('div');
      dot.className = 'pin' + (p.tmp ? ' tmp' : p.done ? ' done' : '');
      dot.textContent = String(p.n == null ? '' : p.n).slice(0, 3);
      dot.style.left = (r.left + w.scrollX + (r.width * (Number(p.x_pct) || 50)) / 100) + 'px';
      dot.style.top = (r.top + w.scrollY + (r.height * (Number(p.y_pct) || 50)) / 100) + 'px';
      root.appendChild(dot);
    }
  }

  /* ------------------------------------------------ the screenshot (best effort)
     What is on screen, redrawn from the page itself: the visible part of the
     document cloned with its computed styles into an SVG, painted onto a
     canvas. Images from this site come along; images from elsewhere, web
     fonts and CSS background images may not. Any failure, a page too big,
     or more than 4 seconds: no screenshot, and the note saves without one. */
  var PROPS = ['display', 'position', 'top', 'left', 'right', 'bottom', 'float', 'clear', 'width', 'height', 'min-height', 'max-width',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-sizing', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'box-shadow',
    'color', 'background-color', 'opacity', 'visibility', 'overflow', 'z-index', 'transform',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'white-space', 'word-break',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self', 'justify-content', 'gap', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'object-fit', 'list-style-type', 'vertical-align'];
  var MAX_NODES = 3000;
  function shot() {
    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (v) { if (!settled) { settled = true; resolve(v); } };
      setTimeout(function () { finish(null); }, 4000);
      try {
        var W = w.innerWidth, H = w.innerHeight, count = 0;
        if (!W || !H) return finish(null);
        var copy = function (src) {
          if (++count > MAX_NODES) throw new Error('too big');
          if (src.nodeType === 3) return d.createTextNode(src.nodeValue);
          if (src.nodeType !== 1 || ours(src)) return null;
          var tag = src.tagName.toLowerCase();
          if (tag === 'script' || tag === 'noscript' || tag === 'template' || tag === 'link' || tag === 'meta' || tag === 'style') return null;
          var cs = w.getComputedStyle(src), out;
          if (tag === 'svg') {                                  /* inline icons come along as they are */
            out = src.cloneNode(true);
            out.setAttribute('width', String(src.getBoundingClientRect().width || 0)); out.setAttribute('height', String(src.getBoundingClientRect().height || 0));
            return out;
          }
          if (tag === 'iframe' || tag === 'video' || tag === 'canvas') {
            out = d.createElement('div');
            out.style.background = '#E6ECF7';
          } else if (tag === 'img') {
            out = d.createElement('img');
            var data = '';
            try { if (src.complete && src.naturalWidth) { var c = d.createElement('canvas'); c.width = Math.min(src.naturalWidth, 1200); c.height = Math.round(c.width * src.naturalHeight / src.naturalWidth); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); data = c.toDataURL('image/jpeg', 0.7); } } catch (e) { data = ''; }
            if (data) out.setAttribute('src', data); else out.style.background = '#E6ECF7';
          } else {
            out = d.createElement(/^[a-z][a-z0-9-]*$/.test(tag) ? tag : 'div');
          }
          var st = '';
          for (var i = 0; i < PROPS.length; i++) { var v = cs.getPropertyValue(PROPS[i]); if (v) st += PROPS[i] + ':' + v + ';'; }
          out.setAttribute('style', st);
          if (tag !== 'img' && tag !== 'iframe' && tag !== 'video' && tag !== 'canvas')
            for (var n = src.firstChild; n; n = n.nextSibling) { var k = copy(n); if (k) out.appendChild(k); }
          return out;
        };
        var body = copy(d.body);
        if (!body) return finish(null);
        var bg = w.getComputedStyle(d.body).backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = w.getComputedStyle(d.documentElement).backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = '#ffffff';
        var wrap = d.createElement('div');
        wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrap.setAttribute('style', 'width:' + W + 'px;height:' + H + 'px;overflow:hidden;background:' + bg);
        var inner = d.createElement('div');
        inner.setAttribute('style', 'transform:translate(' + (-w.scrollX) + 'px,' + (-w.scrollY) + 'px);width:' + d.documentElement.scrollWidth + 'px');
        inner.appendChild(body); wrap.appendChild(inner);
        var html = new XMLSerializer().serializeToString(wrap);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject width="100%" height="100%">' + html + '</foreignObject></svg>';
        var img = new Image();
        img.onload = function () {
          try {
            var scale = Math.min(1, 1280 / W), c = d.createElement('canvas');
            c.width = Math.round(W * scale); c.height = Math.round(H * scale);
            var g = c.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0);
            var out = c.toDataURL('image/jpeg', 0.72);
            finish(/^data:image\/jpeg;base64,/.test(out) && out.length < 4000000 ? out : null);
          } catch (e) { finish(null); }                         /* a tainted canvas: no screenshot */
        };
        img.onerror = function () { finish(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (e) { finish(null); }
    });
  }
})();
