/* SETTINGS AS TILES: the grid, the search, and which card lives in which tile.

   LAYOUT ONLY. Every tile opens existing settings cards, unchanged: nothing
   here reads, writes or validates a setting except to show a status line,
   and every status line is computed by the same reader the card itself uses
   (readSwitches, readCadence, readLifecycle, readOffer...), so the tile and
   the card cannot disagree.

   EVERY CARD IN EXACTLY ONE TILE. `TILES[].cards` lists the card keys the
   Settings page renders; tests/settingstiles.mjs holds that every key the
   page renders appears in exactly one tile, and no tile names a card the
   page does not have.

   WHO SEES A TILE is who sees its cards today: a tile whose cards are all
   owner-only (`owner: true`) is hidden from anyone who is not an owner. A rep
   has no Settings tab at all (ROLES.md), and that is unchanged.

   DEEP LINKS are ?settings=<tile id>, beside the record's ?lead=<id>: the
   hash belongs to the sign-in links. */
import React, { useMemo, useState } from 'react';
import {
  Image as ImageIcon, LayoutDashboard, SlidersHorizontal, List, Users, Wallet, Bell, Target, Layers, DollarSign, FileText,
  CalendarCheck, Receipt, ArrowLeftRight, KanbanSquare, CalendarClock, Rocket, Mail, HeartHandshake, Mic, Eye, HardDriveDownload, Search, ChevronRight, ArrowLeft,
} from 'lucide-react';

export const GROUPS = [
  ['business', 'Business & brand'],
  ['team', 'Team'],
  ['sales', 'Sales & Proposals'],
  ['money', 'Money'],
  ['clients', 'Clients & Onboarding'],
  ['emails', 'Client emails'],
  ['rels', 'Relationships'],
  ['integrations', 'Integrations'],
  ['security', 'Security & access'],
];

/* id: the URL slug. cards: the page's card keys. keys: words a search should
   find (the setting names inside the card), so "invoice prefix" or "launch
   days" lands on the right tile. owner: every card in it is owner-only. */
