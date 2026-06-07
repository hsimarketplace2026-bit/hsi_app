# HSI Marketplace — Backup Notes & Manual Steps

**Backup created:** 2026-06-07
**Branch:** main (also pushed to claude/new-session-UNHqw)
**Commit:** 7638f268773480df5c23444053169220f7f7dd28
**Live URL:** https://hsimarketplace2026-bit.github.io/hsi_app/
**Repo:** https://github.com/hsimarketplace2026-bit/hsi_app

---

## 1. What's in the backup

The archive `hsi_app_backup_YYYYMMDD.tar.gz` contains the full working tree —
all HTML, JS, CSS, assets, docs, supabase SQL — **excluding** the `.git`
folder. To get a full git history backup, clone fresh from GitHub.

Top-level structure:
```
/                 ← root page (index.html, app.js, manifest, sw.js)
/about/           ← About page
/activities/      ← Activities page
/partners/        ← Partners page
/contact/         ← Contact page
/marketplace/     ← Public storefront (browse + cart)
/buyer/           ← Buyer dashboard (auth-gated)
/seller/          ← Seller dashboard (auth-gated)
/admin/           ← Admin panel (auth-gated)
/assets/          ← logos, og-image, gallery, sponsor logos
/docs/            ← ARCHITECTURE.md, DATABASE.md, ORDER-LIFECYCLE.md
/supabase/        ← setup_all.sql (run once on Supabase to bootstrap)
/setup/           ← initial admin seed page
/idle-logout.js   ← 15-min idle auto-logout (used by 7 pages)
/enhance.css      ← UX smoothness layer (transitions, focus rings, etc.)
/nav-auth.js      ← shared auth for About/Activities/Partners/Contact
/auth-modal.js    ← injects login/register panel on secondary pages
/translations.js  ← English + Bahasa Malaysia i18n strings
```

---

## 2. Required external services

The site won't function without these. Set them up first if rebuilding from
scratch:

### A) Supabase project
- **URL hard-coded in code:** `https://kdhcxmzwgiwyskfamvkb.supabase.co`
- **Anon key** is hard-coded across `app.js`, `buyer/app.js`, `seller/app.js`,
  `admin/app.js`, `marketplace/app.js`, `nav-auth.js`, `idle-logout.js`,
  `auth-modal.js`. If you migrate to a new Supabase project, search the
  codebase for `SUPABASE_URL` and `SUPABASE_ANON_KEY` and update **every**
  occurrence.
- **Database schema:** run `/supabase/setup_all.sql` in the SQL editor on a
  fresh Supabase project to create all tables, RLS policies, and RPCs.
- **Storage buckets** to create manually in the Supabase dashboard:
  - `payment-slips` (public read off; authenticated upload)
  - `product-images` (public read on)
  - `farm-photos` (public read on)
  - `farm-qr` (public read on)
- **Auth settings:** enable email/password. Disable email confirmation if you
  want instant signup, or keep it on for production.
- **Storage policies:** see `docs/DATABASE.md` for exact RLS recommendations.

### B) GitHub Pages
- Settings → Pages → Source: `main` branch, root folder (`/`)
- Custom domain: none (uses `*.github.io`)
- The OG image URL hard-coded in every `index.html` points to
  `https://hsimarketplace2026-bit.github.io/hsi_app/assets/og-image.png` —
  update if you change the repo or org name.

---

## 3. First-time setup (after rebuild from this backup)

