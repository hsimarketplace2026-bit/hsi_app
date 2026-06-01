# Database reference

Everything here is created by the single idempotent script
[`supabase/setup_all.sql`](../supabase/setup_all.sql). It is safe to re-run: it renames
older un-prefixed tables to the `shared_`/`mkt_` convention (keeping data), then creates
tables, RLS policies, functions and triggers with `create … if not exists` /
`create or replace` / drop-then-create patterns.

## Tables

### Identity / config (`shared_*`)

| Table | Purpose |
|-------|---------|
| `shared_profiles` | One row per user. `role` ∈ `buyer` / `seller` / `admin`, plus seller fields (farm name, photo, story, bank/QR payout details, `delivery_fee`) and the seller rating aggregate (`rating_avg`, `rating_count`). |
| `shared_app_settings` | Program-wide config (points, tiers, payment methods, announcements toggle…). |

### Marketplace (`mkt_*`)

| Table | Purpose |
|-------|---------|
| `mkt_products` | Seller's catalogue. `quantity` is live stock; the storefront only shows `status='active'` and `quantity > 0`. |
| `mkt_cart_items` | A buyer's working cart. |
| `mkt_orders` | One order per seller per checkout. `status` drives the four-tab lifecycle (see [ORDER-LIFECYCLE.md](./ORDER-LIFECYCLE.md)); also holds totals, `fulfillment_type` (pickup/delivery), `delivery_fee`, `delivery_address`, `rating`, `rating_comment`. |
| `mkt_order_items` | Line items; snapshots `product_name` and `unit_price`. |
| `mkt_payments` | Uploaded payment slips. `status` ∈ `pending` / `verified` / `rejected`; `proof_url` points at the public storage object. |
| `mkt_coupons`, `mkt_coupon_redemptions` | Discount codes + usage tracking. |
| `mkt_promotions` | Auto-apply sale pricing shown on the storefront. |
| `mkt_points_ledger` + `mkt_customer_points_balance` (view) | Loyalty points earned/redeemed. |
| `mkt_billing_info` | Buyer billing addresses. |
| `mkt_announcements` | Admin broadcast messages. |

## RLS — the security model

RLS is **on** for every table; the client only ever uses the anon key + the user's JWT,
so the database decides access. The recurring pattern:

- **Owner access** — a user sees/edits only their own rows
  (`auth.uid() = buyer_id` / `seller_id` / `id`).
- **Seller visibility** — sellers can see orders/payments/items where they are the seller.
- **Public reads** — active products, promotions, coupons, settings, and **seller
  profiles** are world-readable (the storefront runs as `anon`).
- **Admin override** — `is_admin(auth.uid())` grants full access.

Key policies worth knowing (they were the source of subtle bugs, now fixed):

| Table | Policy | Why it matters |
|-------|--------|----------------|
| `mkt_orders` | `Buyers update own orders` (UPDATE) | Lets the buyer move their order to `payment_uploaded` after uploading a slip. Without it the status silently never changed. |
| `mkt_orders` | `Sellers update own orders` (UPDATE) | Lets the seller verify/reject and complete. |
| `shared_profiles` | `Public/Authenticated view seller profiles` (SELECT) | Lets the storefront and logged-in buyers read seller name, photo, payout details and rating. |

## Functions (RPC) — all `SECURITY DEFINER`

These run with elevated rights so they can touch rows the caller doesn't own, in a
controlled, auditable way. The privileged ones re-check authorization internally.

| Function | What it does |
|----------|--------------|
| `mkt_next_order_number()` | Generates the next human-friendly order number (e.g. `HSI-28J6UH`). |
| `mkt_preview_coupon(...)` / `mkt_redeem_coupon(...)` | Validate and apply a coupon at checkout. |
| `mkt_promotions_for_cart(items jsonb)` | Returns the best auto-promotion per cart line. |
| `mkt_award_order_points(order_id)` | Credits loyalty points when a payment is verified. |
| **`mkt_complete_order(order_id)`** | Atomically completes an order **and decrements product stock** by the ordered quantities. Idempotent (no double-deduct), floors at 0, and only the order's own seller may call it. |
| **`mkt_recompute_seller_rating(seller_id)`** | Recomputes `rating_avg` / `rating_count` from that seller's rated orders. `SECURITY DEFINER` so a *buyer's* rating write can update the *seller's* profile row despite owner-only RLS. |
| `mkt_order_rating_trigger()` | Trigger fn calling the recompute on rating insert/update/delete. |
| **`mkt_seller_reviews(seller_id)`** | Returns the public review list (rating, comment, date, buyer **first name** only) so the anon storefront can show reviews without exposing the private `mkt_orders` table. |
| `mkt_release_abandoned_orders()` | Cron-style cleanup of stale unpaid orders. |

## Triggers

| Trigger | Table | Effect |
|---------|-------|--------|
| `trg_mkt_order_rating` | `mkt_orders` | After insert / update-of-`rating` / delete → `mkt_order_rating_trigger()` keeps each seller's rating aggregate in sync. |

## Storage buckets

| Bucket | Visibility | Holds |
|--------|-----------|-------|
| `mkt-product-images` | public | Product photos |
| `farmer-photos` | public | Seller profile photos / payout QR |
| `mkt-payment-proofs` | public | Buyer-uploaded payment slips (sellers must view them) |
