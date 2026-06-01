# Order lifecycle

This is the single most important flow in the app. An order moves through four states,
shared by both the buyer and seller views as four tabs. The database `mkt_orders.status`
column is the **single source of truth** for which tab an order appears in — both portals
filter strictly by it, so the two sides always agree.

## States

| `mkt_orders.status` | Tab (both sides) | Buyer label | Seller label |
|---------------------|------------------|-------------|--------------|
| `pending`           | 💰 To Pay        | PENDING PAYMENT SLIP | TO PAY |
| `payment_uploaded`  | 💳 Paid          | PAYMENT SLIP UPLOADED · PENDING VERIFICATION | PAID |
| `processing`        | 🚚 In Delivery   | ORDER SUCCESSFULLY | IN DELIVERY |
| `completed`         | ✅ Completed     | ORDER COMPLETED | COMPLETED |
| `cancelled`         | (hidden)         | CANCELLED | CANCELLED |

Each tab shows a count badge of how many orders sit in that state (the Completed tab has
no badge on either side).

## Happy path

```
Buyer places order
      │  status = pending
      ▼
  💰 To Pay ──────────────────────────────────────────────┐
      │  buyer uploads payment slip (submitPayment)        │
      │  inserts mkt_payments row, status = payment_uploaded│
      ▼                                                    │
  💳 Paid                                                  │ buyer may
      │  seller reviews slip (handlePaymentAction)         │ Cancel Order
      │  ├─ Verified  → status = processing                │ while in
      │  └─ Rejected  → status = pending (back to To Pay) ─┘ To Pay
      ▼
  🚚 In Delivery
      │  seller clicks "Delivery Completed" → confirm
      │  mkt_complete_order RPC:
      │    • decrements product stock by ordered qty
      │    • status = completed   (atomic, idempotent)
      ▼
  ✅ Completed
      │  buyer may rate the order (1–5 ★ + comment)
      ▼
   rating recorded; seller's average rating recomputed
```

## Payment verification (seller, Paid tab)

The seller sees the uploaded slip image and a Verified / Rejected dropdown
(`handlePaymentAction`).

- **Verified** (`verifyPayment`): marks the payment `verified`, sets the order to
  `processing`, records `amount_paid`, and awards loyalty points
  (`mkt_award_order_points`). The order moves to **In Delivery**.
- **Rejected** (`rejectPayment`): marks the payment `rejected` and sets the order back
  to `pending`. The order falls back to **To Pay**.

## Rejection → buyer side

When the latest payment for a pending order is `rejected`, the buyer's To Pay card shows
a red **"Verification unsuccessful — upload your payment slip again"** banner, an
**Upload Slip Again** button, and a **Cancel Order** button. Re-uploading inserts a fresh
`pending` payment and moves the order back to **Paid**.

> Tab placement always follows the DB `status`. The buyer page deliberately does **not**
> second-guess it from the payment rows — that earlier "normalization" caused rejected
> orders to appear under Paid and was removed so both portals stay consistent.

## Cancellation

Any order in **To Pay** (`pending`) — including a rejected one — can be cancelled by the
buyer (`cancelOrder`), which sets `status = cancelled`. Cancelled orders drop out of the
four active tabs. Order placement does **not** reserve stock, so cancelling needs no
inventory restore.

## Inventory (on completion only)

Stock is decremented exactly once, when the seller completes delivery, via the
`mkt_complete_order` RPC. It is atomic (status change + stock decrement in one
transaction), idempotent (a re-run on an already-completed order does nothing, so stock
can't double-deduct), floors quantity at 0, and is restricted to the order's own seller.
Example: lettuce 100 available, deliver 10 → 90 available. Products that hit 0 disappear
from the storefront (the marketplace query filters `quantity > 0`).

## Ratings

After completion the buyer rates the order (`submitRating`, writes `mkt_orders.rating` +
`rating_comment`). A database trigger recomputes the seller's aggregate
(`shared_profiles.rating_avg` / `rating_count`) — see [DATABASE.md](./DATABASE.md). The
storefront shows the average as a proportional star fill on the *About the Farmer* card;
clicking it opens the list of individual buyer reviews via the `mkt_seller_reviews` RPC.
