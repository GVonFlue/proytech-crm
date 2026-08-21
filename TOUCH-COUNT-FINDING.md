# Machine-written notes are counted as human contact

**Status:** open. Not fixed. Deliberately kept out of the lead-view redesign so
the before and after can be seen side by side.

**Class:** the same one as REP-AUDIT #9 — a number a rep is measured on, made
wrong by a default nobody chose.

---

## The bug

`touch()` in `src/LeadView.jsx` counts activity by type and then removes exactly
one machine-written note:

```js
/* "Lead created." is written by the system, not by you — counting it as a
   note would mean every lead claims one touch it never had. */
const sysNotes = acts.filter(a => a.type === 'Note' && /^Lead created\.$/.test(a.text || '')).length;
by.Note = Math.max(0, by.Note - sysNotes);
```

**The reasoning in that comment is correct and applies to seventeen other
writes.** Only this one is excluded.

## Everything else it should exclude

Eighteen distinct literal prefixes, every one written by the app rather than by
a person, every one stored as `type:'Note'`:

| note | written when | file |
|---|---|---|
| `Follow-up cleared.` / `Follow-up done — …` | **every follow-up cleared** | `App.jsx:3684` |
| `Stage moved: X → Y` | every stage change | `App.jsx` |
| `Deal value set to $X` | every deal-value edit (folded within 15 min) | `App.jsx` |
| `Phase → X` | every client phase change | `App.jsx` |
| `Close date set to …` | fixing close tracking | `App.jsx` |
| `Commission approved — …` / `Commission voided…` | owner approves or voids | `App.jsx` |
| `Converted to client — onboarding started.` | conversion | `App.jsx` |
| `Signed — onboarding started.` | stage → won | `App.jsx` |
| `Reverted to lead — back to …` | revert | `App.jsx` |
| `Invoice …` | invoice actions | `App.jsx` |
| `Payment confirmed …` | marking payment collected | both |
| `Payment marked as not collected.` | un-marking it | `LeadView.jsx` |
| `Deal closed: …` | closing a deal | `LeadView.jsx` |
| `New build started: …` | closing a deal on a client | `LeadView.jsx` |
| `Sponsorship logged: …` | logging one by hand | `LeadView.jsx` |
| `Dated: …` | dating an undated meeting | `LeadView.jsx` |
| `Lead created.` | creation — **the one already excluded** | both |

`Follow-up cleared.` is the loudest of them because it fires on the most
routine action in the app. A lead worked properly for a month collects one per
follow-up.

## What is actually wrong on screen

Three things, all on the lead view, all reading from `touch`:

1. **The Notes chip** — `Notes (n)` in the filter row. `noteCount` is a plain
   `filter(a => a.type === 'Note').length` with no exclusion at all, so it is
   wrong by *every* machine note including `Lead created.`
2. **The contact tally** in the prep rail — `N conversations · X notes`.
3. **`touch.total`**, which is the `All (n)` chip.

`touch.spoken` — calls + meetings + booked — is **not affected**. Neither is
anything outside this screen: `REACHED_TYPES` deliberately excludes `Note`
entirely, so touch counts, the untouched filter and the conversion ratio are
all unharmed. **This is a display bug on one screen, not a metrics bug.** That
is the reason it can wait for its own PR.

## How many leads are affected

Any lead that has ever had a follow-up cleared, a stage changed, a deal value
edited, or a payment confirmed — which is close to "every lead anyone has
worked". The exact number needs the database:

```sql
-- leads carrying at least one machine-written note, and how many each has
with sys as (
  select l.id,
         count(*) filter (where a->>'type' = 'Note' and (
              a->>'text' like 'Lead created.%'        or a->>'text' like 'Follow-up cleared.%'
           or a->>'text' like 'Follow-up done —%'     or a->>'text' like 'Stage moved:%'
           or a->>'text' like 'Deal value set to%'    or a->>'text' like 'Phase →%'
           or a->>'text' like 'Close date set to%'    or a->>'text' like 'Commission approved%'
           or a->>'text' like 'Commission voided%'    or a->>'text' like 'Converted to client%'
           or a->>'text' like 'Signed — onboarding%'  or a->>'text' like 'Reverted to lead%'
           or a->>'text' like 'Invoice %'             or a->>'text' like 'Payment confirmed%'
           or a->>'text' like 'Payment marked as not collected%'
           or a->>'text' like 'Deal closed:%'         or a->>'text' like 'New build started:%'
           or a->>'text' like 'Sponsorship logged:%'  or a->>'text' like 'Dated:%'
         )) as machine,
         count(*) filter (where a->>'type' = 'Note') as all_notes
    from leads l, jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
   group by l.id
)
select count(*)                                        as leads_with_notes,
       count(*) filter (where machine > 0)             as leads_affected,
       sum(machine)                                    as machine_notes_total,
       sum(all_notes)                                  as notes_shown_total,
       round(100.0 * sum(machine) / nullif(sum(all_notes),0), 1) as pct_machine
  from sys where all_notes > 0;
```

`pct_machine` is the headline: the share of the Notes chip that is the app
talking to itself.

## The fix, when it is its own PR

Extend the exclusion `touch()` already applies to `Lead created.` to the whole
set, and apply the same exclusion to `noteCount`, which currently has none.

One shared predicate — `isSystemNote(a)` — read by both, so they cannot
disagree. It changes **displayed counts only**; no write path, no stored field,
nothing outside this screen.

**Do it after the redesign, not inside it.** The numbers move, and they should
move in a diff where that is the only thing happening.

## Related

- The redesign folds *consecutive* machine notes into one collapsed line so
  they stop crowding the history. That is presentation and does not touch any
  count — the two changes are independent and the fold does not fix this.
- REP-AUDIT #9, same class: a default nobody chose, quietly wrong in the
  numbers a rep is judged by.