export const TILES = [
  { id: 'brand', group: 'business', icon: ImageIcon, title: 'Brand & logo', desc: 'The logo on your CRM, invoices and proposals', cards: ['logo'], keys: ['logo', 'brand', 'image'] },
  { id: 'sections', group: 'business', icon: LayoutDashboard, title: 'Sections', desc: 'Which tabs this install has', cards: ['modules'], keys: ['tabs', 'modules', 'sections', 'turn off', 'hide'] },
  { id: 'dropdowns', group: 'business', icon: SlidersHorizontal, title: 'Dropdown lists', desc: 'Lead sources, business types, next actions, labels', cards: ['options'], keys: ['source', 'business type', 'next action', 'labels', 'key dates', 'service interest', 'arrived via', 'options'] },
  { id: 'fields', group: 'business', icon: List, title: 'Custom fields', desc: 'Extra fields on every lead', cards: ['customFields'], keys: ['custom field', 'fields'] },

  { id: 'team', group: 'team', icon: Users, title: 'Team & roles', desc: 'Who can sign in, owners and reps, their tabs', cards: ['team'], owner: true, keys: ['invite', 'rep', 'owner', 'role', 'tabs', 'deactivate', 'login', 'pools'] },
  { id: 'rep-pay', group: 'team', icon: Wallet, title: 'Rep pay', desc: 'Commission and appointment fees', cards: ['repPay'], owner: true, keys: ['commission', 'appointment', 'fee', 'pay'] },
  { id: 'alerts', group: 'team', icon: Bell, title: 'Conversion alerts', desc: 'Who is emailed when a rep converts a client', cards: ['alerts'], owner: true, keys: ['notify', 'alert', 'conversion email'] },
  { id: 'goals', group: 'team', icon: Target, title: 'Monthly goals', desc: 'Booked, closed, onboarded, revenue and MRR targets', cards: ['goals'], keys: ['goal', 'target', 'revenue goal', 'mrr goal'] },

  { id: 'stages', group: 'sales', icon: Layers, title: 'Pipeline stages', desc: 'The stages a deal moves through', cards: ['stages'], keys: ['stage', 'pipeline', 'probability', 'won', 'lost'] },
  { id: 'services', group: 'sales', icon: DollarSign, title: 'Services & pricing', desc: 'The catalog the deal picker reads', cards: ['services'], keys: ['service', 'price', 'catalog', 'setup', 'monthly'] },
  { id: 'proposals', group: 'sales', icon: FileText, title: 'Proposals', desc: 'The offer, packages and prices proposals are built from', cards: ['proposals'], keys: ['offer', 'package', 'proposal', 'launch days', 'contacts', 'terms'] },
  { id: 'sales-meetings', group: 'sales', icon: CalendarCheck, title: 'Sales meetings', desc: 'Which meeting types count toward conversion ratios', cards: ['ratio'], keys: ['meeting type', 'ratio', 'coffee', 'discovery'] },

  { id: 'invoicing', group: 'money', icon: Receipt, title: 'Invoicing', desc: 'Your business details, terms and invoice numbers', cards: ['invoicing'], keys: ['invoice', 'prefix', 'terms', 'due', 'business address', 'tax'] },
  { id: 'sort-payments', group: 'money', icon: ArrowLeftRight, title: 'Sort payments', desc: 'Which money paid for the work and which for the retainer', cards: ['paymentReview'], owner: true, keys: ['payment', 'setup', 'retainer', 'sort'] },

  { id: 'client-phases', group: 'clients', icon: KanbanSquare, title: 'Client phases', desc: 'The columns of the client board', cards: ['phases'], keys: ['phase', 'client board', 'columns'] },
  { id: 'lifecycle', group: 'clients', icon: CalendarClock, title: 'Client lifecycle', desc: 'Who builds, and the 14-day clock\'s dates', cards: ['lifecycle'], owner: true, keys: ['builder', 'lifecycle', 'clock', 'due dates', 'template'] },
  { id: 'delivery', group: 'clients', icon: Rocket, title: 'Delivery tracks', desc: 'Website, Suite and other build checklists', cards: ['tracks'], keys: ['delivery', 'track', 'milestone'] },

  { id: 'client-emails', group: 'emails', icon: Mail, title: 'Client emails', desc: 'Locked in, saved your seat, Launch Day ticket, day-10 task', cards: ['clientEmails'], owner: true, keys: ['email', 'locked in', 'saved your seat', 'launch day ticket', 'reminder', 'day 10'] },

  { id: 'cadence', group: 'rels', icon: HeartHandshake, title: 'Relationship cadence', desc: 'How often each tier should hear from you', cards: ['cadence'], owner: true, keys: ['cadence', 'tier', 'reach out', 'every days'] },

  { id: 'google', group: 'integrations', icon: CalendarClock, title: 'Google Calendar', desc: 'Bookings, availability and invites', cards: ['gcal'], keys: ['google', 'calendar', 'connect'] },
  { id: 'pocket', group: 'integrations', icon: Mic, title: 'Pocket recordings', desc: 'Bring in recordings from before the webhook', cards: ['pocket'], owner: true, keys: ['pocket', 'recording', 'backfill', 'import'] },

  { id: 'visibility', group: 'security', icon: Eye, title: 'Lead visibility', desc: 'Who sees whose leads: Mine, Pool, All', cards: ['visibility'], keys: ['visibility', 'mine', 'pool', 'all leads', 'team access'] },
  { id: 'backup', group: 'security', icon: HardDriveDownload, title: 'Backup & restore', desc: 'Download everything, or restore from a file', cards: ['backup'], keys: ['backup', 'export', 'restore', 'download'] },
];
export const tileById = id => TILES.find(t => t.id === id) || null;
export const visibleTiles = isOwner => TILES.filter(t => isOwner || !t.owner);

const norm = s => String(s || '').toLowerCase();
/** Tiles matching a search, by title, description or a setting name inside.
 *  `hit` is the setting name that matched, when it was not the title. */
export function searchTiles(q, tiles) {
  const n = norm(q).trim();
  if (!n) return tiles.map(t => ({ tile: t, hit: null }));
  /* a title match first, then a setting's name, then a description */
  return tiles.map((t, i) => {
    if (norm(t.title).includes(n)) return { tile: t, hit: null, rank: 0, i };
    const k = (t.keys || []).find(x => norm(x).includes(n) || n.includes(norm(x)));
    if (k) return { tile: t, hit: k, rank: 1, i };
    if (norm(t.desc).includes(n)) return { tile: t, hit: null, rank: 2, i };
    return null;
  }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.i - b.i).map(({ tile, hit }) => ({ tile, hit }));
}

