  /* ============================================================================
   * BUYER PORTAL — cart, checkout, orders, ratings, rewards, profile, billing
   * ----------------------------------------------------------------------------
   * Requires a logged-in buyer. Orders are shown in four tabs that mirror the
   * seller dashboard and are filtered strictly by mkt_orders.status:
   *   pending → To Pay · payment_uploaded → Paid · processing → In Delivery ·
   *   completed → Completed.
   * A rejected slip puts the order back to pending (To Pay) with re-upload /
   * cancel options. See docs/ORDER-LIFECYCLE.md.
   * ========================================================================== */
  const SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentUser = null;
  let APP = { points: { earn_rm:10, earn_pts:1, redeem_pts:100, redeem_rm:1, enabled:true }, tiers: [], payment: { online_enabled:false, offline_enabled:true } };
  let CART = [];
  let POINTS = { balance:0, lifetime_earned:0 };
  let appliedCoupon = null;
  let redeemPoints = 0;
  let sellerProfiles = {};   // seller_id → {full_name, farm_name, delivery_fee}
  let deliveryChoice = 'pickup'; // 'pickup' | 'delivery'

  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '../'; return; }
    const { data: profile } = await sb.from('shared_profiles').select('*').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'buyer') { window.location.href = '../'; return; }
    currentUser = { ...session.user, ...profile };
    currentUserName = (profile.full_name || session.user.email || '').trim();
    updateGreeting();
    updateLangChecks();
    await loadAppConfig();
    initBuyerApp();
  })();

  // ---------- STANDARDIZED USER MENU ----------
  let currentUserName = '';
  function updateGreeting() {
    const span = document.getElementById('nav-user-greeting');
    if (!span) return;
    const first = currentUserName.split(' ')[0] || currentUserName || '';
    let hi = (typeof t === 'function') ? t('nav.greeting') : '';
    if (!hi || hi === 'nav.greeting') hi = (typeof getLang === 'function' && getLang() === 'bm') ? 'Hai' : 'Hi';
    span.textContent = first ? `${hi}, ${first}` : hi;
  }
  function toggleUserMenu() { document.getElementById('user-dropdown').classList.toggle('hidden'); }
  function closeUserMenu() { document.getElementById('user-dropdown')?.classList.add('hidden'); }
  function chooseLang(lang) {
    if (typeof setLang === 'function') setLang(lang);
    updateGreeting();
    updateLangChecks();
    closeUserMenu();
  }
  function updateLangChecks() {
    const lang = (typeof getLang === 'function') ? getLang() : 'en';
    const en = document.getElementById('lang-check-en');
    const bm = document.getElementById('lang-check-bm');
    if (en) en.textContent = lang === 'en' ? '' : '';
    if (bm) bm.textContent = lang === 'bm' ? '' : '';
  }
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('nav-user-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) closeUserMenu();
  });

  async function loadAppConfig() {
    const { data } = await sb.from('shared_app_settings').select('key,value').in('key', ['points_config','member_tiers','payment_config']);
    (data || []).forEach(r => {
      if (r.key === 'points_config') APP.points = { ...APP.points, ...r.value };
      if (r.key === 'member_tiers') APP.tiers = r.value || [];
      if (r.key === 'payment_config') APP.payment = { ...APP.payment, ...r.value };
    });
  }

