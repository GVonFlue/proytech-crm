/* One section screen: progress bar, one group of questions, "Why we ask" and
   "Coming up next" beside it, Back / Save & continue under it.

   "Save & continue" NEVER blocks. A section with a required answer still
   empty is not marked done and says what it is waiting for, but the client
   moves on: required answers block submit, not the flow (spec §3). */
import React from 'react';
import {
  visibleSections, shownFields, sectionTitle, sectionHeadline, sectionLead, sectionBlurb, missingRequired,
} from '../lib/onboarding';
import { Field } from './Fields';

export default function Section({ s, ctx, cfg, answers, files, errors, setAnswer, upload, onBack, onNext, onLater, laterState, locked }) {
  const vis = visibleSections(ctx);
  const idx = vis.findIndex(x => x.id === s.id);
  const next = vis[idx + 1];
  const waiting = missingRequired(ctx, answers, files, cfg).filter(m => m.section === s.id);
  return (<main className="ob-wrap" id="main">
    <div className="ob-steps" aria-hidden="true">{vis.map((x, i) => <span key={x.id} className={i < idx ? 'd' : i === idx ? 'n' : ''} />)}</div>
    <div className="ob-cols">
      <form className="ob-form" onSubmit={e => { e.preventDefault(); onNext(); }} aria-labelledby="ob-sec-h" noValidate>
        <span className="ob-kick">Section {idx + 1} of {vis.length} · {sectionTitle(s, ctx)}</span>
        <h2 id="ob-sec-h">{sectionHeadline(s, ctx)}</h2>
        <p className="lead">{sectionLead(s, ctx)}</p>
        <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {shownFields(s, ctx, answers).map(f => (
            <Field key={f.id} f={f} value={answers[f.id]} onChange={setAnswer} ctx={ctx} cfg={cfg} answers={answers} files={files}
              error={errors[f.id]} upload={upload} />
          ))}
        </fieldset>
        {waiting.length > 0 && <p className="ob-info" style={{ marginTop: 6 }}>Before you submit we'll need: {waiting.map(w => w.label).join(', ')}. You can keep going and come back.</p>}
        <div className="ob-nav">
          <button type="button" className="ob-ghost" onClick={onBack}>← Back</button>
          <button type="submit" className="ob-cta" style={{ margin: 0 }}>{next ? 'Save & continue' : 'Save & review'} <span aria-hidden="true">→</span></button>
        </div>
      </form>
      <aside className="ob-side">
        <div className="ob-card"><h4>Why we ask</h4><p className="why">{s.why}</p></div>
        <div className="ob-card"><h4>Coming up next</h4><p className="why">{next
          ? <><b>{sectionTitle(next, ctx)}:</b> {sectionBlurb(next, ctx).replace(/\.$/, '')}. About {next.minutes} minute{next.minutes === 1 ? '' : 's'}.</>
          : <><b>Review & submit:</b> one last look, then your launch clock starts.</>}</p></div>
        <div className="ob-note"><span aria-hidden="true">✅</span><span><b>Saved automatically.</b> Close this anytime.{' '}
          <button type="button" className="ob-link" onClick={onLater} disabled={laterState === 'sending'}>{laterState === 'sent' ? 'Link sent. Check your email.' : laterState === 'sending' ? 'Sending…' : 'Email me a link to finish later'}</button>
          {laterState && laterState.error && <span role="alert" style={{ display: 'block', color: 'var(--o-bad)', marginTop: 4 }}>{laterState.error}</span>}</span></div>
      </aside>
    </div>
  </main>);
}