1. Create the Supabase project (see §2A).
2. Run `/supabase/setup_all.sql` in the SQL editor.
3. Create the storage buckets and policies.
4. Search-and-replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` in all JS files
   if not using the original Supabase project.
5. Push the entire backup to a new GitHub repo (or restore over the existing
   one). Enable GitHub Pages on `main` / root.
6. Visit `/setup/index.html` once to seed the first admin user (read the
   form's instructions — it creates one admin row in `shared_profiles`).
7. Delete or password-protect `/setup/` after the admin is seeded (it's a
   one-time bootstrap page).

---

## 4. Recurring maintenance — release checklist

Every time you ship code that touches any JS, CSS, or HTML:

### 4.1. Bump the service worker cache
Edit `/sw.js`:
```js
const CACHE = 'hsi-marketplace-vNNN';  // increment this
```
Current version: **v116**

The SW is **network-first**, so users will eventually get the new version,
but bumping the cache name forces an immediate `controllerchange` and avoids
stale-asset bugs.

### 4.2. Bump cache-busters on shared JS/CSS
If you change one of these shared files, also bump the `?v=NNN` query string
on every `<script>` / `<link>` reference that loads it. Currently:
- `translations.js?v=111`  ← bump if you edit translations
- `buyer/app.js?v=66`      ← bump if you edit buyer JS
- `seller/app.js?v=66`     ← bump if you edit seller JS

Grep for the version you're replacing to find all references:
```bash
grep -rn "translations.js?v=" .
```

### 4.3. Push to BOTH branches
```bash
git push -u origin main
git push -u origin main:claude/new-session-UNHqw
```
The `claude/new-session-UNHqw` branch is the development branch.

### 4.4. Verify on live site
- Hard refresh: `Ctrl/Cmd + Shift + R`
- Confirm the new SW version registered (DevTools → Application → Service
  Workers).

---

## 5. Admin / Supabase tasks (no code change needed)

Things you do directly in the Supabase dashboard:

- **Approve a new seller**: SQL editor →
  `UPDATE shared_profiles SET status='active' WHERE email='...';`
  (or use the Admin Panel → Sellers & Products tab).
- **Promote a user to admin**: SQL editor →
  `UPDATE shared_profiles SET role='admin' WHERE email='...';`
- **Reset a forgotten password**: Authentication → Users → click user → Send
  password recovery email.
- **Soft-delete an order / refund**: handled inside the Admin Panel.
- **View raw rows**: Table Editor → pick table (mkt_orders, mkt_products,
  shared_profiles, etc.).

---

## 6. Key feature notes

### Auto-logout (15 min idle)
- **Public pages + admin + marketplace**: implemented by `/idle-logout.js`.
- **Buyer portal**: implemented inline inside `initBuyerApp()` in
  `buyer/app.js` (uses the page's own Supabase client to avoid race
  conditions).
- **Seller portal**: implemented inline inside `initSellerApp()` in
  `seller/app.js`.
- Timer resets on `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`,
  `click`. On timeout: `sb.auth.signOut()` then redirects to the root page.

### Cart auto-open from public pages
- Cart icon on About/Activities/Partners/Contact links to
  `../marketplace/?cart=open`.
- `marketplace/app.js` checks `URLSearchParams` after `initNav()` resolves
  and calls `toggleCart()` to auto-open the drawer.

### i18n (English / Bahasa Malaysia)
- All strings live in `/translations.js`.
- Toggle language: any "Bahasa / English" button calls `toggleLang()`, which
  saves the new lang to `localStorage` and reloads the page.
- New translatable strings: add a `data-i18n="namespace.key"` attribute to
  the element, then add the key under both `en` and `bm` in `translations.js`.
  **Bump the `?v=NNN` on translations.js** so users get the new keys.

### Profile editing (buyer + seller)
- Fields are **locked by default** when the profile loads.
- User must click the pencil icon to unlock editing.
- After save/cancel, fields re-lock automatically.
- Photo and QR uploads on the seller side use hidden `<input type="file">`
  triggered by styled `<label>` buttons (avoids native "No file chosen" text).

### Service worker
- File: `/sw.js`. Strategy: network-first with cache fallback.
- Precache list at the top of the file — add any new shared JS/CSS there.
- Currently at `hsi-marketplace-v116`.

---

## 7. Files most likely to need edits

- **Add/edit content on a public page:** the `<main>` section of the
  corresponding `index.html`.
- **Add/edit a translatable string:** `translations.js` + bump `?v=`.
- **Change brand colours:** the inline `tailwind.config` `<script>` block at
  the top of each HTML page (search for `brand: { blue:`). The palette is:
  - blue: #1b75bc
  - bluedark: #11537f
  - bluelight: #e8f3fb
  - green: #56b947
  - greendark: #3c8a30
  - greenlight: #eef8e8
  - yellow: #cfdb2e
- **Change auth UI:** `auth-modal.js` for secondary pages, root `app.js`
  for the landing page.
- **Change cart / checkout logic:** `marketplace/app.js` (cart drawer),
  `buyer/app.js` (checkout, orders).
- **Change order lifecycle:** see `docs/ORDER-LIFECYCLE.md` for the state
  machine. RPC functions are in `supabase/setup_all.sql`.

---

## 8. Known production gotchas

1. **Stale cache after release**: if a user reports "I see old text" or
   "raw translation keys", they're on a stale SW. The fix in §4.1 + §4.2
   handles this — bump both the SW version AND the `?v=` on shared files.
2. **Two Supabase clients on the same page race**: discovered when
   `idle-logout.js` was used on buyer/seller — the global client and the
   portal's client would conflict on token refresh. Always reuse the page's
   own `sb` if there is one.
3. **GitHub Pages caching**: GitHub serves static files with `Cache-Control:
   max-age=600` — after pushing, it can take up to ~10 minutes for an edit
   to propagate. The SW will catch up once it sees the new file.
4. **Mobile menu close on outside click**: in buyer/seller/marketplace the
   listener uses **capture phase** (`addEventListener('click', fn, true)`)
   because dashboard content calls `stopPropagation()` and would otherwise
   swallow the click.

---

## 9. Restore from backup

```bash
# 1. Extract the archive
tar -xzf hsi_app_backup_YYYYMMDD.tar.gz

# 2. cd into the extracted folder
cd hsi_app

# 3. Initialize git and add your remote
git init
git remote add origin https://github.com/YOUR_ORG/YOUR_REPO.git

# 4. Initial commit and push
git add .
git commit -m "Restore from backup YYYYMMDD"
git branch -M main
git push -u origin main

# 5. Re-do the Supabase setup if not using the original project
# (see §2A and §3)

# 6. Enable GitHub Pages in repo settings
```

---

## 10. Quick reference — service versions at backup time

| Item                  | Version |
|-----------------------|---------|
| Service Worker cache  | v116    |
| translations.js       | v111    |
| buyer/app.js          | v66     |
| seller/app.js         | v66     |
| Tailwind CSS          | CDN (latest) |
| Supabase JS SDK       | v2 (CDN, latest) |

---

_End of notes._