/* ----- next block ----- */

  function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-500' : 'bg-green-700'}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
  const rm = n => 'RM ' + (Number(n) || 0).toFixed(2);

  function switchTab(tab) {
    ['cart','orders','profile'].forEach(t => {
      document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
      const btn = document.getElementById(`tab-${t}`);
      if (!btn) return;
      btn.classList.toggle('active', t === tab);
      btn.classList.toggle('bg-white', t !== tab);
      btn.classList.toggle('text-brand-bluedark', t !== tab);
    });
    const profileOnly = tab === 'profile';
    document.getElementById('page-title')?.classList.toggle('hidden', profileOnly);
    document.getElementById('tabs-bar')?.classList.toggle('hidden', profileOnly);
    if (tab === 'cart') loadCart();
    if (tab === 'orders') loadOrders();
    if (tab === 'profile') { loadProfile(); loadBilling(); }
  }

  let orderView = 'pending';
  function setOrderView(v) {
    orderView = v;
    ['pending','payment_uploaded','processing','completed'].forEach(s => {
      const btn = document.getElementById('ordview-' + s);
      if (!btn) return;
      btn.className = `py-2 px-1 text-xs font-semibold rounded-lg transition text-center ${
        s === v ? 'bg-brand-blue text-white' : 'bg-white border border-gray-200 text-brand-bluedark'
      }`;
    });
    loadOrders();
  }

  function toggleCart() { switchTab('cart'); }
  async function updateCartBadge() {
    const { count } = await sb.from('mkt_cart_items').select('id', { count: 'exact', head: true }).eq('buyer_id', currentUser.id);
    const badge = document.getElementById('cart-badge');
    if (count && count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  async function initBuyerApp() {
    const params = new URLSearchParams(window.location.search);
    const openCart = params.get('cart') === 'open';
    const initialTab = params.get('tab');
    history.replaceState({}, '', window.location.pathname);
    if (openCart) {
      document.body.classList.add('checkout-mode');
      document.getElementById('cart-close-btn').classList.remove('hidden');
    }
    let startTab = 'orders';
    if (openCart) startTab = 'cart';
    else if (initialTab && ['orders','rewards','profile','cart'].includes(initialTab)) startTab = initialTab;
    switchTab(startTab);
    updateCartBadge();
  }

  // ---------- CART / CHECKOUT ----------
  async function loadCart() {
    appliedCoupon = null; redeemPoints = 0;
    const { data: items } = await sb.from('mkt_cart_items')
      .select('*, products:mkt_products(id, name, price, unit, quantity, seller_id, category)')
      .eq('buyer_id', currentUser.id);
    const listEl = document.getElementById('cart-list');
    const summaryEl = document.getElementById('cart-summary');
    if (!items || items.length === 0) {
      listEl.innerHTML = '<div class="text-center py-8"><p class="text-gray-400 text-sm mb-3">Your cart is empty.</p><a href="../marketplace/" class="btn-primary text-white text-sm px-5 py-2 rounded-full transition inline-block">Browse Products</a></div>';
      summaryEl.classList.add('hidden');
      updateCartBadge();
      return;
    }
    CART = items.map(i => ({
      cart_id: i.id, id: i.products.id, name: i.products.name, price: parseFloat(i.products.price),
      unit: i.products.unit, stock: i.products.quantity, seller_id: i.products.seller_id,
      category: i.products.category, qty: i.quantity, promo: 0
    }));
    // fetch seller delivery fees
    const sellerIds = [...new Set(CART.map(c => c.seller_id).filter(Boolean))];
    if (sellerIds.length) {
      const { data: sps } = await sb.from('shared_profiles').select('id, full_name, farm_name, delivery_fee').in('id', sellerIds);
      sellerProfiles = {};
      (sps || []).forEach(sp => { sellerProfiles[sp.id] = sp; });
    }
    // promotions
    try {
      const payload = CART.map(c => ({ product_id: c.id, category: c.category, qty: c.qty, price: c.price }));
      const { data: promos } = await sb.rpc('mkt_promotions_for_cart', { p_items: payload });
      (promos || []).forEach(pr => { const c = CART.find(x => x.id === pr.product_id); if (c) c.promo = parseFloat(pr.discount) || 0; });
    } catch (_) {}

    listEl.innerHTML = CART.map(i => `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100 flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">${i.name}</p>
          <p class="text-xs text-gray-500">${rm(i.price)} / ${i.unit}${i.promo>0?` · <span class="text-green-600">promo -${rm(i.promo)}</span>`:''}</p>
        </div>
        <div class="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button onclick="updateCartQty('${i.cart_id}', ${i.qty - 1}, ${i.stock})" class="px-2 py-1 bg-brand-bluelight hover:bg-brand-bluelight font-bold">−</button>
          <span class="px-3 py-1 text-sm font-medium">${i.qty}</span>
          <button onclick="updateCartQty('${i.cart_id}', ${i.qty + 1}, ${i.stock})" class="px-2 py-1 bg-brand-bluelight hover:bg-brand-bluelight font-bold">+</button>
        </div>
        <span class="font-bold text-brand-bluedark text-sm w-20 text-right">${rm(i.qty * i.price - i.promo)}</span>
        <button onclick="removeCartItem('${i.cart_id}')" class="text-red-400 hover:text-red-600 text-lg ml-1">×</button>
      </div>`).join('');

    // points
    await loadPointsBalance();
    if (APP.points.enabled !== false && POINTS.balance > 0) {
      document.getElementById('points-redeem-block').classList.remove('hidden');
      document.getElementById('pts-available').textContent = POINTS.balance;
      // max points limited so discount can't exceed subtotal
      const sub = cartSubtotal();
      const maxByValue = Math.floor((sub) / (APP.points.redeem_rm || 1)) * (APP.points.redeem_pts || 100);
      const maxPts = Math.max(0, Math.min(POINTS.balance, maxByValue));
      const slider = document.getElementById('points-slider');
      slider.max = maxPts; slider.step = APP.points.redeem_pts || 100; slider.value = 0;
    } else {
      document.getElementById('points-redeem-block').classList.add('hidden');
    }
    summaryEl.classList.remove('hidden');
    recalcTotals();
    updateCartBadge();
  }

  function cartSubtotal() { return CART.reduce((s,i)=> s + (i.qty*i.price - i.promo), 0); }
  function promoTotal()  { return CART.reduce((s,i)=> s + i.promo, 0); }
  function pointsDiscount() { return Math.floor(redeemPoints / (APP.points.redeem_pts||100)) * (APP.points.redeem_rm||1); }
  function deliveryFeeTotal() {
    if (deliveryChoice !== 'delivery') return 0;
    const sellerIds = [...new Set(CART.map(c => c.seller_id).filter(Boolean))];
    return sellerIds.reduce((s, sid) => s + (parseFloat(sellerProfiles[sid]?.delivery_fee) || 0), 0);
  }

  function setFulfillment(choice) {
    deliveryChoice = choice;
    document.getElementById('lbl-pickup').classList.toggle('border-brand-blue', choice === 'pickup');
    document.getElementById('lbl-pickup').classList.toggle('bg-brand-bluelight', choice === 'pickup');
    document.getElementById('lbl-pickup').classList.toggle('border-gray-200', choice !== 'pickup');
    document.getElementById('lbl-delivery').classList.toggle('border-brand-blue', choice === 'delivery');
    document.getElementById('lbl-delivery').classList.toggle('bg-brand-bluelight', choice === 'delivery');
    document.getElementById('lbl-delivery').classList.toggle('border-gray-200', choice !== 'delivery');
    document.getElementById('delivery-address-wrap').classList.toggle('hidden', choice !== 'delivery');
    recalcTotals();
  }

  async function downloadQr(url) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'payment-qr.png';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch(_) { window.open(url, '_blank'); }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast('Copy failed', 'warning'));
  }

  function onPointsSlide() {
    redeemPoints = parseInt(document.getElementById('points-slider').value) || 0;
    document.getElementById('points-redeem-label').textContent = `${redeemPoints} pts = ${rm(pointsDiscount())}`;
    recalcTotals();
  }

  function recalcTotals() {
    const sub = cartSubtotal();
    const coup = appliedCoupon ? Math.min(appliedCoupon.discount, sub) : 0;
    const pts = Math.min(pointsDiscount(), Math.max(0, sub - coup));
    const delFee = deliveryFeeTotal();
    const total = Math.max(0, sub - coup - pts + delFee);
    document.getElementById('sum-subtotal').textContent = rm(sub);
    toggleRow('sum-promo-row','sum-promo', promoTotal(), true);
    toggleRow('sum-coupon-row','sum-coupon', coup, false);
    toggleRow('sum-points-row','sum-points', pts, false);
    const delRow = document.getElementById('sum-delivery-row');
    delRow.classList.toggle('hidden', delFee <= 0);
    document.getElementById('sum-delivery').textContent = rm(delFee);
    document.getElementById('sum-total').textContent = rm(total);
  }
  function toggleRow(rowId, valId, val, isPromo) {
    document.getElementById(rowId).classList.toggle('hidden', !(val>0));
    document.getElementById(valId).textContent = (isPromo?'- ':'- ') + rm(val);
  }

  async function applyCoupon() {
    const code = document.getElementById('coupon-input').value.trim();
    const msg = document.getElementById('coupon-msg');
    if (!code) return;
    const cats = [...new Set(CART.map(c => c.category))];
    const { data, error } = await sb.rpc('mkt_preview_coupon', {
      p_code: code, p_customer_id: currentUser.id, p_subtotal: cartSubtotal(), p_categories: cats
    });
    if (error) { msg.className='text-xs mt-1 text-red-600'; msg.textContent = 'Could not validate coupon.'; return; }
    if (!data.valid) { appliedCoupon=null; msg.className='text-xs mt-1 text-red-600'; msg.textContent = data.reason; recalcTotals(); return; }
    appliedCoupon = { code: data.code, discount: parseFloat(data.discount) };
    msg.className='text-xs mt-1 text-green-600'; msg.textContent = ` ${data.name} applied — ${rm(data.discount)} off`;
    recalcTotals();
  }

  async function updateCartQty(itemId, newQty, maxQty) {
    if (newQty < 1) { removeCartItem(itemId); return; }
    if (newQty > maxQty) { showToast('Not enough stock', 'warning'); return; }
    await sb.from('mkt_cart_items').update({ quantity: newQty }).eq('id', itemId);
    loadCart();
  }
  async function removeCartItem(itemId) {
    await sb.from('mkt_cart_items').delete().eq('id', itemId);
    loadCart();
  }

  async function placeOrder() {
    if (CART.length === 0) { showToast('Cart is empty', 'warning'); return; }
    const btn = document.getElementById('place-order-btn');
    btn.disabled = true; btn.textContent = 'Placing order…';
    const payChoice = 'offline';
    const notes = document.getElementById('delivery-notes').value.trim();
    const delivAddress = deliveryChoice === 'delivery' ? (document.getElementById('delivery-address').value.trim()) : null;

    const sub = cartSubtotal();
    const coup = appliedCoupon ? Math.min(appliedCoupon.discount, sub) : 0;
    const pts = Math.min(pointsDiscount(), Math.max(0, sub - coup));
    const totalDiscount = coup + pts;

    // group by seller
    const bySeller = {};
    CART.forEach(i => { (bySeller[i.seller_id] = bySeller[i.seller_id] || []).push(i); });

    const createdOrders = [];
    let firstOrderId = null;
    try {
      for (const [sellerId, sellerItems] of Object.entries(bySeller)) {
        const sellerSub = sellerItems.reduce((s,i)=> s + (i.qty*i.price - i.promo), 0);
        const share = sub > 0 ? sellerSub / sub : 0;
        const sellerDiscount = +(totalDiscount * share).toFixed(2);
        const sellerPtsRedeemed = Math.round((redeemPoints||0) * share);
        const sellerPtsRm = +((pts) * share).toFixed(2);
        const sellerDelFee = deliveryChoice === 'delivery' ? (parseFloat(sellerProfiles[sellerId]?.delivery_fee) || 0) : 0;
        const sellerTotal = Math.max(0, +(sellerSub - sellerDiscount + sellerDelFee).toFixed(2));

        // unique order number
        let orderNumber = null;
        try { const { data: on } = await sb.rpc('mkt_next_order_number'); orderNumber = on; } catch (_) {}

        const { data: order, error: oErr } = await sb.from('mkt_orders').insert({
          buyer_id: currentUser.id, seller_id: sellerId,
          order_number: orderNumber,
          subtotal: +sellerSub.toFixed(2),
          discount_amount: sellerDiscount,
          total_amount: sellerTotal,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
          points_redeemed: sellerPtsRedeemed,
          points_discount_rm: sellerPtsRm,
          payment_method: payChoice,
          delivery_notes: notes,
          fulfillment_type: deliveryChoice,
          delivery_fee: sellerDelFee,
          delivery_address: delivAddress,
          status: 'pending'
        }).select().single();
        if (oErr) throw oErr;
        if (!firstOrderId) firstOrderId = order.id;
        createdOrders.push({ id: order.id, total: sellerTotal });

        const orderItems = sellerItems.map(i => ({
          order_id: order.id, product_id: i.id, product_name: i.name,
          quantity: i.qty, unit_price: i.price, promotion_discount: i.promo
        }));
        await sb.from('mkt_order_items').insert(orderItems);
      }

      // redeem coupon once (attached to first order)
      if (appliedCoupon && firstOrderId) {
        const cats = [...new Set(CART.map(c => c.category))];
        await sb.rpc('mkt_redeem_coupon', { p_code: appliedCoupon.code, p_customer_id: currentUser.id, p_order_id: firstOrderId, p_subtotal: sub, p_categories: cats });
      }

      await sb.from('mkt_cart_items').delete().eq('buyer_id', currentUser.id);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Place Order';
      showToast('Order failed: ' + (e.message || e), 'error');
      return;
    }

    btn.disabled = false; btn.textContent = 'Place Order';

    for (const o of createdOrders) {
      sendEmail('order_confirmation', { order_id: o.id });
      sendEmail('new_order_seller',   { order_id: o.id });
    }

    updateCartBadge();
    showToast('Order placed! Check your Orders tab to pay the seller.', 'success');
    document.body.classList.remove('checkout-mode');
    document.getElementById('cart-close-btn').classList.add('hidden');
    switchTab('orders');
  }

  // ---------- ORDERS ----------
  async function loadOrders() {
    const { data: orders } = await sb.from('mkt_orders')
      .select('*, profiles:shared_profiles!seller_id(full_name, farm_name, whatsapp, bank_name, bank_account_no, bank_account_name, bank_qr_url, delivery_fee), order_items:mkt_order_items(*, products:mkt_products(name, unit, image_url)), payments:mkt_payments(*)')
      .eq('buyer_id', currentUser.id)
      .order('created_at', { ascending: false });
    const listEl = document.getElementById('orders-list');
    const allOrders = orders || [];

    // Tab placement follows the order's actual DB status (matches the seller view).
    // Tab badges (counts per status)
    const counts = { pending:0, payment_uploaded:0, processing:0, completed:0 };
    allOrders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    ['pending','payment_uploaded','processing'].forEach(k => {
      const b = document.getElementById('badge-' + k);
      if (!b) return;
      if (counts[k] > 0) { b.textContent = counts[k]; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    });

    const orders_ = allOrders.filter(o => o.status === orderView);
    const emptyMsgs = {
      pending: 'No orders awaiting payment.',
      payment_uploaded: 'No orders pending verification.',
      processing: 'No orders in delivery.',
      completed: 'No completed orders yet.'
    };
    if (orders_.length === 0) {
      listEl.innerHTML = `<p class="text-gray-400 text-sm text-center py-8">${emptyMsgs[orderView] || 'No orders yet.'}</p>`;
      return;
    }
    const STATUS_LABEL = {
      pending:          'PENDING PAYMENT SLIP',
      payment_uploaded: 'PAYMENT SLIP UPLOADED · PENDING VERIFICATION',
      processing:       'ORDER SUCCESSFULLY',
      completed:        'ORDER COMPLETED',
      cancelled:        'CANCELLED'
    };
    listEl.innerHTML = orders_.map(o => {
      // Determine latest payment to reflect verification state
      const payments = (o.payments || []).slice().sort((a,b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const latestPayment = payments[0] || null;
      const isRejected = o.status === 'pending' && latestPayment && latestPayment.status === 'rejected';
      const needsPayment = o.status === 'pending';
      const canRate = o.status === 'completed' && !o.rating;
      const s = o.profiles || {};
      const sellerName = s.farm_name || s.full_name || 'Seller';
      const hasBank = s.bank_name || s.bank_account_no;
      const payBlock = needsPayment ? `
          <div class="border-t border-gray-100 pt-3 mt-3 bg-brand-bluelight/60 -mx-5 px-5 pb-1">
            <p class="text-sm font-semibold text-brand-bluedark mb-2">Pay ${sellerName} — ${rm(o.total_amount)}</p>
            <div class="flex items-start gap-3">
              ${s.bank_qr_url ? `
                <div class="shrink-0 flex flex-col items-center gap-1">
                  <a href="${s.bank_qr_url}" target="_blank">
                    <img src="${s.bank_qr_url}" alt="Pay QR" class="w-28 h-28 object-contain rounded-lg border border-gray-200 bg-white" />
                  </a>
                  <button onclick="downloadQr('${s.bank_qr_url}')" class="text-xs text-brand-bluedark hover:underline">Download QR</button>
                </div>` : ''}
              <div class="text-xs text-gray-600 space-y-1">
                ${hasBank ? `
                  ${s.bank_name?`<p><span class="text-gray-400">Bank:</span> <span class="font-medium text-gray-800">${s.bank_name}</span></p>`:''}
                  ${s.bank_account_name?`<p><span class="text-gray-400">Name:</span> <span class="font-medium text-gray-800">${s.bank_account_name}</span></p>`:''}
                  ${s.bank_account_no?`<div class="flex items-center gap-1"><span class="text-gray-400">Acc:</span> <span class="font-medium text-gray-800">${s.bank_account_no}</span><button onclick="copyText('${s.bank_account_no}')" class="text-green-600 hover:text-brand-bluedark ml-1" title="Copy"></button></div>`:''}
                ` : (s.bank_qr_url ? '<p>Scan the QR code to pay.</p>' : '<p class="text-amber-600">Seller has not set up payment details yet. Please contact them.</p>')}
              </div>
            </div>
            <div class="flex gap-2 mt-3 flex-wrap">
              ${s.whatsapp ? `<button onclick="sendSlip('${s.whatsapp}','${(o.order_number||'').replace(/'/g,'')}','${o.total_amount}','${sellerName.replace(/'/g,'')}')" class="bg-[#25D366] hover:opacity-90 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition inline-flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.115zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>Send Slip on WhatsApp</button>` : ''}
              <button onclick="openPaymentModal('${o.id}')" class="bg-white border border-gray-300 text-brand-bluedark hover:bg-brand-bluelight text-sm px-4 py-1.5 rounded-full transition">${isRejected ? 'Upload Slip Again' : 'Upload Slip'}</button>
              <button onclick="cancelOrder('${o.id}')" class="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm px-4 py-1.5 rounded-full transition">Cancel Order</button>
            </div>
          </div>` : '';
      return `
        <div class="bg-white rounded-xl p-5 shadow border border-gray-100">
          <div class="flex items-start justify-between mb-2">
            <div>
              <p class="font-semibold text-brand-bluedark">${sellerName}</p>
              <p class="text-xs text-gray-400">${o.order_number ? o.order_number+' · ' : ''}${new Date(o.created_at).toLocaleString()}</p>
            </div>
            <span class="text-xs font-semibold px-2 py-1 rounded-full text-center leading-snug ${isRejected ? 'status-cancelled' : 'status-'+o.status}" style="max-width:180px">${isRejected ? 'VERIFICATION UNSUCCESSFUL' : (STATUS_LABEL[o.status] || o.status.replace(/_/g,' ').toUpperCase())}</span>
          </div>
          <div class="flex gap-2 mb-2 flex-wrap">
            ${o.fulfillment_type === 'delivery'
              ? `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Delivery${o.delivery_fee > 0 ? ` +RM ${parseFloat(o.delivery_fee).toFixed(2)}` : ''}</span>`
              : `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Pickup</span>`}
            ${o.delivery_address ? `<span class="text-xs text-gray-500"> ${o.delivery_address}</span>` : ''}
          </div>
          <div class="space-y-2 mb-3">
            ${(o.order_items || []).map(i => `
              <div class="flex items-center gap-3 text-sm">
                <div class="w-12 h-12 rounded-lg bg-brand-bluelight overflow-hidden flex-shrink-0 flex items-center justify-center">
                  ${i.products?.image_url
                    ? `<img src="${i.products.image_url}" alt="" class="w-full h-full object-cover" onerror="this.parentNode.innerHTML='<svg class=\\'w-6 h-6 text-brand-blue\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' d=\\'M4 7h16M4 12h16M4 17h16\\'/></svg>'" />`
                    : `<svg class="w-6 h-6 text-brand-blue" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4-4a3 3 0 014 0l4 4M14 14l2-2a3 3 0 014 0l0 0M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-gray-700 truncate">${i.product_name || i.products?.name || ''}</p>
                  <p class="text-xs text-gray-400">× ${i.quantity} ${i.products?.unit || ''}</p>
                </div>
                <span class="text-gray-700 font-medium whitespace-nowrap">${rm(i.quantity * i.unit_price)}</span>
              </div>`).join('')}
          </div>
          ${o.discount_amount>0?`<p class="text-xs text-green-600 mb-1">Discount: -${rm(o.discount_amount)}</p>`:''}
          ${isRejected?`<div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700 font-medium">Verification unsuccessful. Please upload your payment slip again.${latestPayment.notes?`<br><span class="text-xs font-normal">Reason: ${latestPayment.notes}</span>`:''}</div>`:''}
          ${o.status==='payment_uploaded'?`<div class="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3 text-sm text-blue-700">Payment slip uploaded. Pending seller verification.</div>`:''}
          ${o.status==='processing'?`<div class="bg-brand-bluelight border border-gray-200 rounded-lg px-3 py-2 mb-3 text-sm text-brand-bluedark font-medium">Order confirmed! Your order is being processed/delivered.</div>`:''}
          ${o.rating?`<p class="text-xs text-amber-500 mb-1">${'★'.repeat(o.rating)}${'☆'.repeat(5-o.rating)}</p>`:''}
          <div class="flex items-center justify-between border-t border-gray-100 pt-3 flex-wrap gap-2">
            <span class="font-bold text-brand-bluedark">${rm(o.total_amount)}</span>
            <div class="flex gap-2">
              <button onclick="openOrderDetail('${o.id}')" class="bg-brand-bluelight text-brand-bluedark text-sm px-4 py-1.5 rounded-full transition">View details</button>
              ${canRate ? `<button onclick="openRatingModal('${o.id}')" class="bg-amber-100 text-amber-700 text-sm px-4 py-1.5 rounded-full transition">★ Rate Order</button>` : ''}
            </div>
          </div>
          ${payBlock}
        </div>`;
    }).join('');
  }

  function sendSlip(whatsapp, orderNumber, total, sellerName) {
    const num = (whatsapp || '').replace(/[^0-9]/g, '');
    if (!num) { showToast('Seller has no WhatsApp number set', 'warning'); return; }
    const msg = `Hi ${sellerName}, here is my payment slip for order ${orderNumber || ''} (RM ${Number(total).toFixed(2)}) from HSI Marketplace.`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function openPaymentModal(orderId) {
    document.getElementById('pay-order-id').value = orderId;
    renderBankDetails();
    document.getElementById('payment-modal').classList.remove('hidden');
  }
  function renderBankDetails() {
    const el = document.getElementById('pay-bank-details');
    if (!el) return;
    el.innerHTML = `
      <div class="bg-brand-bluelight border border-gray-100 rounded-xl p-4 text-sm text-gray-600">
        <p class="font-semibold text-brand-bluedark mb-1">Pay the seller directly</p>
        <p class="text-xs">Use the seller's bank details / DuitNow QR shown on your order to make payment, then upload your slip below.</p>
      </div>`;
  }
  function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); }

  // ---- Order detail ----
  function closeOrderDetail() { document.getElementById('orderdetail-modal').classList.add('hidden'); }
  async function openOrderDetail(orderId) {
    document.getElementById('od-body').innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading…</p>';
    document.getElementById('orderdetail-modal').classList.remove('hidden');
    const { data: o } = await sb.from('mkt_orders')
      .select('*, buyer:shared_profiles!buyer_id(full_name,email,phone), seller:shared_profiles!seller_id(full_name,farm_name), order_items:mkt_order_items(*, products:mkt_products(name,unit,image_url))')
      .eq('id', orderId).single();
    if (!o) { document.getElementById('od-body').innerHTML = '<p class="text-red-500 text-sm text-center py-8">Order not found.</p>'; return; }
    const items = o.order_items || [];
    const rows = items.map(i => `
      <tr class="border-b border-gray-100">
        <td class="py-2 pr-2">
          <div class="flex items-center gap-2">
            <div class="w-10 h-10 rounded-lg bg-brand-bluelight overflow-hidden flex-shrink-0 flex items-center justify-center">
              ${i.products?.image_url
                ? `<img src="${i.products.image_url}" alt="" class="w-full h-full object-cover" onerror="this.style.display='none'" />`
                : `<svg class="w-5 h-5 text-brand-blue" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4-4a3 3 0 014 0l4 4M14 14l2-2a3 3 0 014 0M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
            </div>
            <span class="text-gray-700">${i.product_name || i.products?.name || 'Item'}</span>
          </div>
        </td>
        <td class="py-2 px-2 text-center whitespace-nowrap">${i.quantity} ${i.products?.unit || ''}</td>
        <td class="py-2 px-2 text-right whitespace-nowrap">${rm(i.unit_price)}</td>
        <td class="py-2 pl-2 text-right font-semibold whitespace-nowrap">${rm(i.quantity * i.unit_price)}</td>
      </tr>`).join('');
    const b = o.buyer || {}, s = o.seller || {};
    document.getElementById('od-body').innerHTML = `
      <h3 class="text-lg font-bold text-brand-bluedark mb-1">Order Details</h3>
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p class="text-xs text-gray-400">${o.order_number ? o.order_number + ' · ' : ''}${new Date(o.created_at).toLocaleString()}</p>
        <span class="text-xs font-semibold px-2 py-1 rounded-full status-${o.status}">${o.status.replace(/_/g,' ').toUpperCase()}</span>
      </div>
      <div class="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
        <div class="bg-brand-bluelight/60 rounded-lg p-3">
          <p class="text-xs font-semibold text-gray-500 mb-1">Buyer</p>
          <p class="font-medium">${b.full_name || '—'}</p>
          ${b.email ? `<p class="text-xs text-gray-500 break-words">${b.email}</p>` : ''}
          ${b.phone ? `<p class="text-xs text-gray-500">${b.phone}</p>` : ''}
        </div>
        <div class="bg-brand-bluelight/60 rounded-lg p-3">
          <p class="text-xs font-semibold text-gray-500 mb-1">Seller</p>
          <p class="font-medium">${s.farm_name || s.full_name || '—'}</p>
        </div>
      </div>
      <table class="w-full text-sm mb-3">
        <thead><tr class="text-xs text-gray-400 border-b border-gray-100"><th class="text-left py-1 pr-2 font-medium">Product</th><th class="py-1 px-2 font-medium">Qty</th><th class="text-right py-1 px-2 font-medium">Unit price</th><th class="text-right py-1 pl-2 font-medium">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="border-t border-gray-100 pt-3 space-y-1 text-sm">
        ${o.subtotal ? `<div class="flex justify-between text-gray-500"><span>Subtotal</span><span>${rm(o.subtotal)}</span></div>` : ''}
        ${o.discount_amount > 0 ? `<div class="flex justify-between text-green-600"><span>Discount${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}</span><span>- ${rm(o.discount_amount)}</span></div>` : ''}
        ${o.points_discount_rm > 0 ? `<div class="flex justify-between text-green-600"><span>Points redeemed</span><span>- ${rm(o.points_discount_rm)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-brand-bluedark text-base"><span>Total</span><span>${rm(o.total_amount)}</span></div>
      </div>
      ${o.payment_method ? `<p class="text-xs text-gray-500 mt-3">Payment method: ${o.payment_method}</p>` : ''}
      ${o.delivery_notes ? `<p class="text-xs text-gray-500 mt-1">Notes: ${o.delivery_notes}</p>` : ''}`;
  }

  async function submitPayment(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    const orderId = document.getElementById('pay-order-id').value;
    const method = document.getElementById('pay-method').value;
    const file = document.getElementById('pay-proof').files[0];
    if (!file) { if (btn) { btn.disabled = false; btn.textContent = 'Submit Payment Slip'; } return; }
    const path = `${currentUser.id}/${orderId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await sb.storage.from('mkt-payment-proofs').upload(path, file);
    if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Submit Payment Slip'; } return; }
    const { data: { publicUrl } } = sb.storage.from('mkt-payment-proofs').getPublicUrl(path);
    const { error: insErr } = await sb.from('mkt_payments').insert({ order_id: orderId, buyer_id: currentUser.id, method, proof_url: publicUrl, status: 'pending' });
    if (insErr) { showToast('Failed to save payment: ' + insErr.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Submit Payment Slip'; } return; }
    const { error: updErr } = await sb.from('mkt_orders').update({ status: 'payment_uploaded' }).eq('id', orderId);
    if (updErr) { showToast('Failed to update order: ' + updErr.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Submit Payment Slip'; } return; }
    sendEmail('order_status', { order_id: orderId });
    showToast('Payment slip submitted! Awaiting seller verification.');
    closePaymentModal();
    loadOrders();
  }

  function sendEmail(type, data) {
    fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ type, ...data }),
    }).catch(() => {});
  }

  async function cancelOrder(orderId) {
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    const { error } = await sb.from('mkt_orders').update({ status: 'cancelled' }).eq('id', orderId);
    if (error) { showToast('Failed to cancel: ' + error.message, 'error'); return; }
    showToast('Order cancelled.');
    loadOrders();
  }

  // ---------- RATING ----------
  let ratingValue = 0;
  function openRatingModal(orderId) {
    ratingValue = 0;
    document.getElementById('rate-order-id').value = orderId;
    document.getElementById('rate-comment').value = '';
    renderStars();
    document.getElementById('rating-modal').classList.remove('hidden');
  }
  function closeRatingModal() { document.getElementById('rating-modal').classList.add('hidden'); }
  function renderStars() {
    document.getElementById('rate-stars').innerHTML = [1,2,3,4,5].map(n =>
      `<span class="star" onclick="setStars(${n})">${n<=ratingValue?'★':'☆'}</span>`).join('');
  }
  function setStars(n) { ratingValue = n; renderStars(); }
  async function submitRating() {
    if (ratingValue < 1) { showToast('Please select a rating', 'warning'); return; }
    const orderId = document.getElementById('rate-order-id').value;
    await sb.from('mkt_orders').update({ rating: ratingValue, rating_comment: document.getElementById('rate-comment').value.trim() || null }).eq('id', orderId);
    showToast('Thanks for your review!');
    closeRatingModal();
    loadOrders();
  }

  // ---------- REWARDS ----------
  async function loadPointsBalance() {
    const { data } = await sb.from('mkt_customer_points_balance').select('*').eq('user_id', currentUser.id).maybeSingle();
    POINTS = data || { balance:0, lifetime_earned:0 };
  }
  function tierFor(pts) {
    const tiers = [...APP.tiers].sort((a,b)=> (b.min_points||0)-(a.min_points||0));
    for (const t of tiers) if (pts >= (t.min_points||0)) return t;
    return tiers.length ? tiers[tiers.length-1] : { name:'Sprout', min_points:0 };
  }
  function nextTier(pts) {
    const tiers = [...APP.tiers].sort((a,b)=> (a.min_points||0)-(b.min_points||0));
    return tiers.find(t => (t.min_points||0) > pts) || null;
  }
  async function loadRewards() {
    await loadPointsBalance();
    const lifetime = POINTS.lifetime_earned || 0;
    const cur = tierFor(lifetime), nxt = nextTier(lifetime);
    document.getElementById('rw-balance').textContent = POINTS.balance || 0;
    document.getElementById('rw-tier').textContent = cur.name || 'Sprout';
    if (nxt) {
      const span = (nxt.min_points - (cur.min_points||0)) || 1;
      const pct = Math.min(100, Math.max(0, Math.round(((lifetime - (cur.min_points||0)) / span) * 100)));
      document.getElementById('rw-progress').style.width = pct + '%';
      document.getElementById('rw-next').textContent = `${nxt.min_points - lifetime} pts to ${nxt.name}`;
    } else {
      document.getElementById('rw-progress').style.width = '100%';
      document.getElementById('rw-next').textContent = 'Top tier reached ';
    }
    // coupons
    const today = new Date().toISOString().slice(0,10);
    const { data: coupons } = await sb.from('mkt_coupons').select('*').eq('is_active', true).order('created_at',{ascending:false});
    const valid = (coupons||[]).filter(c => (!c.expiry_date || c.expiry_date >= today) && (!c.start_date || c.start_date <= today) && (c.usage_limit===0 || c.usage_count < c.usage_limit));
    document.getElementById('rw-coupons').innerHTML = valid.length ? valid.map(c => `
      <div class="bg-white border border-dashed border-gray-300 rounded-xl p-4">
        <p class="text-lg font-extrabold text-brand-bluedark">${c.discount_type==='percentage'? c.discount_value+'% OFF' : rm(c.discount_value)+' OFF'}</p>
        <p class="text-xs text-gray-500 mb-2">${c.name||c.description||''}${c.min_order_value>0?` · min ${rm(c.min_order_value)}`:''}</p>
        <div class="flex items-center justify-between">
          <code class="bg-brand-bluelight text-brand-bluedark px-2 py-1 rounded text-sm font-bold">${c.code}</code>
          <button onclick="copyCode('${c.code}')" class="text-xs text-green-600 hover:underline">Copy</button>
        </div>
      </div>`).join('') : '<p class="text-gray-400 text-sm">No coupons available right now.</p>';
    // history
    const { data: ledger } = await sb.from('mkt_points_ledger').select('*').eq('user_id', currentUser.id).order('created_at',{ascending:false}).limit(30);
    document.getElementById('rw-history').innerHTML = (ledger&&ledger.length) ? ledger.map(l => `
      <div class="flex items-center justify-between p-3 text-sm">
        <div><p class="font-medium text-gray-700">${l.type==='Earned'?'':l.type==='Redeemed'?'':''} ${l.note||l.type}</p>
        <p class="text-xs text-gray-400">${new Date(l.created_at).toLocaleDateString()}</p></div>
        <span class="font-bold ${l.change>0?'text-green-600':'text-red-500'}">${l.change>0?'+':''}${l.change}</span>
      </div>`).join('') : '<p class="text-gray-400 text-sm p-4">No points activity yet. Earn points on your next order!</p>';
  }
  function copyCode(code) { navigator.clipboard.writeText(code); showToast('Coupon copied: ' + code); }

  // ---------- PROFILE ----------
  async function loadProfile() {
    const { data: p } = await sb.from('shared_profiles').select('*').eq('id', currentUser.id).single();
    if (!p) return;
    document.getElementById('profile-name').value = p.full_name || '';
    document.getElementById('profile-phone').value = p.phone || '';
    document.getElementById('profile-email').value = p.email || currentUser.email;
  }
  async function saveProfile(e) {
    e.preventDefault();
    const { error } = await sb.from('shared_profiles').update({
      full_name: document.getElementById('profile-name').value.trim(),
      phone: document.getElementById('profile-phone').value.trim()
    }).eq('id', currentUser.id);
    if (error) showToast('Save failed', 'error'); else { showToast('Profile updated!'); currentUser.full_name = document.getElementById('profile-name').value.trim(); }
  }
  async function changePassword(e) {
    e.preventDefault();
    const pw = document.getElementById('new-password').value;
    if (pw.length < 6) { showToast('Password too short', 'warning'); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) showToast('Failed: ' + error.message, 'error');
    else { showToast('Password updated!'); document.getElementById('new-password').value=''; }
  }

  // ---------- BILLING ----------
  async function loadBilling() {
    const { data } = await sb.from('mkt_billing_info').select('*').eq('user_id', currentUser.id).order('is_default',{ascending:false});
    const el = document.getElementById('billing-list');
    if (!data || data.length === 0) { el.innerHTML = '<p class="text-gray-400 text-sm">No billing addresses yet.</p>'; return; }
    el.innerHTML = data.map(b => `
      <div class="border border-gray-100 rounded-lg p-3 flex items-start justify-between">
        <div>
          <p class="font-medium text-sm">${b.name||''} ${b.is_default?'<span class="text-xs bg-brand-bluelight text-brand-bluedark px-1.5 py-0.5 rounded">Default</span>':''} <span class="text-xs text-gray-400">(${b.type})</span></p>
          <p class="text-xs text-gray-500">${[b.address,b.city,b.state,b.postcode].filter(Boolean).join(', ')}</p>
          ${b.tax_id?`<p class="text-xs text-gray-400">Tax ID: ${b.tax_id}</p>`:''}
        </div>
        <div class="flex gap-2">
          <button onclick="editBilling('${b.id}')" class="text-xs text-green-600 hover:underline">Edit</button>
          <button onclick="deleteBilling('${b.id}')" class="text-xs text-red-500 hover:underline">Delete</button>
        </div>
      </div>`).join('');
  }
  let billingCache = {};
  function openBillingModal() {
    document.getElementById('billing-modal-title').textContent = 'Add Billing Address';
    document.getElementById('bill-id').value = '';
    ['bill-name','bill-phone','bill-address','bill-city','bill-state','bill-postcode','bill-tax'].forEach(id=>document.getElementById(id).value='');
    document.querySelector('input[name="bill-type"][value="personal"]').checked = true;
    document.getElementById('bill-default').checked = false;
    document.getElementById('billing-modal').classList.remove('hidden');
  }
  function closeBillingModal() { document.getElementById('billing-modal').classList.add('hidden'); }
  async function editBilling(id) {
    const { data: b } = await sb.from('mkt_billing_info').select('*').eq('id', id).single();
    if (!b) return;
    document.getElementById('billing-modal-title').textContent = 'Edit Billing Address';
    document.getElementById('bill-id').value = b.id;
    document.getElementById('bill-name').value = b.name||'';
    document.getElementById('bill-phone').value = b.phone||'';
    document.getElementById('bill-address').value = b.address||'';
    document.getElementById('bill-city').value = b.city||'';
    document.getElementById('bill-state').value = b.state||'';
    document.getElementById('bill-postcode').value = b.postcode||'';
    document.getElementById('bill-tax').value = b.tax_id||'';
    document.querySelector(`input[name="bill-type"][value="${b.type}"]`).checked = true;
    document.getElementById('bill-default').checked = b.is_default;
    document.getElementById('billing-modal').classList.remove('hidden');
  }
  async function saveBilling(e) {
    e.preventDefault();
    const id = document.getElementById('bill-id').value;
    const payload = {
      user_id: currentUser.id,
      type: document.querySelector('input[name="bill-type"]:checked').value,
      name: document.getElementById('bill-name').value.trim(),
      phone: document.getElementById('bill-phone').value.trim(),
      address: document.getElementById('bill-address').value.trim(),
      city: document.getElementById('bill-city').value.trim(),
      state: document.getElementById('bill-state').value.trim(),
      postcode: document.getElementById('bill-postcode').value.trim(),
      tax_id: document.getElementById('bill-tax').value.trim() || null,
      is_default: document.getElementById('bill-default').checked
    };
    if (payload.is_default) await sb.from('mkt_billing_info').update({ is_default:false }).eq('user_id', currentUser.id);
    let error;
    if (id) ({ error } = await sb.from('mkt_billing_info').update(payload).eq('id', id));
    else ({ error } = await sb.from('mkt_billing_info').insert(payload));
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Billing saved!');
    closeBillingModal();
    loadBilling();
  }
  async function deleteBilling(id) {
    if (!confirm('Delete this billing address?')) return;
    await sb.from('mkt_billing_info').delete().eq('id', id);
    loadBilling();
  }

  async function doLogout() { await sb.auth.signOut(); window.location.href = '../'; }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'activated') window.location.reload();
        });
      });
    }).catch(() => {});
  }
