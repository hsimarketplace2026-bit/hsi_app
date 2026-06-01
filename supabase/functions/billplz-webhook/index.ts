// ============================================================
// HSI Marketplace — billplz-webhook
// Server-to-server payment confirmation from Billplz.
// Verifies the X-Signature, then marks the order paid, awards
// loyalty points, and fires the confirmation email.
//
// Secret required:
//   supabase secrets set BILLPLZ_X_SIGNATURE_KEY=xxxx
// Deploy:  supabase functions deploy billplz-webhook --no-verify-jwt
// In the Billplz dashboard, set the Collection callback/webhook to:
//   https://<project>.supabase.co/functions/v1/billplz-webhook
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const X_KEY = Deno.env.get('BILLPLZ_X_SIGNATURE_KEY') ?? ''
    const form = await req.formData()

    if (X_KEY) {
      const ok = await verifySignature(form, X_KEY)
      if (!ok) return new Response('invalid signature', { status: 401 })
    }

    const paid = String(form.get('paid')) === 'true'
    const orderId = String(form.get('reference_1') || '')
    const billId = String(form.get('id') || '')
    if (!orderId) return new Response('no reference', { status: 200 })

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (paid) {
      await markOrderPaid(sb, orderId, billId)
    }
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('webhook error', e)
    return new Response('ok', { status: 200 })   // always 200 so Billplz stops retrying
  }
})

// Shared: flip order to paid, award points, send email (idempotent)
export async function markOrderPaid(sb: any, orderId: string, billId: string) {
  const { data: o } = await sb.from('orders').select('*').eq('id', orderId).single()
  if (!o) return
  // idempotency — already settled
  if (o.amount_paid && Number(o.amount_paid) >= Number(o.total_amount || 0) && o.total_amount > 0) {
    return
  }

  await sb.from('orders').update({
    status: ['pending', 'payment_uploaded'].includes(o.status) ? 'payment_verified' : o.status,
    amount_paid: o.total_amount,
    amount_paid_at: new Date().toISOString(),
    billplz_bill_id: billId,
    updated_at: new Date().toISOString(),
  }).eq('id', orderId)

  // record a payment row (online channel)
  await sb.from('payments').insert({
    order_id: orderId,
    buyer_id: o.buyer_id,
    method: 'Billplz (FPX/Card)',
    amount: o.total_amount,
    reference: billId,
    status: 'verified',
  })

  // award loyalty points (RPC is idempotent)
  try { await sb.rpc('award_order_points', { p_order_id: orderId }) } catch (_) {}

  // fire confirmation email (fire-and-forget)
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

async function verifySignature(form: FormData, key: string): Promise<boolean> {
  const sig = String(form.get('x_signature') || '')
  if (!sig) return false
  const entries: [string, string][] = []
  for (const [k, v] of form.entries()) {
    if (k === 'x_signature') continue
    entries.push([k, typeof v === 'string' ? v : ''])
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const base = entries.map(([k, v]) => `${k}${v}`).join('|')
  const enc = new TextEncoder()
  const ck = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', ck, enc.encode(base))
  const expected = Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}
