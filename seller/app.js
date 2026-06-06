  /* ============================================================================
   * SELLER DASHBOARD — products, orders, analytics, farmer profile
   * ----------------------------------------------------------------------------
   * Requires a logged-in, approved seller. Orders use the same four-tab flow as
   * the buyer (filtered by mkt_orders.status):
   *   To Pay → verify/reject slip in Paid → mark delivered in In Delivery →
   *   Completed. "Delivery Completed" calls the mkt_complete_order RPC which
   *   atomically completes the order and decrements product stock.
   * See docs/ORDER-LIFECYCLE.md.
   * ========================================================================== */
  const SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentUser = null;

  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '../'; return; }
    const { data: profile } = await sb.from('shared_profiles').select('*').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'seller') { window.location.href = '../'; return; }
    currentUser = { ...session.user, ...profile };
    document.getElementById('user-name').textContent = profile.farm_name || profile.full_name || session.user.email;
    if (profile.status !== 'active') {
      document.getElementById('pending-banner').classList.remove('hidden');
      document.getElementById('main-content').classList.add('hidden');
      return;
    }
    initSellerApp();
  })();

/* ----- next block ----- */

  function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-500' : 'bg-green-700'}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function switchTab(tab) {
    ['products','orders','analytics','profile'].forEach(t => {
      document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
      const btn = document.getElementById(`tab-${t}`);
      btn.classList.toggle('active', t === tab);
      btn.classList.toggle('bg-white', t !== tab);
      btn.classList.toggle('text-green-700', t !== tab);
    });
    if (tab === 'orders') loadOrders();
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'profile') loadProfile();
  }

  async function initSellerApp() { loadProducts(); }

  // ---- PRODUCTS ----
  async function loadProducts() {
    const { data: products } = await sb.from('mkt_products')
      .select('*')
      .eq('seller_id', currentUser.id)
      .order('created_at', { ascending: false });
    const el = document.getElementById('products-list');
    if (!products || products.length === 0) {
      el.innerHTML = '<p class="col-span-full text-gray-400 text-sm text-center py-8">No products yet. Add your first!</p>';
      return;
    }
    el.innerHTML = products.map(p => `
      <div class="bg-white rounded-xl overflow-hidden shadow border border-green-100">
        <div class="h-32 bg-green-100 overflow-hidden">
          ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover" />` : '<div class="w-full h-full flex items-center justify-center text-4xl">🌿</div>'}
        </div>
        <div class="p-4">
          <div class="flex items-start justify-between mb-1">
            <h4 class="font-semibold text-sm text-gray-800">${p.name}</h4>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${p.status}</span>
          </div>
          <p class="text-xs text-gray-500 mb-2">${p.category} · ${p.quantity} ${p.unit} available</p>
          <p class="text-green-700 font-bold text-sm mb-3">RM ${parseFloat(p.price).toFixed(2)} / ${p.unit}</p>
          <div class="flex gap-2">
            <button onclick="openProductModal('${p.id}')" class="flex-1 bg-green-50 text-green-700 hover:bg-green-100 text-xs py-1.5 rounded-lg transition font-medium">Edit</button>
            <button onclick="toggleProductStatus('${p.id}', '${p.status}')" class="flex-1 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs py-1.5 rounded-lg transition font-medium">${p.status === 'active' ? 'Deactivate' : 'Activate'}</button>
            <button onclick="deleteProduct('${p.id}')" class="flex-1 bg-red-50 text-red-600 hover:bg-red-100 text-xs py-1.5 rounded-lg transition font-medium">Delete</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function toggleProductStatus(id, current) {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    await sb.from('mkt_products').update({ status: newStatus }).eq('id', id);
    loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    await sb.from('mkt_products').delete().eq('id', id);
    showToast('Product deleted');
    loadProducts();
  }

  let editingProductId = null;
  function openProductModal(productId = null) {
    editingProductId = productId;
    document.getElementById('product-id').value = productId || '';
    document.getElementById('product-modal-title').textContent = productId ? 'Edit Product' : 'Add Product';
    if (!productId) {
      ['prod-name','prod-desc','prod-price','prod-unit','prod-quantity','prod-harvest'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('prod-category').value = 'Vegetables';
      document.getElementById('prod-current-image').classList.add('hidden');
    } else {
      sb.from('mkt_products').select('*').eq('id', productId).single().then(({ data: p }) => {
        if (!p) return;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-category').value = p.category;
        document.getElementById('prod-desc').value = p.description || '';
        document.getElementById('prod-price').value = p.price;
        document.getElementById('prod-unit').value = p.unit;
        document.getElementById('prod-quantity').value = p.quantity;
        document.getElementById('prod-harvest').value = p.harvest_date || '';
        if (p.image_url) {
          document.getElementById('prod-image-preview').src = p.image_url;
          document.getElementById('prod-current-image').classList.remove('hidden');
        }
      });
    }
    document.getElementById('product-modal').classList.remove('hidden');
  }

  function closeProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
    editingProductId = null;
  }

  async function saveProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('product-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    let imageUrl = null;
    const file = document.getElementById('prod-image').files[0];
    if (file) {
      const path = `${currentUser.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await sb.storage.from('mkt-product-images').upload(path, file, { upsert: true });
      if (upErr) { showToast('Image upload failed', 'error'); btn.disabled = false; btn.textContent = 'Save Product'; return; }
      const { data: { publicUrl } } = sb.storage.from('mkt-product-images').getPublicUrl(path);
      imageUrl = publicUrl;
    }

    const payload = {
      seller_id: currentUser.id,
      name: document.getElementById('prod-name').value.trim(),
      category: document.getElementById('prod-category').value,
      description: document.getElementById('prod-desc').value.trim() || null,
      price: parseFloat(document.getElementById('prod-price').value),
      unit: document.getElementById('prod-unit').value.trim(),
      quantity: parseInt(document.getElementById('prod-quantity').value),
      harvest_date: document.getElementById('prod-harvest').value || null,
    };
    if (imageUrl) payload.image_url = imageUrl;

    let error;
    if (editingProductId) {
      ({ error } = await sb.from('mkt_products').update(payload).eq('id', editingProductId));
    } else {
      ({ error } = await sb.from('mkt_products').insert(payload));
    }

    btn.disabled = false; btn.textContent = 'Save Product';
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast(editingProductId ? 'Product updated!' : 'Product added!');
    closeProductModal();
    loadProducts();
  }

  // ---- ORDERS ----
  // Four tabs, each a single mkt_orders.status. orderView is the active tab;
  // loadOrders() queries that status only, while updateOrderBadges() counts all
  // statuses for the tab badges.
  let orderView = 'pending';

  function setOrderView(v) {
    orderView = v;
    ['pending','payment_uploaded','processing','completed'].forEach(s => {
      const btn = document.getElementById('ordview-' + s);
      if (!btn) return;
      btn.className = `py-2 px-1 text-xs font-semibold rounded-lg transition text-center ${
        s === v
          ? 'bg-green-600 text-white'
          : 'bg-white border border-green-200 text-green-700'
      }`;
    });
    loadOrders();
  }

  async function updateOrderBadges() {
    const { data: rows } = await sb.from('mkt_orders')
      .select('status')
      .eq('seller_id', currentUser.id);
    const counts = { pending:0, payment_uploaded:0, processing:0, completed:0 };
    (rows || []).forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    ['pending','payment_uploaded','processing'].forEach(k => {
      const b = document.getElementById('badge-' + k);
      if (!b) return;
      if (counts[k] > 0) { b.textContent = counts[k]; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    });
  }

  async function loadOrders() {
    updateOrderBadges();
    const { data: orders } = await sb.from('mkt_orders')
      .select('*, profiles:shared_profiles!buyer_id(full_name, phone), order_items:mkt_order_items(*, products:mkt_products(name, unit)), payments:mkt_payments(*)')
      .eq('seller_id', currentUser.id)
      .eq('status', orderView)
      .order('created_at', { ascending: false });

    const el = document.getElementById('orders-list');
    const emptyMsgs = {
      pending: 'No orders awaiting payment.',
      payment_uploaded: 'No payment slips to verify.',
      processing: 'No orders in delivery.',
      completed: 'No completed orders yet.'
    };
    if (!orders || orders.length === 0) {
      el.innerHTML = `<p class="text-gray-400 text-sm text-center py-8">${emptyMsgs[orderView] || 'No orders.'}</p>`;
      return;
    }

    el.innerHTML = orders.map(o => {
      const payment = o.payments?.[0];
      const statusLabels = { pending:'TO PAY', payment_uploaded:'PAID', processing:'IN DELIVERY', completed:'COMPLETED', cancelled:'CANCELLED' };
      const statusClass = `status-${o.status}`;
      return `
        <div class="bg-white rounded-xl p-5 shadow border border-green-100">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="font-semibold text-green-900">${o.profiles?.full_name || 'Buyer'}</p>
              <p class="text-xs text-gray-400">${new Date(o.created_at).toLocaleString()}${o.order_number ? ' · ' + o.order_number : ''}</p>
            </div>
            <span class="text-xs font-semibold px-2 py-1 rounded-full ${statusClass}">${statusLabels[o.status] || o.status.replace(/_/g,' ').toUpperCase()}</span>
          </div>
          <div class="space-y-1 mb-3">
            ${(o.order_items || []).map(i => `
              <div class="flex justify-between text-sm text-gray-600">
                <span>${i.products?.name} × ${i.quantity}</span>
                <span>RM ${(i.quantity * i.unit_price).toFixed(2)}</span>
              </div>`).join('')}
          </div>
          <div class="flex gap-2 mb-2 flex-wrap">
            ${o.fulfillment_type === 'delivery'
              ? `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">🚚 Delivery${o.delivery_fee > 0 ? ` +RM ${parseFloat(o.delivery_fee).toFixed(2)}` : ''}</span>`
              : `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">🏡 Pickup</span>`}
          </div>
          ${o.delivery_address ? `<p class="text-xs text-gray-500 mb-1">📍 ${o.delivery_address}</p>` : ''}
          ${o.delivery_notes ? `<p class="text-xs text-gray-500 italic mb-2">Note: ${o.delivery_notes}</p>` : ''}

          ${o.status === 'pending' ? `<p class="text-xs text-amber-600 mb-3">⏳ Waiting for buyer to upload payment slip.</p>` : ''}

          ${o.status === 'payment_uploaded' ? `
            <div class="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p class="text-xs font-medium text-gray-600 mb-2">Payment Slip</p>
              <div class="flex items-start gap-3">
                ${payment?.proof_url ? `
                  <a href="${payment.proof_url}" target="_blank" class="shrink-0">
                    <img src="${payment.proof_url}" alt="slip" class="h-24 w-24 rounded-lg object-cover border border-gray-200" />
                  </a>` : `<p class="text-xs text-amber-600">⚠ Slip image unavailable.</p>`}
                <div class="flex-1">
                  <label class="text-xs font-medium text-gray-700 block mb-1">Verify Payment Slip:</label>
                  <select onchange="handlePaymentAction(this,'${payment?.id || ''}','${o.id}')"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 bg-white">
                    <option value="">— Select action —</option>
                    <option value="verified">✅ Verified</option>
                    <option value="rejected">❌ Rejected</option>
                  </select>
                </div>
              </div>
            </div>` : ''}

          ${o.status === 'processing' && payment?.proof_url ? `
            <div class="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p class="text-xs font-medium text-gray-600 mb-1">Payment Slip</p>
              <a href="${payment.proof_url}" target="_blank">
                <img src="${payment.proof_url}" alt="slip" class="h-20 w-20 rounded-lg object-cover border border-gray-200" />
              </a>
            </div>` : ''}

          <div class="flex items-center justify-between border-t border-green-50 pt-3 flex-wrap gap-2">
            <span class="font-bold text-green-700">RM ${parseFloat(o.total_amount).toFixed(2)}</span>
            <div class="flex gap-2 flex-wrap items-center">
              <button onclick="openOrderDetail('${o.id}')" class="bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full transition">View details</button>
              ${o.status === 'processing' ? `
                <button onclick="confirmDelivery('${o.id}')"
                  class="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-full transition">
                  ✅ Delivery Completed
                </button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ---- Order detail ----
  function closeOrderDetail() { document.getElementById('orderdetail-modal').classList.add('hidden'); }
  async function openOrderDetail(orderId) {
    const rm = n => 'RM ' + (Number(n) || 0).toFixed(2);
    document.getElementById('od-body').innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading…</p>';
    document.getElementById('orderdetail-modal').classList.remove('hidden');
    const { data: o } = await sb.from('mkt_orders')
      .select('*, buyer:shared_profiles!buyer_id(full_name,email,phone), seller:shared_profiles!seller_id(full_name,farm_name), order_items:mkt_order_items(*, products:mkt_products(name,unit))')
      .eq('id', orderId).single();
    if (!o) { document.getElementById('od-body').innerHTML = '<p class="text-red-500 text-sm text-center py-8">Order not found.</p>'; return; }
    const rows = (o.order_items || []).map(i => `
      <tr class="border-b border-green-50">
        <td class="py-2 pr-2">${i.product_name || i.products?.name || 'Item'}</td>
        <td class="py-2 px-2 text-center whitespace-nowrap">${i.quantity} ${i.products?.unit || ''}</td>
        <td class="py-2 px-2 text-right whitespace-nowrap">${rm(i.unit_price)}</td>
        <td class="py-2 pl-2 text-right font-semibold whitespace-nowrap">${rm(i.quantity * i.unit_price)}</td>
      </tr>`).join('');
    const b = o.buyer || {}, s = o.seller || {};
    document.getElementById('od-body').innerHTML = `
      <h3 class="text-lg font-bold text-green-900 mb-1">Order Details</h3>
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p class="text-xs text-gray-400">${o.order_number ? o.order_number + ' · ' : ''}${new Date(o.created_at).toLocaleString()}</p>
        <span class="text-xs font-semibold px-2 py-1 rounded-full status-${o.status}">${o.status.replace(/_/g,' ').toUpperCase()}</span>
      </div>
      <div class="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
        <div class="bg-green-50/60 rounded-lg p-3">
          <p class="text-xs font-semibold text-gray-500 mb-1">Buyer</p>
          <p class="font-medium">${b.full_name || '—'}</p>
          ${b.email ? `<p class="text-xs text-gray-500 break-words">${b.email}</p>` : ''}
          ${b.phone ? `<p class="text-xs text-gray-500">${b.phone}</p>` : ''}
        </div>
        <div class="bg-green-50/60 rounded-lg p-3">
          <p class="text-xs font-semibold text-gray-500 mb-1">Seller</p>
          <p class="font-medium">${s.farm_name || s.full_name || '—'}</p>
        </div>
      </div>
      <table class="w-full text-sm mb-3">
        <thead><tr class="text-xs text-gray-400 border-b border-green-100"><th class="text-left py-1 pr-2 font-medium">Product</th><th class="py-1 px-2 font-medium">Qty</th><th class="text-right py-1 px-2 font-medium">Unit price</th><th class="text-right py-1 pl-2 font-medium">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="border-t border-green-100 pt-3 space-y-1 text-sm">
        ${o.subtotal ? `<div class="flex justify-between text-gray-500"><span>Subtotal</span><span>${rm(o.subtotal)}</span></div>` : ''}
        ${o.discount_amount > 0 ? `<div class="flex justify-between text-green-600"><span>Discount${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}</span><span>- ${rm(o.discount_amount)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-green-800 text-base"><span>Total</span><span>${rm(o.total_amount)}</span></div>
      </div>
      ${o.payment_method ? `<p class="text-xs text-gray-500 mt-3">Payment method: ${o.payment_method}</p>` : ''}
      ${o.delivery_notes ? `<p class="text-xs text-gray-500 mt-1">Notes: ${o.delivery_notes}</p>` : ''}`;
  }

  async function handlePaymentAction(select, paymentId, orderId) {
    const action = select.value;
    if (!action) return;
    select.disabled = true;
    if (action === 'verified') await verifyPayment(paymentId, orderId);
    else if (action === 'rejected') await rejectPayment(paymentId, orderId);
    select.disabled = false;
    select.value = '';
  }

  async function verifyPayment(paymentId, orderId) {
    await sb.from('mkt_payments').update({ status: 'verified' }).eq('id', paymentId);
    const { data: ord } = await sb.from('mkt_orders').select('total_amount').eq('id', orderId).single();
    await sb.from('mkt_orders').update({
      status: 'processing',
      amount_paid: ord ? ord.total_amount : undefined,
      amount_paid_at: new Date().toISOString()
    }).eq('id', orderId);
    try { await sb.rpc('mkt_award_order_points', { p_order_id: orderId }); } catch (_) {}
    showToast('Payment verified — order is now In Delivery!');
    loadOrders();
  }

  async function rejectPayment(paymentId, orderId) {
    await sb.from('mkt_payments').update({ status: 'rejected' }).eq('id', paymentId);
    await sb.from('mkt_orders').update({ status: 'pending' }).eq('id', orderId);
    showToast('Payment rejected — order reset to pending', 'warning');
    loadOrders();
  }

  function confirmDelivery(orderId) {
    const modal = document.getElementById('delivery-confirm-modal');
    document.getElementById('delivery-confirm-order-id').value = orderId;
    modal.classList.remove('hidden');
  }
  function closeDeliveryConfirm() {
    document.getElementById('delivery-confirm-modal').classList.add('hidden');
  }
  async function doDeliveryCompleted() {
    const orderId = document.getElementById('delivery-confirm-order-id').value;
    closeDeliveryConfirm();
    const { error } = await sb.rpc('mkt_complete_order', { p_order_id: orderId });
    if (error) { showToast('Failed to complete: ' + error.message, 'error'); return; }
    showToast('Delivery completed! Inventory updated.');
    loadOrders();
    loadProducts();
  }

  // ---- ANALYTICS ----
  async function loadAnalytics() {
    const { data: orders } = await sb.from('mkt_orders')
      .select('total_amount, status')
      .eq('seller_id', currentUser.id);
    const { data: products } = await sb.from('mkt_products')
      .select('id, name')
      .eq('seller_id', currentUser.id);
    const { data: orderItems } = await sb.from('mkt_order_items')
      .select('product_id, quantity, mkt_orders!inner(seller_id)')
      .eq('mkt_orders.seller_id', currentUser.id);

    const revenue = (orders || []).filter(o => o.status === 'completed').reduce((s, o) => s + parseFloat(o.total_amount), 0);
    const totalOrders = (orders || []).length;
    const pendingOrders = (orders || []).filter(o => ['pending','payment_uploaded'].includes(o.status)).length;

    const productCounts = {};
    (orderItems || []).forEach(i => {
      productCounts[i.product_id] = (productCounts[i.product_id] || 0) + i.quantity;
    });

    document.getElementById('analytics-content').innerHTML = `
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-xl p-5 shadow border border-green-100 text-center">
          <p class="text-xs text-gray-500 mb-1">Total Revenue</p>
          <p class="text-2xl font-bold text-green-700">RM ${revenue.toFixed(2)}</p>
        </div>
        <div class="bg-white rounded-xl p-5 shadow border border-green-100 text-center">
          <p class="text-xs text-gray-500 mb-1">Total Orders</p>
          <p class="text-2xl font-bold text-green-700">${totalOrders}</p>
        </div>
        <div class="bg-white rounded-xl p-5 shadow border border-green-100 text-center">
          <p class="text-xs text-gray-500 mb-1">Pending Orders</p>
          <p class="text-2xl font-bold text-amber-600">${pendingOrders}</p>
        </div>
      </div>
      <div class="bg-white rounded-xl p-5 shadow border border-green-100">
        <h4 class="font-bold text-green-900 mb-3">Products by Order Volume</h4>
        <div class="space-y-2">
          ${(products || []).sort((a, b) => (productCounts[b.id] || 0) - (productCounts[a.id] || 0)).map(p => `
            <div class="flex items-center justify-between py-2 border-b border-green-50">
              <span class="text-sm text-gray-700">${p.name}</span>
              <span class="text-sm font-semibold text-green-700">${productCounts[p.id] || 0} ordered</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ---- PROFILE ----
  function previewPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('profile-photo-preview').src = e.target.result;
      document.getElementById('profile-photo-preview').classList.remove('hidden');
      document.getElementById('profile-photo-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }

  function previewQr(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('qr-preview').src = e.target.result;
      document.getElementById('qr-preview').classList.remove('hidden');
      document.getElementById('qr-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }

  async function loadProfile() {
    const { data: p } = await sb.from('shared_profiles').select('*').eq('id', currentUser.id).single();
    if (!p) return;
    document.getElementById('profile-name').value = p.full_name || '';
    document.getElementById('profile-phone').value = p.phone || '';
    document.getElementById('profile-age').value = p.age || '';
    document.getElementById('profile-ethnicity').value = p.ethnicity || '';
    document.getElementById('profile-farm-name').value = p.farm_name || '';
    document.getElementById('profile-farm-location').value = p.farm_location || '';
    document.getElementById('profile-farm-size').value = p.farm_size || '';
    document.getElementById('profile-farming-since').value = p.farming_since || '';
    document.getElementById('profile-certifications').value = p.certifications || '';
    document.getElementById('profile-story').value = p.story || '';
    document.getElementById('profile-whatsapp').value = p.whatsapp || '';
    document.getElementById('profile-bank-name').value = p.bank_name || '';
    document.getElementById('profile-bank-account-name').value = p.bank_account_name || '';
    document.getElementById('profile-bank-account-no').value = p.bank_account_no || '';
    document.getElementById('profile-delivery-fee').value = p.delivery_fee != null ? p.delivery_fee : '';
    if (p.photo_url) {
      document.getElementById('profile-photo-preview').src = p.photo_url;
      document.getElementById('profile-photo-preview').classList.remove('hidden');
      document.getElementById('profile-photo-placeholder').classList.add('hidden');
    }
    if (p.bank_qr_url) {
      document.getElementById('qr-preview').src = p.bank_qr_url;
      document.getElementById('qr-preview').classList.remove('hidden');
      document.getElementById('qr-placeholder').classList.add('hidden');
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = 'Saving…';

    let photoUrl = null;
    const photoFile = document.getElementById('profile-photo').files[0];
    if (photoFile) {
      const path = `${currentUser.id}/profile.${photoFile.name.split('.').pop()}`;
      const { error: upErr } = await sb.storage.from('farmer-photos').upload(path, photoFile, { upsert: true });
      if (upErr) { showToast('Photo upload failed', 'error'); btn.disabled = false; btn.textContent = 'Save Profile'; return; }
      const { data: { publicUrl } } = sb.storage.from('farmer-photos').getPublicUrl(path);
      photoUrl = publicUrl;
    }

    let qrUrl = null;
    const qrFile = document.getElementById('profile-qr').files[0];
    if (qrFile) {
      const path = `${currentUser.id}/qr.${qrFile.name.split('.').pop()}`;
      const { error: qrErr } = await sb.storage.from('farmer-photos').upload(path, qrFile, { upsert: true });
      if (qrErr) { showToast('QR upload failed', 'error'); btn.disabled = false; btn.textContent = 'Save Profile'; return; }
      const { data: { publicUrl } } = sb.storage.from('farmer-photos').getPublicUrl(path);
      qrUrl = publicUrl + '?t=' + Date.now();
    }

    const payload = {
      full_name: document.getElementById('profile-name').value.trim(),
      phone: document.getElementById('profile-phone').value.trim(),
      age: parseInt(document.getElementById('profile-age').value) || null,
      ethnicity: document.getElementById('profile-ethnicity').value || null,
      farm_name: document.getElementById('profile-farm-name').value.trim(),
      farm_location: document.getElementById('profile-farm-location').value.trim(),
      farm_size: document.getElementById('profile-farm-size').value.trim() || null,
      farming_since: parseInt(document.getElementById('profile-farming-since').value) || null,
      certifications: document.getElementById('profile-certifications').value.trim() || null,
      story: document.getElementById('profile-story').value.trim() || null,
      whatsapp: document.getElementById('profile-whatsapp').value.replace(/[^0-9]/g, '') || null,
      bank_name: document.getElementById('profile-bank-name').value.trim() || null,
      bank_account_name: document.getElementById('profile-bank-account-name').value.trim() || null,
      bank_account_no: document.getElementById('profile-bank-account-no').value.trim() || null,
      delivery_fee: parseFloat(document.getElementById('profile-delivery-fee').value) || 0,
    };
    if (photoUrl) payload.photo_url = photoUrl;
    if (qrUrl) payload.bank_qr_url = qrUrl;

    const { error } = await sb.from('shared_profiles').update(payload).eq('id', currentUser.id);
    btn.disabled = false; btn.textContent = 'Save Profile';
    if (error) showToast('Save failed: ' + error.message, 'error');
    else { showToast('Profile updated!'); document.getElementById('user-name').textContent = payload.farm_name || payload.full_name; }
  }

  async function doLogout() {
    await sb.auth.signOut();
    window.location.href = '../';
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js').catch(() => {});
  }
