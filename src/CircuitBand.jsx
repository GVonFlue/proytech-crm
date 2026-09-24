import React from 'react';
import { COBALT, ACCENT } from './lib/lead';

/* ============================================================================
   THE CIRCUIT BAND — the brand's trace artwork, behind a navy header.

   The same language as the sidebar art and the merch: traces run straight and
   turn at 45°, and end in either a filled node or an open ring. Two colours —
   the brand's cobalt fading to a lit cyan, and its warm accent — so it reads as
   the brand and not as "blue UI".

   WHERE IT GOES, AND WHERE IT DOES NOT. Only on navy header bands: the lead
   view, the client dashboard and the Relationships header. Never behind
   anything you type into or read at length — the body of those screens is
   white on purpose, and art behind text is the fastest way to make a UI look
   cheap. The mask keeps the left third clear, which is where the name sits.

   Colours come from BRAND (VITE_COLOR_COBALT / VITE_COLOR_ACCENT), so a
   white-label install gets its own palette with no code change. The ids are
   suffixed per instance because two bands can be mounted at once (a lead
   opened over the Relationships page) and SVG ids are document-global.
   ========================================================================== */

/* Each trace: a polyline and how it ends. Drawn on a 900×160 canvas, anchored
   right, so on a narrow header the right-hand cluster is what survives. */
const BLUE = [
  ['M470 160 L470 128 L500 98 L560 98',            'ring'],
  ['M520 160 L520 136 L548 108 L612 108 L636 84 L636 40', 'dot'],
  ['M580 0 L580 30 L604 54 L668 54',                'ring'],
  ['M650 160 L650 120 L676 94 L740 94',             'dot'],
  ['M700 0 L700 22 L724 46 L724 70',                'ring'],
  ['M760 160 L760 132 L786 106 L860 106',           'ring'],
  ['M820 0 L820 36 L846 62 L900 62',                'dot'],
  ['M430 0 L430 28 L452 50 L512 50',                'dot'],
  ['M860 160 L860 140 L880 120 L900 120',           'dot'],
];
const WARM = [
  ['M540 0 L540 20 L562 42 L562 74',                'dot'],
  ['M610 160 L610 142 L630 122 L690 122 L712 100',  'ring'],
  ['M760 0 L760 14 L786 40 L840 40',                'ring'],
  ['M720 160 L720 150 L740 130 L800 130',           'dot'],
];
const end = d => { const p = d.trim().split(/\s+L|M/).filter(Boolean).pop().trim().split(/\s+/); return [+p[0], +p[1]]; };

let seq = 0;
export default function CircuitBand({ className = '' }) {
  const [id] = React.useState(() => 'cb' + (++seq));
  return (
    <svg className={'cband ' + className} viewBox="0 0 900 160" preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id + 'b'} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={COBALT} stopOpacity=".55" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id={id + 'm'} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0" />
          <stop offset="62%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={id + 'k'}><rect width="900" height="160" fill={`url(#${id}m)`} /></mask>
      </defs>
      <g mask={`url(#${id}k)`} fill="none" strokeWidth="1.4" strokeLinejoin="round">
        <g stroke={`url(#${id}b)`}>
          {BLUE.map(([d], i) => <path key={i} d={d} />)}
        </g>
        <g stroke={ACCENT} strokeOpacity=".85">
          {WARM.map(([d], i) => <path key={i} d={d} />)}
        </g>
        {BLUE.concat(WARM).map(([d, kind], i) => {
          const [x, y] = end(d); const warm = i >= BLUE.length;
          const c = warm ? ACCENT : '#5CC8FA';
          return kind === 'ring'
            ? <circle key={'n' + i} cx={x} cy={y} r="3.6" stroke={c} strokeWidth="1.4" />
            : <circle key={'n' + i} cx={x} cy={y} r="2.8" fill={c} stroke="none" />;
        })}
      </g>
    </svg>
  );
}
