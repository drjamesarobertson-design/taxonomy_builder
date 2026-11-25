# Taxonomy Builder — Master Briefing

*Version: v 1.21*

*A one-stop orientation document: what this is, what it does today, where the
business stands, and what's still outstanding. Written for James (or anyone
he shares this with) rather than as an engineering log — for the detailed,
round-by-round build history, see `PROGRESS.md`; for the original functional
specification, see `CLAUDE.md`.*

*Last updated: 2026-11-25 — Stage D (app-side tier enforcement) has now
been tested live by James, round by round, with every bug found along the
way fixed and confirmed working: the workflow-type gates, the Lock
Taxonomy count cap, the Settings dialog's error handling, the Library
entries cap, and — the biggest piece — the read-only-over-limit Library
mode, which went through several rounds of real live-testing feedback
before landing on its final shape (see §0). James's own words once the
last round checked out: "That is it, well done." **Test: Expired-
subscription screen is the one piece still held over, deliberately, for
James to test tonight** — see §0/§6.*

*Version history: v 1.01 — first version stamp applied to this file
(2026-10-14). v 1.02 — same evening, after PRs #230–#235 (see §0): Promote/
Demote warning simplified, the Unlock cursor fix, per-account autosave, the
Library "starter sample" star shown on a subscriber's own copy, visible
progress during first-sign-in Library seeding, and — the evening's main
piece — an in-app "new sign-ups" panel (with CSV download) as a more
reliable alternative to the outbound Resend email, which turned out to be
working all along (see §0). v 1.03 (2026-10-21) — recorded a heads-up from
Supabase (§3): from 30 October 2026, a newly created table no longer
automatically gets Data API access without an explicit grant; doesn't
affect anything already shipped, but is now a required step for any future
migration that creates a new table. v 1.04 (2026-11-24) — the subscription
pricing/tier structure went from a 3-tier draft to a fully worked-through
4-tier plan (Free/Basic/Advanced/Enterprise), with every open mechanic
James raised resolved to a concrete decision (see §0/§4) and a bite-sized
delivery plan agreed; also corrects the record to say plainly that Stripe
account creation has **not** actually been started yet, superseding the
earlier ambiguous "step 1 given, not confirmed done." v 1.05 (2026-11-24,
same day) — Stage B completed live: Stripe account created, Stripe Tax
enabled in the sandbox, all three paid-tier Products/Prices created in
GBP/Monthly/tax-exclusive, and the test-mode publishable key recorded
(§4). v 1.06 (2026-11-24, same day) — Stage C's first piece written:
`supabase/0010_create_subscription_plans.sql` creates the tier-config
tables (§3/§4), seeded with the agreed structure; a one-time manual step
James still needs to run, same as every migration before it. v 1.07
(2026-11-24, same day) — James ran `0010` successfully in Supabase's SQL
Editor; the tier-config tables exist for real now, ready for the app to
read from in a later Stage C/D piece. Also recorded, from the same stretch
of conversation: James's live Stripe account picked up an automated
compliance flag unrelated to anything built here (an unrecognised
"missing director" on the business verification check) — confirmed this
cannot affect the sandbox or anything in Stages B–F, only Stage G
(accepting real payments); Stripe Support couldn't resolve it on first
contact, left open for James to revisit before go-live. v 1.08
(2026-11-24, same day) — Stage C's second piece written:
`supabase/0011_create_subscriptions.sql` creates the per-account plan
record (§3/§4), defaulting every signup to Free; scope narrowed from the
original plan for a concrete reason (a real "choose a paid tier" flow
needs Stripe Checkout to exist first, so that moment moves into C3 — see
§0); run successfully by James, 2026-11-24. v 1.09 (2026-11-24, same day)
— both subscription tier-config migrations (`0010`, `0011`) confirmed run;
Stage C3 (the Stripe Edge Functions) broken into six sub-pieces. v 1.10
(2026-11-24, same day) — Stage C3 piece (a) done: the Stripe secret key is
in Supabase's Edge Function secrets; `supabase/0012_add_stripe_price_ids.
sql` written (two new columns on `subscription_plans` for each tier's
Stripe Price ID), not yet run. v 1.11 (2026-11-24, same day) — `0012` run
and all three paid tiers' Price IDs populated (Basic/Advanced/Enterprise);
Stage C3 piece (b) (the Checkout-Session function itself) is next. v 1.12
(2026-11-24, same day) — the Checkout-Session Edge Function is written,
not yet deployed; James's next step. v 1.13 (2026-11-24, same day) —
deployed successfully (caught and redone once, after the editor's own
placeholder name/code got deployed unmodified on the first attempt); JWT
verification turned off per Supabase's own recommendation. v 1.14
(2026-11-24, same day) — a minimal, supervisor-only "Test Checkout" entry
point built (`src/checkout.ts` + a toolbar dropdown); not yet clicked/
tested live. v 1.15 (2026-11-24, same day) — tested live, successfully,
including a full real test payment with Stripe's standard test card;
Checkout itself is now proven fully working end to end — only the
webhook (to actually grant the plan) remains. v 1.16 (2026-11-24, same
day) — James's explicit standing instruction: increment this version
number every time this file is shared with him, not only when its
content changes — this share is the first under that rule. v 1.17
(2026-11-25) — a disaster-recovery review (James's own initiative, after
reading an article on the topic) found a real gap: the live database has
no automated backups (Supabase Free plan). Built a supervisor-only
"Export Full Backup" button as a periodic manual stopgap (James's
preference over upgrading the Supabase plan) — written, not yet deployed;
also gave James a one-off Git-bundle backup of the code itself directly.
v 1.18 (2026-11-25, same day) — the "Export Full Backup" function was
deployed and tested successfully by James (a real backup download covering
all five tables). Fixed a regression from the heading-squeeze (PR #260):
the landing page's heading had shrunk along with the worksheet page's,
since both shared one CSS class — landing page now shows "Taxonomy
Builder" at its original large size with a "Copyright © James A Robertson
and Associates Limited" line beneath it in the current small font, and the
redundant tagline paragraph was removed (PR #277); worksheet page
unchanged. **Stage C3 is now fully complete**: the `stripe-webhook` Edge
Function (piece (e)) was written, deployed, registered as a Stripe event
destination (`checkout.session.completed`, Snapshot payload), and its
signing secret added to Supabase — then proven end to end with a real
test payment, confirmed in Supabase's Table Editor: the test account's
`subscriptions` row correctly updated `plan_key` from `free` to `basic`,
with `stripe_subscription_id`/`stripe_customer_id`/`current_period_end`
all populated (PR #278). v 1.19 (2026-11-25, same day) — **Stage C4 is
now also fully complete**: `stripe-webhook` extended to handle
`customer.subscription.updated` (keeps `current_period_end`/`status` in
step with every renewal, successful or failed) and
`customer.subscription.deleted` (drops a fully-lapsed/cancelled account
back to `free`) — until now the webhook only ever handled the one-time
initial purchase, so `current_period_end` would have gone stale after an
account's first billing period; `supabase/0013_add_renewal_reminders.sql`
added a daily `pg_cron` job sending the staged reminder emails (30/7/1
days before renewal, an expired notice, a follow-up nudge), reusing
`0008`'s proven `pg_net` + Vault + Resend pattern, no new Edge Function
needed (PR #280). **Tested live by James, successfully**: the new events
were added to the Stripe webhook destination; the reminder function was
run manually against a test row with its `current_period_end` adjusted to
today, then to 8 days out — correctly producing the "expired" email and
then the "30d" email respectively (8 days out correctly falling in the
30-day bucket, not the 7-day one, confirming the day-boundary logic).
**Stages C1 through C4 — the entire Stripe/Supabase subscription
backend — are now fully built and proven end to end.** v 1.20 (2026-11-25,
same day, built solo while James was away at a call) — **Stage D (app-
side tier enforcement) built in full**, broken into five sub-pieces:
(D1) `src/subscription.ts`'s `fetchPlanLimits()` reads the signed-in
user's plan + live numeric/feature limits once per sign-in, giving every
other piece one place to read from. (D2) the "your subscription has
expired — renew here" hard-block screen (`ExpiredSubscriptionScreen.tsx`),
checked against wall-clock time directly so it takes effect the moment a
paid period lapses, independent of Stripe's own dunning timing; "renew"
reuses the existing Checkout flow. (D3) numeric caps — code columns, rows
(a genuinely new concept), and Library entries (counting only a
subscriber's own entries, never starter samples, since every tier always
sees the full starter library) — wired into every growth path: Settings,
New Taxonomy, Add Column, the guided wizard, Insert Row, and all four CSV
import formats. (D4) the pricing table's Chart of Accounts Wizard/
Function Master/Location Master/Division Master rows now gate their
matching WorkflowMenu starting points — a gated button is disabled with
an explanatory tooltip, never hidden. (D5a) a starter sample whose own
size exceeds the signed-in user's current plan opens read-only, reusing
Lock Taxonomy's exact row-protection sweep — applied only to the opened
copy, never written back to the Library entry itself. (D5b) the Lock
Taxonomy count cap (Advanced 6, Enterprise unlimited), enforceable only via
a new running counter (`supabase/0014_add_locked_taxonomy_count.sql`,
not yet run) since taxonomy files are never stored centrally — a new
`settings.lockCounted` flag keeps this counter from being wrongly
decremented when an oversized starter sample (D5a) gets unlocked.
**Verified via `tsc`/`vite build`, Playwright checks against the existing
`test-bypass-auth` dev path (no new console errors), and direct logic
tests of the gating functions — not yet tested live by James.** One
manual step outstanding: run `supabase/0014_add_locked_taxonomy_count.sql`
in Supabase's SQL Editor. Stage E (paid-subscriber report, starred-Library
notifications) is next — see §6. v 1.21 (2026-11-25, same day) —
**Stage D tested live by James, round by round, every bug found along the
way fixed, redeployed and reconfirmed, with James's final "that is it,
well done" once the last round checked out:**
`supabase/0014_add_locked_taxonomy_count.sql` run successfully. (D4) the
gated workflow buttons weren't visibly greyed out (the button's own
explicit colours were overriding the browser's disabled-state dimming)
and showed two stacked tooltips (a native `title=""` attribute on top of
the `Tooltip` component) — both fixed (PR #286/#287-ish). (D5b) the Lock
Taxonomy cap gave no visible feedback when blocked — fixed by disabling
the toolbar's own "Lock Taxonomy ▾" button with an explanatory tooltip,
matching the landing page's own pattern; wording then also fixed for the
`maxLocked === 0` case, which read as nonsense ("unlock one first" when
there's nothing to unlock). Settings dialog: a failed Save gave no visible
sign anything had happened if the error text was scrolled out of view —
fixed with a `drawAttentionTo()` helper that scrolls/focuses/flashes the
offending field directly (James's own preference over an audible
warning, for this specific case). Library entries cap: the error showed
as a banner elsewhere on the page, easy to miss while attention was on
the dialog — moved inline into the dialog itself; separately, a newly
added entry wasn't scrolled into view in the Library sidebar — fixed via
a `scrollToEntryId` prop, with `refreshLibrary()` changed to return its
own promise so the scroll only fires once the new entry actually exists
in the refreshed list. **(D5a, the largest piece, went through several
more rounds after that:** every `alert()` in `App.tsx` now plays a short
synchronous Web Audio beep first (`alertWithBeep`) — James's report, after
missing a top-of-window pop-up while looking at the Library sidebar, that
this had been a recurring issue with other pop-ups too, never raised
until now. The over-limit message now states both the taxonomy's actual
size and the plan's allowed size, not just the actual numbers. Right-click
on a read-only-over-limit taxonomy is now blocked entirely (no menu opens
at all), not just individual actions after a menu item is chosen. "Locked"
(a real, user-initiated Lock Taxonomy) and "Read Only" (exceeds the
viewer's current plan size limit) are now two fully independent
attributes — separate settings fields (`readOnlyDueToPlanLimit`/
`readOnlyReason`, replacing an earlier version that wrongly reused
`locked`/`lockReason`), separate title-bar badges (a new blue "📖 Read
Only" shown *alongside*, never instead of, the existing yellow "🔒
Locked"), and separate wording everywhere. Two further rounds of live
feedback refined this further: a personal Library copy of an oversized
sample (seeded into every subscriber's own Library at signup, or saved
via "Add to Library") was found to inherit a stale `readOnlyDueToPlanLimit`
flag with no explanation text, so the badge showed but the pop-up silently
didn't — fixed to always recompute fresh, with the pop-up falling back to
a generic message exactly like the badge's own tooltip already did, so
the two can never disagree. That fix also exposed a genuine, separate bug
in `SettingsModal`: a taxonomy already over its plan's column cap could
not save ANY Settings change at all, even ones unrelated to column count,
because the save-block check fired on the unchanged value alone — fixed
to only block actually *increasing* the count past the cap. **Finally,
James made an explicit scope decision after seeing a personal copy load
with no warning at all**: the read-only-over-limit treatment, originally
scoped to starter samples only ("a subscriber's own, already-oversized
entries... are left exactly as they are"), now applies to **every**
Library entry regardless of ownership — any taxonomy over the current
plan's size cap gets the same pop-up, badge and full block, whoever owns
it. **With this, Stage D is confirmed fully working end to end**, bar one
piece James deliberately held over: **Test: Expired-subscription screen,
scheduled for tonight.** Separately noted, not yet investigated (James
called it out explicitly as "a separate issue," not something to action
immediately): a Library duplicate-name-detection regression — caught a
duplicate the first time it was tried, then let one through in a later,
separate session.
**Increment this by one every time this file is next updated and/or
shared with him (whichever comes first), and add a line here whenever its
content actually changed** — see
`ONBOARDING_FOR_NEW_CLAUDE_INSTANCE.md` §5, item 10.*

---

## 0. Where things stand right now — read this first

*(2026-11-25 addendum: the restored paragraphs below were found to have been
accidentally dropped by an earlier merge-conflict resolution in this same
session, caught and repaired the same day -- nothing else in this document
was affected.)*

**Disaster recovery, 2026-11-25 — a real gap found and a stopgap built,
now deployed and tested.** James asked what the DR arrangements are.
Code/config: solid (full Git history, auto-rebuilding static site). The
live database: no automated backups, since the Supabase project is on the
Free plan. Built `supabase/functions/export-database-backup/index.ts`
(supervisor-only, server-side-enforced, reads every table via the service
role) plus a new "Export Full Backup" toolbar button
(`src/databaseBackup.ts`) — a periodic, one-click, manual export, James's
preferred option over upgrading the Supabase plan. Full detail in §2/§4's
"Disaster recovery" section. **Deployed and tested successfully by James,
2026-11-25** — a real backup download covering all five tables. A one-off
Git-bundle backup of the code itself was also handed to him directly
earlier (not a recurring mechanism, just a point-in-time copy).

**Landing page heading fix, 2026-11-25.** The worksheet-page heading
squeeze (PR #260) had accidentally shrunk the landing page's heading too,
since both pages shared one CSS class. Fixed (PR #277): worksheet page
unchanged; landing page (no project open) now shows "Taxonomy Builder" at
its original large size, with "Copyright © James A Robertson and
Associates Limited" beneath it in the current small font, and the
redundant tagline paragraph removed.

**Stage D (app-side tier enforcement), 2026-11-25 — built in full, then
tested live by James round by round, with every bug found along the way
fixed, redeployed and reconfirmed.** See the version history entry above
(v 1.20) for the original five-sub-piece breakdown (D1–D5b), and v 1.21
for the full list of live-testing fixes — including a significant,
James-directed scope widening of the read-only-over-limit mode to cover
every Library entry, not just starter samples. James's own words once the
last round checked out: "That is it, well done." **One piece deliberately
held over: Test: Expired-subscription screen, scheduled for tonight.**
Also noted, separately and not yet investigated: a Library duplicate-name
detection regression (§6).

**Stripe Stage B walkthrough, 2026-11-24 (same day as the planning round
below) — done live, step by step:** account created; Stripe Tax enabled in
the sandbox; all three paid-tier Products/Prices created (GBP, Monthly,
**tax-exclusive** — James's confirmed choice: the advertised price is net,
local VAT/sales tax is added on top at checkout, the standard approach for
B2B software, versus "tax-inclusive" where the all-in price is fixed and
the business absorbs the jurisdiction variance); test-mode publishable key
obtained and recorded (§4 — safe to record, not secret). The secret key was
correctly never shared in chat. Full detail, including one live-UI
navigation note for next time, in §4's "Payment processing" subsection.

**Stage C, piece 1 of 4 (C1) — done.** `supabase/0010_create_subscription_
plans.sql` created `subscription_plans` and `subscription_settings` (see
§3), seeded with the agreed 4-tier structure plus the hidden `beta` row —
**run successfully by James in Supabase's SQL Editor, 2026-11-24.** This is
data only — no app code reads it yet (that's C3/Stage D) — but any
price/limit can now be tweaked directly in Supabase's Table Editor.

**Stage C, piece 2 of 4 (C2) — done.** Scope narrowed from the original
plan, for a concrete reason worth recording: a real "choose a paid tier at
signup" flow needs Stripe Checkout to exist first (C3) — otherwise nothing
stops a new signup from just claiming Enterprise for free, and the in-app
Pricing page still shows the old 3-tier draft with paid buttons disabled
("Coming Soon") for exactly that reason. So C2 was just the database
piece: `supabase/0011_create_subscriptions.sql` creates `subscriptions` —
one row per account, defaults to `plan_key = 'free'` the instant anyone
signs up (a trigger mirroring `profiles`' own, see §3), with
`stripe_customer_id`/`stripe_subscription_id`/`current_period_end` columns
sitting ready but unused until C3's webhook populates them — **run
successfully by James in Supabase's SQL Editor, 2026-11-24.**
**Deliberately no write access for ordinary users at all, not even to
their own row** — only the signup trigger and, later, the webhook function
(running as `service_role`) can ever change a row, so nothing in the
regular app can self-grant a paid tier. Wiring an actual "pick a tier and
sign up" UI is folded into C3 instead, once Checkout actually exists to
make that choice real.

**Stage C, piece 3 of 4 (C3) — fully complete, 2026-11-25**, broken down
into sub-pieces since it was genuinely new ground for this project
(nothing Edge-Function-shaped existed yet, unlike the now well-worn
SQL-migration pattern):
(a) add the Stripe secret key to Supabase's own Edge Function secrets —
**done, 2026-11-24** (as `STRIPE_SECRET_KEY`, Project Settings → Edge
Functions → Secrets — note this is a *different* area from Project
Settings → API Keys, which is Supabase's own keys, not Stripe's).
`supabase/0012_add_stripe_price_ids.sql` also **done, 2026-11-24**: two
nullable columns added to `subscription_plans` (same "live data, not
hardcoded" philosophy as the rest of that table), and the three paid
tiers' monthly Price IDs copied in by hand from Stripe's Product catalog
(found via Stripe's Workbench → Inspector, searching by Product ID — the
Price ID is the separate, distinct object Checkout actually needs).
(b) **done, 2026-11-24.** `supabase/functions/create-checkout-session/
index.ts` deployed successfully, under the correct name, via Supabase's
in-browser "Via Editor" deploy path (found at Edge Functions → Deploy a
new function → Via Editor — the editor pre-fills a random function name
and Supabase's own generic placeholder code, both of which must be
replaced before deploying, easy to miss — happened once, caught and
redone). **"Verify JWT with legacy secret" turned off** on the deployed
function's own Settings tab, per Supabase's own on-screen recommendation
("Recommended: OFF with JWT and custom auth logic in your function
code") — this function already does its own proper check in code (calls
`getUser()`, returns 401 if that fails), so the platform-level legacy
check was redundant and potentially a mismatch with this project's newer
key-naming scheme. Creates (or reuses) a Stripe Customer tied to the
signed-in account, creates a Stripe Checkout Session for the requested
paid tier's Monthly Price (rejects Annual with a clear error for now,
since no Annual Price objects exist in Stripe yet), and returns the
Checkout URL. Deliberately never writes `plan_key` on `subscriptions`
itself — only the webhook (piece (e), once Stripe actually confirms
payment) can do that, so starting a Checkout Session can never itself
grant paid access. Needed no new secret beyond `STRIPE_SECRET_KEY`
(already in place) — `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are
auto-injected into every Edge Function by Supabase.
(c) **done, 2026-11-24.** `src/checkout.ts` (calls the Edge Function via
Supabase's own client, which attaches the signed-in session automatically,
then redirects the browser to the returned Checkout URL) plus a
supervisor-only "Test Checkout ▾" toolbar dropdown (App.tsx) — three
items, one per paid tier, visible only to James's own account
(`isSupervisor`), never shown to an ordinary subscriber. Deliberately
separate from the real, customer-facing Pricing page (`PricingPage.tsx`,
still showing the old 3-tier draft with its own "not purchasable yet"
disclaimer, untouched) — wiring real "Upgrade" buttons into that page is
its own later piece, once the visual overhaul to the real 4-tier
structure happens (Stage D/F). **Tested live by James, 2026-11-24,
successfully, including a full real test payment**: all three tier
buttons opened a real Stripe Checkout page; using Stripe's standard test
card (`4242 4242 4242 4242`, any future expiry/CVC) the payment was
accepted and Stripe redirected cleanly back to Taxonomy Builder
afterward, in the same browser tab — confirmed as expected/correct
behaviour (not a bug), since that's exactly how Stripe Checkout is meant
to be used (a full-page redirect out and back, not a popup — opening a
new tab instead would leave two copies of the app open, which is more
confusing, not less). **Nothing in the app visibly reacted to the
successful payment yet** — expected, since that only happens once the
webhook (piece (e)) existed yet; `subscriptions.plan_key` for that test
account stayed `free` until the webhook below was built. (d) **done,
2026-11-25.** Webhook registered in Stripe as an event destination
(Workbench → Webhooks → Add endpoint; scope "Your account", payload style
**Snapshot** — not Thin, since the webhook code reads full session detail
like `metadata` directly off the event), listening to just
`checkout.session.completed`, pointed at the deployed function's URL; its
signing secret added to Supabase as a second secret, `STRIPE_WEBHOOK_
SECRET`. (e) **done, 2026-11-25.** `supabase/functions/stripe-webhook/
index.ts` written and deployed (same "Via Editor" dance, **"Verify JWT
with legacy secret" turned off** — a hard requirement here, not just a
recommendation, since Stripe's calls carry no Supabase session at all).
Verifies the delivery's signature via `stripe.webhooks.constructEventAsync`
(the async form Stripe's SDK provides specifically for Deno/edge runtimes,
since there's no Node-style sync crypto available), then on
`checkout.session.completed` updates the paying account's `subscriptions`
row: `plan_key`, `stripe_subscription_id`, `stripe_customer_id`, and
`current_period_end` (fetched via one extra Stripe API call against the
session's subscription ID). (f) **done, 2026-11-25 — tested live by James,
successfully.** Ran a real test payment (Basic tier, Stripe's test card),
then confirmed directly in Supabase's Table Editor: the test account's
`subscriptions` row updated from `plan_key = 'free'` to `plan_key =
'basic'`, with `stripe_subscription_id`/`stripe_customer_id`/`current_
period_end` all correctly populated. **Checkout, webhook and database
update now all proven working end to end.**

**Stage C4 (renewal/expiry + reminder emails) — done, 2026-11-25.**
`stripe-webhook` extended to also handle `customer.subscription.updated`
(every renewal, successful or failed, plus any other change to the
subscription) and `customer.subscription.deleted` (fully ended) —
necessary because `checkout.session.completed` alone only ever fires once,
at the very first payment, so without this `current_period_end` would
have gone stale the moment an account renewed for a second period.
`supabase/0013_add_renewal_reminders.sql` added `subscriptions.last_
reminder_stage` (tracks the most advanced reminder already sent for the
current period, so a daily run never repeats one) and a daily `pg_cron`
job (08:00 UTC) calling a new SQL function that sends the staged reminder
emails James specified — 30/7/1 days before renewal, an expired notice,
then one follow-up nudge — via Resend, reusing `0008`'s exact `pg_net` +
Vault pattern (no new Edge Function, no new API key). **Tested live by
James, successfully**: redeployed `stripe-webhook`; added the two new
event types to the Stripe webhook destination; ran the reminder function
manually against a test row with `current_period_end` set to today (got
the "expired" email, correctly) and then to 8 days out (got the "30d"
email, correctly — 8 days falls in the 30-day bucket, not the 7-day one,
confirming the boundary logic). **With this, Stages C1 through C4 — the
entire Stripe/Supabase subscription backend — are fully built and proven
end to end.** Stage D (app-side tier enforcement, including the expired-
subscription block screen itself) is next — see §6.

**Side note from the same stretch of conversation, unrelated to any of the
above:** going through Stripe's live-account activation flow (confirming
email, adding business/bank details — which happened earlier than planned,
ahead of Stage G) surfaced an automated compliance flag: Stripe's "Know
Your Business" check listed an unrecognised "missing director" (a name
James has no association with) on the live account. Stripe Support
couldn't resolve this on first contact. Confirmed with James this cannot
affect the sandbox, which is a fully separate environment from live-account
verification — nothing in Stages B through F depends on it. It only
matters at Stage G (accepting real payments), which is weeks off at the
earliest; left open for James to revisit then, with no impact on anything
built in the meantime.

**Subscription/pricing planning round, 2026-11-24 — fully worked through,
nothing built yet.** James brought a refined subscription-structure
spreadsheet (two rounds, v1.1 then v1.2, resolving his own open questions
round by round) alongside the already-delivered WordPress pricing page
(§4), and asked for a full review plus a step-by-step delivery plan before
any work started. Outcome — full detail in §4, which replaces the old
3-tier draft entirely:

- **Tier structure is now 4-way**: Free / Basic / Advanced / Enterprise,
  replacing the earlier Free/Professional/Enterprise draft. Final dollar
  break-points are still under James's own consideration (he wants to
  think about them further) — everything else below is decided.
- **A real conflict was caught and resolved**: the original draft gated
  Lock Taxonomy to Basic but Audit Taxonomy (a hard prerequisite for Lock)
  to Advanced+. James's fix: Lock moved up to Advanced+ alongside Audit —
  no tier can be sold a feature it can't actually use.
- **Annual billing**: a flat discount off monthly (James's default: 25%,
  confirmed as "attractive enough" after discussing 30/40/50% as
  alternatives), entered as an exact, editable two-decimal amount per tier
  rather than computed at runtime (Stripe Prices are immutable per amount
  anyway, so each tier/period combination will be its own stored Price
  object). Shown at launch, not hidden — toggled alongside Monthly but
  labelled **"Coming soon"** rather than actually purchasable yet, so
  James can turn it on later without any UI work. Quarterly/Half-Yearly:
  explicitly dropped, not building either.
- **Category names and break-points must be user-configurable data, not
  hardcoded constants** — James's own explicit requirement, since he
  expects to adjust them as he gains real-world experience. Plan: a small
  Supabase table, editable the same way `help-text.csv`/the in-app Help
  editor already works for James's supervisor account.
- **A genuinely new piece of scope, agreed**: lower tiers will see the
  *full* starter-sample Library (not a cut-down one), but a sample whose
  column/row count exceeds that tier's own limits opens **read-only**
  rather than being hidden or blocked outright. Confirmed feasible at a
  moderate size by reusing the existing Lock Taxonomy "viewable, can't be
  destructively edited" mechanism rather than inventing a new one.
- **"Create Folder Structure on Local Drive" and "...in Outlook" in the
  pricing sheet need no new engineering** — both already exist and work
  today (§2); gating them per tier is just adding the same limit-check
  every other numeric cap needs. This is distinct from **Outlook 365**
  (one-click Microsoft Graph sign-in), which genuinely isn't built and
  remains its own separately-scheduled piece of work (§4) — no dependency
  forces an order between the two.
- **Beta tester override confirmed**: a hidden tier giving full
  tier-equivalent access at no charge, explicitly still excluded from the
  supervisor-only Edit Help capability regardless.
- **Two new, previously-unrecorded feature asks, both agreed**: a
  paid-subscriber report (reusing the existing "new sign-ups" panel's
  list+CSV-download pattern once a plan field exists), and an email
  notification to subscribers when a starred Library sample they hold a
  copy of is updated — pointing them at the existing "Check for New
  Samples" pull mechanism rather than silently overwriting their copy.
  James expects his starter-sample set to be largely complete at launch
  and updated only rarely, so this doesn't need to be a heavyweight
  automated pipeline.
- **Tax (EU/US VAT, thresholds)**: parked deliberately — Stripe Tax (a
  built-in Stripe feature) is the practical mechanism when Stripe setup
  is actually underway; anything with real compliance liability still
  wants a real accountant's sign-off, not Claude's.
- **WooCommerce**: reconfirmed, not revisited — the existing recommendation
  (§4, "Payment processing") stands as-is. It plays no role in any of this.
- **The record is corrected**: James confirmed directly (2026-11-24) that
  **Stripe account creation has not been done** — the prior "step 1 given,
  not yet confirmed" note in earlier revisions of this file should not be
  read as any progress having actually happened. The walkthrough starts
  from a genuine zero next session, one step at a time, exactly as he's
  asked for throughout.
- **Full delivery plan, agreed as bite-sized stages (A business decisions →
  B Stripe account/product setup → C Supabase plumbing (plan config table,
  Checkout/webhook Edge Functions, renewal/expiry + reminder emails) →
  D app-side enforcement (numeric caps, workflow-type gates, read-only-
  over-limit mode) → E reporting/notifications (the two new asks above) →
  F WordPress (update the HTML snippet, then walk James through
  publishing it) → G go live (Stripe to live mode, one real test payment))
  — see §4 for the full breakdown. **Next actual step, whenever James is
  ready to resume this thread: Stage B, step 1 — walk him through creating
  the Stripe account itself.**

**Evening round, 2026-10-14 (PRs #230–#235) — a sign-up-notification feature
built in stages, settling on an in-app panel:**
- Promote/Demote (PR #230's own auto-insert-heading mechanism) was tried,
  found more trouble than it was worth, and simplified per James's own
  direct correction: both directions now just warn *after* the move
  ("...requires changes to headings, please make changes as you require
  after Promote/Demote") rather than attempting to auto-insert a heading row.
- Fixed the "not-allowed" cursor visibly lingering on a protected row after
  Unlock, even though editing was already working correctly — a CSS rule
  had no awareness of lock state, only of the row's permanent `protected`
  flag; rescoped to require both.
- Session autosave ("Resume Work in Progress") is now scoped per signed-in
  account — a brand-new account signing into a browser previously used by a
  different account no longer sees that other account's in-progress work.
- The Library's starter-sample star indicator now also shows on a
  subscriber's own copy of a sample (not only on James's master flagged
  entry) — their copy correctly still carries `isStarterSample: false`
  underneath (that's what stops it being re-seeded to every other new
  subscriber), the star is just keyed off a separate "came from a sample"
  field for display purposes.
- First-sign-in Library seeding (new account, starter samples copying in)
  now shows a visible "Setting up your Library — adding sample N of M…"
  notice — it was previously silent while running (each sample is its own
  network round trip, visibly a few seconds for the full set), which read
  as "nothing is happening" and led to a mid-seed browser refresh.
- **New-signup email notification investigated at length, turned out to be
  working.** The Resend/pg_net trigger from PR #229 (`supabase/0008`) was
  suspected broken when a test signup produced no email — diagnosis (two
  read-only SQL checks James ran himself) showed Resend had actually
  accepted and queued the email (`status_code: 200`, an `{"id": ...}`
  response) — a deliverability/spam-folder question, not a sending bug.
  Confirmed working for a later signup. **Built regardless, as a more
  robust alternative James asked for directly**: a supervisor-only panel on
  the landing menu listing anyone who's signed up since last checked (name,
  email, company, mobile, date), reading straight from the existing
  `profiles` table rather than depending on outbound email at all —
  `supabase/0009_allow_supervisor_read_profiles.sql` is the one new
  one-time SQL step this needed (profiles was previously unreadable by the
  app under any account, by original design — see §2). Includes a
  "Download CSV" button (for sending welcome emails) and clears itself on a
  plain refresh or a fresh login, not only on an explicit dismiss.

**A documentation gap, found and fixed 2026-10-14:** this file was missing
real, already-shipped work — most importantly, Resend was already fully
configured as Supabase's custom SMTP provider (DNS verified, confirmed
working by James's own test) well before this file's previous "last
updated" date, and was never recorded here at all. Relying on this file
being current, an earlier reply in this same session wrongly told James
the email setup still needed doing from scratch. James supplied his own
complete record of the project conversation to correct this; §2–§6 below
have been reconciled against it. **The lesson driving this**: nothing said
in any one session persists to the next except what's written into this
file (or `PROGRESS.md`/`CLAUDE.md`) — a decision or a piece of completed
setup that only ever lived in chat is, from a future session's point of
view, exactly as if it never happened. Keep this file current as a matter
of course, not just at natural pauses.

**Engineering is fully caught up as of PR #235 (2026-10-14)** — every item
from James's last several rounds of live testing has been addressed and
deployed. PR #210 and earlier covered four showcase-recording bugs, a
dismissible "Resume Work in Progress" banner, Lock Taxonomy syncing to the
Library, a starter-sample seeding race fix, Audit's new case checks, and
Unlock gaining Lock's own confirm treatment (full detail in §2 and
`PROGRESS.md`). Since then: PR #211 brought this file's engineering summary
up to date (since superseded by this correction pass); PR #212 added a
dismissible "new version available" banner (polls a small `version.json`
marker written alongside each deploy) and three ERP Doctor book
recommendations on the landing menu; PR #213 fixed those book links being
illegible against the landing page's dark blue background; PR #214 added a
**supervisor role**, restricted to James's own account
(`jamesar@jar-and-a.com`) — starring Library entries as starter samples
(previously open to any subscriber) and an in-app Help editor are now
supervisor-only, and the groundwork is in place so that if/when tier limits
are ever built, his account is automatically exempt (see §2). PR #218 fixed
sign-up silently showing "check your email" for an already-registered
address; PR #219 root-caused and fixed the duplicate starter-sample Library
entries (see below).

**Both of the previously-open investigations below were root-caused and
resolved on 2026-10-14 (PRs #218, #219):**
- **Duplicate starter-sample entries — resolved.** Root cause: `Login.tsx`
  passed the signed-in email to `App.tsx` exactly as typed, while Supabase's
  own auth-state-change listener reports it lowercase-normalized moments
  later; any typed uppercase meant the app saw two distinct sign-in events
  for one login and ran starter-sample seeding twice, each pass's own "is my
  Library still empty?" check landing before the other's inserts had
  committed — confirmed via a brand-new test account that already showed 2
  copies of every sample on its very first sign-in, which ruled out stale
  session data as the cause. Fixed in three layers: `Login.tsx` now
  normalizes the email it reports; `library.ts` upserts seeded/imported
  copies on `(user_id, source_sample_id)` instead of always inserting a
  fresh row; and a new database constraint
  (`supabase/0007_prevent_duplicate_starter_sample_copies.sql`) makes a
  duplicate copy structurally impossible regardless of any future timing
  quirk — a real guarantee, not just a client-side check. All existing
  duplicates (3 affected accounts, 98 rows) were cleaned up via
  `supabase/0006_dedupe_existing_library_entries.sql`, and James confirmed
  all three accounts now show each sample once.
- **New-signup confirmation email not arriving — resolved, not a bug.** The
  test address (`james.a.robertson@the-erp-doctor.com`) had actually been
  used before; Supabase deliberately sends no email and gives no error when
  `signUp()` is called with an already-registered address (an
  anti-enumeration measure), which the app was silently treating the same
  as a genuine new signup. Fixed in `auth.ts` (PR #218): this case is now
  detected and reported honestly ("An account already exists for this
  email..."). Resend/SMTP itself was never broken — confirmed working again
  with a genuinely new test address.

**Commercial-setup status below (§4/§6) has been reconciled against
James's full record as of 2026-10-14**, but the Stripe account, the
WordPress pricing page publication, and the Outlook 365 registration are
all still exactly where the 2026-09-28 snapshot left them — nothing in
James's own record since then shows any of those three moving forward.
**Still worth confirming directly with James** rather than assuming,
since a gap exactly like this is what caused today's correction in the
first place.

<details>
<summary>Commercial-setup status as last recorded (2026-09-28) — click to expand</summary>

James was away from the project until **Friday 2026-10-02 at the earliest**
(moving house Wednesday 2026-09-30; packing takes up Tuesday). Nothing was
blocked on the engineering side — the app was fully shipped and deployed as
of PR #190. What was paused is the **commercial setup conversation**, which
was mid-flow when James stepped away. Here's exactly where that stood, so it
can pick up without re-deriving anything:

**Delivered to James, not yet actioned by him:**
- The WordPress-ready pricing page (a self-contained `<div>` + `<style>`
  snippet for a WordPress "Custom HTML" block — no plugin, no developer
  needed) was sent to him as a file. It's built and visually verified
  (desktop + mobile), but he has not yet pasted it into the-erp-doctor.com.
  It contains one placeholder he needs to fill in before publishing:
  `REPLACE_WITH_CONTACT` on the Enterprise tier's "Contact Us" link, currently
  pointing at `#`.
- That page's Free-tier button links to
  `https://drjamesarobertson-design.github.io/taxonomy_builder/?mode=register`
  — this works today because of PR #190 (`Login.tsx` now reads `?mode=register`
  from the URL and opens straight on the sign-up form).

**Conversation in progress — Stripe setup, one step at a time (James's
explicit instruction: "doing on a step-by-step one step at a time basis"):**
- **Step 1 was given**, not yet confirmed done by James: go to
  `https://dashboard.stripe.com/register`, create an account, verify email.
  No business/banking details needed yet — Stripe allows exploring the
  dashboard in **test mode** immediately; live/payout details can be added
  later, right before actually going live.
- **Do not jump ahead to step 2** (creating products/prices in the Stripe
  dashboard, or the Edge Functions work) until James confirms he's completed
  step 1 and is looking at the Stripe Dashboard. This pacing was his explicit,
  repeated request — respect it even after a multi-day gap.

**Answered, no action needed:** James asked whether there's a reason not to
do the Outlook 365 Azure app registration now, ahead of Stripe. Answer given:
no — it's free, independent of Stripe, and redirect URIs can be edited later.
He said he'd follow his own stated order (Stripe first) unless told
otherwise, so **do not start the Outlook 365 walkthrough unprompted** — wait
for him to ask for it, per §4 below.

**When James returns, the natural next questions to ask him (don't assume
the order — let him pick up wherever he wants):**
1. Did the Stripe account get created? If yes → give step 2 of the Stripe
   walkthrough (next: creating the Product/Price objects in test mode for
   the Professional and Enterprise tiers, ready for Checkout Session code).
2. Did the WordPress pricing page get published? If yes → confirm the
   `REPLACE_WITH_CONTACT` link was updated; if he wants help with the
   WordPress steps themselves (block editor vs. classic editor, etc.), that
   walkthrough hasn't been given yet — give it "one step at a time" per his
   standing preference.
3. Does he want to proceed with the Outlook 365 Azure app registration now,
   or hold it until Stripe is further along? Either is fine technically.
4. Sign-off still needed on the draft pricing numbers themselves (§4/§5
   below) before any tier-limit enforcement gets built into the app.

</details>

---

## 1. What this is

**Taxonomy Builder** (branded **The ERP Doctor Taxonomy Builder**) is a
facilitation tool for building structured hierarchical taxonomies — Chart of
Accounts, Product Class, Asset Class, Division, Location, Reason Codes, and
similar master-data lists — as master data for any downstream software
application (typically an ERP). It is not an automated generator: it guides a
user or small stakeholder group through the judgement calls of building a
clean, correctly-coded hierarchy, enforcing the structural conventions (5–9
items per level, ascending code order, ALL CAPS for structural entries,
Proper Case for posting-level entries, etc.) along the way.

**Live app:** https://drjamesarobertson-design.github.io/taxonomy_builder/
**Repository:** `drjamesarobertson-design/taxonomy_builder` (GitHub)
**Deploy:** automatic — every push to `main` rebuilds and redeploys via
GitHub Actions (`.github/workflows/deploy-pages.yml`), live within about a
minute.

---

## 2. What it can do today

### Account & sign-up
- Real accounts via Supabase Auth — Create Account, Log In, Forgot
  Password, all live.
- **Create Account collects Name, Company Name, and Mobile Number**
  (required, with an international dialling code, e.g. `+44 7700 900123`,
  validated client-side before submission) alongside the usual email/
  password. A "check your email to confirm your account" popup shows
  immediately after submitting.
- That contact data is stored two ways: in Supabase Auth's own user
  metadata (visible per-user under Authentication → Users → click a user →
  User Metadata), and copied automatically into a separate `profiles`
  table (`supabase/0001_create_profiles.sql`) — still pullable as a clean
  contact list straight out of Supabase's Table Editor as a CSV (Table
  Editor → `profiles` → export) if ever needed, but as of 2026-10-14 James
  doesn't need to go there day to day: see the in-app "new sign-ups" panel
  below. Originally this table had zero RLS policies at all (reachable only
  from inside the Supabase dashboard); `supabase/0009_allow_supervisor_read_
  profiles.sql` added one read-only policy scoped to James's own account,
  specifically so the app itself could show it to him.
- **New sign-ups panel** (James's ask, 2026-10-14, supervisor-only): a
  panel on the landing menu — same placement/shape as "Resume Work in
  Progress" — listing anyone who's signed up since James last saw it (name,
  email, company, mobile, sign-up date), with a "Download CSV" button for
  pulling the list to send welcome emails. Clears itself automatically on a
  plain browser refresh or a fresh log-in (not only on an explicit
  dismiss), so only genuinely new sign-ups since the last time he actually
  saw the panel ever show. Built as a more reliable, no-email-deliverability-
  question alternative to the Resend notification below, after James found
  the "did it even send" question hard to reason about from the email alone
  — see §0 for the full story (the email was in fact confirmed working).
- **Email delivery runs through Resend**, not Supabase's own default
  mailer (see §4 for the full setup record) — this is what makes
  confirmation/password-reset emails arrive reliably at any real inbox
  rather than hitting Supabase's test-only rate limit. A separate trigger
  (`supabase/0008_notify_supervisor_of_new_signup.sql`) also emails James
  directly on every new sign-up, confirmed working 2026-10-14 — the new
  sign-ups panel above is a second, independent way to see the same thing,
  not a replacement for this.
- **Supervisor role** (James's own account, `jamesar@jar-and-a.com`
  specifically, hardcoded — see `src/supervisor.ts`): capabilities
  restricted to this one account — marking/unmarking a Library entry as a
  starter sample (open to any subscriber until 2026-10-14; a database
  trigger now enforces this server-side, not just a hidden button), an
  in-app Help editor (edit any tooltip/help-page field directly, in place
  of downloading `help-text.csv` and editing it in Excel), a "Test
  Checkout" toolbar dropdown for exercising the real Stripe flow (§4), and
  (new, 2026-11-25) an **"Export Full Backup" toolbar button** — see
  below. Built as reusable infrastructure — no paywall exists yet to
  bypass most of this (see §4), but his account will be automatically
  exempt the moment one is.

### Disaster recovery (added 2026-11-25)
James asked directly what the disaster-recovery arrangements are, after
reading an article on the topic. Honest answer at the time: **code and
configuration are well covered** (this entire repository, full history,
in GitHub — the live site rebuilds from source automatically, so there's
no server to lose) — **the live database was not**. The Supabase project
is on the **Free plan**, which doesn't include automated backups; before
this, the only way to get data out was Supabase's own Table Editor,
table by table (as already used for `profiles` — see "Account &
sign-up" above).

Given the choice between upgrading the Supabase plan (for automated
backups) or a periodic manual export, James chose the latter. Built:
`supabase/functions/export-database-backup/index.ts`, a new Edge
Function — supervisor-only, **enforced server-side inside the function
itself** (checks the caller's own email, not just a hidden UI button,
same principle as every other supervisor-only capability in this
project) — which reads every row of every table (`profiles`,
`library_entries`, `subscription_plans`, `subscription_settings`,
`subscriptions`) using the service-role key, specifically because some
of these tables (`library_entries`) have no supervisor-read-all RLS
policy today — a backup needs everything, so this bypasses RLS entirely
for exactly this one purpose rather than weakening any table's existing
policies for everyday use. `src/databaseBackup.ts` calls it and saves
the result as one timestamped JSON file via the browser's save dialog
(the same `saveExportFile` mechanism every other export in this app
already uses). A new **"Export Full Backup"** toolbar button triggers
it, visible only to the supervisor account.

James was also given a full code-and-configuration backup directly (a
Git bundle — the standard format for a complete, restorable-elsewhere
repository copy — zipped with a README explaining what it does and
doesn't cover, and how to restore it). That covers the code side once;
it isn't a recurring mechanism — the "Export Full Backup" button above
is what's meant to be used periodically, for the data side, going
forward.

**Status: written, 2026-11-25, not yet deployed by James.** Same
deployment dance as `create-checkout-session` (§4): Supabase Dashboard →
Edge Functions → Deploy a new function → Via Editor → name it exactly
`export-database-backup` → paste the code → deploy → turn off "Verify
JWT with legacy secret" on its Settings tab, same reasoning as before
(this function does its own proper auth check in code).

### Core taxonomy editing
- The full coded-hierarchy grid: single-character code columns, configurable
  delimiter columns, description columns, per-level colour coding, ALL
  CAPS/Proper Case convention.
- Full row editing: type-ahead entry, case toggle, promote/demote (with
  children), alpha sort, manual drag reorder, insert/delete rows (including
  multi-row selections), copy/move blocks.
- Code validation: charset restrictions, ascending-order enforcement (hard
  rule, with an explicit Override), duplicate detection, soft warnings for
  item counts outside 5–9 and descriptions approaching their configured
  length limit.
- Deep undo/redo across every edit type.
- Notes on any entry, with a discreet on-row indicator.
- **Guided wizard** ("Simple Taxonomy"): a step-by-step build flow —
  headings, then sub-items, then coding — for a first-time or less technical
  user, with live Numeric/Alpha code-restriction prompts and mnemonic code
  suggestions. "One Column List with Multiple Character Codes" is its own
  separate menu entry for a genuinely flat list (no guided-wizard staging,
  since there's no hierarchy to build up through).
- **Audit Taxonomy**: a structured integrity walkthrough (missing codes,
  out-of-order codes, "Other" not last, oversized descriptions, outlier
  entries, a childless ALL CAPS heading, and — the other half of that same
  check — a heading with children left in the wrong case) that is required
  before Lock Taxonomy and offered before CSV export, or runnable standalone
  any other time. Most checks are hard (must be fixed or accepted before
  continuing); a deliberate ALL CAPS entry with no children (e.g. a section
  marker like "END OF LOCATIONS") can be explicitly accepted as correct
  rather than only fixed.
- **Lock Taxonomy**: freezes a taxonomy once it's live in an ERP — protects
  existing rows from destructive edits while still allowing controlled,
  audited additions ("Lock updates"). Both Lock and Unlock require typing
  the word (LOCK/UNLOCK) to confirm, with the signed-in account shown. Lock
  also adds the taxonomy to the Library if it isn't there already
  (prompting which category), and keeps that Library copy in sync on every
  later Lock/Lock Updates.
- **Format Descriptions**: a whole-taxonomy (or selected-range) bulk
  clean-up — "Capitalise and Proper Case All" brings every heading to ALL
  CAPS and every posting-level entry to Proper Case in one action, useful
  after importing scrappy or inconsistently-cased source data.

### Import
Four CSV import shapes, each recognised automatically from the file's own
structure and reachable from one "Import CSV ▾" toolbar menu:
1. **ERP Doctor Delimited Format** — this app's own one-character-per-column
   layout (also accepts the app's own Discrete Columns export).
2. **Third Party Concatenated Codes** — a file with one combined code per row
   (e.g. `"2111"`), split into per-level characters with a delimiter-position
   setup step.
3. **Multi-Column Description Table Without Code** — a file with no codes at
   all, one description column per level, exactly one populated cell per row
   at the position matching its level (the shape of a typical folder-
   structure export). Codes are left blank; the grid automatically hides its
   (empty) code columns until the user is ready to code it — toggleable
   anytime from Settings ("Hide Code Columns").
4. **Flat Code and Description List** — a plain two-column (code,
   description) file with no hierarchy at all.

Common import mistakes (wrong file type, unrecognised shape, structural
problems) are now flagged with a specific, fixable message rather than a
generic failure.

### Export
- **CSV**: Discrete Columns (matches the on-screen grid) or Concatenated
  (one padded, delimited value per posting-level row, for ERP import), each
  with a "no delimiter" variant.
- **Single Column CSV**: one combined `Code_Description` or `Code-Description`
  value per row, for pasting into another tool (e.g. a folder-naming scheme).
- **Excel (XLSX)**: full formatting parity with the on-screen grid (colours,
  ALL CAPS/Proper Case).
- **Export Block**: any selected row range, independent of a full export.

### Library (cloud, per-account)
- Every subscriber's Library is private, cloud-stored per account (Supabase),
  following them across devices.
- New subscribers are automatically seeded with a curated set of starter
  sample taxonomies on first sign-in; a "Check for New Samples" button lets
  existing subscribers pull in newly-published samples later, voluntarily
  rather than automatically — both this and the import step now show a
  visible progress/busy state so a slow check (with a few dozen samples to
  compare against) doesn't look stalled and invite a duplicate-triggering
  repeat click. Marking an entry as a starter sample is supervisor-only
  (James's account) as of 2026-10-14 — see "Account & sign-up" above.
- Import/export a Library bundle as a file (backup, migration, sharing a demo
  set); bulk Export to Excel/CSV for the whole Library in one action; "Import
  from Folder (Replace)" for batch-replacing a set of Library entries'
  content from a folder of files, fuzzy-matched against each entry's title.

### Folders (create real folders from a taxonomy)
Toolbar "Folders ▾" menu:
- **Local Hard Drive** — creates a real folder for every entry in the
  taxonomy (headings included, not just leaves), nested exactly as the
  taxonomy is, directly on the user's computer via the browser's File System
  Access API (Chrome/Edge only). Prompts for a destination (defaults to
  Documents) and an optional top-level folder name (default "Data") to keep
  the taxonomy's folders separate from whatever else is already there.
- **Outlook Client** — downloads a plain folder-path list plus a ready-to-run
  Outlook VBA macro; a one-time macro import in Outlook creates the matching
  mail-folder structure. Genuinely working today, not a placeholder.
- **Outlook 365** — not yet built. Designed to be a one-click "Sign in with
  Microsoft" experience for every licensee once a one-time Microsoft Graph
  API app registration is done (see §4 below).

### Help system
- A custom-styled hover tooltip on every toolbar button and every right-click
  menu item across the whole app (not the browser's plain `title=` tooltip).
- A dedicated, searchable Help page (toolbar "Help" button).
- Both are driven by one editable file (`public/help-text.csv`), downloadable
  in-app (Help page → "Download Help CSV") so James can edit and resend it
  without touching GitHub directly — or edited directly in-app via the
  supervisor-only "Edit Help" button (see "Account & sign-up" above), which
  still produces that same downloadable file at the end.

### Staying current
- A small, dismissible "A new version of Taxonomy Builder is available"
  banner appears for anyone with the app open in a tab across a new deploy
  (polls a small `version.json` marker written alongside each release),
  with a one-click Refresh.
- Three ERP Doctor book recommendations (Amazon links) on the bottom of the
  signed-in landing menu.

### Commercial groundwork (not yet live)
- A **Pricing** page (reachable from the Login screen and the signed-in
  landing menu) presenting a draft three-tier model — see §4. Explicitly
  marked as a draft under review; there is no working checkout yet. **Still
  showing the old 3-tier numbers as of 2026-11-24** — the newly-agreed
  4-tier structure (§4) hasn't been built into the app yet (Stage D/F).
- The same draft pricing has also been prepared as a **standalone WordPress
  snippet** (delivered to James as a file, not part of this repository) for
  the-erp-doctor.com marketing site — see §0 for its exact delivery status.
  Also still the old 3-tier version; updating it to the new structure is
  Stage F (§4).

---

## 3. Architecture, in brief

- **Frontend**: React + TypeScript, built with Vite, hosted as a static
  single-page app on GitHub Pages. No server of its own.
- **Backend**: Supabase — Postgres (with Row Level Security) for accounts,
  Library storage, starter samples, and (new, see below) the subscription
  tier structure; Supabase Auth for sign-in/sign-up; Resend as the custom
  SMTP provider for auth emails (see §4). Twelve one-time SQL migrations
  exist (`supabase/0001`–`0012`), each a one-off manual step in Supabase's
  SQL Editor — eleven have been run; `0012` is new and **not yet run by
  James** (see §4, Stage C). `0001` creates the
  `profiles` table (James's own exportable contact list — see "Account &
  sign-up" in §2); `0002` creates `library_entries` (cloud Library
  storage); `0003` adds the starter-sample flag and its cross-account read
  policy; `0004` adds `source_sample_id` (for "Check for New Samples");
  `0005` restricts starter-sample flagging to James's supervisor account
  at the database level; `0006` was the one-time cleanup of the duplicate
  Library entries found 2026-10-14 (see §0); `0007` adds a unique
  constraint on `(user_id, source_sample_id)` so no account can ever again
  hold two copies of the same starter sample, closing that bug at the
  database level rather than relying on application timing; `0008` adds the
  Resend-via-pg_net trigger that emails James on every new sign-up (the
  Resend API key itself lives in Supabase Vault, not in this file — see §4);
  `0009` adds the one read-only policy that lets the app show James the new
  sign-ups panel (§2) from his own account; `0010` creates
  `subscription_plans` (the tier structure — prices, limits, feature
  gates — as live editable data rather than hardcoded constants, per
  James's explicit requirement) and `subscription_settings` (the single
  global "is Annual billing live yet" toggle), seeded with the 4-tier
  structure agreed 2026-11-24 plus one hidden `beta` row, readable by
  anyone (signed in or not — the Pricing page shows before sign-in too)
  and writable only by the supervisor account; `0011` creates
  `subscriptions` — one row per account, recording which plan it's
  actually on, defaulting every new signup to `free` via a trigger — with
  no write access for ordinary users at all, not even to their own row
  (only the trigger and, later, the Stripe webhook function can ever
  change it); `0012` adds two nullable columns to `subscription_plans` for
  each paid tier's Stripe Price ID, filled in by hand once the real IDs
  are known (see §4, Stage C).
- **Supabase Data API grants — new requirement from 30 October 2026
  onward.** Supabase emailed James (2026-10-21) that from that date, a
  newly *created* table in the `public` schema no longer automatically
  gets Data API access — without an explicit `grant` statement, PostgREST/
  supabase-js gets "permission denied" even if RLS policies are otherwise
  correct. Confirmed this does not affect any table that already exists in
  the live project (every migration above predates the change, and
  Supabase's own email says existing tables keep their current grants) —
  nothing to do for anything already shipped. It DOES mean any *future*
  migration creating a new table needs its own explicit grants alongside
  its RLS policies, e.g.:
  ```sql
  grant select on public.your_table to anon;
  grant select, insert, update, delete on public.your_table to authenticated;
  grant select, insert, update, delete on public.your_table to service_role;
  ```
  — add this to this list of required habits for any new migration file
  from here on, the same way RLS policies already are.
- **Local file system integration**: the File System Access API (Chromium
  browsers only — Chrome, Edge) powers "Choose Export Folder" and "Folders →
  Local Hard Drive". No equivalent exists in Firefox/Safari; both features
  degrade to a clear message rather than failing silently.
- **No server-side component of its own exists yet.** This matters directly
  for billing (below): anything needing a secret credential (a Stripe secret
  key, a Microsoft Graph client secret) cannot live in the frontend and will
  need a small serverless function — Supabase Edge Functions are the natural
  choice, since Supabase is already the one backend piece in place.

---

## 4. Commercial status and what's still needed from James

### Pricing — 4-tier structure agreed 2026-11-24, dollar break-points still under James's own review

Superseding the earlier 3-tier (Free/Professional/Enterprise) draft entirely.
Worked through directly with James across two revisions of his own pricing
spreadsheet; the structure, mechanics and features below are decided — only
the exact dollar amounts remain his to finalise ("I will give that more
thought"):

| | Free | Basic | Advanced | Enterprise |
|---|---|---|---|---|
| Monthly | $0 | $19.99 | $39.99 | $99.99 |
| Annual (total/yr, 25% off monthly) | $0 | $179.91 | $359.91 | $899.91 |
| Code/description columns | Up to 3 | Up to 6 | Up to 9 | Up to 15 (app max) |
| Rows | Up to 30 | Up to 60 | Up to 120 | Unlimited |
| Library entries | 3 | 6 | 12 | Unlimited |
| Lock Taxonomy | No | No | Up to 6 taxonomies | Unlimited |
| Taxonomy Audit | No | No | Yes | Yes |
| Chart of Accounts Wizard | No | Yes | Yes (incl.) | Yes (incl.) |
| Function Master | No | No | Yes | Yes |
| Location Master / Division Master | No | No | No | Yes |
| All taxonomy types | No | No | No | Yes |
| Create Folder Structure — Local Drive / Outlook | No | Yes | Yes | Yes |
| Import from GL Analyser / Export to GL Builder | No | No | "When available" | "When available" |
| Comprehensive help, full sample library, CSV import/export | Yes | Yes | Yes | Yes |

Every tier gets a 21-day money-back guarantee. "When available" against the
GL Analyser/GL Builder rows is deliberate — both are separate, not-yet-built
products (§5); these are forward-looking marketing commitments, not
something to try to enforce in code before they exist.

**Mechanics decided alongside the numbers (2026-11-24):**
- **Annual billing**: a flat discount off monthly (25% to start, i.e. "3
  months free" framing — considered against 30/40/50% and kept at 25% as
  the more conventional, less revenue-aggressive choice). Stored as an
  exact, independently-editable two-decimal amount per tier, **not**
  computed at runtime — Stripe Price objects are immutable per amount
  regardless, so changing this later always means creating a new Price
  object (with a separate decision at that time on whether existing
  subscribers move to it or stay on their original price). Shown at launch
  — not hidden — with Monthly/Annual as a toggle, but Annual is labelled
  **"Coming soon"** rather than actually purchasable, so turning it on
  later is a label change, not new engineering. The toggle shows the
  annual *total* (e.g. "$179.91/yr"), not a monthly-equivalent figure.
  Quarterly and Half-Yearly were considered and explicitly dropped.
- **Category names and the break-points themselves must be data James can
  edit, not hardcoded constants** — his explicit requirement, since he
  expects to tune them with real-world experience. Plan: a small Supabase
  table (tier name, price, each numeric/feature limit), editable the same
  way `help-text.csv`/the in-app Help editor already work for his
  supervisor account — not a new mechanism, the same one reused.
- **A real conflict caught and fixed**: the original draft offered Lock
  Taxonomy at Basic while gating Audit Taxonomy (a hard prerequisite for
  Lock) to Advanced+. Resolved by moving Lock up to Advanced+ alongside
  Audit, so no tier is ever sold a feature it structurally can't use.
- **Lower tiers see the full starter-sample Library, not a cut-down one** —
  but a sample whose column/row count exceeds that tier's own limits opens
  **read-only** rather than being hidden or blocked. Confirmed feasible at
  a moderate size: reuses the existing Lock Taxonomy "viewable, can't be
  destructively edited" plumbing rather than needing a new mechanism built
  from scratch. Scoped as its own stage below (Stage D), not assumed free.
- **"Create Folder Structure on Local Drive" and "...in Outlook" need no
  new engineering** — both already exist and work today (§2: Local Hard
  Drive, and the Outlook Client VBA-macro flow). Gating them per tier is
  just the same limit-check every other capability needs. This is
  distinct from **Outlook 365** (§4 below, "one-click" Microsoft Graph
  sign-in), which genuinely isn't built and stays its own separately-
  scheduled piece of work — no dependency forces an order between them.
- **Beta tester override**: a hidden tier/flag giving full tier-equivalent
  access at no charge, explicitly still excluded from the supervisor-only
  Edit Help capability regardless of that override.
- **When someone registers, the chosen tier is logged** at signup (a field
  on the existing `profiles` table or a new `subscriptions` table), kept
  in sync by the Stripe webhook once billing is live as the single system
  of record for "what plan is this account on."
- **Two new feature asks, agreed, not yet built**:
  - A **paid-subscriber report** (supervisor-only) — reuses the existing
    "new sign-ups" panel's exact list+CSV-download pattern, once the plan
    field above exists.
  - **Email notification on starred-Library updates** — when James updates
    a starter sample, notify only the subscribers who actually hold a copy
    of that sample (via the existing Resend infrastructure), pointing them
    at the existing "Check for New Samples" pull mechanism rather than
    silently overwriting their own copy. James expects his starter set to
    be largely complete at launch and updated only rarely, so this doesn't
    need heavyweight automation — a simple, occasionally-triggered action
    is enough.
- **Tax (EU/US VAT, minimum thresholds)**: deliberately parked until Stripe
  setup is actually underway — **Stripe Tax** (a built-in Stripe feature)
  is the practical mechanism to reach for then. Anything with real
  compliance liability (e.g. whether James must register somewhere because
  of a threshold) still wants a real accountant's sign-off, not Claude's.

**Subscription/renewal mechanics James specified earlier, unchanged and
still to be built**: billing renews monthly or annually (quarterly/
half-yearly dropped — see above). On expiry, login is hard-blocked (no
grace-period access) with a clear "your subscription has expired — renew
here" screen in place of the app. Staged reminder emails before that point:
one month out, one week out, one day out, then an expired notice, then a
follow-up nudge if still unrenewed — each sent through the same Resend
infrastructure as the auth emails (see below).

### Delivery plan — agreed 2026-11-24, bite-sized stages, in order
1. **Stage A — business decisions**: done, except final dollar break-points
   (James's own further thought, not blocking the rest).
2. **Stage B — Stripe account/product setup, step by step**: create the
   account (`dashboard.stripe.com/register`, verify email, test mode
   available immediately, no banking details needed yet) → create test-mode
   Product + Price objects for each paid tier (Monthly now; Annual Price
   objects can be created in test mode too, ready for when Annual goes
   live) → enable Stripe Tax → obtain the test-mode publishable key.
   **Done, 2026-11-24** — see §0/§4 "Payment processing" for the full record.
3. **Stage C — Supabase plumbing**: the tier-config table — **done,
   2026-11-24** (`supabase/0010_create_subscription_plans.sql`); the
   per-account plan record, defaulting every signup to Free — **done,
   2026-11-24** (`supabase/0011_create_subscriptions.sql`), both run
   successfully by James; the Checkout Session and webhook Edge Functions,
   the renewal/expiry state machine and the staged reminder emails —
   **all done, 2026-11-25, tested live by James** — see §0.
4. **Stage D — app-side enforcement** — **built in full, 2026-11-25, then
   tested live by James and confirmed working** (bar one piece
   deliberately held over — see below): the numeric caps (columns/rows/
   Library entries/locked taxonomies) and the workflow-type gates
   (reusing the existing `WORKFLOW_LEVELS`/Cubic Business Model
   structure) wired to the live tier config; the read-only-over-limit
   mode, which — after live-testing feedback — now applies to any
   oversized Library entry regardless of ownership, not just starter
   samples; the "subscription expired, renew here" hard-block screen,
   **not yet tested live (held over for tonight at James's own request)**.
   See §0 for the full breakdown.
5. **Stage E — reporting & notifications**: the paid-subscriber report; the
   starred-Library-update notification feature.
6. **Stage F — WordPress**: update the already-delivered HTML pricing
   snippet (§4 below) to the new 4-tier structure once dollar amounts are
   final; walk James through pasting it into a WordPress Custom HTML block
   (never done yet); fill in the `REPLACE_WITH_CONTACT` placeholder.
7. **Stage G — go live**: Stripe account to live mode (banking/payout
   details added at this point, not before); one real, small end-to-end
   test payment; launch.

### Email delivery — Resend, configured and working
Supabase's own built-in mailer is explicitly test-only (a handful of
emails/hour, not meant to carry real traffic) — all confirmation/
password-reset emails now route through **Resend** instead, configured as
Supabase's custom SMTP provider:
- Resend account: `jamesar@jar-and-a.com`. Sending domain
  `the-erp-doctor.com`, DNS-verified (SPF/DKIM records at the registrar).
- Supabase → Authentication → Emails (relocated from "SMTP Settings" in an
  earlier Supabase UI) → Custom SMTP: host `smtp.resend.com`, port `465`,
  username the literal word `resend`, password a Resend API key (starts
  `re_...`, generated from Resend → API Keys — **not** an arbitrary chosen
  password), sender an address on the verified domain (e.g.
  `noreply@the-erp-doctor.com`).
- **Confirmed working** by James's own end-to-end test (Create Account +
  Forgot Password, both arrived correctly) once this was set up.
- **2026-10-14 incident, resolved same day:** a signup confirmation email
  didn't arrive for `james.a.robertson@the-erp-doctor.com`. Cause: that
  address had been used before — Supabase deliberately sends no email and
  gives no error for an already-registered address (an anti-enumeration
  measure), which the app was silently treating as a normal new signup. Not
  a Resend/SMTP problem at all; confirmed still working correctly with a
  genuinely new address. Fixed in `auth.ts` (PR #218) so this case is now
  reported honestly instead of silently.

### Payment processing — recommendation: Stripe direct, skip WooCommerce
- The product is a software subscription, not a shopping-cart purchase —
  WooCommerce's whole model (product catalog, cart, shipping) doesn't fit,
  and its subscription-billing capability is itself a separate paid
  extension that would then need custom code to sync back into this app's
  Supabase-based accounts anyway. Two systems of record for "has this person
  paid?" is a recipe for support tickets.
- Going directly to **Stripe Checkout** (hosted, no PCI burden) plus the
  **Stripe Customer Portal** (so subscribers manage/cancel their own plan)
  keeps ONE system of record: Stripe's subscription status flows via webhook
  straight into the same Supabase database everything else already uses. The
  marketing website's only job becomes a "Sign Up" / "Upgrade" link into the
  app.
- **Architecture plan**: two small Supabase Edge Functions — one to create a
  Checkout Session when a user clicks "Upgrade," one to receive and verify
  Stripe's webhook and update that user's `plan` in Supabase. Neither needs
  handled in this app's frontend code at all.

**Needed from James:** a Stripe account. His old one (from ~7 years ago) is
untraceable — a fresh account is the right call. Once created, from the
Stripe Dashboard: the publishable key (safe to share), the secret key, and
(once a webhook endpoint is configured) a webhook signing secret. **None of
these should be pasted into chat** — once the account exists, the secret
key and webhook secret should go directly into Supabase's own dashboard
(Project Settings → Edge Functions → Secrets), the same way Supabase's own
credentials never leave that dashboard today.

**Status — Stage B complete as of 2026-11-24.** Walked through live, one
step at a time, in a single session: Stripe account created (test
mode/sandbox); Stripe Tax enabled in the sandbox (live-mode activation is
a Stage G, go-live step, not needed yet); all three paid-tier Products +
Prices created in GBP, Monthly billing, **tax-exclusive** (James's call —
the advertised price is net, local tax is added on top at checkout,
standard for B2B software — see §0 below for the full reasoning), using
the draft dollar-figure-as-pounds amounts from §4's pricing table (Basic
£19.99/mo, Advanced £39.99/mo, Enterprise £99.99/mo) as placeholders —
trivial to change later since nothing here is live. Test-mode publishable
key obtained: `pk_test_51UfL2jFJfNMrOj5R1LVzxrlVK7jSA1bLth2c75mD4L27l29ZZazVsVMv2wYLFi5m3MUtnnV06GwawTikhYNkHq3O00qV4AC9E3`
— safe to record (publishable keys are meant to be public, embedded in
frontend code). **The secret key was correctly never shared in chat** —
per the rule above, it goes straight into Supabase's own dashboard once
Stage C's Edge Functions are actually being built, not before.

One live-UI note for whoever picks up this walkthrough next: Stripe's
current dashboard no longer has a literal "Developers" sidebar entry —
API keys are reached directly at `dashboard.stripe.com/test/apikeys`
(or `/live/apikeys` once live), and the publishable key shows as a
separate button/panel near the top of that page rather than in the main
"Secret keys" table.

**Open issue on the live account, unrelated to the above (2026-11-24):**
confirming his email took James straight into Stripe's live-account
activation flow (business/bank details), ahead of where Stage G would
otherwise have asked for it. That surfaced an automated "Know Your
Business" compliance flag — an unrecognised "missing director" Stripe
says is required but which James has no association with. Stripe Support
couldn't resolve it on first contact. Confirmed with James this is
entirely a live-account verification matter, structurally unable to touch
the sandbox — nothing in Stage B through F depends on it in any way; it
only blocks Stage G (accepting real payments), which is not imminent.
Needs revisiting with Stripe (a different support escalation, or
supporting documents such as a Companies House extract) whenever James is
ready to actually go live — not before.

**Next:** Stage C (Supabase plumbing — the tier-config table, the
Checkout-Session/webhook Edge Functions, the renewal/expiry + reminder-
email mechanics) is mostly engineering work on this side, with a couple of
one-time steps for James along the way (similar in shape to the existing
Supabase SQL migrations already run for the Library/supervisor features).
Not started yet — a deliberate pause point was offered after Stage B,
since this is a different kind of work from the dashboard click-through
above and warrants being its own bite-sized chunk.

### Outlook 365 — needs a one-time Microsoft 365 app registration
For "Sign in with Microsoft" to be genuinely one-click for every future
licensee (per James's explicit ask — "really easy for someone who licenses
the software to action"), a multi-tenant Azure AD (Entra ID) app registration
needs to be created once, by the ERP Doctor, with delegated Microsoft Graph
permission to read/write mail folders. This is a one-time setup cost that
then makes the feature effortless for every subscriber afterward — they
would just click "Connect Outlook 365," sign in with their own Microsoft
work/school account, and approve access. Not started yet; needs James's
decision to proceed (and access to a Microsoft 365 admin account to register
the app) before it can be built.

**Status:** James asked whether there's a reason to delay this registration
until after Stripe is set up. Answer given (2026-09-28): no technical reason
— it's free, independent of Stripe, and redirect URIs can be edited later;
if anything, earlier is better since app-registration review can have some
lead time. He said he'd follow his own stated order (Stripe first) unless he
says otherwise — so wait for him to ask before giving the step-by-step for
this, rather than starting it unprompted.

### The website (the-erp-doctor.com) — admin access not needed for the above
Site: `https://the-erp-doctor.com/`; admin: `https://the-erp-doctor.com/admin`
(WordPress, with WooCommerce already installed but unused). None of the
billing or Outlook work above touches the WordPress marketing site — the
paywall logic lives entirely in this app plus Supabase plus Stripe.

A standalone WordPress-ready pricing snippet (self-contained `<div>` +
`<style>`, pastes into a WordPress "Custom HTML" block, no plugin or
developer needed) was delivered to James earlier as a file, built against
the old 3-tier draft — still not pasted into the-erp-doctor.com (Stage F,
§4). It needs updating to the new 4-tier structure once James finalises the
dollar break-points, and still has the `REPLACE_WITH_CONTACT` placeholder
on its "Contact Us" link waiting to be filled in. The WordPress-side
walkthrough itself (block editor vs. classic editor, etc.) hasn't been
given yet — give it step by step when James is ready for Stage F. If direct
edits to the WordPress site are ever needed, the safe way to grant access is
a WordPress **Application Password** (Users → Profile → Application
Passwords in `wp-admin`) scoped just for that purpose — not the real admin
login.

---

## 5. GL Analyser Management Application — a separate, parked future product

A second, substantially bigger product, deliberately set aside (James's own
call, "let us park what I will call the GL Analyser Management Application
for now... I still have quite a bit to do on Taxonomy Builder") to return
to once there's bandwidth — not started, no repo or Supabase project set
up for it yet. Recorded here in full so picking it back up doesn't require
re-deriving any of this.

- **What it is**: a from-a-trial-balance tool that produces first-draft
  Division/Location/Function/Chart-of-Accounts tables from a client's real
  data — a genuinely new product, not an extension of Taxonomy Builder.
  James and a separate "Claude Chat" conversation (not this codebase)
  already produced a full business workflow document and an application
  specification for it — both exist as files outside this repository, not
  yet reviewed line-by-line against this repo's own conventions.
- **Proposed delivery shape, as last discussed**: Phase 1 (core wizard, no
  billing — auth, file upload, a four-step wizard calling Claude
  server-side with code execution, review/download, iterative refine,
  usage logging), ballparked at 12–22 sessions to a deployed, free-Beta-
  ready state; Phase 2 (Stripe billing) ~3–6 sessions; Phase 3 (dashboards/
  hardening) ~3–6 sessions — roughly 18–34 sessions end to end, Phase 1
  alone enough to run real Beta engagements on.
- **Licensing model, as James specified it**: separate from Taxonomy
  Builder's own recurring subscription — GL Analyser priced as an initial
  one-off per engagement, not a subscription (possibly unified into one
  combined subscription across all three tools later, but not now). GL
  Builder (the third, long-mentioned tool) is explicitly "NOT on the radar
  yet" — no plan, no timeline.
- **Cost ceiling**: James set a rough ~£50/month ceiling on the AI/compute
  cost per engagement as a constraint to design within — not yet validated
  against real numbers (needs the actual prompt/spec files sized for token
  cost, and a technical spike against one real anonymised trial balance,
  before a confident per-engagement cost figure can be given).
- **Payment shape under discussion**: James's own suggestion — 50% upfront,
  50% on delivery — fits a "payment before AI work" constraint and would be
  straightforward in Stripe once Phase 2 is reached.
- **To pick this back up**: review the business workflow + specification
  files James supplied, run one technical spike against a real (anonymised)
  trial balance to tighten the Phase 1 estimate, confirm the domain/
  subdomain it should live at, and set up a new repo + Supabase project
  only once actually starting (deliberately not done ahead of time — "no
  benefit to an empty repo sitting idle").

---

## 6. Open items awaiting James's input

- [x] ~~Duplicate starter-sample Library entries~~ — resolved 2026-10-14
      (PR #219): root-caused, fixed in code, existing duplicates cleaned up,
      and a database constraint now prevents recurrence. See §0.
- [x] ~~New-signup confirmation email not arriving~~ — resolved 2026-10-14
      (PR #218): was a reused test address, not a broken setup; fixed so the
      app now reports this honestly. See §0.
- [x] ~~Audit Taxonomy / Lock Taxonomy tier conflict~~ — resolved 2026-11-24:
      Lock moved up to Advanced+, alongside Audit. See §0/§4.
- [x] ~~Where does WooCommerce fit?~~ — reconfirmed 2026-11-24: nowhere: it
      plays no role, per the existing "Payment processing" recommendation.
- [x] ~~James to finalise the exact dollar break-points for the 4 tiers~~ —
      done 2026-11-25: set directly in Stripe; James has also emailed
      colleagues for marketability feedback, so treat as settled unless he
      revisits it himself.
- [x] ~~James to deploy `supabase/functions/export-database-backup/
      index.ts`~~ — done 2026-11-25, tested successfully (a real backup
      download covering all five tables).
- [x] ~~Create the Stripe account and the paid-tier Products/Prices~~ —
      done 2026-11-24 (Stage B, §4): account created, Stripe Tax enabled in
      the sandbox, Basic/Advanced/Enterprise all created in GBP/Monthly/
      tax-exclusive, test-mode publishable key recorded.
- [x] ~~Run `supabase/0010_create_subscription_plans.sql`~~ — done
      2026-11-24: both tables created successfully in Supabase.
- [x] ~~Run `supabase/0011_create_subscriptions.sql`~~ — done 2026-11-24:
      the per-account plan record, defaulting every signup to Free.
- [x] ~~Add the Stripe secret key to Supabase's Edge Function secrets~~ —
      done 2026-11-24 (as `STRIPE_SECRET_KEY`).
- [x] ~~Run `supabase/0012_add_stripe_price_ids.sql` and populate the
      three paid tiers' monthly Price IDs~~ — done 2026-11-24.
- [x] ~~Deploy `supabase/functions/create-checkout-session/index.ts`~~ —
      done 2026-11-24, under the correct name, with "Verify JWT with
      legacy secret" turned off per Supabase's own recommendation.
- [x] ~~Build a minimal "Upgrade" entry point to test the Checkout
      function~~ — done 2026-11-24: a supervisor-only "Test Checkout ▾"
      toolbar dropdown, three paid tiers.
- [x] ~~Test Checkout live, including a full real test payment~~ — done
      2026-11-24: all three tiers opened a real Stripe Checkout page,
      Stripe's test card (`4242 4242 4242 4242`) was accepted, and Stripe
      redirected cleanly back to the app in the same tab afterward
      (confirmed as correct, expected behaviour, not a bug). Nothing in
      the app visibly reacted yet — expected, since that's the webhook's
      job, not yet built.
- [x] ~~Register the webhook in Stripe, add its signing secret, write/
      deploy the webhook Edge Function, and test end-to-end~~ — done
      2026-11-25 (Stage C3, §0/§4): a real test payment correctly moved a
      test account's `plan_key` from `free` to `basic`. **Stage C3 is now
      fully complete.**
- [x] ~~Build the renewal/expiry state machine and staged reminder
      emails~~ — done 2026-11-25 (Stage C4, §4): `stripe-webhook` now keeps
      renewals/cancellations accurate, and the staged reminder emails
      (30d/7d/1d/expired/followup) were tested live and fire correctly at
      the right day-boundaries. **Stages C1–C4 are now fully complete.**
- [ ] Resolve the live Stripe account's "missing director" compliance
      flag with Stripe Support before Stage G (go-live) — does not block
      anything before then (§4, "Payment processing"). James is currently
      waiting on a further email from Stripe but, pending that, is taking
      their word that it doesn't affect the live account, which otherwise
      looks to be in order.
- [x] ~~Wire app-side tier enforcement: numeric caps, workflow-type gates,
      the read-only-over-limit Library mode, and the expired-subscription
      block screen~~ — built in full, 2026-11-25 (Stage D, §0/§4); **the
      numeric caps, workflow-type gates, and read-only-over-limit mode are
      now tested live and confirmed working** (v 1.21) — the last round
      widened read-only-over-limit to every Library entry, not just
      starter samples, at James's explicit direction.
- [x] ~~Run `supabase/0014_add_locked_taxonomy_count.sql`~~ — done,
      2026-11-25; the Lock Taxonomy count cap is tested live and working.
- [ ] **Next (tonight, at James's own request):** test the one Stage D
      piece still held over — the expired-subscription hard-block screen.
- [ ] Investigate a Library duplicate-name detection regression James
      flagged as a separate issue during Stage D testing (2026-11-25): it
      caught a duplicate name the first time, then let one through in a
      later, separate session. Not yet looked into.
- [ ] Build the paid-subscriber report and the starred-Library-update
      notification feature (Stage E, §4 — both new asks, agreed 2026-11-24).
- [ ] Update the WordPress pricing snippet to the new 4-tier structure once
      dollar amounts are final, then give James the WordPress publishing
      walkthrough for the first time, including the `REPLACE_WITH_CONTACT`
      placeholder (Stage F, §4).
- [ ] Decide whether/when to proceed with the Outlook 365 Microsoft Graph
      app registration (no blocker either way, independent of all of the
      above — see §4).

*See §0 above for the immediate "pick up here" summary of this list.*

---

## 7. Where to look for more detail

- **`CLAUDE.md`** — the original functional specification (data model,
  facilitation workflow, conventions) plus a standing amendment noting the
  project has moved well past its original "v1" scope.
- **`PROGRESS.md`** — the detailed, round-by-round engineering history: every
  PR, what changed and why, in the order it happened. The best place to
  answer "why does X work this way?" The "Current status" section there is
  being kept as the authoritative technical snapshot for anyone (or any AI
  session) picking up the codebase; this document is the higher-level
  business-and-product briefing that sits alongside it.
