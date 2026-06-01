// ============================================================
// HSI Marketplace — verify-billplz-bill
// Fallback used by payment-callback.html after the browser
// returns from Billplz. Re-queries the Billplz API directly
// (the redirect query params are NOT trusted) and, if paid,
// settles the order. Idempotent with the webhook.
//
// Deploy:  supabase functions deploy verify-billplz-bill --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const API_KEY = Deno.env.get('BILLPLZ_API_KEY') ?? ''
    const SANDBOX = (Deno.env.get('BILLPLZ_SANDBOX') ?? 'false') === 'true'
    const baseUrl = SANDBOX ? 'https://www.billplz-sandbox.com/api/v3' : 'https://www.billplz.com/api/v3'

    const { bill_id } = await req.json()
    if (!bill_id) return json({ paid: false, error: 'missing bill_id' }, 400)

    const res = await fetch(`${baseUrl}/bills/${bill_id}`, {
      headers: { 'Authorization': 'Basic ' + btoa(API_KEY + ':') },
    })
    const bill = await res.json()
    if (!res.ok) return json({ paid: false, error: 'billplz lookup failed' }, 502)

    const orderId = bill.reference_1
    if (!bill.paid) return json({ paid: false, order_id: orderId })

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    await markOrderPaid(sb, orderId, bill.id)
    return json({ paid: true, order_id: orderId })
  } catch (e) {
    return json({ paid: false, error: String(e?.message || e) }, 500)
  }
})

async function markOrderPaid(sb: any, orderId: string, billId: string) {
  const { data: o } = await sb.from('mkt_orders').select('*').eq('id', orderId).single()
  if (!o) return
  if (o.amount_paid && Number(o.amount_paid) >= Number(o.total_amount || 0) && o.total_amount > 0) return

  await sb.from('mkt_orders').update({
    status: ['pending', 'payment_uploaded'].includes(o.status) ? 'payment_verified' : o.status,
    amount_paid: o.total_amount,
    amount_paid_at: new Date().toISOString(),
    billplz_bill_id: billId,
    updated_at: new Date().toISOString(),
  }).eq('id', orderId)

  await sb.from('mkt_payments').insert({
    order_id: orderId, buyer_id: o.buyer_id,
    method: 'Billplz (FPX/Card)', amount: o.total_amount,
    reference: billId, status: 'verified',
  })

  try { await sb.rpc('mkt_award_order_points', { p_order_id: orderId }) } catch (_) {}

  try {
    if (!o.email_sent_at) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ order_id: orderId }),
      })
    }
  } catch (_) {}
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
