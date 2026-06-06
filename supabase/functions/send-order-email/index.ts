// ============================================================
// HSI Marketplace — send-order-email (multi-purpose transactional email)
// Handles:
//   - order_confirmation : payment confirmed, sent to buyer + admins
//   - new_order_seller   : new order placed, sent to seller
//   - order_status       : order status changed, sent to buyer
//   - seller_status      : seller application approved/rejected, sent to seller
//
// Required secret:
//   supabase secrets set RESEND_API_KEY=re_xxxx
//
// Deploy:
//   supabase functions deploy send-order-email --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
    const body = await req.json()
    const type: string = body.type || 'order_confirmation'

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // shared config
    let fromEmail = 'orders@hsimarketplace.com',
        fromName  = 'HSI Marketplace',
        adminEmails: string[] = []
    const { data: cfgRow } = await sb.from('shared_app_settings')
      .select('value').eq('key', 'notification_config').maybeSingle()
    if (cfgRow?.value) {
      const c = cfgRow.value
      if (c.from_email)  fromEmail = c.from_email
      if (c.from_name)   fromName  = c.from_name
      if (Array.isArray(c.admin_emails)) adminEmails = c.admin_emails
    }

    let mail: { to: string|string[]; subject: string; html: string; cc?: string[] } | null = null

    if (type === 'order_confirmation') {
      mail = await buildOrderConfirmation(sb, body.order_id, adminEmails)
    } else if (type === 'new_order_seller') {
      mail = await buildNewOrderSeller(sb, body.order_id)
    } else if (type === 'order_status') {
      mail = await buildOrderStatus(sb, body.order_id)
    } else if (type === 'seller_status') {
      mail = await buildSellerStatus(sb, body.seller_id, body.status)
    } else {
      return resp({ ok: false, error: `unknown type: ${type}` }, 400)
    }

    if (!mail || !mail.to || (Array.isArray(mail.to) && !mail.to.length)) {
      return resp({ ok: true, skipped: 'no recipient' })
    }

    if (RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to:   mail.to,
          cc:   mail.cc?.length ? mail.cc : undefined,
          subject: mail.subject,
          html:    mail.html,
        }),
      })
      if (!r.ok) return resp({ ok: false, error: 'resend failed', detail: await r.text() }, 200)
    }

    return resp({ ok: true, type })
  } catch (e) {
    return resp({ ok: false, error: String((e as any)?.message || e) }, 200)
  }
})

// -------------------- builders --------------------

async function buildOrderConfirmation(sb: any, order_id: string, adminEmails: string[]) {
  if (!order_id) throw new Error('missing order_id')
  const { data: o } = await sb.from('mkt_orders')
    .select('*, order_items:mkt_order_items(product_name, quantity, unit_price), profiles:shared_profiles!buyer_id(full_name, email)')
    .eq('id', order_id).single()
  if (!o) throw new Error('order not found')
  if (o.email_sent_at) return { to: '', subject: '', html: '' }   // idempotent
  const email = o.profiles?.email
  if (!email) return { to: '', subject: '', html: '' }

  const items = (o.order_items || []).map((i: any) =>
    `<tr><td style="padding:6px 0">${esc(i.product_name || 'Item')} &times; ${i.quantity}</td>
     <td style="padding:6px 0;text-align:right">RM ${(i.quantity * i.unit_price).toFixed(2)}</td></tr>`).join('')

  const html = wrapShell('Payment Confirmed', `
    <p>Hi ${esc(o.profiles?.full_name || 'there')}, thank you for your order!</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${items}</table>
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:12px 0"/>
    <p style="text-align:right;font-weight:700;font-size:16px;color:#11537f">Total Paid: RM ${Number(o.total_amount).toFixed(2)}</p>
    <p style="color:#6b7280;font-size:13px">Your order is now being prepared by the farmer. You'll be notified when it's ready.</p>
  `)

  await sb.from('mkt_orders').update({ email_sent_at: new Date().toISOString() }).eq('id', order_id)
  return {
    to: email,
    cc: adminEmails,
    subject: `Payment confirmed — Order ${o.order_number || ''}`,
    html,
  }
}

