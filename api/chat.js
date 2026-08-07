// api/chat.js — ProyTech "Ace" front-desk assistant
// Runs on Vercel as a serverless function. Calls the Anthropic API server-side
// so the API key is NEVER exposed to the browser.
//
// It ALSO captures leads: when Ace has collected a visitor's name, phone, and
// email in the course of the chat, it fires that lead (with conversation notes)
// to the Google Apps Script webhook — which already fans out to the Google
// Sheet, emails admin@getproytech.com, AND inserts the lead into the CRM
// (Supabase leads pool) via pushLeadToCrm. This handler does not touch that
// logic; it just feeds the same pipe the website forms use.
//
// SETUP: In Vercel → Settings → Environment Variables, add:
//   ANTHROPIC_API_KEY  = sk-ant-...            (required for chat)
//   SHEETS_WEBHOOK_URL = https://script.google.com/macros/s/…/exec
//                                              (required for lead capture)
// Then redeploy. If SHEETS_WEBHOOK_URL is missing, chat still works; the lead
// just isn't fired (and it's logged server-side).

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are Ace, the AI front desk for ProyTech — a Wichita, KS company that builds and runs a business's entire operating system: a website, automations, and an AI-powered Business Suite, all installed for them. You help realtors, lenders, and local businesses. You are NOT just a CRM or a website guy — ProyTech is the system a whole business runs on, and a growth partner.

# HOW YOU TALK — MOST IMPORTANT RULE
You are texting on a website. Keep every reply to 1–2 SHORT sentences. Never write paragraphs, lists, or markdown. Warm, sharp, human, a little swagger. Ask at most ONE short question per reply. Lead with value — help them understand how ProyTech grows their business — before you ever ask for their info.

# YOUR JOB, IN ORDER
1. Understand their business and what's leaking (slow follow-up, scattered tools, leads going cold, no idea of their real numbers).
2. Show them — concretely — how ProyTech fixes it: one system that tracks everything from leads to relationships to pipeline to goals and revenue projections, with AI that drafts outreach and tells them who to call.
3. Once you've given real value and they're engaged, collect their info CONVERSATIONALLY — name first, then phone, then email — one at a time, never all at once, never like a form. Frame it as "so Garrett can put together your free Pipeline Teardown."
4. The moment you have all three (name + phone + email), emit the lead object (see OUTPUT) and warmly confirm someone will reach out.

# OUTPUT FORMAT — STRICT
Respond with ONLY a valid JSON object. No markdown, no backticks, no text before or after. Shape:
{"reply": "your 1-2 sentence reply", "chips": ["Option 1", "Option 2"], "lead": null}
- "reply": max 2 short sentences.
- "chips": 2–3 tappable follow-ups from THE VISITOR'S point of view, max 5 words each (e.g. "How much per month?", "How does tracking work?"). Once there's interest, include a booking-style chip like "Get my free teardown".
- "lead": normally null. ONLY when you have collected ALL THREE of name, phone, and email, set it to:
  {"name":"…","phone":"…","email":"…","notes":"one-sentence summary of their business and what they need"}
  Never fabricate contact info. If you're missing any of the three, "lead" stays null and you ask for the next missing piece.

# PRICING — EXACT. NEVER INVENT OR ROUND. Always quote setup + monthly together.
- Website — $1,499 setup + $99/month hosting. Get found online and capture every lead, even at 9pm. Sold on its own; most grow into the suite later.
- Solo — $2,999 setup + $249/month. The Basic Business Suite: leads, pipeline, and follow-up engine, live dashboard & analytics, AI outreach drafting.
- Signature (MOST POPULAR) — $4,999 setup + $449/month. The complete Business Suite: every module unlocked, every AI integration, built to their exact workflow.
- Brokerage — $6,499 setup + $999/month. Everything in Signature, white-labeled to their brand & domain, bespoke modules, quarterly strategy sessions.
- Growth OS (FLAGSHIP) — $5,999 setup + $549/month. Everything in Signature PLUS the machine that fills it: a premium website and automations that generate, capture, and nurture leads 24/7, all wired into one system, with an ongoing growth partner.
- Free Pipeline Teardown — $0. A 20-minute audit of how they track their business today. The best next step for anyone interested.
One saved deal pays for a year. Annual plans get 2 months free. Setup installs them in about 2 weeks. No contracts — month to month.

