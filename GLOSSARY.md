# Glossary

Every term I've actually used with you on this build, in plain English, with the
place it shows up in your own code. Skim the headings; read what you need.

---

## Your stack, in one paragraph

Your CRM is a **React** app written in **JSX**, bundled by **Vite**, hosted on
**Vercel**, storing data in **Supabase**. The whole UI is one enormous file,
`src/App.jsx`. Your website is plain **HTML/CSS**, no framework, also on Vercel.
When you "upload a file to GitHub," Vercel notices, rebuilds, and the live site
changes about thirty seconds later.

---

## Front end — what the user sees

**HTML** — the structure of a page. Headings, paragraphs, buttons. Nouns.

**CSS** — how it looks. Colours, spacing, layout. Adjectives.

**JavaScript (JS)** — what it does. Clicks, calculations, saving. Verbs.

**JSX** — HTML written *inside* JavaScript. It's why `App.jsx` has
`<div className="card">` sitting next to real code. `className` instead of
`class` because `class` already means something in JS.

**React** — the library that redraws the screen when data changes. You change a
number; React figures out which pixels move. You never write "update that text
box" — you change the value and React handles it.

**Component** — a reusable chunk of UI. `Dashboard`, `MeetingsPage`,
`SponsorsPage` are all components. Capitalised by convention, which is why
`<Gift />` broke: React assumed it was a component and couldn't find one.

**Props** — values passed *into* a component. `<Dashboard leads={leads} />`
hands the dashboard your leads. When I said "the Modal never received `events`,"
that was a missing prop.

**State** — data a component remembers between redraws. `useState` creates it.
`const [tab, setTab] = useState('upcoming')` means "remember which tab, start on
upcoming, call `setTab` to change it."

**Hook** — any React function starting with `use`. `useState`, `useEffect`,
`useMemo`. They have one hard rule: always called in the same order, never
inside an `if`. Breaking that produced *"Rendered more hooks than during the
previous render."*

**useMemo** — "only recalculate this when its inputs change." Your dashboard
metrics are in a `useMemo`, so they don't recompute on every keystroke.

**useEffect** — "run this after rendering." Loading data on startup, mostly.

**Render** — React drawing the screen. "Crashes at render" means the build was
fine but the page died when it tried to draw.

**DOM** — the live page in the browser, as a tree the code can touch.

---

## The bugs that kept happening

**TDZ (temporal dead zone)** — `const` doesn't exist until the line that creates
it. Use it above that line and it throws. This bit us five times, always with a
green build.

**Stale closure / stale write** — a function grabbed a copy of your data, then
something else changed it, and the function saved its outdated copy over the
top. Fixed with `leadsRef` (always current) and `commitLeads`.

**Race condition** — two things happening at once where the order decides the
outcome. Two saves in the same instant, second wins, first vanishes.

**Shadowing** — an inner variable with the same name as an outer one hides it.
`Leads` declared its own `importOpen` while also receiving one; the sidebar set
one and the page read the other, so the modal never opened.

**Regression** — something that used to work, broken by a new change. What the
test suites exist to catch.

**Edge case** — the unusual input that breaks things. Feb 29 birthdays. A month
with no closed deals. A lead with an empty deals array.

**Off-by-one** — counting from the wrong end. Seven days meaning six or eight.

**Idempotent** — safe to run twice. `MIGRATION.sql` is idempotent, which is why
re-running it can't hurt you.

**Backfill** — retroactively fixing existing records. Each new tab needed one,
or it shipped invisible to anyone with saved settings.

---

## Data and the database

**Supabase** — your database, plus login and file storage. Postgres underneath.

**Postgres** — the database engine. Industrial, boring, correct.

**Table / row / column** — spreadsheet, line, field.

**Schema** — the shape of your tables. What `MIGRATION.sql` defines.

**Migration** — a script that changes the schema. Kept in a file so it's
repeatable rather than remembered.

**JSON / JSONB** — a way to store nested data in one field. Your leads store
activities, meetings and deals as JSON inside a single column. Flexible, but
you can't query inside it easily — which is why splitting those out matters for
multi-tenancy.

