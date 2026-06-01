// ============================================================
// HSI Marketplace — create-billplz-bill
// Creates a Billplz bill for an order and returns the payment URL.
//
// Point this at YOUR Billplz account by setting these secrets:
//   supabase secrets set BILLPLZ_API_KEY=xxxx
//   supabase secrets set BILLPLZ_COLLECTION_ID=xxxx
//   supabase secrets set BILLPLZ_SANDBOX=false   # "true" for sandbox
// Deploy:  supabase functions deploy create-billplz-bill --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const API_KEY = Deno.env.get('BILLPLZ_API_KEY') ?? ''
    const COLLECTION_ID = Deno.env.get('BILLPLZ_COLLECTION_ID') ?? ''
    const SANDBOX = (Deno.env.get('BILLPLZ_SANDBOX') ?? 'false') === 'true'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

    if (!API_KEY || !COLLECTION_ID) {
      return json({ error: 'Billplz is not configured. Set BILLPLZ_API_KEY and BILLPLZ_COLLECTION_ID.' }, 500)
    }

    const baseUrl = SANDBOX
      ? 'https://www.billplz-sandbox.com/api/v3'
      : 'https://www.billplz.com/api/v3'

    const { order_id, amount, email, name, phone, description, redirect_url } = await req.json()
    if (!order_id || !amount || !email) {
      return json({ error: 'Missing order_id, amount or email' }, 400)
    }

    // Billplz webhook (server-to-server confirmation)
    const webhookUrl = `${SUPABASE_URL}/functions/v1/billplz-webhook`

    const body = new URLSearchParams()
    body.append('collection_id', COLLECTION_ID)
    body.append('email', email)
    if (phone) {
      let p = String(phone).replace(/[\s\-()]/g, '')
      if (p.startsWith('+')) p = p.substring(1)
      if (/^60\d{8,11}$/.test(p)) body.append('mobile', p)
    }
    body.append('name', name || 'HSI Customer')
    body.append('amount', String(Math.round(Number(amount))))   // amount in cents
    body.append('description', (description || `HSI Order ${String(order_id).substring(0, 8)}`).substring(0, 200))
    body.append('callback_url', webhookUrl)
    if (redirect_url) body.append('redirect_url', redirect_url)
    body.append('reference_1_label', 'Order ID')
    body.append('reference_1', order_id)

    const res = await fetch(`${baseUrl}/bills`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + btoa(API_KEY + ':') },
      body,
    })
    const bill = await res.json()
    if (!res.ok) {
      return json({ error: 'Billplz error', detail: bill }, 502)
    }

    return json({ url: bill.url, bill_id: bill.id })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