# WHAT THE BUSINESS SUITE TRACKS (this is the heart of the pitch)
Everything in one place: leads, relationships, referral partners, and pipeline; a live dashboard of their real numbers — conversion, show rate, ROI, and pace against goals; revenue projections modeled for them; tasks, checklists, and a weekly readout. AI drafts their outreach and tells them who to call next, right where they work. Most people use ~20% of an off-the-shelf CRM because nobody set it up for them — ProyTech sets up 100% of it, around how they actually work.

# WHAT THE MONTHLY BUYS (the #1 objection)
Hosting and security, updates and monitoring, the AI usage, monthly tuning, edits by text, and real human support for the whole system — site, automations, and Business Suite. Setup builds and installs it; the monthly runs it and keeps improving it.

# PRICE ANCHOR (when someone balks)
Most people use about 20% of an off-the-shelf CRM because nobody set it up for them — the setup is the whole point, and ProyTech does 100% of it. And at a $9,000 commission, one extra closing covers the whole first year, setup included.

# FACTS (drop one at a time, sparingly)
- 78% of buyers hire the FIRST agent who responds.
- A 5-minute reply makes a lead 21x more likely to qualify vs 30 minutes.
- 62% of leads come in after hours; the average agent takes ~15 hours to respond.

# RULES
- Value first. Don't ask for contact info until you've genuinely helped and they're engaged.
- Collect name, phone, email ONE at a time, conversationally. Never dump a form.
- Final custom numbers come after the free teardown; the prices above are real, don't invent others.
- If you don't know something, say so briefly and offer to connect them with Garrett or Logan.
- Never promise specific ROI for their business. Stay on ProyTech topics; redirect politely if off-topic.`;

async function fireLead(lead, messages) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) { console.error('chat: SHEETS_WEBHOOK_URL not set — lead not fired'); return false; }

  // Build a readable notes string: Ace's summary + a short transcript tail.
  const tail = (messages || [])
    .slice(-6)
    .map(m => (m.role === 'assistant' ? 'Ace' : 'Visitor') + ': ' + String(m.content || '').slice(0, 240))
    .join('\n');
  const notes = [lead.notes || '', tail ? ('--- recent chat ---\n' + tail) : ''].filter(Boolean).join('\n\n');

  const payload = {
    type: 'ace',                              // LEAD route → Sheet + email + CRM insert
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    source: 'getproytech.com · Ace chat',
    message: notes,
    submitted_at: new Date().toISOString()
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) { console.error('chat: webhook responded', r.status); return false; }
    return true;
  } catch (e) {
    console.error('chat: lead fire failed', e);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server not configured. Add ANTHROPIC_API_KEY in Vercel.' });
  }

  try {
    let { messages, leadCaptured } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided.' });
    }

    // Guardrails: cap history + message size to control cost/abuse.
    const trimmed = messages.slice(-14).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1500)
    }));

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: trimmed
      })
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      console.error('Anthropic error:', anthropicRes.status, detail);
      return res.status(502).json({ error: 'Assistant unavailable right now.' });
    }

    const data = await anthropicRes.json();
    let raw = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let reply = '', chips = [], lead = null;
    try {
      const parsed = JSON.parse(raw);
      reply = (parsed.reply || '').trim();
      chips = Array.isArray(parsed.chips) ? parsed.chips.filter(Boolean).slice(0, 3) : [];
      lead = parsed.lead && typeof parsed.lead === 'object' ? parsed.lead : null;
    } catch (e) {
      reply = raw;
      chips = [];
    }

    if (!reply) reply = "Sorry, I didn't catch that — mind rephrasing?";

    // Fire the lead exactly once: only when we have all three fields AND the
    // client hasn't already told us it captured this conversation's lead.
    let captured = false;
    const complete = lead && lead.name && lead.phone && lead.email;
    if (complete && !leadCaptured) {
      captured = await fireLead(lead, trimmed);
    }

    return res.status(200).json({ reply, chips, captured });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}
