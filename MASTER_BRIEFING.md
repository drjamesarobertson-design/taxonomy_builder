# Taxonomy Builder — Master Briefing

*A one-stop orientation document: what this is, what it does today, where the
business stands, and what's still outstanding. Written for James (or anyone
he shares this with) rather than as an engineering log — for the detailed,
round-by-round build history, see `PROGRESS.md`; for the original functional
specification, see `CLAUDE.md`.*

*Last updated: 2026-09-28, after PR #188.*

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
  suggestions.
- **Audit Taxonomy**: a structured integrity walkthrough (missing codes,
  out-of-order codes, "Other" not last, oversized descriptions, outlier
  entries), runnable standalone or required before Lock Taxonomy / offered
  before CSV export.
- **Lock Taxonomy**: freezes a taxonomy once it's live in an ERP — protects
  existing rows from destructive edits while still allowing controlled,
  audited additions ("Lock updates").

### Import
Three CSV import shapes, each recognised automatically from the file's own
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
  existing subscribers pull in newly-published samples later.
- Import/export a Library bundle as a file (backup, migration, sharing a demo
  set).

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
  without touching GitHub directly.

### Commercial groundwork (not yet live)
- A **Pricing** page (reachable from the Login screen and the signed-in
  landing menu) presenting a draft three-tier model — see §4. Explicitly
  marked as a draft under review; there is no working checkout yet.

---

## 3. Architecture, in brief

- **Frontend**: React + TypeScript, built with Vite, hosted as a static
  single-page app on GitHub Pages. No server of its own.
- **Backend**: Supabase — Postgres (with Row Level Security) for accounts,
  Library storage, and starter samples; Supabase Auth for sign-in/sign-up.
  Four one-time SQL migrations have been run (`supabase/0001`–`0004`) to set
  this up; each was a one-off manual step in Supabase's SQL Editor.
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

### The website (the-erp-doctor.com) — admin access not needed for the above
None of the billing or Outlook work above touches the WordPress marketing
site — the paywall logic lives entirely in this app plus Supabase plus
Stripe. If James wants an actual Pricing page live on the marketing site
itself (rather than just linking to the one already in this app), the
content is ready to hand over. If direct edits to the WordPress site are
ever needed, the safe way to grant access is a WordPress **Application
Password** (Users → Profile → Application Passwords in `wp-admin`) scoped
just for that purpose — not the real admin login.

---

## 5. Open items awaiting James's input

- [ ] Confirm or adjust the three pricing tiers and their dollar amounts.
- [ ] Create a new Stripe account; share the publishable key here, store the
      secret key and webhook secret directly in Supabase (never in chat).
- [ ] Decide whether/when to proceed with the Outlook 365 Microsoft Graph
      app registration.
- [ ] Decide whether the Pricing page should also go live on the WordPress
      marketing site, and if so, provide a WordPress Application Password
      (not the main admin login) when ready.
- [ ] Once pricing is confirmed: sign off on wiring real tier limits into the
      app (a bigger, business-facing change, deliberately held until the
      numbers are final).

---

## 6. Where to look for more detail

- **`CLAUDE.md`** — the original functional specification (data model,
  facilitation workflow, conventions) plus a standing amendment noting the
  project has moved well past its original "v1" scope.
- **`PROGRESS.md`** — the detailed, round-by-round engineering history: every
  PR, what changed and why, in the order it happened. The best place to
  answer "why does X work this way?" The "Current status" section there is
  being kept as the authoritative technical snapshot for anyone (or any AI
  session) picking up the codebase; this document is the higher-level
  business-and-product briefing that sits alongside it.