export function SettingsGrid({ isOwner, status, onOpen }) {
  const [q, setQ] = useState('');
  const tiles = useMemo(() => visibleTiles(isOwner), [isOwner]);
  const found = useMemo(() => searchTiles(q, tiles), [q, tiles]);
  const enter = e => { if (e.key === 'Enter' && found[0]) onOpen(found[0].tile.id, found[0].hit || q); };
  return (<div className="st-wrap">
    <div className="st-search"><Search size={16} />
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={enter} placeholder="Search settings: logo, invoice terms, launch days…" aria-label="Search settings" />
    </div>
    {q && !found.length && <div className="st-none">No setting matches "{q}".</div>}
    {/* AREA SHORTCUTS, phones only (CSS): 23 tiles in one column is a long
        scroll, so each area is one tap away */}
    {!q && <nav className="st-areas" aria-label="Settings areas">{GROUPS.filter(([g]) => tiles.some(t => t.group === g)).map(([g, label]) =>
      <button key={g} type="button" className="st-area" onClick={() => { const el = document.getElementById('st-g-' + g); if (el) el.scrollIntoView({ block: 'start' }); }}>{label}</button>)}</nav>}
    {GROUPS.map(([g, label]) => {
      const list = found.filter(x => x.tile.group === g);
      if (!list.length) return null;
      return (<section key={g} id={'st-g-' + g} className="st-group" aria-label={label}>
        <h3 className="st-gh">{label}</h3>
        <div className="st-grid">{list.map(({ tile: t, hit }) => {
          const Ic = t.icon; const s = status && status[t.id];
          return (<button key={t.id} type="button" className="st-tile" onClick={() => onOpen(t.id, hit || '')} data-tile={t.id}>
            <span className="st-ic"><Ic size={18} /></span>
            <span className="st-body"><b>{t.title}</b><em>{t.desc}</em>
              {hit ? <i className="st-hit">Has "{hit}"</i> : s ? <i className={'st-status ' + (s.tone || '')}>{s.text}</i> : null}</span>
            <ChevronRight size={16} className="st-ch" />
          </button>);
        })}</div>
      </section>);
    })}
  </div>);
}

export function SettingsPanelHead({ tile, onBack }) {
  return (<div className="st-head">
    <button type="button" className="st-back" onClick={onBack}><ArrowLeft size={15} />All settings</button>
    <h2 className="st-title">{tile.title}</h2>
  </div>);
}

export const SETTINGS_TILES_CSS = `
.st-wrap{max-width:1080px}
.st-search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #DCE1F2;border-radius:14px;padding:11px 14px;margin-bottom:18px;color:#5F6680}
.st-search input{flex:1;border:0;outline:0;font:inherit;font-size:15px;color:#14122B;background:transparent;min-width:0}
.st-none{color:#5F6680;font-size:14px;padding:8px 2px 18px}
.st-group{margin-bottom:22px}
.st-gh{font-size:11.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#56607A;margin:0 0 10px}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.st-tile{display:flex;align-items:flex-start;gap:12px;text-align:left;font:inherit;background:#fff;border:1px solid #E3E6F2;border-radius:14px;padding:14px;cursor:pointer;color:#14122B;transition:border-color .12s,box-shadow .12s}
.st-tile:hover,.st-tile:focus-visible{border-color:#B9C5F2;box-shadow:0 8px 22px -14px rgba(43,77,224,.45);outline:none}
.st-ic{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#EEF2FE;color:#2B4DE0}
.st-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.st-body b{font-size:14.5px}
.st-body em{font-style:normal;font-size:12.5px;color:#56607A;line-height:1.4}
.st-status,.st-hit{font-style:normal;font-size:12px;font-weight:700;margin-top:3px;color:#3A4160}
.st-status.ok{color:#14663E}.st-status.warn{color:#8A5A12}.st-status.off{color:#5F6680}
.st-hit{color:#2B4DE0}
.st-ch{flex:none;color:#9AA1B8;margin-top:10px}
.st-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.st-back{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:700;color:#2B4DE0;background:#F3F5FE;border:1px solid #CBD3F5;border-radius:10px;padding:6px 11px;cursor:pointer}
.st-title{font-size:20px;margin:0}
.st-areas{display:none}
.st-flash{animation:stflash 1.6s ease-out}
@keyframes stflash{0%{box-shadow:0 0 0 3px rgba(43,77,224,.55)}100%{box-shadow:0 0 0 3px rgba(43,77,224,0)}}
@media (max-width:560px){.st-grid{grid-template-columns:1fr}.st-tile{padding:12px}
  .st-areas{display:flex;gap:8px;overflow-x:auto;margin:-6px 0 16px;padding-bottom:4px;-webkit-overflow-scrolling:touch}
  .st-area{flex:none;font:inherit;font-size:12.5px;font-weight:700;color:#2B4DE0;background:#F3F5FE;border:1px solid #CBD3F5;border-radius:999px;padding:6px 11px;cursor:pointer;white-space:nowrap}
  .st-group{scroll-margin-top:110px}}
`;
