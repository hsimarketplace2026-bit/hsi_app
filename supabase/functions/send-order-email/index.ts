// ============================================================
// HSI Marketplace — send-order-email
// Sends an order/payment confirmation email via Resend.
// Idempotent: bails if orders.email_sent_at is already set.
//
// Secret required:
//   supabase secrets set RESEND_API_KEY=re_xxxx
// From/admin addresses come from app_settings.notification_config.
// Deploy:  supabase functions deploy send-order-email --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
    const { order_id } = await req.json()
    if (!order_id) return resp({ ok: false, error: 'missing order_id' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: o } = await sb.from('mkt_orders')
      .select('*, order_items:mkt_order_items(product_name, quantity, unit_price), profiles:shared_profiles!buyer_id(full_name, email)')
      .eq('id', order_id).single()
    if (!o) return resp({ ok: false, error: 'order not found' }, 404)
    if (o.email_sent_at) return resp({ ok: true, skipped: 'already sent' })

    const email = o.profiles?.email
    if (!email) return resp({ ok: false, error: 'no customer email' }, 200)

    // config
    let fromEmail = 'orders@hsimarketplace.com', fromName = 'HSI Marketplace', adminEmails: string[] = []
    const { data: cfgRow } = await sb.from('shared_app_settings').select('value').eq('key', 'notification_config').maybeSingle()
    if (cfgRow?.value) {
      const c = cfgRow.value
      if (c.from_email) fromEmail = c.from_email
      if (c.from_name) fromName = c.from_name
      if (Array.isArray(c.admin_emails)) adminEmails = c.admin_emails
    }

    const items = (o.order_items || []).map((i: any) =>
      `<tr><td style="padding:6px 0">${i.product_name || 'Item'} × ${i.quantity}</td>
       <td style="padding:6px 0;text-align:right">RM ${(i.quantity * i.unit_price).toFixed(2)}</td></tr>`).join('')

    const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <div style="background:#14532d;color:#fff;padding:24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:20px">🌿 Payment Confirmed</h1>
        <p style="margin:4px 0 0;color:#bbf7d0">HSI Marketplace — Order ${o.order_number || ''}</p>
      </div>
      <div style="border:1px solid #dcfce7;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>Hi ${o.profiles?.full_name || 'there'}, thank you for your order!</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${items}</table>
        <hr style="border:0;border-top:1px solid #dcfce7;margin:12px 0"/>
        <p style="text-align:right;font-weight:700;font-size:16px;color:#14532d">Total Paid: RM ${Number(o.total_amount).toFixed(2)}</p>
        <p style="color:#6b7280;font-size:13px">Your order is now being prepared by the farmer. You'll be notified when it's ready.</p>
      </div>
    </div>`

    if (RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [email],
          cc: adminEmails.length ? adminEmails : undefined,
          subject: `Payment confirmed — Order ${o.order_number || ''}`,
          html,
        }),
      })
      if (!r.ok) return resp({ ok: false, error: 'resend failed', detail: await r.text() }, 200)
    }

    await sb.from('mkt_orders').update({ email_sent_at: new Date().toISOString() }).eq('id', order_id)
    return resp({ ok: true })
  } catch (e) {
    return resp({ ok: false, error: String(e?.message || e) }, 200)
  }
})

function resp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
