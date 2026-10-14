# Taxonomy Builder — Master Briefing

*Version: v 1.01*

*A one-stop orientation document: what this is, what it does today, where the
business stands, and what's still outstanding. Written for James (or anyone
he shares this with) rather than as an engineering log — for the detailed,
round-by-round build history, see `PROGRESS.md`; for the original functional
specification, see `CLAUDE.md`.*

*Last updated: 2026-10-14, after PR #219, and a correction pass against
James's own full conversation record (see note below).*

*Version history: v 1.01 — first version stamp applied to this file
(2026-10-14), at James's request. Increment this by one, and add a line
here, every time this file is next updated and re-sent to him — see
`ONBOARDING_FOR_NEW_CLAUDE_INSTANCE.md` §5, item 10.*

---

## 0. Where things stand right now — read this first

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

**Engineering is fully caught up as of PR #214 (2026-10-14)** — every item
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
  table (`supabase/0001_create_profiles.sql`) purpose-built so James can
  pull a clean contact list — email, full_name, company_name,
  mobile_number, created_at — straight out of Supabase's Table Editor as a
  CSV (Table Editor → `profiles` → export), ready for Excel or a mail-merge
  tool. The app itself has no access to that table at all (Row Level
  Security with zero policies — reachable only from inside the Supabase
  dashboard, which bypasses RLS as the project owner).
- **Email delivery runs through Resend**, not Supabase's own default
  mailer (see §4 for the full setup record) — this is what makes
  confirmation/password-reset emails arrive reliably at any real inbox
  rather than hitting Supabase's test-only rate limit.
- **Supervisor role** (James's own account, `jamesar@jar-and-a.com`
  specifically, hardcoded — see `src/supervisor.ts`): two capabilities
  restricted to this one account — marking/unmarking a Library entry as a
  starter sample (open to any subscriber until 2026-10-14; a database
  trigger now enforces this server-side, not just a hidden button), and an
  in-app Help editor (edit any tooltip/help-page field directly, in place
  of downloading `help-text.csv` and editing it in Excel). Built as
  reusable infrastructure — no paywall exists yet to bypass (see §4), but
  his account will be automatically exempt the moment one is.

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
  marked as a draft under review; there is no working checkout yet.
- The same draft pricing has also been prepared as a **standalone WordPress
  snippet** (delivered to James as a file, not part of this repository) for
  the-erp-doctor.com marketing site — see §0 for its exact delivery status.

---

## 3. Architecture, in brief

- **Frontend**: React + TypeScript, built with Vite, hosted as a static
  single-page app on GitHub Pages. No server of its own.
- **Backend**: Supabase — Postgres (with Row Level Security) for accounts,
  Library storage, and starter samples; Supabase Auth for sign-in/sign-up;
  Resend as the custom SMTP provider for auth emails (see §4). Seven
  one-time SQL migrations have been run (`supabase/0001`–`0007`), each a
  one-off manual step in Supabase's SQL Editor: `0001` creates the
  `profiles` table (James's own exportable contact list — see "Account &
  sign-up" in §2); `0002` creates `library_entries` (cloud Library
  storage); `0003` adds the starter-sample flag and its cross-account read
  policy; `0004` adds `source_sample_id` (for "Check for New Samples");
  `0005` restricts starter-sample flagging to James's supervisor account
  at the database level; `0006` was the one-time cleanup of the duplicate
  Library entries found 2026-10-14 (see §0); `0007` adds a unique
  constraint on `(user_id, source_sample_id)` so no account can ever again
  hold two copies of the same starter sample, closing that bug at the
  database level rather than relying on application timing.
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

### Pricing — draft proposal, not final
Building on James's own Free-tier sketch, the current in-app draft is:

| | Free | Professional | Enterprise |
|---|---|---|---|
| Price | $0 | $19/mo | $79/mo |
| Code columns | 3 | 8 (standard depth) | 15 (app maximum) |
| Rows | 50 | 500 | Unlimited |
| Taxonomies in Library | 5 | 25 | Unlimited |
| Library | Read-only once saved | Full read/write | Full read/write |
| Lock Taxonomy | No | Yes | Yes |
| CSV/Excel export | Yes | Yes | Yes |
| HDD Folders | No | Yes | Yes |
| GL Builder / Cubic Business Model | No | No | Yes |
| Support | — | — | Priority |

**This needs James's sign-off or adjustment** — the numbers and prices above
are a recommendation, not a decision. Once confirmed, the actual tier limits
still need to be wired into the app itself (a `plan` field, enforcement
logic) — deliberately not done yet, since that's a business-critical change
better made once the numbers are final and the app has active users who
shouldn't be surprised by new restrictions overnight.

**Subscription/renewal mechanics James has specified** (not yet built —
captured here so it isn't lost before the Stripe wiring happens): billing
renews monthly, quarterly, or annually, with a discounted rate for the
longer periods. On expiry, login is hard-blocked (no grace-period access)
with a clear "your subscription has expired — renew here" screen in place
of the app. Staged reminder emails before that point: one month out, one
week out, one day out, then an expired notice, then a follow-up nudge if
still unrenewed — each one sent through the same Resend infrastructure as
the auth emails (see below).

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

**Status:** James asked for this walkthrough "one step at a time." Step 1
(create the account at `dashboard.stripe.com/register`, verify email, no
banking details needed yet — test mode is available immediately) was given
on 2026-09-28. Not yet confirmed done. See §0 for exactly where to pick this
up.

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
paywall logic lives entirely in this app plus Supabase plus Stripe. If
James wants an actual Pricing page live on the marketing site itself
(rather than just linking to the one already in this app), the content is
ready to hand over. If direct edits to the WordPress site are ever needed,
the safe way to grant access is a WordPress **Application Password**
(Users → Profile → Application Passwords in `wp-admin`) scoped just for
that purpose — not the real admin login.

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
- [ ] Confirm or adjust the three pricing tiers and their dollar amounts.
- [ ] **In progress, step 1 given:** create a new Stripe account (see §4 —
      being walked through one step at a time, at James's request).
- [ ] Decide whether/when to proceed with the Outlook 365 Microsoft Graph
      app registration (no blocker either way — see §4).
- [ ] **Delivered, not yet actioned:** the WordPress pricing snippet is with
      James as a file. He still needs to (a) fill in the
      `REPLACE_WITH_CONTACT` placeholder and (b) actually paste it into
      the-erp-doctor.com — the WordPress-side walkthrough for that hasn't
      been given yet, pending his request.
- [ ] Once pricing is confirmed: sign off on wiring real tier limits into the
      app (a bigger, business-facing change, deliberately held until the
      numbers are final).

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
