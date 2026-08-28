import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { personLabel, personMatch, isUnlabelled } from './lib/lead';

/* PersonPicker — one type-ahead for every place you attach a person.
   ---------------------------------------------------------------------------
   Six pickers across four files each rolled their own <select> over the whole
   lead list, each with its own label format. At 170+ leads a raw dropdown is a
   wall of names you scroll, and the same person read differently depending on
   which screen you were on. That duplication was the bug; this is the fix.

   Matching runs on name AND business (plus email and phone), so whichever one
   you happen to remember gets you there. Records with neither a name nor a
   business sort last rather than being hidden — they are real records, usually
   a half-finished import, and hiding them makes them unreachable. */
export default function PersonPicker({
  people = [], value = '', onChange, placeholder = 'Search a name or business…',
  allowEmpty = true, emptyLabel = '— none —', groupBy = null, autoFocus = false,
  limit = 60, disabled = false, id,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = useMemo(
    () => people.find(p => p.id === value) || null,
    [people, value]
  );

  /* Ordering: best match first while searching; alphabetical when idle. Either
     way the unlabelled records go last so they never head the list. */
  const results = useMemo(() => {
    const scored = [];
    for (const p of people) {
      const s = q.trim() ? personMatch(p, q) : 0;
      if (s < 0) continue;
      scored.push({ p, s, label: personLabel(p), blank: isUnlabelled(p) });
    }
    scored.sort((a, b) => {
      if (a.blank !== b.blank) return a.blank ? 1 : -1;
      if (b.s !== a.s) return b.s - a.s;
      return a.label.localeCompare(b.label);
    });
    return scored.slice(0, limit);
  }, [people, q, limit]);

  const total = useMemo(() => {
    if (!q.trim()) return people.length;
    let n = 0; for (const p of people) if (personMatch(p, q) >= 0) n++;
    return n;
  }, [people, q]);

  useEffect(() => { setHi(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  /* keep the highlighted row in view when arrowing through a long list */
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[hi];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const close = () => { setOpen(false); setQ(''); };
  const pick = p => { onChange && onChange(p ? p.id : ''); close(); };

  const onKey = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const n = results.length + (allowEmpty ? 1 : 0);
      if (!n) return;
      setHi(h => (e.key === 'ArrowDown' ? (h + 1) % n : (h - 1 + n) % n));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const off = allowEmpty ? 1 : 0;
      if (allowEmpty && hi === 0) return pick(null);
      const r = results[hi - off];
      if (r) pick(r.p);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); close(); }
    }
  };

  const rows = [];
  let lastGroup = null;
  results.forEach((r, i) => {
    if (groupBy) {
      const g = groupBy(r.p);
      if (g !== lastGroup) { rows.push({ group: g, key: 'g' + i }); lastGroup = g; }
    }
    rows.push({ ...r, idx: i, key: r.p.id });
  });

  return (
    <div className={'pp' + (disabled ? ' off' : '')} ref={wrapRef}>
      {!open ? (
        <button type="button" className="pp-face" id={id} disabled={disabled}
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current && inputRef.current.focus(), 0); }}>
          <span className={'pp-val' + (selected ? '' : ' none')}>
            {selected ? personLabel(selected) : emptyLabel}
          </span>
          <ChevronDown size={15} />
        </button>
      ) : (
        <div className="pp-open">
          <div className="pp-search">
            <Search size={14} />
            <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
              onKeyDown={onKey} placeholder={placeholder} autoFocus={autoFocus || true}
              aria-label={placeholder} autoComplete="off" />
            {q && <button type="button" className="pp-clear" onClick={() => { setQ(''); inputRef.current.focus(); }} aria-label="Clear"><X size={13} /></button>}
          </div>
          <div className="pp-list" ref={listRef} role="listbox">
            {allowEmpty && (
              <div role="option" aria-selected={!value} className={'pp-row none' + (hi === 0 ? ' hi' : '')}
                onMouseEnter={() => setHi(0)} onMouseDown={e => { e.preventDefault(); pick(null); }}>
                {emptyLabel}
              </div>
            )}
            {rows.map(r => r.group !== undefined
              ? <div key={r.key} className="pp-group">{r.group}</div>
              : (
                <div key={r.key} role="option" aria-selected={r.p.id === value}
                  className={'pp-row' + (hi === r.idx + (allowEmpty ? 1 : 0) ? ' hi' : '') + (r.blank ? ' blank' : '') + (r.p.id === value ? ' sel' : '')}
                  onMouseEnter={() => setHi(r.idx + (allowEmpty ? 1 : 0))}
                  onMouseDown={e => { e.preventDefault(); pick(r.p); }}>
                  {r.label}
                </div>
              ))}
            {!results.length && <div className="pp-empty">No one matches “{q}”.</div>}
          </div>
          {total > results.length &&
            <div className="pp-more">{results.length} of {total} — keep typing to narrow it.</div>}
        </div>
      )}
    </div>
  );
}
