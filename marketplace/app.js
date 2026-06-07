  /* ============================================================================
   * MARKETPLACE — public storefront (runs as anon)
   * ----------------------------------------------------------------------------
   * Shows every active seller's products with live promotion pricing. No login
   * required to browse; adding to cart prompts sign-in. Seller name/photo/rating
   * on the "About the Farmer" card come from public reads of shared_profiles.
   * Reviews are fetched via the mkt_seller_reviews RPC (orders stay private).
   * See docs/ARCHITECTURE.md and docs/ORDER-LIFECYCLE.md.
   * ========================================================================== */
  const SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let allProducts = [];
  let currentCategory = 'All';
  let currentProduct = null;
  let cartOpen = false;
  let promoMap = {};   // product_id -> { discount, title } (live promotions)

  function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-500' : 'bg-green-700'}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  async function loadProducts() {
    const { data, error } = await sb.from('mkt_products')
      .select('*')
      .eq('status', 'active')
      .gt('quantity', 0)
      .order('created_at', { ascending: false });
    if (error) { showToast('Error loading products', 'error'); return; }
    allProducts = data || [];

    // Fetch seller profiles separately (more reliable than FK join)
    const sellerIds = [...new Set(allProducts.map(p => p.seller_id).filter(Boolean))];
    if (sellerIds.length) {
      const { data: profilesData } = await sb.from('shared_profiles')
        .select('id, full_name, farm_name, photo_url, farm_location, age, ethnicity, farming_since, farm_size, certifications, story, rating_avg, rating_count')
        .in('id', sellerIds);
      if (profilesData) {
        const profileMap = {};
        profilesData.forEach(pr => { profileMap[pr.id] = pr; });
        allProducts.forEach(p => { p.profiles = profileMap[p.seller_id] || null; });
      }
    }

    await loadPromotions();
    renderProducts();
  }

  async function loadPromotions() {
    promoMap = {};
    try {
      const items = allProducts.map(p => ({ product_id: p.id, category: p.category, qty: 1, price: parseFloat(p.price) }));
      if (!items.length) return;
      const { data: promos } = await sb.rpc('mkt_promotions_for_cart', { p_items: items });
      (promos || []).forEach(pr => { promoMap[pr.product_id] = { discount: parseFloat(pr.discount) || 0, title: pr.promo_title }; });
    } catch (_) {}
  }
  function salePrice(p) {
    const promo = promoMap[p.id];
    const base = parseFloat(p.price);
    if (promo && promo.discount > 0) return Math.max(0, base - promo.discount);
    return base;
  }

  function filterProducts() {
    renderProducts();
  }

  function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-pill').forEach(p => {
      p.classList.toggle('active', p.textContent.trim() === cat);
    });
    renderProducts();
  }

  function renderProducts() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const filtered = allProducts.filter(p => {
      const matchCat = currentCategory === 'All' || p.category === currentCategory;
      const matchSearch = !search || p.name.toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search);
      return matchCat && matchSearch;
    });
    const grid = document.getElementById('product-grid');
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-16">No products found.</div>';
      return;
    }
    grid.innerHTML = filtered.map(p => `
      <div class="card-hover bg-white rounded-xl overflow-hidden shadow border border-green-100 cursor-pointer relative" onclick="openModal('${p.id}')">
        ${promoMap[p.id] ? '<span class="absolute top-2 left-2 z-10 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">SALE</span>' : ''}
        <div class="h-36 bg-green-100 overflow-hidden">
          ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover" />` : '<div class="w-full h-full flex items-center justify-center text-4xl"></div>'}
        </div>
        <div class="p-3">
          <p class="font-semibold text-sm text-gray-800 truncate">${p.name}</p>
          <p class="text-xs text-gray-500 truncate">${p.profiles?.farm_name || p.profiles?.full_name || 'HSI Farmer'}</p>
          <div class="flex items-center justify-between mt-2">
            <span class="text-green-700 font-bold text-sm">
              ${promoMap[p.id] ? `<span class="text-gray-400 line-through font-normal mr-1">RM ${parseFloat(p.price).toFixed(2)}</span>` : ''}RM ${salePrice(p).toFixed(2)}/${p.unit}
            </span>
            <span class="text-xs text-gray-400">${p.quantity} avail.</span>
          </div>
          <button onclick="event.stopPropagation(); openModal('${p.id}')" class="mt-2 w-full btn-primary text-white text-xs py-1.5 rounded-lg transition">+ Add to Cart</button>
        </div>
      </div>
    `).join('');
  }

  // ---------- SELLER RATINGS & REVIEWS ----------
  // Renders the average rating as a proportional star fill (e.g. 4.5 → 4½ stars)
  // using an amber star layer clipped to (avg/5)% over a grey full-star layer.
  function ratingStarsHTML(avg, count) {
    const a = Math.max(0, Math.min(5, Number(avg) || 0));
    const c = Number(count) || 0;
    if (c < 1) return '<span class="text-gray-400">No ratings yet</span>';
    const pct = (a / 5) * 100;
    return `<span class="relative inline-block align-middle leading-none" aria-label="${a.toFixed(1)} out of 5">`
      + `<span class="text-gray-300">★★★★★</span>`
      + `<span class="text-amber-500 absolute inset-0 overflow-hidden whitespace-nowrap" style="width:${pct}%">★★★★★</span>`
      + `</span> <span class="text-gray-500 align-middle">${a.toFixed(1)} (${c})</span>`;
  }

  function closeReviewsModal() { document.getElementById('reviews-modal').classList.add('hidden'); }
  async function openReviewsModal(sellerId, avg, count) {
    if (!sellerId) return;
    document.getElementById('reviews-summary').innerHTML =
      `<div class="flex items-center gap-2 text-sm">${ratingStarsHTML(avg, count)}</div>`;
    const listEl = document.getElementById('reviews-list');
    listEl.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading…</p>';
    document.getElementById('reviews-modal').classList.remove('hidden');
    const { data, error } = await sb.rpc('mkt_seller_reviews', { p_seller: sellerId });
    if (error) { listEl.innerHTML = '<p class="text-red-500 text-sm text-center py-8">Could not load ratings.</p>'; return; }
    if (!data || data.length === 0) { listEl.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No ratings yet.</p>'; return; }
    listEl.innerHTML = data.map(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
      return `
        <div class="border border-green-100 rounded-xl p-3">
          <div class="flex items-center justify-between mb-1">
            <span class="font-medium text-gray-800 text-sm">${r.buyer_name || 'Buyer'}</span>
            <span class="text-xs text-gray-400">${date}</span>
          </div>
          <div class="text-amber-500 text-sm leading-none mb-1">${stars}</div>
          ${r.rating_comment ? `<p class="text-sm text-gray-600">${r.rating_comment.replace(/</g,'&lt;')}</p>` : ''}
        </div>`;
    }).join('');
  }

  function openModal(id) {
    currentProduct = allProducts.find(p => p.id === id);
    if (!currentProduct) return;
    const seller = currentProduct.profiles || {};

    document.getElementById('modal-name').textContent = currentProduct.name;
    document.getElementById('modal-desc').textContent = currentProduct.description || 'No description available.';
    document.getElementById('modal-price').textContent = `RM ${parseFloat(currentProduct.price).toFixed(2)} / ${currentProduct.unit}`;
    document.getElementById('modal-harvest').textContent = currentProduct.harvest_date ? `Harvested: ${currentProduct.harvest_date}` : '';
    document.getElementById('modal-available').textContent = `${currentProduct.quantity} available`;
    document.getElementById('modal-qty').value = 1;
    document.getElementById('modal-qty').max = currentProduct.quantity;
    const img = document.getElementById('modal-image');
    if (currentProduct.image_url) { img.src = currentProduct.image_url; img.classList.remove('hidden'); }
    else { img.classList.add('hidden'); }

    // Seller card
    const card = document.getElementById('modal-seller-card');
    const sellerName = seller.farm_name || seller.full_name || 'HSI Farmer';
    document.getElementById('modal-seller-name').textContent = sellerName;

    const ratingEl = document.getElementById('modal-seller-rating');
    const hasRatings = seller.rating_count > 0;
    ratingEl.innerHTML = ratingStarsHTML(seller.rating_avg, seller.rating_count)
      + (hasRatings ? ' <span class="text-green-600 underline">see ratings</span>' : '');
    ratingEl.classList.toggle('hidden', !hasRatings);
    ratingEl.classList.toggle('cursor-pointer', hasRatings);
    ratingEl.onclick = hasRatings ? () => openReviewsModal(seller.id, seller.rating_avg, seller.rating_count) : null;

    const meta = [
      seller.farm_location,
      seller.ethnicity,
      seller.age ? `Age ${seller.age}` : null,
      seller.farming_since ? `Farming since ${seller.farming_since}` : null,
      seller.farm_size ? `Farm: ${seller.farm_size}` : null,
    ].filter(Boolean).join(' · ');
    document.getElementById('modal-seller-meta').textContent = meta;

    const badgesEl = document.getElementById('modal-seller-badges');
    const badges = [];
    if (seller.certifications) badges.push(...seller.certifications.split(',').map(s => s.trim()).filter(Boolean));
    badgesEl.innerHTML = badges.map(b => `<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">${b}</span>`).join('');

    const storyEl = document.getElementById('modal-seller-story');
    if (seller.story) { storyEl.textContent = `"${seller.story}"`; storyEl.classList.remove('hidden'); }
    else { storyEl.classList.add('hidden'); }

    const photoEl = document.getElementById('modal-seller-photo');
    const placeholderEl = document.getElementById('modal-seller-placeholder');
    if (seller.photo_url) {
      photoEl.src = seller.photo_url; photoEl.classList.remove('hidden'); placeholderEl.classList.add('hidden');
    } else {
      photoEl.classList.add('hidden'); placeholderEl.classList.remove('hidden');
    }
    card.classList.remove('hidden');

    document.getElementById('product-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('product-modal').classList.add('hidden');
    currentProduct = null;
  }

  function openFarmerModal() {
    const s = (currentProduct && currentProduct.profiles) || {};
    document.getElementById('farmer-name').textContent = s.full_name || s.farm_name || 'HSI Farmer';
    const farmEl = document.getElementById('farmer-farm');
    farmEl.textContent = s.farm_name || '';
    farmEl.classList.toggle('hidden', !s.farm_name);
    const ratingEl = document.getElementById('farmer-rating');
    const hasRatings = s.rating_count > 0;
    ratingEl.innerHTML = ratingStarsHTML(s.rating_avg, s.rating_count)
      + (hasRatings ? ' <span class="text-green-600 underline">see ratings</span>' : '');
    ratingEl.classList.toggle('hidden', !hasRatings);
    ratingEl.classList.toggle('cursor-pointer', hasRatings);
    ratingEl.onclick = hasRatings ? () => openReviewsModal(s.id, s.rating_avg, s.rating_count) : null;
    const locEl = document.getElementById('farmer-location');
    locEl.textContent = s.farm_location ? ` ${s.farm_location}` : '';
    locEl.classList.toggle('hidden', !s.farm_location);

    // photo
    const photo = document.getElementById('farmer-photo');
    const ph = document.getElementById('farmer-placeholder');
    if (s.photo_url) { photo.src = s.photo_url; photo.classList.remove('hidden'); ph.classList.add('hidden'); }
    else { photo.classList.add('hidden'); ph.classList.remove('hidden'); }

    // stat chips
    const exp = s.farming_since ? Math.max(0, (new Date().getFullYear() - s.farming_since)) : null;
    const stats = [
      s.age ? { label: 'Age', value: s.age } : null,
      s.ethnicity ? { label: 'Ethnicity', value: s.ethnicity } : null,
      exp !== null ? { label: 'Experience', value: exp + (exp === 1 ? ' yr' : ' yrs') } : null,
      s.farming_since ? { label: 'Since', value: s.farming_since } : null,
      s.farm_size ? { label: 'Farm Size', value: s.farm_size } : null,
    ].filter(Boolean);
    document.getElementById('farmer-stats').innerHTML = stats.map(st => `
      <div class="bg-green-50 rounded-lg py-2 px-1 text-center border border-green-100">
        <p class="text-sm font-bold text-green-800 leading-tight">${st.value}</p>
        <p class="text-[10px] text-gray-500 uppercase tracking-wide">${st.label}</p>
      </div>`).join('');

    // certifications
    const certs = s.certifications ? s.certifications.split(',').map(x => x.trim()).filter(Boolean) : [];
    document.getElementById('farmer-certs-wrap').classList.toggle('hidden', certs.length === 0);
    document.getElementById('farmer-certs').innerHTML = certs.map(c =>
      `<span class="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium"> ${c}</span>`).join('');

    // story
    const storyWrap = document.getElementById('farmer-story-wrap');
    if (s.story) { document.getElementById('farmer-story').textContent = `"${s.story}"`; storyWrap.classList.remove('hidden'); }
    else storyWrap.classList.add('hidden');

    document.getElementById('farmer-modal').classList.remove('hidden');
  }

  function closeFarmerModal() {
    document.getElementById('farmer-modal').classList.add('hidden');
  }

  function changeQty(delta) {
    const input = document.getElementById('modal-qty');
    const val = Math.max(1, Math.min(currentProduct?.quantity || 99, parseInt(input.value) + delta));
    input.value = val;
  }

  async function addToCart() {
    if (!currentProduct) return;
    await doAddToCart(currentProduct.id, parseInt(document.getElementById('modal-qty').value));
    closeModal();
  }

  async function quickAdd(id) {
    await doAddToCart(id, 1);
  }

  async function doAddToCart(productId, qty) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Please login to add items to your cart', 'warning'); return; }
    const { error } = await sb.from('mkt_cart_items').upsert(
      { buyer_id: session.user.id, product_id: productId, quantity: qty },
      { onConflict: 'buyer_id,product_id', ignoreDuplicates: false }
    );
    if (error) { showToast('Failed to add to cart', 'error'); return; }
    showToast('Added to cart!');
    loadCart();
  }

  async function loadCart() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data: items } = await sb.from('mkt_cart_items')
      .select('*, products:mkt_products(name, price, unit)')
      .eq('buyer_id', session.user.id);
    const list = document.getElementById('cart-items-list');
    const footer = document.getElementById('cart-footer');
    const badge = document.getElementById('cart-badge');
    if (!items || items.length === 0) {
      list.innerHTML = '<p class="text-gray-400 text-sm text-center py-10">Your cart is empty.</p>';
      footer.classList.add('hidden');
      badge.classList.add('hidden');
      return;
    }
    const total = items.reduce((s, i) => s + (i.quantity * parseFloat(i.products?.price || 0)), 0);
    list.innerHTML = items.map(i => `
      <div class="flex items-center gap-3 py-3 border-b border-green-50">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${i.products?.name}</p>
          <p class="text-xs text-gray-500">RM ${parseFloat(i.products?.price).toFixed(2)} / ${i.products?.unit}</p>
        </div>
        <span class="text-sm font-semibold">×${i.quantity}</span>
        <span class="text-green-700 text-sm font-bold">RM ${(i.quantity * parseFloat(i.products?.price || 0)).toFixed(2)}</span>
      </div>
    `).join('');
    document.getElementById('cart-total').textContent = `RM ${total.toFixed(2)}`;
    footer.classList.remove('hidden');
    badge.textContent = items.length;
    badge.classList.remove('hidden');
  }

  function toggleCart() {
    cartOpen = !cartOpen;
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-overlay');
    sidebar.classList.toggle('translate-x-full', !cartOpen);
    overlay.classList.toggle('hidden', !cartOpen);
    if (cartOpen) loadCart();
  }

  async function goToDashboard() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (window.location.href = '../');
    const { data: p } = await sb.from('shared_profiles').select('role,status').eq('id', session.user.id).single();
    if (!p) return;
    if (p.role === 'admin') window.location.href = '../admin/';
    else if (p.role === 'seller' && p.status === 'active') window.location.href = '../seller/';
    else window.location.href = '../buyer/';
  }

  async function goToProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (window.location.href = '../');
    const { data: p } = await sb.from('shared_profiles').select('role,status').eq('id', session.user.id).single();
    if (!p) return (window.location.href = '../buyer/?tab=profile');
    if (p.role === 'admin') window.location.href = '../admin/';
    else if (p.role === 'seller' && p.status === 'active') window.location.href = '../seller/?tab=profile';
    else window.location.href = '../buyer/?tab=profile';
  }

  function toggleUserMenu() { document.getElementById('user-dropdown').classList.toggle('hidden'); }
  function updateLangChecks() {
    const l = (window.getLang ? getLang() : 'en');
    const en = document.getElementById('lang-check-en'), bm = document.getElementById('lang-check-bm');
    if (en) en.textContent = l === 'en' ? '' : '';
    if (bm) bm.textContent = l === 'bm' ? '' : '';
  }
  function chooseLang(l) {
    if (window.setLang) setLang(l);
    updateLangChecks();
    if (window.applyTranslations) applyTranslations();
    document.getElementById('user-dropdown').classList.add('hidden');
  }
  async function doLogout() { try { await sb.auth.signOut(); } catch (_) {} window.location.replace('../'); }
  document.addEventListener('click', e => {
    const menu = document.getElementById('nav-user-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
      document.getElementById('user-dropdown').classList.add('hidden');
    }
  });
  // Close the mobile slide-down menu on any outside click. Capture phase so
  // content elements that call stopPropagation can't swallow the event.
  document.addEventListener('click', (e) => {
    const mobile = document.getElementById('mobile-menu');
    if (!mobile || mobile.classList.contains('hidden')) return;
    if (mobile.contains(e.target)) return;
    const trigger = e.target.closest && e.target.closest('[aria-label="Open menu"]');
    if (!trigger) mobile.classList.add('hidden');
  }, true);

  async function initNav() {
    updateLangChecks();
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      document.getElementById('nav-auth-btn').classList.add('hidden');
      document.getElementById('nav-user-menu').classList.remove('hidden');
      const cartBtn = document.getElementById('nav-cart-btn');
      if (cartBtn) cartBtn.classList.remove('hidden');
      const { data: p } = await sb.from('shared_profiles').select('full_name, role, status').eq('id', session.user.id).single();
      const first = ((p && p.full_name) || session.user.email || '').trim().split(' ')[0];
      document.getElementById('nav-user-greeting').textContent = first ? ('Hi, ' + first) : 'Hi';

      const portal = document.getElementById('nav-portal-btn');
      if (portal) {
        const role = p && p.role;
        if (role === 'admin') { portal.textContent = 'Admin Portal'; portal.href = '../admin/'; }
        else if (role === 'seller' && p.status === 'active') { portal.textContent = 'Seller Portal'; portal.href = '../seller/'; }
        else { portal.textContent = 'Buyer Portal'; portal.href = '../buyer/'; }
        portal.classList.remove('hidden');
      }
      loadCart();
    } else {
      // Logged out: hide portal pill (Login pill stays visible by default in HTML)
      const portal = document.getElementById('nav-portal-btn');
      if (portal) portal.classList.add('hidden');
    }
  }

  initNav().then(() => {
    if (new URLSearchParams(location.search).get('cart') === 'open') toggleCart();
  });
  loadProducts();

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
