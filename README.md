# HSI Marketplace

A multi-seller marketplace for fresh **hydroponic produce**, connecting certified HSI
community farmers directly with buyers. Built as a static PWA (HTML + Tailwind +
Supabase), inspired by the MJM Nursery Sales Web concept, structure and logic — but
re-shaped around a **3-role marketplace** model.

## Roles & structure

| Role | Page | What they do |
|------|------|--------------|
| **Buyer / Customer** | `buyer/` | Browse, cart, checkout (coupons + points + online/offline payment), order history, ratings, loyalty rewards, billing addresses |
| **Seller / Farmer** | `seller/` | Manage their own products & pricing, fulfil orders, verify payments, view analytics |
| **Admin** | `admin/` | Manage **all sellers** (approve/suspend) + orders, payments, customers, coupons, promotions, announcements, and global settings |

Public-facing pages:

- `index.html` — landing + login/registration (buyer or seller)
- `marketplace/` — public storefront showing **every active seller's products**, with live promotion/sale pricing
- `payment-callback.html` — Billplz return/verification page
- `setup/` — one-time admin activation

> **The HSI difference vs. a single-store site:** sellers post products from their own
> portal, those products flow straight onto the shared sales web (`marketplace/`), and a
> main admin oversees all sellers.

## Ported MJM features (full port)

- **Loyalty points** — program-wide HSI points, earned on paid orders, redeemable at checkout (`points_ledger`, `customer_points_balance` view, configurable `points_config`)
- **Member tiers** — Sprout → Grower → Harvester → Master Farmer (configurable in admin)
- **Coupons** — percentage/fixed, min order, usage & per-customer limits, first-order-only, expiry (`coupons`, `preview_coupon`/`redeem_coupon` RPCs)
- **Promotions** — auto-apply sale pricing by category/product, shown on the storefront (`promotions`, `promotions_for_cart` RPC)
- **Billplz online payment** — FPX/card via edge functions, with offline bank-transfer + proof upload as the alternative
- **Customer portal** — rewards, points history, billing-address CRUD, order ratings, change password
- **Order lifecycle** — human order numbers, `amount_paid` tracking, auto-release of abandoned unpaid orders, payment-confirmation email

## Setup

### 1. Database
In the Supabase SQL Editor, run **in order**:
1. `supabase/full_setup.sql` — base marketplace (profiles, products, cart, orders, payments, announcements, RLS, storage buckets)
2. `supabase/hsi_marketplace_v2.sql` — loyalty, coupons, promotions, billing, settings, RPCs, RLS

### 2. App config
`SUPABASE_URL` / `SUPABASE_ANON_KEY` are already set in every HTML file. To use a
different Supabase project, replace them, then set **Authentication → URL Configuration**
(Site URL + redirect URLs) to your hosting URL.

### 3. Create the admin
Sign up, then visit `setup/` while logged in with the admin email (configured in
`setup/index.html` and `index.html` as `ADMIN_EMAIL`) and click **Activate Admin Access**.

### 4. Online payments — point Billplz at **your own account**
Online payment is **off by default**. To enable it:

1. **Deploy the edge functions:**
   ```bash
   supabase functions deploy create-billplz-bill  --no-verify-jwt
   supabase functions deploy billplz-webhook       --no-verify-jwt
   supabase functions deploy verify-billplz-bill    --no-verify-jwt
   supabase functions deploy send-order-email       --no-verify-jwt
   ```
2. **Set your Billplz secrets** (from *your* Billplz dashboard):
   ```bash
   supabase secrets set BILLPLZ_API_KEY=your_api_key
   supabase secrets set BILLPLZ_COLLECTION_ID=your_collection_id
   supabase secrets set BILLPLZ_X_SIGNATURE_KEY=your_x_signature_key
   supabase secrets set BILLPLZ_SANDBOX=false        # "true" while testing
   supabase secrets set RESEND_API_KEY=re_xxx        # optional, for emails
   ```
3. In the Billplz dashboard, set the collection **callback/webhook URL** to:
   `https://<your-project>.supabase.co/functions/v1/billplz-webhook`
4. In **Admin → Settings → Payment Methods**, tick **Online (Billplz)** and save.

No code changes are needed to switch Billplz accounts — it's all secrets.

## Notes
- Currency is **RM (Malaysian Ringgit)** throughout; UI is bilingual (English / Bahasa Malaysia) via `translations.js`.
- This is a static site (works on GitHub Pages). The PWA service worker is `sw.js`.
- The `.github/workflows/keep-alive.yml` workflow pings Supabase to avoid free-tier pausing.
