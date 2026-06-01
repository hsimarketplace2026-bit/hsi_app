# Architecture

A static, multi-role Progressive Web App backed by Supabase. There is **no build
step and no server** — every page is plain HTML with Tailwind (CDN) and vanilla
JavaScript that talks directly to Supabase over the JS SDK. It is deployed as-is to
GitHub Pages.

## Tech stack

| Concern | Choice |
|---------|--------|
| UI | Hand-written HTML + [Tailwind CSS](https://tailwindcss.com) via CDN |
| Logic | Vanilla ES2017 JavaScript, inline in each page's `<script>` |
| Backend | [Supabase](https://supabase.com) — Postgres, Auth, Storage, RPC, RLS |
| Auth | Supabase email/password sessions |
| Offline / installable | PWA via `sw.js` + `manifest.json` |
| i18n | `translations.js` (English / Bahasa Malaysia) |
| Hosting | GitHub Pages (served from the repo root) |

## Folder map

```
/
├── index.html            Landing page + login / registration (buyer or seller)
├── marketplace/          Public storefront — every active seller's products
├── buyer/                Buyer portal — cart, checkout, orders, ratings, rewards
├── seller/               Seller dashboard — products, orders, analytics, profile
├── admin/                Admin console — sellers, orders, coupons, settings…
├── setup/                One-time admin activation page
├── sw.js                 Service worker (offline cache; bump CACHE to ship updates)
├── translations.js       Bilingual UI strings
├── manifest.json         PWA manifest
├── supabase/
│   ├── setup_all.sql     Single idempotent schema + RLS + RPC script
│   └── functions/        Supabase Edge Functions (Deno)
└── docs/                 You are here
```

Each role lives in its own folder with a single `index.html`. They share nothing at
runtime except the Supabase project and a few conventions (toast helper, the
`shared_profiles` identity table, the `mkt_*` data tables).

## Why everything is inline

The app uses the classic "global function + `onclick`" pattern — e.g.
`<button onclick="addToCart()">`. Functions are declared at the top level of each
page's `<script>` so the inline handlers can find them. This keeps the project
buildless and trivially hostable, at the cost of larger single files. When reading a
page, treat the `<script>` block as the page's controller and the markup as its view.

## Request / data flow

```
Browser (role page)
   │  supabase-js (anon key + user JWT)
   ▼
Supabase
   ├── Auth            → session / JWT
   ├── Postgres + RLS  → row-level access scoped to the logged-in user
   ├── RPC functions   → privileged/atomic operations (mkt_*)
   └── Storage         → product images, farmer photos, payment proofs
```

Security is enforced **in the database**, not the client. Row Level Security (RLS)
policies decide what each role can read/write; sensitive cross-row operations (awarding
points, completing an order + decrementing stock, recomputing a seller's rating) run
inside `SECURITY DEFINER` RPCs so they can act beyond the caller's own rows in a
controlled way. See [DATABASE.md](./DATABASE.md).

## Naming conventions

Tables are module-namespaced so future modules slot in cleanly:

- `shared_*` — cross-module identity/config (`shared_profiles`, `shared_app_settings`)
- `mkt_*` — the marketplace module (`mkt_products`, `mkt_orders`, …)
- RPCs are prefixed `mkt_*`; the shared auth helper is `is_admin`.

## Shipping updates

Because the service worker caches assets, **bump the `CACHE` version in `sw.js`**
(e.g. `hsi-marketplace-v23` → `v24`) whenever you change client files, so returning
users fetch the new version instead of a stale cache. HTML is served network-first, so
markup updates land immediately; other assets are cache-first until the version bumps.