**RLS (Row Level Security)** — Postgres deciding, per row, who may see it. This
is what makes per-agent expense privacy real rather than cosmetic. A UI filter
hides rows on screen; RLS means the database never sends them.

**Policy** — one RLS rule. `leads_all`, `users_read` are policies.

**Query** — asking the database for data.

**Index** — a lookup shortcut that makes queries fast. Like a book's index.

**Foreign key** — a column pointing at another table's row. `owner_id`
references a user.

**Multi-tenant** — one database serving many separate customers, each seeing
only their own. What you'd need to sell the CRM as SaaS.

**Seed data** — starter content for a fresh install.

---

## Code plumbing

**Repo (repository)** — a project's folder plus its full history. You have two:
`proytech-crm` and `GetProyTech`.

**Git** — the system tracking every change. **GitHub** hosts it.

**Commit** — one saved change with a message. **Push** — send commits to GitHub.
**Pull** — get the latest down. **Branch** — a parallel line of work.
**Merge** — combine two lines. **Merge conflict** — both edited the same lines
and something must choose.

**Main** — the primary branch. What's live.

**Build** — turning your source into what the browser downloads. `npm run build`.

**Deploy** — putting the build online. Vercel does it on every push.

**Bundle** — all your code squashed into a few files for the browser.

**Vite** — your bundler. Fast, and it does *not* catch undefined components.

**npm** — the package installer. **package.json** lists what your project needs.

**Dependency** — outside code you rely on. React, Recharts, Lucide.

**Environment variable (env var)** — a secret or setting kept outside the code.
`GOOGLE_CLIENT_ID`, your Supabase keys. Lives in Vercel, never in the repo.

---

## APIs and integrations

**API** — a way for two programs to talk. Google's calendar API, Anthropic's.

**Endpoint** — one specific URL that does one thing. `api/sheet-read.js`.

**Serverless function** — code that runs on demand instead of on a server you
maintain. Everything in your `api/` folder.

**Request / response** — you ask, it answers.

**GET / POST** — fetch something / send something.

**Status code** — the answer's headline. **200** fine. **403** forbidden — the
one that bit you, because a token missing a scope stays valid and returns 403
rather than expiring. **404** not found. **500** the server broke.

**JSON** — the format APIs talk in.

**Webhook** — the reverse of an API call: they call *you* when something happens.

**OAuth** — "sign in with Google" without giving away your password.

**Scope** — what a permission actually covers. `spreadsheets.readonly`. Add a
scope and every existing user must reconnect.

**Token** — the pass issued after login. **Refresh token** — the long-lived one
used to get new passes.

**Rate limit** — a cap on requests per hour. Why GitHub cut me off mid-session.

**CORS** — browser rules about which sites may call which APIs.

---

## Money and metrics, as this CRM defines them

**Pipeline** — open deals, not yet won.

**Weighted pipeline** — each deal multiplied by its stage's probability. A
$10,000 deal at 30% counts as $3,000.

**MRR** — monthly recurring revenue. Retainers.

**GCI** — gross commission income. Realtor term, before splits.

**Cash basis vs accrual** — money counted when it *arrives* vs when it's
*earned*. Your CRM is cash basis: revenue lands in the month of the payment,
not the month you closed.

**Still owed / outstanding** — `owedBy()`: on a record that is a client or
sits at a **won** stage, everything sold minus everything paid against the work.
Three things it deliberately is **not**:

- **not invoiced-and-unpaid.** It reads deals, never the invoices table. A sale
  nobody has billed is in this number exactly like one whose invoice went past
  due last month.
- **not quoted work.** An open lead with a live proposal owes nothing — it has
  not bought anything. This is why "still owed" is a fraction of open pipeline
  rather than a multiple of it.
- **not retainer arrears.** A retainer is recurring, not a balance. Arrears live
  on the client record.

The Dashboard's breakdown panel splits it by client and shows both possible
ages side by side: *past due* (an unpaid invoice has a due date, so lateness is
a fact) and *sold N days ago* (nothing was ever billed, so it is old rather than
late). Those two are never averaged or sorted against each other.

**Attribution** — deciding which month or which source a number belongs to.

**Conversion rate** — how many of one thing became the next thing.

