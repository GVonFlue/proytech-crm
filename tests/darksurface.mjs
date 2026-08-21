/* Is anything unreadable on a dark surface?  — the reusable engine
   ============================================================================

   Written for the lead view, extracted here because the Relationships page is
   next and the check is worth more than the screen it was written for. Two
   passes, and the second one exists because the first was not enough:

   TEXT that is too dark to read on the plate. This is what the original check
   did, and it caught 28 elements the paint had missed.

   SURFACES that are too light to belong in a dark view. The meeting card kept
   its white background from before the paint, so its text was dark on white —
   correct against its own surface, and a white slab floating in a dark view.
   The text pass was structurally incapable of seeing it. Worse, recolouring
   that text for the plate then put white on white and the meeting title read
   as missing. Neither pass alone finds that; both together found ten of them.

   WHY LUMINANCE AND NOT A CONTRAST RATIO. jsdom resolves `color` but cannot
   composite a gradient over a plate over a scrim, so a true WCAG ratio is not
   available. It is also not needed: the ground is dark everywhere on these
   surfaces, so "is this light" and "is this dark" answer the only questions
   being asked, and they answer them for every element rather than the ones a
   hand-audit thought to look at.

   USAGE

     import { audit } from './darksurface.mjs';
     const { count, dark, light } = audit(root, { win: dom.window });
     ok(`${count} elements render text, none of it dark`, !dark.length, dark.join('\n'));
     ok('no element paints a light surface', !light.length, light.join('\n'));

   `root` is the element whose subtree is checked, and by default it is also
   the element custom properties are resolved against. Pass `host` when the
   tokens are declared somewhere else.
*/

export const DARK = 0.35;   // text below this is not readable on the plate
export const LIGHT = 0.5;   // a surface above this is a slab of the old theme

export const nameOf = e => e.tagName.toLowerCase() +
  ((e.className || '').toString().split(' ').filter(Boolean).map(c => '.' + c).join(''));

const HEX = h => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return null;
  const x = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
};

export const luminance = rgb => {
  const c = rgb.map(n => { const q = n / 255; return q <= 0.03928 ? q / 12.92 : ((q + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export function audit(root, opts = {}) {
  const win = opts.win;
  if (!win) throw new Error('audit(root, {win}) — the window is required');
  const hostSel = opts.host || null;
  const darkAt = opts.dark === undefined ? DARK : opts.dark;
  const lightAt = opts.light === undefined ? LIGHT : opts.light;
  const cs = n => win.getComputedStyle(n);

  /* jsdom hands back `var(--ink-hi)` verbatim — it resolves the cascade but not
     custom properties — so one level of var() is resolved against whichever
     element declares them. Without this every painted colour reads as unknown
     and the check silently passes on exactly the things it was written for. */
  const deVar = (v, node) => {
    let out = String(v || '');
    for (let i = 0; i < 4 && /var\(/.test(out); i++) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (_, name, fb) => {
        const host = (hostSel && node.closest(hostSel)) || root || node;
        const got = win.getComputedStyle(host).getPropertyValue(name).trim();
        return got || (fb || '').trim();
      });
    }
    return out.trim();
  };

  const rgbOf = (raw, node) => {
    const v = deVar(raw, node);
    const hx = HEX(v);
    if (hx) return hx;
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
    return m ? [1, 2, 3].map(i => +m[i]) : null;
  };

  /* filter:brightness() genuinely changes what lands on the screen, so honour
     it rather than reading the pre-filter colour — jsdom's computed colour
     does not. The badge pills in the lead view rely on exactly this. */
  const bright = node => {
    let k = 1;
    for (let a = node; a && a.tagName !== 'HTML'; a = a.parentElement) {
      const m = /brightness\(([\d.]+)\)/.exec(win.getComputedStyle(a).filter || '');
      if (m) k *= Number(m[1]);
    }
    return k;
  };

  const chain = n => {
    const out = [];
    for (let a = n.parentElement, i = 0; a && i < 3 && a !== root; a = a.parentElement, i++) out.unshift(nameOf(a));
    return out;
  };

  /* ---- pass 1: text ---- */
  const nodes = [...root.querySelectorAll('*')].filter(n => {
    if (/^(SCRIPT|STYLE|SVG|PATH|CIRCLE|LINE|OPTION)$/.test(n.tagName)) return false;
    if (n.closest('svg')) return false;
    return [...n.childNodes].some(c => c.nodeType === 3 && (c.textContent || '').trim());
  });

  const dark = [];
  for (const n of nodes) {
    const rgb = rgbOf(cs(n).color, n);
    if (!rgb) continue;
    const k = bright(n);
    const L = luminance(k === 1 ? rgb : rgb.map(v => Math.min(255, v * k)));
    if (L < darkAt) {
      dark.push(`${chain(n).join(' > ')} > ${nameOf(n)}  color=${cs(n).color}${k === 1 ? '' : ` x${k}`}` +
                `  L=${L.toFixed(3)}  text="${(n.textContent || '').trim().slice(0, 30)}"`);
    }
  }

  /* ---- pass 2: surfaces ----
     Only an element's OWN background counts. A gradient resolves to
     background-image and leaves background-color transparent, so the dark
     plates and the lit-edge fills are correctly ignored. */
  const light = [];
  for (const n of [...root.querySelectorAll('*')]) {
    if (n.closest('svg')) continue;
    /* The one deliberate exception: .sw b is the knob of a toggle switch. A
       white knob on a dark track is the control reading correctly, not a slab
       of the old theme — it is the moving part, and it carries no text. Named
       here rather than loosening the rule, so it stays the only one. */
    if (n.closest('.sw')) continue;
    const raw = cs(n).backgroundColor || '';
    if (!raw || /transparent/.test(raw)) continue;
    const al = /rgba\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+[,\s]+([\d.]+)/.exec(raw);
    if (al && Number(al[1]) < 0.5) continue;    // a tint over the plate, not a slab
    const rgb = rgbOf(raw, n);
    if (!rgb) continue;
    const L = luminance(rgb);
    if (L > lightAt) {
      light.push(`${chain(n).join(' > ')} > ${nameOf(n)}  background=${raw}  L=${L.toFixed(3)}` +
                 `  text="${(n.textContent || '').trim().slice(0, 30)}"`);
    }
  }

  return { count: nodes.length, dark, light };
}

/* The luminance of ONE element's text, brightness honoured — for the handful
   of cases worth naming individually rather than sweeping. Returns null when
   the colour cannot be resolved, which callers should treat as a failure
   rather than a pass. */
export function nodeLuminance(node, opts = {}) {
  const win = opts.win;
  if (!win) throw new Error('nodeLuminance(node, {win}) — the window is required');
  const host = (opts.host && node.closest(opts.host)) || opts.root || node;
  let raw = String(win.getComputedStyle(node).color || '');
  for (let i = 0; i < 4 && /var\(/.test(raw); i++) {
    raw = raw.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (_, name, fb) =>
      win.getComputedStyle(host).getPropertyValue(name).trim() || (fb || '').trim());
  }
  const hx = HEX(raw);
  const m = hx ? null : /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(raw);
  const rgb = hx || (m ? [1, 2, 3].map(i => +m[i]) : null);
  if (!rgb) return null;
  let k = 1;
  for (let a = node; a && a.tagName !== 'HTML'; a = a.parentElement) {
    const b = /brightness\(([\d.]+)\)/.exec(win.getComputedStyle(a).filter || '');
    if (b) k *= Number(b[1]);
  }
  return luminance(rgb.map(v => Math.min(255, v * k)));
}