async function buildNewOrderSeller(sb: any, order_id: string) {
  if (!order_id) throw new Error('missing order_id')
  const { data: o } = await sb.from('mkt_orders')
    .select('*, order_items:mkt_order_items(product_name, quantity, unit_price), buyer:shared_profiles!buyer_id(full_name, email, phone), seller:shared_profiles!seller_id(full_name, email, farm_name)')
    .eq('id', order_id).single()
  if (!o) throw new Error('order not found')
  const email = o.seller?.email
  if (!email) return { to: '', subject: '', html: '' }

  const items = (o.order_items || []).map((i: any) =>
    `<tr><td style="padding:6px 0">${esc(i.product_name || 'Item')} &times; ${i.quantity}</td>
     <td style="padding:6px 0;text-align:right">RM ${(i.quantity * i.unit_price).toFixed(2)}</td></tr>`).join('')

  const html = wrapShell('New Order Received', `
    <p>Hi ${esc(o.seller?.full_name || 'there')}, you have a new order!</p>
    <p><strong>Buyer:</strong> ${esc(o.buyer?.full_name || 'Buyer')}${o.buyer?.phone ? ` (${esc(o.buyer.phone)})` : ''}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${items}</table>
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:12px 0"/>
    <p style="text-align:right;font-weight:700;font-size:16px;color:#11537f">Order Total: RM ${Number(o.total_amount).toFixed(2)}</p>
    <p style="color:#6b7280;font-size:13px">Log in to your seller dashboard to confirm payment and arrange delivery.</p>
  `)

  return {
    to: email,
    subject: `New order ${o.order_number || ''} — ${o.buyer?.full_name || 'Buyer'}`,
    html,
  }
}

async function buildOrderStatus(sb: any, order_id: string) {
  if (!order_id) throw new Error('missing order_id')
  const { data: o } = await sb.from('mkt_orders')
    .select('*, profiles:shared_profiles!buyer_id(full_name, email), seller:shared_profiles!seller_id(full_name, farm_name)')
    .eq('id', order_id).single()
  if (!o) throw new Error('order not found')
  const email = o.profiles?.email
  if (!email) return { to: '', subject: '', html: '' }

  const statusLabel: Record<string,string> = {
    pending: 'awaiting payment',
    payment_uploaded: 'payment received',
    payment_verified: 'payment confirmed',
    processing: 'out for delivery',
    completed: 'delivered',
    cancelled: 'cancelled',
  }
  const label = statusLabel[o.status] || o.status

  const html = wrapShell(`Order ${label}`, `
    <p>Hi ${esc(o.profiles?.full_name || 'there')},</p>
    <p>Your order <strong>${esc(o.order_number || '')}</strong> from
       <strong>${esc(o.seller?.farm_name || o.seller?.full_name || 'the farmer')}</strong>
       is now <strong>${esc(label)}</strong>.</p>
    <p style="color:#6b7280;font-size:13px">Total: RM ${Number(o.total_amount).toFixed(2)}</p>
  `)

  return {
    to: email,
    subject: `Order ${o.order_number || ''} — ${label}`,
    html,
  }
}

async function buildSellerStatus(sb: any, seller_id: string, status: string) {
  if (!seller_id || !status) throw new Error('missing seller_id or status')
  const { data: s } = await sb.from('shared_profiles')
    .select('full_name, email, farm_name')
    .eq('id', seller_id).single()
  if (!s?.email) return { to: '', subject: '', html: '' }

  let title = '', body = ''
  if (status === 'active') {
    title = 'Seller account approved'
    body = `
      <p>Hi ${esc(s.full_name || 'there')},</p>
      <p>Good news — your seller account on HSI Marketplace has been <strong>approved</strong>. You can now log in and start listing your products.</p>
      <p style="color:#6b7280;font-size:13px">Tip: complete your farm profile and payment details first so buyers know who they're buying from.</p>
    `
  } else if (status === 'suspended') {
    title = 'Seller account suspended'
    body = `
      <p>Hi ${esc(s.full_name || 'there')},</p>
      <p>Your seller account on HSI Marketplace has been <strong>suspended</strong>. You will not be able to list new products until the suspension is lifted.</p>
      <p style="color:#6b7280;font-size:13px">If you believe this is a mistake, please contact the HSI Marketplace team.</p>
    `
  } else if (status === 'pending') {
    title = 'Seller account under review'
    body = `
      <p>Hi ${esc(s.full_name || 'there')},</p>
      <p>Your seller account on HSI Marketplace is now <strong>pending review</strong>. We'll email you once a decision is made.</p>
    `
  } else {
    return { to: '', subject: '', html: '' }
  }

  return {
    to: s.email,
    subject: `${title} — HSI Marketplace`,
    html: wrapShell(title, body),
  }
}

// -------------------- helpers --------------------

function wrapShell(heading: string, inner: string) {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
    <div style="background:#11537f;color:#fff;padding:24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">${esc(heading)}</h1>
      <p style="margin:4px 0 0;color:#cfe3f1">HSI Marketplace</p>
    </div>
    <div style="border:1px solid #e8f3fb;border-top:0;padding:24px;border-radius:0 0 12px 12px;background:#fff">
      ${inner}
    </div>
  </div>`
}

function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
}

function resp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