**Cohort** — a group tracked over time. Everyone who first made contact in July.

**Sample size** — how many data points a rate rests on. A close rate from three
deals isn't a close rate, which is why every rate shows its count.

**Derived vs stored** — calculated on the fly, or saved. Your sponsorship
history is derived from event slots. Storing it separately would create two
copies that drift.

**Single source of truth** — one place a fact lives. `meetingsOf()` for meeting
counts. Break this and two screens disagree.

---

## Testing

**Unit test** — checks one function. The leap-year date maths.

**Integration test** — checks pieces working together. Your jsdom suites.

**jsdom** — a fake browser in Node, so tests can render React without a screen.

**Test harness** — the scaffolding that sets tests up.

**Stub / mock** — a stand-in for something real. `stub-supabase.js` pretends to
be your database so tests don't touch live data.

**Fixture** — the fake data a test runs against.

**Assertion** — the actual check. "This should equal 3."

**Suite** — a file of related tests. You have 22.

**Coverage** — how much of your code the tests touch.

**Green / red** — everything passing / something failing.

---

## Web and SEO

**Static site** — plain files, no server logic. Your website.

**Responsive** — adapting to screen size.

**Media query** — the CSS rule that does it. `@media (max-width:640px)`.

**Viewport** — the visible area of the browser.

**Breakpoint** — the width where layout changes. Yours are 640px and 920px.

**Flexbox / Grid** — the two CSS layout systems. Your event cards use both.

**z-index** — what stacks on top of what. Why the badge sits above the scrim.

**Gradient** — a smooth fade between colours.

**Scrim** — a dark overlay that keeps text readable over a photo. The thing that
made your event tiles work.

**WebP** — a modern image format, far smaller than PNG at the same quality.
Your tiles went 6.5 MB → 250 KB.

**Lazy loading** — only fetching images once they're near the screen.

**Meta tags** — invisible page info for search engines and social previews.

**Open Graph (og:)** — the tags controlling how a link looks when shared. Your
missing `og:image` is why links unfurled as grey boxes.

**Structured data / JSON-LD / schema.org** — machine-readable facts about a
page. The `Event` schema is what makes your events eligible for Google's event
listings.

**Rich results** — the enhanced search listings that come from structured data.

**Canonical URL** — the official address of a page, so duplicates don't compete.

**Alt text** — an image description for screen readers. Empty when the image is
pure decoration, which is deliberate, not lazy.

---

## AI

**LLM** — large language model. Claude, GPT.

**Prompt** — what you send it. **System prompt** — the standing instructions.

**Token** — roughly ¾ of a word. What you're billed on.

**Context window** — how much it can hold at once.

**Temperature** — randomness. Low for extraction, higher for writing.

**Hallucination** — confidently making something up. Why every AI output in your
CRM is a draft you approve, never an auto-send.

**Structured output** — forcing JSON back instead of prose, so code can use it.

**RAG** — retrieval-augmented generation. Feeding it your real data so answers
are grounded rather than invented.

**Haiku / Sonnet / Opus** — small and fast / balanced / most capable. Your
receipt scanning uses Haiku; the Monday Huddle uses Sonnet.

---

## Things I say that mean something specific

**"Ships invisible"** — the code deploys but nobody can see the feature. Every
new tab risked this.

**"Silently"** — fails without any error. The worst kind, because nothing tells
you.

**"Degrades gracefully"** — when something's missing it still works, just less.
Sidebar order without the SQL: works for the session, doesn't persist.

**"Source of truth"** — the one authoritative place a fact lives.

**"Blast radius"** — how much breaks if this is wrong.

**"Load-bearing"** — looks removable, isn't. `min-height: 0` on the sidebar
scroller looks redundant and is the only reason it scrolls.

**"Scope creep"** — the job quietly growing past what was asked.

**"Technical debt"** — a shortcut you'll pay for later. Your `onboarding` and
`delivery` checklists being two parallel systems is debt.

**"Refactor"** — restructuring code without changing behaviour.

**"Root cause"** — the actual origin, versus the symptom you noticed. The $0
rows were a symptom; reading a field that gets emptied was the root cause.
