  const SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentUser = null;
  const rm = n => 'RM ' + (Number(n) || 0).toFixed(2);

  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '../'; return; }
    const { data: profile } = await sb.from('shared_profiles').select('*').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') { window.location.href = '../'; return; }
    currentUser = { ...session.user, ...profile };
    document.getElementById('admin-name').textContent = 'Hi, ' + (profile.full_name || session.user.email);
    try { await sb.rpc('mkt_release_abandoned_orders'); } catch (_) {}
    initAdminAccess();
  })();

/* ----- next block ----- */

  function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-500' : 'bg-green-700'}`;
    t.textContent = msg; c.appendChild(t); setTimeout(() => t.remove(), 3500);
  }
  const TABS = ['sellers','reports','orders','payments','customers','points','coupons','promotions','announcements','settings','staff'];
  const TAB_LABELS = { orders:'Orders', customers:'Customers', sellers:'Sellers & Products', reports:'Reports', points:'Points & Membership', settings:'Settings', staff:'User Access', payments:'Payments', coupons:'Coupons', promotions:'Promotions', announcements:'Announcements' };
  const MANAGEABLE_TABS = [
    ['orders','Orders'],['customers','Customers'],['sellers','Sellers & Products'],
    ['reports','Reports'],
    ['points','Points & Membership'],['settings','Settings'],['payments','Payments'],
    ['coupons','Coupons'],['promotions','Promotions'],['announcements','Announcements']
  ];
  const SUPER_ADMIN_EMAIL = 'hsimarketplace2026@gmail.com';
  let myAccess = null;                              // null => full admin
  function isFull() { return !myAccess || myAccess.level === 'admin'; }
  function switchTab(tab) {
    TABS.forEach(t => {
      document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
      document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'sellers') loadSellers();
    if (tab === 'reports') loadReports();
    if (tab === 'orders') loadAllOrders();
    if (tab === 'payments') loadAllPayments();
    if (tab === 'customers') loadCustomers();
    if (tab === 'points') loadSettings();
    if (tab === 'coupons') loadCoupons();
    if (tab === 'promotions') loadPromotions();
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'settings') loadSettings();
    if (tab === 'staff') loadStaff();
    applyPreviewLock(tab);
  }

  // Subscribe-only modules — show the page for preview but disable all
  // interaction (no saving/changing). Reuses the side-locked tab list.
  const LOCKED_TABS = ['reports','points','payments','coupons','promotions','announcements'];
  function previewBanner() {
    let b = document.getElementById('preview-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'preview-banner';
      b.className = 'mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3';
      b.innerHTML = '<svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg><div>'
        + '<p class="font-semibold text-sm">Preview only — this module requires a subscription.</p>'
        + '<p class="text-xs text-amber-700">You can view it here, but saving and changes are disabled. Contact your sales representative to unlock.</p></div>';
    }
    return b;
  }
  function applyPreviewLock(tab) {
    TABS.forEach(t => document.getElementById(`panel-${t}`)?.classList.remove('panel-locked'));
    const banner = previewBanner();
    if (LOCKED_TABS.includes(tab)) {
      const panel = document.getElementById(`panel-${tab}`);
      panel.classList.add('panel-locked');
      panel.insertBefore(banner, panel.firstChild);
    } else if (banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }
  // ---------- STAFF / USER ACCESS ----------
  async function initAdminAccess() {
    const { data } = await sb.from('mkt_admin_access').select('*').eq('user_id', currentUser.id).maybeSingle();
    myAccess = (data && data.level === 'staff') ? data : null;
    const full = isFull();
    document.getElementById('tab-staff').classList.toggle('hidden', !full);
    const allowed = full ? MANAGEABLE_TABS.map(t => t[0]) : (myAccess.tabs || []);
    MANAGEABLE_TABS.forEach(([k]) => {
      const btn = document.getElementById('tab-' + k);
      if (btn) btn.classList.toggle('hidden', !allowed.includes(k));
    });
    const first = full ? 'orders' : (allowed[0] || null);
    if (first) switchTab(first);
    else showToast('No sections have been assigned to your account. Contact the administrator.', 'warning');
  }

  async function loadStaff() {
    const { data: admins } = await sb.from('shared_profiles').select('id,full_name,email,created_at').eq('role','admin').order('created_at',{ascending:true});
    const { data: access } = await sb.from('mkt_admin_access').select('*');
    const map = {}; (access||[]).forEach(a => map[a.user_id] = a);
    const el = document.getElementById('staff-list');
    if (!admins || !admins.length) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No admins yet.</p>'; return; }
    el.innerHTML = admins.map(a => {
      const acc = map[a.id];
      const level = (acc && acc.level === 'staff') ? 'staff' : 'admin';
      const tabs = level === 'staff' ? (acc.tabs || []) : [];
      const locked = a.id === currentUser.id || (a.email||'').toLowerCase() === SUPER_ADMIN_EMAIL;
      return `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">${a.full_name || 'Unnamed'} ${a.id===currentUser.id?'<span class="text-xs text-gray-400">(you)</span>':''}</p>
          <p class="text-xs text-gray-500">${a.email}</p>
          ${level==='staff'?`<p class="text-xs text-gray-400 mt-0.5">Tabs: ${tabs.length? tabs.join(', '):'none assigned'}</p>`:''}
        </div>
        <span class="text-xs px-2 py-1 rounded-full ${level==='admin'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}">${level==='admin'?'Full admin':'Staff'}</span>
        ${locked ? '<span class="text-xs text-gray-400 px-2">protected</span>' : `<button onclick="openStaffModal('${a.id}')" class="bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full">Edit</button>`}
      </div>`;
    }).join('');
  }

  async function addStaff() {
    const email = document.getElementById('staff-email').value.trim().toLowerCase();
    const msg = document.getElementById('staff-add-msg');
    if (!email) return;
    const { data: u } = await sb.from('shared_profiles').select('id,role,email').ilike('email', email).maybeSingle();
    if (!u) { msg.className='text-xs mt-2 text-red-600'; msg.textContent='No registered user with that email. Ask them to sign up first.'; return; }
    await sb.from('shared_profiles').update({ role: 'admin' }).eq('id', u.id);
    const { error } = await sb.from('mkt_admin_access').upsert({ user_id: u.id, level: 'staff', tabs: [], updated_at: new Date().toISOString() });
    if (error) { msg.className='text-xs mt-2 text-red-600'; msg.textContent='Failed: '+error.message; return; }
    msg.className='text-xs mt-2 text-green-600'; msg.textContent='Added as staff — click Edit to choose their tabs.';
    document.getElementById('staff-email').value='';
    loadStaff();
  }

  async function openStaffModal(userId) {
    const { data: u } = await sb.from('shared_profiles').select('full_name,email').eq('id', userId).single();
    const { data: acc } = await sb.from('mkt_admin_access').select('*').eq('user_id', userId).maybeSingle();
    document.getElementById('staff-user-id').value = userId;
    document.getElementById('staff-modal-name').textContent = (u?.full_name || '') + ' · ' + (u?.email || '');
    const level = (acc && acc.level === 'staff') ? 'staff' : 'admin';
    document.querySelector(`input[name="staff-level"][value="${level}"]`).checked = true;
    const tabs = level === 'staff' ? (acc.tabs || []) : [];
    document.getElementById('staff-tabs-checks').innerHTML = MANAGEABLE_TABS.map(([k,label]) =>
      `<label class="flex items-center gap-2"><input type="checkbox" value="${k}" ${tabs.includes(k)?'checked':''} class="accent-green-600 staff-tab-cb" /> ${label}</label>`).join('');
    toggleStaffTabs();
    document.getElementById('staff-modal').classList.remove('hidden');
  }
  function toggleStaffTabs() {
    const lvl = (document.querySelector('input[name="staff-level"]:checked')||{}).value;
    document.getElementById('staff-tabs-box').classList.toggle('hidden', lvl !== 'staff');
  }
  function closeStaffModal() { document.getElementById('staff-modal').classList.add('hidden'); }
  async function saveStaffAccess() {
    const userId = document.getElementById('staff-user-id').value;
    const lvl = (document.querySelector('input[name="staff-level"]:checked')||{}).value || 'staff';
    const tabs = lvl === 'staff' ? [...document.querySelectorAll('.staff-tab-cb:checked')].map(c => c.value) : [];
    const { error } = await sb.from('mkt_admin_access').upsert({ user_id: userId, level: lvl, tabs, updated_at: new Date().toISOString() });
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Access updated'); closeStaffModal(); loadStaff();
  }
  async function removeStaff() {
    const userId = document.getElementById('staff-user-id').value;
    if (!confirm("Remove this person's admin access? They will become a normal buyer.")) return;
    await sb.from('mkt_admin_access').delete().eq('user_id', userId);
    await sb.from('shared_profiles').update({ role: 'buyer' }).eq('id', userId);
    showToast('Admin access removed'); closeStaffModal(); loadStaff();
  }

  // ---------- SELLERS ----------
  let sellersFilter = 'all';
  function setSellersFilter(f) {
    sellersFilter = f;
    ['all','pending','active','suspended'].forEach(s => {
      const btn = document.getElementById(`sf-${s}`);
      btn.classList.toggle('active', s === f);
      btn.classList.toggle('bg-white', s !== f);
      btn.classList.toggle('text-green-700', s !== f);
    });
    loadSellers();
  }
  async function loadSellers() {
    let q = sb.from('shared_profiles').select('*').eq('role','seller').order('created_at',{ascending:false});
    if (sellersFilter !== 'all') q = q.eq('status', sellersFilter);
    const { data: sellers } = await q;
    const el = document.getElementById('sellers-list');
    if (!sellers || sellers.length === 0) { el.innerHTML = `<p class="text-gray-400 text-sm text-center py-8">No ${sellersFilter==='all'?'':sellersFilter+' '}sellers.</p>`; return; }
    const ids = sellers.map(s=>s.id);
    const { data: prods } = await sb.from('mkt_products').select('*').in('seller_id', ids.length?ids:['00000000-0000-0000-0000-000000000000']).order('category',{ascending:true}).order('name',{ascending:true});
    const bySeller = {}; (prods||[]).forEach(p => { (bySeller[p.seller_id] = bySeller[p.seller_id] || []).push(p); });
    const statusBadge = st => st==='active'
      ? '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">active</span>'
      : st==='pending'
      ? '<span class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">pending</span>'
      : '<span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">suspended</span>';
    el.innerHTML = sellers.map(s => {
      const list = bySeller[s.id] || [];
      const sid = s.id;
      const name = (s.farm_name || s.full_name || 'Seller').replace(/'/g, '’');
      const tabs = [['products','🌿 Products'],['details','👤 Seller Details'],['payment','💳 Payment'],['orders','📦 Orders']];
      return `
      <div class="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        <!-- ROW (click to expand) -->
        <div class="p-3 flex items-center gap-3 cursor-pointer hover:bg-green-50/50 transition" onclick="toggleSellerRow('${sid}')">
          <div class="w-11 h-11 rounded-full bg-green-100 overflow-hidden shrink-0 flex items-center justify-center">
            ${s.photo_url ? `<img src="${s.photo_url}" alt="" class="w-full h-full object-cover" />` : '<span class="text-xl">🧑‍🌾</span>'}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm flex items-center gap-2 flex-wrap">${s.full_name || 'Unnamed'} ${statusBadge(s.status)}</p>
            <p class="text-xs text-gray-500 truncate">${s.farm_name || 'No farm name'}${s.farm_location ? ' — ' + s.farm_location : ''} · ${list.length} product${list.length===1?'':'s'}</p>
          </div>
          <div class="flex gap-2 flex-wrap items-center" onclick="event.stopPropagation()">
            ${s.status === 'pending' ? `<button onclick="updateSellerStatus('${sid}','active')" class="btn-primary text-white text-xs px-3 py-1.5 rounded-full transition">Approve</button><button onclick="updateSellerStatus('${sid}','suspended')" class="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full transition">Reject</button>` : ''}
            ${s.status === 'active' ? `<button onclick="updateSellerStatus('${sid}','suspended')" class="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full transition">Suspend</button>` : ''}
            ${s.status === 'suspended' ? `<button onclick="updateSellerStatus('${sid}','active')" class="btn-primary text-white text-xs px-3 py-1.5 rounded-full transition">Reinstate</button>` : ''}
          </div>
          <svg id="chev-${sid}" class="w-5 h-5 text-green-700 shrink-0 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </div>
        <!-- EXPAND -->
        <div id="exp-${sid}" class="hidden border-t border-green-50">
          <div class="flex gap-1 px-3 pt-3 flex-wrap">
            ${tabs.map(([k,lab],idx) => `<button onclick="sellerTab('${sid}','${k}')" id="st-${sid}-${k}" class="text-xs font-semibold px-3 py-1.5 rounded-t-lg border border-gray-100 ${idx===0?'bg-green-600 text-white':'bg-white text-green-700'}">${lab}</button>`).join('')}
          </div>
          <div class="p-4 bg-green-50/40">
            <div id="sp-${sid}-products">${renderSellerProducts(list, sid, name)}</div>
            <div id="sp-${sid}-details" class="hidden">${renderSellerDetails(s)}</div>
            <div id="sp-${sid}-payment" class="hidden">${renderSellerPayment(s)}</div>
            <div id="sp-${sid}-orders" class="hidden"><p class="text-gray-400 text-sm text-center py-4">Loading orders…</p></div>
          </div>
        </div>
      </div>`;
    }).join('');
  }
  function toggleSellerRow(id) {
    const exp = document.getElementById(`exp-${id}`);
    const chev = document.getElementById(`chev-${id}`);
    const open = exp.classList.toggle('hidden');
    if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  }
  function sellerTab(id, tab) {
    ['products','details','payment','orders'].forEach(k => {
      document.getElementById(`sp-${id}-${k}`).classList.toggle('hidden', k !== tab);
      const b = document.getElementById(`st-${id}-${k}`);
      b.classList.toggle('bg-green-600', k === tab);
      b.classList.toggle('text-white', k === tab);
      b.classList.toggle('bg-white', k !== tab);
      b.classList.toggle('text-green-700', k !== tab);
    });
    if (tab === 'orders') { const box = document.getElementById(`sp-${id}-orders`); if (!box.dataset.loaded) loadSellerOrders(id); }
  }
  function renderSellerDetails(s) {
    const rows = [
      ['Full name', s.full_name], ['Email', s.email], ['Phone', s.phone], ['WhatsApp', s.whatsapp],
      ['Farm name', s.farm_name], ['Farm location', s.farm_location], ['Farm size', s.farm_size],
      ['Farming since', s.farming_since], ['Age', s.age], ['Ethnicity', s.ethnicity],
      ['Certifications', s.certifications], ['Status', s.status],
      ['Joined', s.created_at ? new Date(s.created_at).toLocaleDateString() : '']
    ].filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '');
    return `
      <div class="flex justify-end gap-2 mb-3">
        <button onclick="openEditSeller('${s.id}')" class="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">✏️ Edit Details</button>
        <button onclick="deleteSeller('${s.id}')" class="bg-red-50 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full">🗑️ Delete Seller</button>
      </div>
      <div class="flex items-start gap-4 mb-3 flex-wrap">
        <div class="w-20 h-20 rounded-xl bg-green-100 overflow-hidden shrink-0 flex items-center justify-center">
          ${s.photo_url ? `<img src="${s.photo_url}" class="w-full h-full object-cover" />` : '<span class="text-3xl">🧑‍🌾</span>'}
        </div>
        <div class="flex-1 min-w-[220px] grid sm:grid-cols-2 gap-x-4 text-sm">
          ${rows.map(r => `<div class="flex justify-between gap-2 border-b border-green-50 py-1"><span class="text-gray-400">${r[0]}</span><span class="font-medium text-gray-800 text-right break-words">${r[1]}</span></div>`).join('')}
        </div>
      </div>
      ${s.story ? `<div class="bg-white border border-gray-100 rounded-lg p-3 text-sm text-gray-600 italic">“${s.story}”</div>` : ''}`;
  }
  function renderSellerPayment(s) {
    const editBtn = `<div class="flex justify-end mb-3"><button onclick="openEditPay('${s.id}')" class="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">✏️ Edit Payment</button></div>`;
    if (!s.bank_name && !s.bank_account_no && !s.bank_account_name && !s.bank_qr_url && !s.whatsapp)
      return editBtn + '<p class="text-xs text-amber-600">This seller has not set up payment details yet.</p>';
    return editBtn + `
      <div class="flex items-start gap-4 flex-wrap">
        ${s.bank_qr_url ? `<a href="${s.bank_qr_url}" target="_blank" class="shrink-0"><img src="${s.bank_qr_url}" class="w-32 h-32 object-contain rounded-lg border border-gray-200 bg-white" /><span class="block text-center text-xs text-green-600 mt-1">QR · tap to enlarge</span></a>` : ''}
        <div class="flex-1 min-w-[220px] text-sm">
          ${s.bank_name ? `<div class="flex justify-between border-b border-green-50 py-1"><span class="text-gray-400">Bank</span><span class="font-medium">${s.bank_name}</span></div>` : ''}
          ${s.bank_account_name ? `<div class="flex justify-between border-b border-green-50 py-1"><span class="text-gray-400">Account name</span><span class="font-medium">${s.bank_account_name}</span></div>` : ''}
          ${s.bank_account_no ? `<div class="flex justify-between border-b border-green-50 py-1"><span class="text-gray-400">Account no.</span><span class="font-mono font-semibold select-all">${s.bank_account_no}</span></div>` : ''}
          ${s.whatsapp ? `<div class="flex justify-between border-b border-green-50 py-1"><span class="text-gray-400">WhatsApp</span><span class="font-medium">${s.whatsapp}</span></div>` : ''}
        </div>
      </div>`;
  }
  async function loadSellerOrders(id) {
    const box = document.getElementById(`sp-${id}-orders`);
    box.dataset.loaded = '1';
    box.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Loading orders…</p>';
    const { data: orders } = await sb.from('mkt_orders')
      .select('*, buyer:shared_profiles!buyer_id(full_name,email), order_items:mkt_order_items(*, products:mkt_products(name,unit))')
      .eq('seller_id', id).order('created_at', { ascending: false });
    if (!orders || !orders.length) { box.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No orders for this seller yet.</p>'; return; }
    box.innerHTML = orders.map(o => `
      <div class="bg-white rounded-lg border border-gray-100 p-3 mb-2">
        <div class="cursor-pointer" onclick="openOrderDetail('${o.id}')">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="min-w-0">
              <p class="text-sm font-semibold">${o.buyer?.full_name || 'Buyer'} <span class="text-xs text-gray-400 font-normal">${o.order_number ? '· ' + o.order_number : ''}</span></p>
              <p class="text-xs text-gray-400">${new Date(o.created_at).toLocaleString()}</p>
            </div>
            <span class="text-xs font-semibold px-2 py-1 rounded-full status-${o.status}">${o.status.replace(/_/g,' ').toUpperCase()}</span>
          </div>
          <div class="mt-2 space-y-0.5">
            ${(o.order_items || []).map(i => `<div class="flex justify-between text-xs text-gray-600"><span>${i.product_name || i.products?.name} × ${i.quantity} ${i.products?.unit || ''}</span><span>${rm(i.quantity * i.unit_price)}</span></div>`).join('')}
          </div>
        </div>
        <div class="flex items-center justify-between border-t border-green-50 mt-2 pt-2 gap-2 flex-wrap">
          <span class="font-bold text-green-700 text-sm">${rm(o.total_amount)}</span>
          <div class="flex items-center gap-2">
            <button onclick="openOrderDetail('${o.id}')" class="text-green-700 text-xs font-semibold hover:underline">View</button>
            <select onchange="setOrderStatus('${o.id}','${id}',this.value)" class="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white">
              ${['pending','payment_uploaded','payment_verified','processing','completed','cancelled'].map(st=>`<option value="${st}" ${o.status===st?'selected':''}>${st.replace(/_/g,' ')}</option>`).join('')}
            </select>
            <button onclick="deleteSellerOrder('${o.id}','${id}')" title="Delete" class="bg-red-50 text-red-600 text-xs px-2 py-1 rounded-full transition">🗑️</button>
          </div>
        </div>
      </div>`).join('');
  }
  function reloadSellerOrders(sellerId) {
    const box = document.getElementById(`sp-${sellerId}-orders`); if (box) box.dataset.loaded = '';
    loadSellerOrders(sellerId);
  }
  async function setOrderStatus(orderId, sellerId, status) {
    const { error } = await sb.from('mkt_orders').update({ status }).eq('id', orderId);
    if (error) { showToast('Update failed: '+error.message, 'error'); return; }
    showToast('Order status updated'); reloadSellerOrders(sellerId);
  }
  async function deleteSellerOrder(orderId, sellerId) {
    if (!confirm('Delete this order permanently? This cannot be undone.')) return;
    const { error } = await sb.from('mkt_orders').delete().eq('id', orderId);
    if (error) { showToast('Delete failed: '+error.message, 'error'); return; }
    showToast('Order deleted', 'warning'); reloadSellerOrders(sellerId);
  }
  // ---- Order detail (shared modal) ----
  function closeOrderDetail() { document.getElementById('orderdetail-modal').classList.add('hidden'); }
  async function openOrderDetail(orderId) {
    document.getElementById('od-body').innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading…</p>';
    document.getElementById('orderdetail-modal').classList.remove('hidden');
    const { data: o } = await sb.from('mkt_orders')
      .select('*, buyer:shared_profiles!buyer_id(full_name,email,phone), seller:shared_profiles!seller_id(full_name,farm_name), order_items:mkt_order_items(*, products:mkt_products(name,unit))')
      .eq('id', orderId).single();
    if (!o) { document.getElementById('od-body').innerHTML = '<p class="text-red-500 text-sm text-center py-8">Order not found.</p>'; return; }
    document.getElementById('od-body').innerHTML = orderDetailHTML(o);
  }
  function orderDetailHTML(o) {
    const items = o.order_items || [];
    const rows = items.map(i => `
      <tr class="border-b border-green-50">
        <td class="py-2 pr-2">${i.product_name || i.products?.name || 'Item'}</td>
        <td class="py-2 px-2 text-center whitespace-nowrap">${i.quantity} ${i.products?.unit || ''}</td>
        <td class="py-2 px-2 text-right whitespace-nowrap">${rm(i.unit_price)}</td>
        <td class="py-2 pl-2 text-right font-semibold whitespace-nowrap">${rm(i.quantity * i.unit_price)}</td>
      </tr>`).join('');
    const b = o.buyer || {}, s = o.seller || {};
    return `
      <h3 class="text-lg font-bold text-brand-bluedark mb-1">Order Details</h3>
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
        <thead><tr class="text-xs text-gray-400 border-b border-gray-100"><th class="text-left py-1 pr-2 font-medium">Product</th><th class="py-1 px-2 font-medium">Qty</th><th class="text-right py-1 px-2 font-medium">Unit price</th><th class="text-right py-1 pl-2 font-medium">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="border-t border-gray-100 pt-3 space-y-1 text-sm">
        ${o.subtotal ? `<div class="flex justify-between text-gray-500"><span>Subtotal</span><span>${rm(o.subtotal)}</span></div>` : ''}
        ${o.discount_amount > 0 ? `<div class="flex justify-between text-green-600"><span>Discount${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}</span><span>- ${rm(o.discount_amount)}</span></div>` : ''}
        ${o.points_discount_rm > 0 ? `<div class="flex justify-between text-green-600"><span>Points redeemed</span><span>- ${rm(o.points_discount_rm)}</span></div>` : ''}
        <div class="flex justify-between font-bold text-green-800 text-base"><span>Total</span><span>${rm(o.total_amount)}</span></div>
      </div>
      ${o.payment_method ? `<p class="text-xs text-gray-500 mt-3">Payment method: ${o.payment_method}</p>` : ''}
      ${o.delivery_notes ? `<p class="text-xs text-gray-500 mt-1">Notes: ${o.delivery_notes}</p>` : ''}`;
  }
  function renderSellerProducts(list, sid, name) {
    const addBtn = (sid != null) ? `<div class="flex justify-end mb-3"><button onclick="openAddProduct('${sid}','${name||''}')" class="bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition">+ Add Product</button></div>` : '';
    if (!list.length) return addBtn + '<p class="text-xs text-gray-400 italic">No products listed yet.</p>';
    const cats = ['Vegetables','Fruits','Herbs','Other'];
    const groups = {}; list.forEach(p => { (groups[p.category] = groups[p.category] || []).push(p); });
    return addBtn + cats.filter(c => groups[c]).map(c => `
      <div class="mb-3 last:mb-0">
        <p class="text-xs font-bold text-green-800 uppercase tracking-wide mb-1.5">${c} <span class="text-gray-400 font-normal">(${groups[c].length})</span></p>
        <div class="grid sm:grid-cols-2 gap-2">
          ${groups[c].map(p => `
            <div class="flex items-center gap-2 bg-white rounded-lg border border-gray-100 p-2">
              ${p.image_url ? `<img src="${p.image_url}" class="w-10 h-10 rounded object-cover flex-shrink-0" onerror="this.style.display='none'" />` : '<div class="w-10 h-10 rounded bg-green-100 flex items-center justify-center text-sm flex-shrink-0">🥬</div>'}
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold truncate">${p.name}</p>
                <p class="text-[11px] text-gray-500">${rm(p.price)}/${p.unit} · ${p.quantity} ${p.unit}${p.status==='inactive' ? ' · <span class="text-red-500 font-semibold">Unpublished</span>' : '<span class="text-green-600"> · Published</span>'}</p>
              </div>
              <button onclick="openEditProduct('${p.id}')" title="Edit" class="text-green-600 hover:bg-green-50 rounded p-1 shrink-0">✏️</button>
              <button onclick="deleteProduct('${p.id}')" title="Delete" class="text-red-500 hover:bg-red-50 rounded p-1 shrink-0">🗑️</button>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }
  async function updateSellerStatus(id, status) {
    const { error } = await sb.from('shared_profiles').update({ status }).eq('id', id);
    if (error) { showToast('Update failed', 'error'); return; }
    showToast(`Seller ${status}`); loadSellers();
  }
  async function openEditSeller(id) {
    const { data: s } = await sb.from('shared_profiles').select('*').eq('id', id).single();
    if (!s) { showToast('Seller not found', 'error'); return; }
    const set = (k,v) => document.getElementById(k).value = (v ?? '');
    set('es-id', s.id); set('es-name', s.full_name); set('es-email', s.email); set('es-phone', s.phone);
    document.getElementById('es-status').value = s.status || 'active';
    set('es-farm', s.farm_name); set('es-loc', s.farm_location); set('es-size', s.farm_size);
    set('es-since', s.farming_since); set('es-age', s.age); set('es-ethnicity', s.ethnicity);
    set('es-cert', s.certifications); set('es-story', s.story);
    document.getElementById('es-msg').textContent = '';
    openAdd('editseller');
  }
  async function saveSellerDetails(e) {
    e.preventDefault();
    const msg = document.getElementById('es-msg');
    const num = id => { const v = document.getElementById(id).value.trim(); return v === '' ? null : (parseInt(v) || null); };
    const payload = {
      full_name: document.getElementById('es-name').value.trim() || null,
      email: document.getElementById('es-email').value.trim() || null,
      phone: document.getElementById('es-phone').value.trim() || null,
      status: document.getElementById('es-status').value,
      farm_name: document.getElementById('es-farm').value.trim() || null,
      farm_location: document.getElementById('es-loc').value.trim() || null,
      farm_size: document.getElementById('es-size').value.trim() || null,
      farming_since: num('es-since'), age: num('es-age'),
      ethnicity: document.getElementById('es-ethnicity').value.trim() || null,
      certifications: document.getElementById('es-cert').value.trim() || null,
      story: document.getElementById('es-story').value.trim() || null
    };
    const { error } = await sb.from('shared_profiles').update(payload).eq('id', document.getElementById('es-id').value);
    if (error) { msg.className='text-xs text-red-600'; msg.textContent='Failed: '+error.message; return; }
    showToast('Seller details updated'); closeAdd('editseller'); loadSellers();
  }
  async function deleteSeller(id) {
    if (!confirm('Delete this seller and ALL their products? Sellers with existing orders cannot be deleted (suspend them instead). This cannot be undone.')) return;
    const { error } = await sb.from('shared_profiles').delete().eq('id', id);
    if (error) {
      const fk = /foreign key|violates/i.test(error.message);
      showToast(fk ? 'Cannot delete: this seller has order history. Suspend them instead.' : 'Delete failed: '+error.message, 'error');
      return;
    }
    showToast('Seller deleted', 'warning'); loadSellers();
  }
  // ---- Edit payment (per seller) ----
  function renderEpQr(url) {
    document.getElementById('ep-qr-preview').innerHTML = url
      ? `<img src="${url}" class="h-24 rounded-lg border border-gray-100 object-contain bg-white" />`
      : '<p class="text-xs text-gray-400">No QR uploaded.</p>';
  }
  async function openEditPay(id) {
    const { data: s } = await sb.from('shared_profiles').select('*').eq('id', id).single();
    if (!s) { showToast('Seller not found', 'error'); return; }
    document.getElementById('ep-id').value = s.id;
    document.getElementById('ep-bank-name').value = s.bank_name || '';
    document.getElementById('ep-bank-acc-name').value = s.bank_account_name || '';
    document.getElementById('ep-bank-acc-no').value = s.bank_account_no || '';
    document.getElementById('ep-whatsapp').value = s.whatsapp || '';
    document.getElementById('ep-qr-url').value = s.bank_qr_url || '';
    document.getElementById('ep-qr-file').value = '';
    renderEpQr(s.bank_qr_url || '');
    document.getElementById('ep-msg').textContent = '';
    openAdd('editpay');
  }
  async function uploadSellerQr(e) {
    const file = e.target.files[0]; if (!file) return;
    const sellerId = document.getElementById('ep-id').value;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${sellerId}/qr-${Date.now()}.${ext}`;
    showToast('Uploading QR…');
    const { error: upErr } = await sb.storage.from('farmer-photos').upload(path, file, { upsert: true });
    if (upErr) { showToast('Upload failed: '+upErr.message, 'error'); return; }
    const { data: { publicUrl } } = sb.storage.from('farmer-photos').getPublicUrl(path);
    document.getElementById('ep-qr-url').value = publicUrl;
    renderEpQr(publicUrl);
    showToast('QR uploaded — remember to Save');
  }
  async function savePay(e) {
    e.preventDefault();
    const msg = document.getElementById('ep-msg');
    const payload = {
      bank_name: document.getElementById('ep-bank-name').value.trim() || null,
      bank_account_name: document.getElementById('ep-bank-acc-name').value.trim() || null,
      bank_account_no: document.getElementById('ep-bank-acc-no').value.trim() || null,
      whatsapp: document.getElementById('ep-whatsapp').value.replace(/[^0-9]/g,'') || null,
      bank_qr_url: document.getElementById('ep-qr-url').value.trim() || null
    };
    const { error } = await sb.from('shared_profiles').update(payload).eq('id', document.getElementById('ep-id').value);
    if (error) { msg.className='text-xs text-red-600'; msg.textContent='Failed: '+error.message; return; }
    showToast('Payment details updated'); closeAdd('editpay'); loadSellers();
  }

  // ---------- REPORTS ----------
  let reportOrders = [];
  const PAID_STATUSES = ['payment_verified','processing','completed'];

  function setReportRange(days) {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - days + 1);
    document.getElementById('rep-to').value = to.toISOString().slice(0,10);
    document.getElementById('rep-from').value = from.toISOString().slice(0,10);
    loadReports();
  }

  async function loadReports() {
    const fromEl = document.getElementById('rep-from'), toEl = document.getElementById('rep-to');
    if (!fromEl.value || !toEl.value) {  // default to last 30 days
      const to = new Date(), from = new Date(); from.setDate(from.getDate() - 29);
      toEl.value = to.toISOString().slice(0,10);
      fromEl.value = from.toISOString().slice(0,10);
    }
    const fromISO = new Date(fromEl.value + 'T00:00:00').toISOString();
    const toISO   = new Date(toEl.value   + 'T23:59:59.999').toISOString();
    document.getElementById('rep-kpis').innerHTML = '<p class="col-span-full text-gray-400 text-sm text-center py-6">Loading report…</p>';

    const { data: orders } = await sb.from('mkt_orders')
      .select('id,order_number,total_amount,status,created_at, buyer:shared_profiles!buyer_id(full_name,email), seller:shared_profiles!seller_id(full_name,farm_name)')
      .gte('created_at', fromISO).lte('created_at', toISO)
      .order('created_at', { ascending: false });
    reportOrders = orders || [];

    const [{ count: custCount }, { count: sellerCount }, { count: prodCount }] = await Promise.all([
      sb.from('shared_profiles').select('id', { count: 'exact', head: true }).eq('role','buyer'),
      sb.from('shared_profiles').select('id', { count: 'exact', head: true }).eq('role','seller').eq('status','active'),
      sb.from('mkt_products').select('id', { count: 'exact', head: true })
    ]);

    const paid = reportOrders.filter(o => PAID_STATUSES.includes(o.status));
    const revenue = paid.reduce((s,o) => s + Number(o.total_amount||0), 0);
    const aov = paid.length ? revenue / paid.length : 0;
    const pendingRev = reportOrders.filter(o => ['pending','payment_uploaded'].includes(o.status))
      .reduce((s,o) => s + Number(o.total_amount||0), 0);

    renderKpis({ revenue, paidCount: paid.length, totalCount: reportOrders.length, aov, pendingRev, custCount, sellerCount, prodCount });
    renderStatusBreakdown(reportOrders);
    renderTopSellers(paid);
    await renderTopProducts(paid.map(o => o.id));
  }

  function kpiCard(label, val, sub) {
    return `<div class="bg-white rounded-xl p-4 shadow border border-gray-100">
      <p class="text-xs text-gray-500">${label}</p>
      <p class="text-xl font-bold text-brand-bluedark mt-1">${val}</p>
      ${sub ? `<p class="text-xs text-gray-400 mt-0.5">${sub}</p>` : ''}</div>`;
  }
  function renderKpis(k) {
    document.getElementById('rep-kpis').innerHTML = [
      kpiCard('Total Sales', rm(k.revenue), `${k.paidCount} paid order(s)`),
      kpiCard('Avg Order Value', rm(k.aov), 'paid orders'),
      kpiCard('Orders', k.totalCount, `${rm(k.pendingRev)} awaiting payment`),
      kpiCard('Active Sellers', k.sellerCount ?? '—', `${k.prodCount ?? 0} products listed`),
      kpiCard('Customers', k.custCount ?? '—', 'registered buyers')
    ].join('');
  }
  function renderStatusBreakdown(orders) {
    const statuses = ['pending','payment_uploaded','payment_verified','processing','completed','cancelled'];
    const agg = {}; statuses.forEach(s => agg[s] = { c:0, amt:0 });
    orders.forEach(o => { (agg[o.status] = agg[o.status] || { c:0, amt:0 }); agg[o.status].c++; agg[o.status].amt += Number(o.total_amount||0); });
    const total = orders.length || 1;
    document.getElementById('rep-status').innerHTML = statuses.map(s => {
      const a = agg[s], pct = Math.round(a.c / total * 100);
      return `<div class="mb-2">
        <div class="flex justify-between text-xs mb-0.5"><span class="font-medium">${s.replace(/_/g,' ')}</span><span class="text-gray-500">${a.c} · ${rm(a.amt)}</span></div>
        <div class="h-2 bg-green-50 rounded-full overflow-hidden"><div class="h-full bg-green-500" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }
  function renderTopSellers(paid) {
    const agg = {};
    paid.forEach(o => { const n = o.seller?.farm_name || o.seller?.full_name || 'Unknown'; (agg[n] = agg[n] || { amt:0, c:0 }); agg[n].amt += Number(o.total_amount||0); agg[n].c++; });
    const rows = Object.entries(agg).sort((a,b) => b[1].amt - a[1].amt).slice(0,8);
    const el = document.getElementById('rep-sellers');
    if (!rows.length) { el.innerHTML = '<p class="text-gray-400 text-sm">No sales in this range.</p>'; return; }
    el.innerHTML = `<table class="w-full text-sm"><tbody>${rows.map(([n,v],i) =>
      `<tr class="border-b border-green-50"><td class="py-1.5 pr-2 text-gray-400">${i+1}</td><td class="py-1.5">${n}</td><td class="py-1.5 text-right text-gray-500">${v.c}</td><td class="py-1.5 text-right font-semibold text-green-700">${rm(v.amt)}</td></tr>`
    ).join('')}</tbody></table>`;
  }
  async function renderTopProducts(paidOrderIds) {
    const el = document.getElementById('rep-products');
    if (!paidOrderIds.length) { el.innerHTML = '<p class="text-gray-400 text-sm">No sales in this range.</p>'; return; }
    let items = [];
    for (let i = 0; i < paidOrderIds.length; i += 100) {
      const { data } = await sb.from('mkt_order_items')
        .select('quantity,unit_price,product:mkt_products(name,unit)')
        .in('order_id', paidOrderIds.slice(i, i+100));
      items = items.concat(data || []);
    }
    const agg = {};
    items.forEach(it => { const n = it.product?.name || 'Unknown'; (agg[n] = agg[n] || { qty:0, amt:0, unit: it.product?.unit || '' }); agg[n].qty += Number(it.quantity||0); agg[n].amt += Number(it.quantity||0) * Number(it.unit_price||0); });
    const rows = Object.entries(agg).sort((a,b) => b[1].qty - a[1].qty).slice(0,10);
    if (!rows.length) { el.innerHTML = '<p class="text-gray-400 text-sm">No items sold in this range.</p>'; return; }
    el.innerHTML = `<table class="w-full text-sm">
      <thead><tr class="text-xs text-gray-400 text-left"><th class="py-1 pr-2">#</th><th>Product</th><th class="text-right">Qty sold</th><th class="text-right">Revenue</th></tr></thead>
      <tbody>${rows.map(([n,v],i) =>
        `<tr class="border-b border-green-50"><td class="py-1.5 pr-2 text-gray-400">${i+1}</td><td class="py-1.5">${n}</td><td class="py-1.5 text-right text-gray-500">${v.qty} ${v.unit}</td><td class="py-1.5 text-right font-semibold text-green-700">${rm(v.amt)}</td></tr>`
      ).join('')}</tbody></table>`;
  }
  function exportReportCSV() {
    if (!reportOrders.length) { showToast('Nothing to export for this range', 'warning'); return; }
    const headers = ['Order #','Date','Buyer','Seller','Status','Total (RM)'];
    const rows = reportOrders.map(o => [
      o.order_number || o.id.slice(0,8),
      new Date(o.created_at).toLocaleString(),
      o.buyer?.full_name || o.buyer?.email || '',
      o.seller?.farm_name || o.seller?.full_name || '',
      o.status,
      Number(o.total_amount||0).toFixed(2)
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hsi-report-${document.getElementById('rep-from').value}_to_${document.getElementById('rep-to').value}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ---------- ORDERS ----------
  let ordersFilter = 'all';
  function setOrdersFilter(f) {
    ordersFilter = f;
    ['all','pending','completed'].forEach(s => {
      const btn = document.getElementById(`of-${s}`);
      btn.classList.toggle('active', s === f);
      btn.classList.toggle('bg-white', s !== f);
      btn.classList.toggle('text-green-700', s !== f);
    });
    loadAllOrders();
  }
  async function loadAllOrders() {
    let q = sb.from('mkt_orders').select('*, buyer:shared_profiles!buyer_id(full_name,email), seller:shared_profiles!seller_id(full_name,farm_name)').order('created_at',{ascending:false});
    if (ordersFilter !== 'all') q = q.eq('status', ordersFilter);
    const { data: orders } = await q;
    const el = document.getElementById('orders-list');
    if (!orders || orders.length === 0) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No orders.</p>'; return; }
    el.innerHTML = orders.map(o => `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">${o.buyer?.full_name || 'Buyer'} → ${o.seller?.farm_name || o.seller?.full_name || 'Seller'}</p>
          <p class="text-xs text-gray-400">${o.order_number? o.order_number+' · ':''}${new Date(o.created_at).toLocaleString()}</p>
          <p class="text-green-700 font-bold text-sm">${rm(o.total_amount)}</p>
        </div>
        <span class="text-xs font-semibold px-2 py-1 rounded-full status-${o.status}">${o.status.replace(/_/g,' ').toUpperCase()}</span>
        ${!['completed','cancelled'].includes(o.status) ? `<button onclick="cancelOrder('${o.id}')" class="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full transition">Cancel</button>` : ''}
      </div>`).join('');
  }
  async function cancelOrder(id) {
    if (!confirm('Cancel this order?')) return;
    await sb.from('mkt_orders').update({ status: 'cancelled' }).eq('id', id);
    showToast('Order cancelled', 'warning'); loadAllOrders();
  }

  // ---------- PAYMENTS ----------
  async function loadAllPayments() {
    const { data: payments } = await sb.from('mkt_payments').select('*, orders:mkt_orders(total_amount,status,order_number), profiles:shared_profiles!buyer_id(full_name,email)').order('created_at',{ascending:false});
    const el = document.getElementById('payments-list');
    if (!payments || payments.length === 0) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No payments.</p>'; return; }
    const sorted = [...payments].sort((a,b) => (a.status==='pending'?-1:1));
    el.innerHTML = sorted.map(p => `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100">
        <div class="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <p class="font-semibold text-sm">${p.profiles?.full_name || 'Buyer'} — ${p.method}</p>
            <p class="text-xs text-gray-400">${p.orders?.order_number? p.orders.order_number+' · ':''}${new Date(p.created_at).toLocaleString()}</p>
            <p class="text-xs text-gray-500">Order: ${rm(p.orders?.total_amount || 0)}</p>
          </div>
          <span class="text-xs font-semibold px-2 py-1 rounded-full ${p.status==='verified'?'bg-green-100 text-green-700':p.status==='rejected'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}">${p.status.toUpperCase()}</span>
        </div>
        ${p.proof_url ? `<a href="${p.proof_url}" target="_blank" class="block mb-3"><img src="${p.proof_url}" class="h-28 rounded-lg object-cover border border-gray-100" /></a>` : '<p class="text-xs text-gray-400 mb-3">No proof uploaded</p>'}
        ${p.status === 'pending' ? `<div class="flex gap-2"><button onclick="verifyPayment('${p.id}','${p.order_id}')" class="btn-primary text-white text-xs px-4 py-1.5 rounded-full transition">Verify</button><button onclick="rejectPayment('${p.id}','${p.order_id}')" class="bg-red-50 text-red-600 text-xs px-4 py-1.5 rounded-full transition">Reject</button></div>` : ''}
      </div>`).join('');
  }
  async function verifyPayment(paymentId, orderId) {
    await sb.from('mkt_payments').update({ status: 'verified' }).eq('id', paymentId);
    const { data: ord } = await sb.from('mkt_orders').select('total_amount').eq('id', orderId).single();
    await sb.from('mkt_orders').update({ status: 'payment_verified', amount_paid: ord?ord.total_amount:undefined, amount_paid_at: new Date().toISOString() }).eq('id', orderId);
    try { await sb.rpc('mkt_award_order_points', { p_order_id: orderId }); } catch (_) {}
    showToast('Payment verified — points awarded!'); loadAllPayments();
  }
  async function rejectPayment(paymentId, orderId) {
    const notes = prompt('Rejection reason (optional):');
    await sb.from('mkt_payments').update({ status: 'rejected', admin_notes: notes || null }).eq('id', paymentId);
    await sb.from('mkt_orders').update({ status: 'pending' }).eq('id', orderId);
    showToast('Payment rejected', 'warning'); loadAllPayments();
  }

  // ---------- CUSTOMERS ----------
  let allCustomers = [];
  async function loadCustomers() {
    const { data: buyers } = await sb.from('shared_profiles').select('*').eq('role','buyer').order('created_at',{ascending:false});
    allCustomers = buyers || [];
    renderCustomers();
  }
  function renderCustomers() {
    const s = (document.getElementById('cust-search').value||'').toLowerCase();
    const list = allCustomers.filter(c => !s || (c.full_name||'').toLowerCase().includes(s) || (c.email||'').toLowerCase().includes(s) || (c.phone||'').toLowerCase().includes(s));
    const el = document.getElementById('customers-list');
    if (!list.length) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No customers.</p>'; return; }
    el.innerHTML = list.map(c => `
      <button onclick="openCustomerModal('${c.id}')" class="w-full text-left bg-white rounded-xl p-4 shadow border border-gray-100 hover:border-green-300 transition flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-lg shrink-0">👤</div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">${c.full_name || 'Unnamed'}</p>
          <p class="text-xs text-gray-500">${c.email || ''}${c.phone ? ' · '+c.phone : ''}</p>
          <p class="text-xs text-gray-400">Joined ${c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}</p>
        </div>
        <span class="text-green-600 text-sm shrink-0">View →</span>
      </button>`).join('');
  }
  async function openCustomerModal(userId) {
    const c = allCustomers.find(x => x.id === userId) || {};
    document.getElementById('cm-name').textContent = c.full_name || 'Unnamed';
    document.getElementById('cm-contact').textContent = [c.email, c.phone].filter(Boolean).join(' · ');
    document.getElementById('cm-joined').textContent = c.created_at ? 'Customer since ' + new Date(c.created_at).toLocaleDateString() : '';
    document.getElementById('cm-stats').innerHTML = '';
    document.getElementById('cm-orders').innerHTML = '<p class="text-gray-400 text-sm text-center py-6">Loading orders…</p>';
    document.getElementById('customer-modal').classList.remove('hidden');
    const { data: orders } = await sb.from('mkt_orders')
      .select('*, seller:shared_profiles!seller_id(full_name,farm_name), order_items:mkt_order_items(product_name,quantity,unit_price)')
      .eq('buyer_id', userId).order('created_at',{ascending:false});
    const list = orders || [];
    const spent = list.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+parseFloat(o.total_amount||0),0);
    const completed = list.filter(o=>o.status==='completed').length;
    document.getElementById('cm-stats').innerHTML = `
      <div class="grid grid-cols-3 gap-2 text-center mb-4">
        <div class="bg-green-50 rounded-lg p-3"><p class="text-lg font-bold text-green-700">${list.length}</p><p class="text-xs text-gray-500">Orders</p></div>
        <div class="bg-green-50 rounded-lg p-3"><p class="text-lg font-bold text-green-700">${completed}</p><p class="text-xs text-gray-500">Completed</p></div>
        <div class="bg-green-50 rounded-lg p-3"><p class="text-base font-bold text-green-700">${rm(spent)}</p><p class="text-xs text-gray-500">Total spent</p></div>
      </div>`;
    document.getElementById('cm-orders').innerHTML = list.length ? list.map(o => `
      <div class="border border-gray-100 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1 gap-2">
          <p class="text-sm font-semibold">${o.order_number || o.id.slice(0,8)} <span class="text-xs text-gray-400 font-normal">· ${new Date(o.created_at).toLocaleDateString()}</span></p>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full status-${o.status}">${o.status.replace(/_/g,' ').toUpperCase()}</span>
        </div>
        <p class="text-xs text-gray-500 mb-1">${o.seller?.farm_name || o.seller?.full_name || 'Seller'}</p>
        <div class="text-xs text-gray-600 space-y-0.5">
          ${(o.order_items||[]).map(i=>`<div class="flex justify-between"><span>${i.product_name||'Item'} × ${i.quantity}</span><span>${rm(i.quantity*i.unit_price)}</span></div>`).join('')}
        </div>
        <div class="flex justify-between border-t border-green-50 mt-1 pt-1 text-sm font-bold text-green-700"><span>Total</span><span>${rm(o.total_amount)}</span></div>
      </div>`).join('') : '<p class="text-gray-400 text-sm text-center py-6">No orders yet.</p>';
  }
  function closeCustomerModal(){ document.getElementById('customer-modal').classList.add('hidden'); }

  // ---------- COUPONS ----------
  async function loadCoupons() {
    const { data } = await sb.from('mkt_coupons').select('*').order('created_at',{ascending:false});
    const el = document.getElementById('coupons-list');
    if (!data || !data.length) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No coupons yet.</p>'; return; }
    const today = new Date().toISOString().slice(0,10);
    el.innerHTML = data.map(c => {
      let status = 'active';
      if (!c.is_active) status='inactive';
      else if (c.expiry_date && c.expiry_date < today) status='expired';
      else if (c.start_date && c.start_date > today) status='scheduled';
      else if (c.usage_limit>0 && c.usage_count>=c.usage_limit) status='exhausted';
      return `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm"><code class="bg-green-50 text-green-700 px-2 py-0.5 rounded">${c.code}</code> <span class="text-gray-500 font-normal">${c.name||''}</span></p>
          <p class="text-xs text-gray-500">${c.discount_type==='percentage'? c.discount_value+'% off':rm(c.discount_value)+' off'} · used ${c.usage_count}${c.usage_limit>0?'/'+c.usage_limit:''}${c.min_order_value>0?' · min '+rm(c.min_order_value):''}${c.expiry_date?' · exp '+c.expiry_date:''}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full ${status==='active'?'bg-green-100 text-green-700':status==='expired'||status==='exhausted'?'bg-red-100 text-red-600':'bg-gray-100 text-gray-500'}">${status}</span>
        <button onclick="editCoupon('${c.id}')" class="bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full">Edit</button>
        <button onclick="toggleCoupon('${c.id}', ${c.is_active})" class="bg-amber-50 text-amber-700 text-xs px-3 py-1.5 rounded-full">${c.is_active?'Disable':'Enable'}</button>
        <button onclick="deleteCoupon('${c.id}')" class="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full">Delete</button>
      </div>`;
    }).join('');
  }
  function randomCode() {
    const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='HSI';
    for (let i=0;i<5;i++) s+=a[Math.floor(Math.random()*a.length)];
    document.getElementById('coupon-code').value = s;
  }
  function openCouponModal() {
    document.getElementById('coupon-modal-title').textContent='New Coupon';
    ['coupon-id','coupon-code','coupon-name','coupon-value','coupon-min','coupon-max','coupon-usage','coupon-percustomer','coupon-start','coupon-expiry'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('coupon-type').value='percentage';
    document.getElementById('coupon-active').checked=true;
    document.getElementById('coupon-first').checked=false;
    document.getElementById('coupon-modal').classList.remove('hidden');
  }
  function closeCouponModal(){ document.getElementById('coupon-modal').classList.add('hidden'); }
  async function editCoupon(id) {
    const { data: c } = await sb.from('mkt_coupons').select('*').eq('id',id).single(); if(!c) return;
    document.getElementById('coupon-modal-title').textContent='Edit Coupon';
    document.getElementById('coupon-id').value=c.id;
    document.getElementById('coupon-code').value=c.code;
    document.getElementById('coupon-name').value=c.name||'';
    document.getElementById('coupon-type').value=c.discount_type;
    document.getElementById('coupon-value').value=c.discount_value;
    document.getElementById('coupon-min').value=c.min_order_value||'';
    document.getElementById('coupon-max').value=c.max_discount||'';
    document.getElementById('coupon-usage').value=c.usage_limit||'';
    document.getElementById('coupon-percustomer').value=c.per_customer_limit||'';
    document.getElementById('coupon-start').value=c.start_date||'';
    document.getElementById('coupon-expiry').value=c.expiry_date||'';
    document.getElementById('coupon-active').checked=c.is_active;
    document.getElementById('coupon-first').checked=c.first_order_only;
    document.getElementById('coupon-modal').classList.remove('hidden');
  }
  async function saveCoupon(e) {
    e.preventDefault();
    const id = document.getElementById('coupon-id').value;
    const payload = {
      code: document.getElementById('coupon-code').value.trim().toUpperCase(),
      name: document.getElementById('coupon-name').value.trim() || null,
      discount_type: document.getElementById('coupon-type').value,
      discount_value: parseFloat(document.getElementById('coupon-value').value)||0,
      min_order_value: parseFloat(document.getElementById('coupon-min').value)||0,
      max_discount: parseFloat(document.getElementById('coupon-max').value)||null,
      usage_limit: parseInt(document.getElementById('coupon-usage').value)||0,
      per_customer_limit: parseInt(document.getElementById('coupon-percustomer').value)||0,
      start_date: document.getElementById('coupon-start').value || null,
      expiry_date: document.getElementById('coupon-expiry').value || null,
      is_active: document.getElementById('coupon-active').checked,
      first_order_only: document.getElementById('coupon-first').checked
    };
    let error;
    if (id) ({error} = await sb.from('mkt_coupons').update(payload).eq('id',id));
    else ({error} = await sb.from('mkt_coupons').insert(payload));
    if (error) { showToast('Save failed: '+error.message,'error'); return; }
    showToast('Coupon saved'); closeCouponModal(); loadCoupons();
  }
  async function toggleCoupon(id, active){ await sb.from('mkt_coupons').update({is_active:!active}).eq('id',id); loadCoupons(); }
  async function deleteCoupon(id){ if(!confirm('Delete coupon?'))return; await sb.from('mkt_coupons').delete().eq('id',id); loadCoupons(); }

  // ---------- PROMOTIONS ----------
  async function loadPromotions() {
    const { data } = await sb.from('mkt_promotions').select('*').order('priority',{ascending:false});
    const el = document.getElementById('promotions-list');
    if (!data || !data.length) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No promotions yet.</p>'; return; }
    el.innerHTML = data.map(p => `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm">${p.banner_emoji||'🏷️'} ${p.title}</p>
          <p class="text-xs text-gray-500">${p.discount_type==='percentage'? p.discount_value+'% off':rm(p.discount_value)+' off'} · ${p.target==='category'? (p.target_categories||[]).join(', '):'all products'}${p.end_date?' · ends '+p.end_date:''}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full ${p.status==='live'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}">${p.status}</span>
        <button onclick="editPromo('${p.id}')" class="bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full">Edit</button>
        <button onclick="deletePromo('${p.id}')" class="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full">Delete</button>
      </div>`).join('');
  }
  function togglePromoCat(){ document.getElementById('promo-category').classList.toggle('hidden', document.getElementById('promo-target').value!=='category'); }
  function openPromoModal() {
    document.getElementById('promo-modal-title').textContent='New Promotion';
    ['promo-id','promo-title','promo-banner','promo-value','promo-maxdisc','promo-start','promo-end','promo-priority'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('promo-type').value='percentage';
    document.getElementById('promo-target').value='all';
    document.getElementById('promo-status').value='live';
    togglePromoCat();
    document.getElementById('promo-modal').classList.remove('hidden');
  }
  function closePromoModal(){ document.getElementById('promo-modal').classList.add('hidden'); }
  async function editPromo(id) {
    const { data: p } = await sb.from('mkt_promotions').select('*').eq('id',id).single(); if(!p) return;
    document.getElementById('promo-modal-title').textContent='Edit Promotion';
    document.getElementById('promo-id').value=p.id;
    document.getElementById('promo-title').value=p.title;
    document.getElementById('promo-banner').value=p.banner_text||'';
    document.getElementById('promo-type').value=p.discount_type;
    document.getElementById('promo-value').value=p.discount_value;
    document.getElementById('promo-target').value=p.target;
    document.getElementById('promo-maxdisc').value=p.max_discount||'';
    document.getElementById('promo-category').value=(p.target_categories&&p.target_categories[0])||'Vegetables';
    document.getElementById('promo-start').value=p.start_date||'';
    document.getElementById('promo-end').value=p.end_date||'';
    document.getElementById('promo-status').value=p.status;
    document.getElementById('promo-priority').value=p.priority||0;
    togglePromoCat();
    document.getElementById('promo-modal').classList.remove('hidden');
  }
  async function savePromo(e) {
    e.preventDefault();
    const id = document.getElementById('promo-id').value;
    const target = document.getElementById('promo-target').value;
    const payload = {
      title: document.getElementById('promo-title').value.trim(),
      banner_text: document.getElementById('promo-banner').value.trim() || null,
      discount_type: document.getElementById('promo-type').value,
      discount_value: parseFloat(document.getElementById('promo-value').value)||0,
      target, target_categories: target==='category' ? [document.getElementById('promo-category').value] : [],
      max_discount: parseFloat(document.getElementById('promo-maxdisc').value)||null,
      start_date: document.getElementById('promo-start').value||null,
      end_date: document.getElementById('promo-end').value||null,
      status: document.getElementById('promo-status').value,
      is_active: true,
      priority: parseInt(document.getElementById('promo-priority').value)||0
    };
    let error;
    if (id) ({error} = await sb.from('mkt_promotions').update(payload).eq('id',id));
    else ({error} = await sb.from('mkt_promotions').insert(payload));
    if (error) { showToast('Save failed: '+error.message,'error'); return; }
    showToast('Promotion saved'); closePromoModal(); loadPromotions();
  }
  async function deletePromo(id){ if(!confirm('Delete promotion?'))return; await sb.from('mkt_promotions').delete().eq('id',id); loadPromotions(); }

  // ---------- ANNOUNCEMENTS ----------
  async function loadAnnouncements() {
    const { data: items } = await sb.from('mkt_announcements').select('*').order('created_at',{ascending:false});
    const el = document.getElementById('announcements-list');
    if (!items || !items.length) { el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No announcements yet.</p>'; return; }
    el.innerHTML = items.map(a => `
      <div class="bg-white rounded-xl p-4 shadow border border-gray-100 flex items-start gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h4 class="font-semibold text-sm text-brand-bluedark">${a.title}</h4>
            ${a.is_featured?'<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Featured</span>':''}
            ${a.is_active?'<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>':'<span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>'}
          </div>
          <p class="text-xs text-gray-500 mb-1">${a.body || ''}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="openAnnouncementModal('${a.id}')" class="bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full">Edit</button>
          <button onclick="deleteAnnouncement('${a.id}')" class="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full">Delete</button>
        </div>
      </div>`).join('');
  }
  let editingAnnouncementId = null;
  function openAnnouncementModal(id = null) {
    editingAnnouncementId = id;
    document.getElementById('ann-modal-title').textContent = id ? 'Edit Announcement' : 'New Announcement';
    if (!id) { ['ann-id','ann-title','ann-body','ann-image-url'].forEach(x=>document.getElementById(x).value=''); document.getElementById('ann-featured').checked=false; document.getElementById('ann-active').checked=true; }
    else sb.from('mkt_announcements').select('*').eq('id',id).single().then(({data:a})=>{ if(!a)return; document.getElementById('ann-id').value=a.id; document.getElementById('ann-title').value=a.title; document.getElementById('ann-body').value=a.body||''; document.getElementById('ann-image-url').value=a.image_url||''; document.getElementById('ann-featured').checked=a.is_featured; document.getElementById('ann-active').checked=a.is_active; });
    document.getElementById('announcement-modal').classList.remove('hidden');
  }
  function closeAnnouncementModal(){ document.getElementById('announcement-modal').classList.add('hidden'); editingAnnouncementId=null; }
  async function saveAnnouncement(e) {
    e.preventDefault();
    const payload = { title: document.getElementById('ann-title').value.trim(), body: document.getElementById('ann-body').value.trim()||null, image_url: document.getElementById('ann-image-url').value.trim()||null, is_featured: document.getElementById('ann-featured').checked, is_active: document.getElementById('ann-active').checked };
    let error;
    if (editingAnnouncementId) ({error}=await sb.from('mkt_announcements').update(payload).eq('id',editingAnnouncementId));
    else ({error}=await sb.from('mkt_announcements').insert(payload));
    if (error) { showToast('Save failed: '+error.message,'error'); return; }
    showToast('Announcement saved'); closeAnnouncementModal(); loadAnnouncements();
  }
  async function deleteAnnouncement(id){ if(!confirm('Delete announcement?'))return; await sb.from('mkt_announcements').delete().eq('id',id); loadAnnouncements(); }

  // ---------- SETTINGS ----------
  async function getSetting(key, def) {
    const { data } = await sb.from('shared_app_settings').select('value').eq('key',key).maybeSingle();
    return data ? data.value : def;
  }
  async function setSetting(key, value) {
    const { error } = await sb.from('shared_app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
    return error;
  }
  async function loadSettings() {
    const pts = await getSetting('points_config', { earn_rm:10, earn_pts:1, redeem_pts:100, redeem_rm:1, enabled:true });
    document.getElementById('set-pts-enabled').checked = pts.enabled !== false;
    document.getElementById('set-earn-rm').value = pts.earn_rm;
    document.getElementById('set-earn-pts').value = pts.earn_pts;
    document.getElementById('set-redeem-pts').value = pts.redeem_pts;
    document.getElementById('set-redeem-rm').value = pts.redeem_rm;
    updatePtsSummary();
    const tiers = await getSetting('member_tiers', []); window.MEMBER_TIERS = tiers; renderTierRows(tiers);
    const notif = await getSetting('notification_config', { from_name:'HSI Marketplace', from_email:'', admin_emails:[] });
    document.getElementById('set-from-name').value = notif.from_name||'';
    document.getElementById('set-from-email').value = notif.from_email||'';
    document.getElementById('set-admin-emails').value = (notif.admin_emails||[]).join(', ');
  }
  function updatePtsSummary() {
    const er=document.getElementById('set-earn-rm').value, ep=document.getElementById('set-earn-pts').value, rp=document.getElementById('set-redeem-pts').value, rr=document.getElementById('set-redeem-rm').value;
    document.getElementById('pts-summary').textContent = `For every RM ${er} spent, customers earn ${ep} point(s). ${rp} points = RM ${rr} discount.`;
  }
  document.addEventListener('input', e => { if (['set-earn-rm','set-earn-pts','set-redeem-pts','set-redeem-rm'].includes(e.target.id)) updatePtsSummary(); });
  async function savePointsConfig() {
    const err = await setSetting('points_config', {
      enabled: document.getElementById('set-pts-enabled').checked,
      earn_rm: parseFloat(document.getElementById('set-earn-rm').value)||10,
      earn_pts: parseFloat(document.getElementById('set-earn-pts').value)||1,
      redeem_pts: parseInt(document.getElementById('set-redeem-pts').value)||100,
      redeem_rm: parseFloat(document.getElementById('set-redeem-rm').value)||1
    });
    showToast(err?'Save failed':'Loyalty saved', err?'error':'success');
  }
  function renderTierRows(tiers) {
    document.getElementById('tiers-rows').innerHTML = (tiers||[]).map((t,i)=>`
      <div class="flex gap-2 items-center">
        <input value="${t.name||''}" data-tier-name="${i}" placeholder="Name" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input value="${t.min_points||0}" data-tier-min="${i}" type="number" placeholder="Min pts" class="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button onclick="removeTierRow(${i})" class="text-red-500 text-lg px-2">×</button>
      </div>`).join('') || '<p class="text-gray-400 text-sm">No tiers. Add one.</p>';
  }
  function collectTiers() {
    const rows = document.querySelectorAll('[data-tier-name]');
    const tiers = [];
    rows.forEach(r => { const i=r.getAttribute('data-tier-name'); const min=document.querySelector(`[data-tier-min="${i}"]`); tiers.push({ name:r.value.trim(), min_points: parseInt(min.value)||0 }); });
    return tiers.filter(t=>t.name).sort((a,b)=>a.min_points-b.min_points);
  }
  function addTierRow(){ const t=collectTiers(); t.push({name:'',min_points:0}); window.MEMBER_TIERS=t; renderTierRows(t); }
  function removeTierRow(i){ const t=collectTiers(); t.splice(i,1); window.MEMBER_TIERS=t; renderTierRows(t); }
  async function saveTiers(){ const t=collectTiers(); window.MEMBER_TIERS=t; const err=await setSetting('member_tiers', t); showToast(err?'Save failed':'Tiers saved', err?'error':'success'); }
  async function saveNotifConfig() {
    const err = await setSetting('notification_config', {
      from_name: document.getElementById('set-from-name').value.trim(),
      from_email: document.getElementById('set-from-email').value.trim(),
      admin_emails: document.getElementById('set-admin-emails').value.split(',').map(s=>s.trim()).filter(Boolean)
    });
    showToast(err?'Save failed':'Notifications saved', err?'error':'success');
  }

  getSetting('member_tiers', []).then(t => window.MEMBER_TIERS = t);

  // ================= ADD-DATA (manual entry) =================
  function genPw() { const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s=''; for (let i=0;i<10;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }
  function openAdd(p) { document.getElementById(p+'-modal').classList.remove('hidden'); }
  function closeAdd(p) { document.getElementById(p+'-modal').classList.add('hidden'); }

  // Create an auth account without disturbing the admin's own session
  // (uses a throwaway client that doesn't persist the new session).
  async function createAccount(email, password, meta) {
    const tmp = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await tmp.auth.signUp({ email, password, options: { data: meta } });
    if (error) return { error: error.message };
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { error: 'This email is already registered.' };
    return { user: data.user };
  }

  // ---- Add Customer ----
  function openAddCustomer() {
    ['nc-name','nc-email','nc-phone','nc-pw'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('nc-msg').textContent='';
    openAdd('addcust');
  }
  async function saveNewCustomer(e) {
    e.preventDefault();
    const btn=document.getElementById('nc-btn'), msg=document.getElementById('nc-msg');
    btn.disabled=true; btn.textContent='Creating…'; msg.textContent='';
    const r = await createAccount(document.getElementById('nc-email').value.trim(), document.getElementById('nc-pw').value, {
      full_name: document.getElementById('nc-name').value.trim(), role:'buyer', phone: document.getElementById('nc-phone').value.trim()
    });
    btn.disabled=false; btn.textContent='Create Customer';
    if (r.error) { msg.className='text-xs text-red-600'; msg.textContent=r.error; return; }
    showToast('Customer created'); closeAdd('addcust'); loadCustomers();
  }

  // ---- Add Seller ----
  function openAddSeller() {
    ['ns-name','ns-email','ns-phone','ns-farm','ns-loc','ns-pw'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('ns-status').value='active'; document.getElementById('ns-msg').textContent='';
    openAdd('addseller');
  }
  async function saveNewSeller(e) {
    e.preventDefault();
    const btn=document.getElementById('ns-btn'), msg=document.getElementById('ns-msg');
    btn.disabled=true; btn.textContent='Creating…'; msg.textContent='';
    const r = await createAccount(document.getElementById('ns-email').value.trim(), document.getElementById('ns-pw').value, {
      full_name: document.getElementById('ns-name').value.trim(), role:'seller',
      phone: document.getElementById('ns-phone').value.trim(),
      farm_name: document.getElementById('ns-farm').value.trim() || null,
      farm_location: document.getElementById('ns-loc').value.trim() || null
    });
    if (!r.error && r.user) {
      await sb.from('shared_profiles').update({ status: document.getElementById('ns-status').value }).eq('id', r.user.id);
    }
    btn.disabled=false; btn.textContent='Create Seller';
    if (r.error) { msg.className='text-xs text-red-600'; msg.textContent=r.error; return; }
    showToast('Seller created'); closeAdd('addseller'); loadSellers();
  }

  // ---- Add Product ----
  async function openAddProduct(sellerId, sellerName) {
    const sel = document.getElementById('np-seller');
    if (sellerId) {
      sel.innerHTML = `<option value="${sellerId}">${sellerName || sellerId}</option>`;
      sel.value = sellerId; sel.disabled = true;
    } else {
      const { data: sellers } = await sb.from('shared_profiles').select('id,full_name,farm_name').eq('role','seller').eq('status','active').order('created_at');
      sel.disabled = false;
      sel.innerHTML = (sellers && sellers.length) ? sellers.map(s=>`<option value="${s.id}">${s.farm_name||s.full_name||s.id}</option>`).join('') : '<option value="">No active sellers — add one first</option>';
    }
    ['np-id','np-name','np-price','np-qty','np-harvest','np-desc','np-image-url'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('np-unit').value='kg'; document.getElementById('np-msg').textContent='';
    document.getElementById('np-category').value='Vegetables';
    document.getElementById('np-status').value='active';
    document.getElementById('np-image-file').value='';
    renderNpImage('');
    document.getElementById('addprod-title').textContent='Add Product';
    document.getElementById('np-submit-btn').textContent='Create Product';
    openAdd('addprod');
  }
  function renderNpImage(url) {
    document.getElementById('np-image-preview').innerHTML = url
      ? `<img src="${url}" class="h-24 rounded-lg border border-gray-100 object-cover" onerror="this.style.display='none'" />`
      : '<p class="text-xs text-gray-400">No image yet.</p>';
  }
  async function uploadProductImage(e) {
    const file = e.target.files[0]; if (!file) return;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `admin/${Date.now()}.${ext}`;
    showToast('Uploading image…');
    const { error: upErr } = await sb.storage.from('mkt-product-images').upload(path, file, { upsert: true });
    if (upErr) { showToast('Upload failed: '+upErr.message, 'error'); return; }
    const { data: { publicUrl } } = sb.storage.from('mkt-product-images').getPublicUrl(path);
    document.getElementById('np-image-url').value = publicUrl;
    renderNpImage(publicUrl);
    showToast('Image uploaded — remember to Save');
  }
  async function openEditProduct(id) {
    const { data: p } = await sb.from('mkt_products').select('*, seller:shared_profiles!seller_id(full_name,farm_name)').eq('id', id).single();
    if (!p) { showToast('Product not found','error'); return; }
    const sel = document.getElementById('np-seller');
    sel.innerHTML = `<option value="${p.seller_id}">${p.seller?.farm_name || p.seller?.full_name || p.seller_id}</option>`;
    sel.value = p.seller_id; sel.disabled = true;
    document.getElementById('np-id').value = p.id;
    document.getElementById('np-name').value = p.name || '';
    document.getElementById('np-category').value = p.category || 'Vegetables';
    document.getElementById('np-unit').value = p.unit || 'kg';
    document.getElementById('np-price').value = p.price ?? '';
    document.getElementById('np-qty').value = p.quantity ?? '';
    document.getElementById('np-harvest').value = p.harvest_date || '';
    document.getElementById('np-desc').value = p.description || '';
    document.getElementById('np-status').value = p.status || 'active';
    document.getElementById('np-image-url').value = p.image_url || '';
    document.getElementById('np-image-file').value = '';
    renderNpImage(p.image_url || '');
    document.getElementById('np-msg').textContent = '';
    document.getElementById('addprod-title').textContent = 'Edit Product';
    document.getElementById('np-submit-btn').textContent = 'Save Product';
    openAdd('addprod');
  }
  async function deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    const { error } = await sb.from('mkt_products').delete().eq('id', id);
    if (error) { showToast('Delete failed: '+error.message, 'error'); return; }
    showToast('Product deleted', 'warning'); loadSellers();
  }
  async function saveNewProduct(e) {
    e.preventDefault();
    const msg=document.getElementById('np-msg');
    const id=document.getElementById('np-id').value;
    const seller_id=document.getElementById('np-seller').value;
    if (!seller_id) { msg.className='text-xs text-red-600'; msg.textContent='Select a seller.'; return; }
    const fields = {
      name: document.getElementById('np-name').value.trim(),
      category: document.getElementById('np-category').value,
      description: document.getElementById('np-desc').value.trim() || null,
      price: parseFloat(document.getElementById('np-price').value)||0,
      unit: document.getElementById('np-unit').value.trim()||'kg',
      quantity: parseInt(document.getElementById('np-qty').value)||0,
      harvest_date: document.getElementById('np-harvest').value || null,
      status: document.getElementById('np-status').value,
      image_url: document.getElementById('np-image-url').value.trim() || null
    };
    let error;
    if (id) ({ error } = await sb.from('mkt_products').update(fields).eq('id', id));
    else ({ error } = await sb.from('mkt_products').insert({ seller_id, ...fields }));
    if (error) { msg.className='text-xs text-red-600'; msg.textContent='Failed: '+error.message; return; }
    showToast(id?'Product updated':'Product added'); closeAdd('addprod'); loadSellers();
  }

  // ---- Add Order ----
  let ORDER_PRODUCTS = [];
  async function openAddOrder() {
    const [{ data: buyers }, { data: sellers }, { data: prods }] = await Promise.all([
      sb.from('shared_profiles').select('id,full_name,email').eq('role','buyer').order('created_at'),
      sb.from('shared_profiles').select('id,full_name,farm_name').eq('role','seller').eq('status','active').order('created_at'),
      sb.from('mkt_products').select('id,name,price,unit,seller_id').eq('status','active')
    ]);
    ORDER_PRODUCTS = prods || [];
    document.getElementById('no-buyer').innerHTML = (buyers||[]).map(b=>`<option value="${b.id}">${b.full_name||b.email}</option>`).join('') || '<option value="">No buyers</option>';
    document.getElementById('no-seller').innerHTML = (sellers||[]).map(s=>`<option value="${s.id}">${s.farm_name||s.full_name}</option>`).join('') || '<option value="">No sellers</option>';
    document.getElementById('no-items').innerHTML='';
    document.getElementById('no-status').value='pending';
    document.getElementById('no-notes').value=''; document.getElementById('no-msg').textContent='';
    addOrderItem();
    openAdd('addorder');
  }
  function sellerProductOptions() {
    const sid=document.getElementById('no-seller').value;
    const list=ORDER_PRODUCTS.filter(p=>p.seller_id===sid);
    return list.length ? list.map(p=>`<option value="${p.id}">${p.name} — ${rm(p.price)}/${p.unit}</option>`).join('') : '<option value="">No products for this seller</option>';
  }
  function addOrderItem() {
    const div=document.createElement('div');
    div.className='no-item-row flex gap-2 items-center';
    div.innerHTML=`<select class="no-item-prod flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" onchange="calcOrderTotal()">${sellerProductOptions()}</select>
      <input type="number" min="1" value="1" class="no-item-qty w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" oninput="calcOrderTotal()" />
      <button type="button" onclick="this.closest('.no-item-row').remove();calcOrderTotal()" class="text-red-500 text-lg px-1">×</button>`;
    document.getElementById('no-items').appendChild(div);
    calcOrderTotal();
  }
  function onOrderSellerChange() {
    document.querySelectorAll('.no-item-prod').forEach(sel => sel.innerHTML = sellerProductOptions());
    calcOrderTotal();
  }
  function calcOrderTotal() {
    let total=0;
    document.querySelectorAll('.no-item-row').forEach(r=>{
      const pid=r.querySelector('.no-item-prod').value; const qty=parseInt(r.querySelector('.no-item-qty').value)||0;
      const p=ORDER_PRODUCTS.find(x=>x.id===pid); if (p) total+=parseFloat(p.price)*qty;
    });
    document.getElementById('no-total').textContent=rm(total);
  }
  async function saveNewOrder(e) {
    e.preventDefault();
    const msg=document.getElementById('no-msg'), btn=document.getElementById('no-btn');
    const buyerId=document.getElementById('no-buyer').value, sellerId=document.getElementById('no-seller').value;
    const items=[...document.querySelectorAll('.no-item-row')].map(r=>{
      const pid=r.querySelector('.no-item-prod').value, qty=parseInt(r.querySelector('.no-item-qty').value)||0;
      const p=ORDER_PRODUCTS.find(x=>x.id===pid); return (p&&qty>0)?{id:pid,name:p.name,price:parseFloat(p.price),qty}:null;
    }).filter(Boolean);
    if (!buyerId||!sellerId||!items.length) { msg.className='text-xs text-red-600'; msg.textContent='Pick a buyer, seller and at least one item.'; return; }
    btn.disabled=true; btn.textContent='Creating…';
    const sub=items.reduce((s,i)=>s+i.price*i.qty,0);
    const status=document.getElementById('no-status').value;
    let orderNumber=null; try { const { data: on } = await sb.rpc('mkt_next_order_number'); orderNumber=on; } catch(_){}
    const paid=['payment_verified','processing','completed'].includes(status);
    const { data: order, error } = await sb.from('mkt_orders').insert({
      buyer_id:buyerId, seller_id:sellerId, order_number:orderNumber, subtotal:sub, total_amount:sub,
      status, channel:'admin_panel', payment_method:'offline',
      amount_paid: paid?sub:0, amount_paid_at: paid?new Date().toISOString():null,
      delivery_notes: document.getElementById('no-notes').value.trim()||null
    }).select().single();
    if (error) { btn.disabled=false; btn.textContent='Create Order'; msg.className='text-xs text-red-600'; msg.textContent='Failed: '+error.message; return; }
    await sb.from('mkt_order_items').insert(items.map(i=>({ order_id:order.id, product_id:i.id, product_name:i.name, quantity:i.qty, unit_price:i.price })));
    if (paid) { try { await sb.rpc('mkt_award_order_points', { p_order_id: order.id }); } catch(_){} }
    btn.disabled=false; btn.textContent='Create Order';
    showToast('Order created'); closeAdd('addorder'); loadAllOrders();
  }

  async function doLogout(){ await sb.auth.signOut(); window.location.href='../'; }
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
