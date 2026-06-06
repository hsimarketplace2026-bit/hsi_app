function toggleMobileMenu(){var m=document.getElementById('mobile-menu');if(m)m.classList.toggle('hidden');}

/* ----- next block ----- */

  const SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // TOAST
  function showToast(msg, type = 'success', duration = 3500) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-500' : type === 'info' ? 'bg-blue-600' : 'bg-green-700'}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // AUTH PANEL
  function openPanel() {
    document.getElementById('auth-panel').classList.add('open');
    document.getElementById('auth-overlay').classList.remove('hidden');
  }
  function openAuth(tab = 'login') {
    openPanel();
    switchTab(tab);
  }
  function closeAuth() {
    document.getElementById('auth-panel').classList.remove('open');
    document.getElementById('auth-overlay').classList.add('hidden');
  }
  // Switch between the login and signup ("register") forms.
  function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
    document.getElementById('confirm-notice').classList.add('hidden');
    document.getElementById('set-password-view').classList.add('hidden');
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('login-info').classList.add('hidden');
  }
  // Show the "set new password" view (used after a recovery-link click).
  function showSetPassword() {
    openPanel();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('confirm-notice').classList.add('hidden');
    document.getElementById('set-password-view').classList.remove('hidden');
  }
  // Send a password-reset email to the address typed in the login form.
  async function doForgotPassword() {
    const email = document.getElementById('login-email').value.trim();
    const errBox = document.getElementById('login-error');
    const infoBox = document.getElementById('login-info');
    errBox.classList.add('hidden');
    infoBox.classList.add('hidden');
    if (!email) {
      errBox.textContent = 'Please enter your email above first, then click “Forgot password?”.';
      errBox.classList.remove('hidden');
      document.getElementById('login-email').focus();
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
    infoBox.textContent = `Password reset link sent to ${email}. Check your inbox.`;
    infoBox.classList.remove('hidden');
  }
  // Save the new password after the user followed a recovery link.
  async function updatePassword(e) {
    e.preventDefault();
    const btn = document.getElementById('setpw-btn');
    const errBox = document.getElementById('setpw-error');
    errBox.classList.add('hidden');
    const pw = document.getElementById('setpw-password').value;
    if (!pw || pw.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; errBox.classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Updating…';
    const { error } = await sb.auth.updateUser({ password: pw });
    btn.disabled = false; btn.textContent = 'Update Password';
    if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
    showToast('Password updated! You are now signed in.');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { switchTab('login'); return; }
    const { data: profile } = await sb.from('shared_profiles').select('role,status').eq('id', session.user.id).single();
    if (profile) routeByRole(profile);
  }
  function toggleSellerFields() {
    const isSeller = document.querySelector('input[name="role"]:checked').value === 'seller';
    document.getElementById('seller-fields').classList.toggle('hidden', !isSeller);
  }

  // ROUTING
  function routeByRole(profile) {
    if (!profile) return;
    if (profile.role === 'admin') { window.location.href = 'admin/'; return; }
    if (profile.role === 'seller' && profile.status !== 'active') {
      showToast('Your seller account is pending admin approval.', 'warning');
      return;
    }
    // Buyers and active sellers: stay on the landing page; just reflect the
    // logged-in state. Sellers can reach their dashboard from the Seller
    // Portal pill in the header.
    closeAuth();
    initNav();
    showToast('Welcome back!');
  }

  function goToDashboard() {
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return openAuth();
      const { data: profile } = await sb.from('shared_profiles').select('role,status').eq('id', session.user.id).single();
      if (!profile) return;
      if (profile.role === 'admin') { window.location.href = 'admin/'; return; }
      if (profile.role === 'seller' && profile.status === 'active') { window.location.href = 'seller/'; return; }
      window.location.href = 'buyer/';
    });
  }

  function goToProfile() {
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return openAuth();
      const { data: profile } = await sb.from('shared_profiles').select('role,status').eq('id', session.user.id).single();
      if (!profile) return;
      if (profile.role === 'admin') { window.location.href = 'admin/'; return; }
      if (profile.role === 'seller' && profile.status === 'active') { window.location.href = 'seller/?tab=profile'; return; }
      window.location.href = 'buyer/?tab=profile';
    });
  }

  async function doLogin() {
    const btn = document.getElementById('login-btn');
    const errBox = document.getElementById('login-error');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    const { data, error } = await sb.auth.signInWithPassword({
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value
    });
    if (error) {
      let msg = error.message;
      if (msg.toLowerCase().includes('not confirmed')) {
        msg = 'Please check your email and click the confirmation link before logging in.';
      } else if (msg.toLowerCase().includes('invalid login')) {
        msg = 'Incorrect email or password.';
      }
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Login';
      return;
    }
    btn.textContent = 'Redirecting…';
    let { data: profile, error: profErr } = await sb.from('shared_profiles').select('role,status').eq('id', data.user.id).single();
    if (profErr || !profile) {
      // Self-heal: the DB trigger may not have created the profile — create it now from auth metadata.
      await ensureProfile(data.user, data.user.user_metadata || {});
      ({ data: profile, error: profErr } = await sb.from('shared_profiles').select('role,status').eq('id', data.user.id).single());
    }
    if (profErr || !profile) {
      errBox.innerHTML = profErr
        ? 'Profile load failed: ' + profErr.message + '<br><span class="text-xs">Make sure you ran supabase/setup_all.sql in this Supabase project.</span>'
        : 'Profile could not be created. Make sure you ran supabase/setup_all.sql in this Supabase project.';
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Login';
      return;
    }
    routeByRole(profile);
  }

  // Ensure a shared_profiles row exists for this user. Works even if the
  // DB trigger isn't installed (an INSERT RLS policy allows self-creation).
  async function ensureProfile(user, meta) {
    try {
      await sb.from('shared_profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: meta.full_name || '',
        phone: meta.phone || null,
        farm_name: meta.farm_name || null,
        farm_location: meta.farm_location || null,
        role: meta.role || 'buyer',
        status: (meta.role === 'seller') ? 'pending' : 'active'
      }, { onConflict: 'id', ignoreDuplicates: true });
    } catch (_) {}
  }

  async function doRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('reg-btn');
    const errBox = document.getElementById('reg-error');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Creating account…';
    const email = document.getElementById('reg-email').value.trim();
    const role = document.querySelector('input[name="role"]:checked').value;
    const meta = {
      full_name: document.getElementById('reg-name').value.trim(),
      role,
      phone: document.getElementById('reg-phone').value.trim(),
      farm_name: document.getElementById('reg-farm-name').value.trim() || null,
      farm_location: document.getElementById('reg-farm-location').value.trim() || null
    };
    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password: document.getElementById('reg-password').value,
        options: { data: meta, emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) {
        let m = error.message;
        if (/already registered|already exists/i.test(m)) m = 'This email is already registered. Please log in or reset your password.';
        errBox.textContent = m;
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Create Account';
        return;
      }
      // Supabase returns a fake user with an empty identities[] when the email already exists.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        errBox.textContent = 'This email is already registered. Please log in instead.';
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Create Account';
        return;
      }
      // Email confirmation OFF → we get a session immediately. Create the profile and go.
      if (data.session && data.user) {
        await ensureProfile(data.user, meta);
        let { data: profile } = await sb.from('shared_profiles').select('role,status').eq('id', data.user.id).single();
        if (profile) { routeByRole(profile); return; }
      }
      // Email confirmation ON → show the "check your email" notice.
      document.getElementById('register-form').classList.add('hidden');
      document.getElementById('confirm-email-display').textContent = email;
      document.getElementById('confirm-notice').classList.remove('hidden');
    } catch (err) {
      errBox.textContent = (err && err.message) || 'Registration failed. Please try again.';
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }

  async function doLogout() {
    await sb.auth.signOut();
    window.location.reload();
  }

  // NAV STATE
  let currentUserName = '';

  async function initNav() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    // Logged in: swap Login/Register + standalone lang toggle for the user menu
    document.getElementById('nav-auth-btn').classList.add('hidden');
    document.getElementById('lang-toggle').classList.add('hidden');
    document.getElementById('nav-user-menu').classList.remove('hidden');
    const { data: profile } = await sb.from('shared_profiles')
      .select('full_name, role, status').eq('id', session.user.id).single();
    currentUserName = (profile?.full_name || session.user.email || '').trim();

    // Show the role-specific portal button and, for buyers, the cart.
    const portalBtn = document.getElementById('nav-portal-btn');
    const role = profile?.role;
    if (role === 'admin') {
      portalBtn.textContent = 'Admin Portal';
      portalBtn.href = 'admin/';
    } else if (role === 'seller' && profile?.status === 'active') {
      portalBtn.textContent = 'Seller Portal';
      portalBtn.href = 'seller/';
    } else {
      portalBtn.textContent = 'Buyer Portal';
      portalBtn.href = 'buyer/';
    }
    portalBtn.classList.remove('hidden');
    if (role === 'buyer' || !role) {
      document.getElementById('nav-cart-btn').classList.remove('hidden');
      document.getElementById('nav-shop-btn').classList.remove('hidden');
      updateCartBadge();
    }
    // Sellers and admins cannot place orders — hide all SHOP links.
    if (role === 'seller' || role === 'admin') {
      document.querySelectorAll('[data-i18n="nav.shop"]').forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
      });
    }

    updateGreeting();
    updateLangChecks();
  }

  // CART (view-anytime drawer)
  let cartOpen = false;
  function toggleCart() {
    cartOpen = !cartOpen;
    document.getElementById('cart-sidebar').classList.toggle('translate-x-full', !cartOpen);
    document.getElementById('cart-overlay').classList.toggle('hidden', !cartOpen);
    if (cartOpen) loadCart();
  }
  async function updateCartBadge() {
    const { data: { session } } = await sb.auth.getSession();
    const badge = document.getElementById('cart-badge');
    if (!session) { badge.classList.add('hidden'); return; }
    const { count } = await sb.from('mkt_cart_items').select('id', { count: 'exact', head: true }).eq('buyer_id', session.user.id);
    if (count && count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
  async function loadCart() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data: items } = await sb.from('mkt_cart_items')
      .select('*, products:mkt_products(name, price, unit)')
      .eq('buyer_id', session.user.id);
    const list = document.getElementById('cart-items-list');
    const footer = document.getElementById('cart-footer');
    if (!items || items.length === 0) {
      list.innerHTML = '<p class="text-gray-400 text-sm text-center py-10">Your cart is empty.</p>';
      footer.classList.add('hidden');
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
      </div>`).join('');
    document.getElementById('cart-total').textContent = `RM ${total.toFixed(2)}`;
    footer.classList.remove('hidden');
  }

  function updateGreeting() {
    const span = document.getElementById('nav-user-greeting');
    if (!span) return;
    const first = currentUserName.split(' ')[0] || currentUserName || '';
    let hi = (typeof t === 'function') ? t('nav.greeting') : '';
    // Fallback if translations.js is missing/stale (t() would return the raw key)
    if (!hi || hi === 'nav.greeting') hi = (typeof getLang === 'function' && getLang() === 'bm') ? 'Hai' : 'Hi';
    span.textContent = first ? `${hi}, ${first}` : hi;
  }

  function toggleUserMenu() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
  }
  function closeUserMenu() {
    document.getElementById('user-dropdown')?.classList.add('hidden');
  }
  function chooseLang(lang) {
    setLang(lang);        // re-applies all data-i18n translations
    updateGreeting();     // greeting is built in JS, re-render it
    updateLangChecks();
    closeUserMenu();
  }
  function updateLangChecks() {
    const lang = getLang();
    const en = document.getElementById('lang-check-en');
    const bm = document.getElementById('lang-check-bm');
    if (en) en.textContent = lang === 'en' ? '' : '';
    if (bm) bm.textContent = lang === 'bm' ? '' : '';
  }
  // Close the dropdown when clicking outside of it
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('nav-user-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) closeUserMenu();
    // Also close the mobile slide-down menu when tapping outside.
    const mobile = document.getElementById('mobile-menu');
    if (mobile && !mobile.classList.contains('hidden') && !mobile.contains(e.target)) {
      const trigger = e.target.closest && e.target.closest('[aria-label="Open menu"]');
      if (!trigger) mobile.classList.add('hidden');
    }
  });

  // POST-EMAIL-CONFIRMATION REDIRECT
  // When user clicks the confirmation link in their email, Supabase
  // returns them here with auth tokens in the URL hash. The JS SDK
  // auto-parses the hash; we just listen for SIGNED_IN and route them.
  sb.auth.onAuthStateChange(async (event, session) => {
    const hash = window.location.hash || '';
    // Password recovery: let the user set a new password instead of routing them.
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && hash.includes('type=recovery'))) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      showSetPassword();
      return;
    }
    if (event !== 'SIGNED_IN' || !session) return;
    const isConfirmation = hash.includes('type=signup') || hash.includes('access_token');
    if (!isConfirmation) return;
    // Clean hash so we don't loop
    history.replaceState(null, '', window.location.pathname + window.location.search);
    await ensureProfile(session.user, session.user.user_metadata || {});
    const { data: profile } = await sb.from('shared_profiles').select('role,status').eq('id', session.user.id).single();
    if (profile) routeByRole(profile);
  });

  // FEATURED PRODUCTS
  async function loadFeaturedProducts() {
    const { data: products } = await sb.from('mkt_products')
      .select('*, profiles:shared_profiles(full_name, farm_name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6);
    const container = document.getElementById('featured-products');
    if (!products || products.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-sm py-6">No products yet. Check back soon!</p>';
      return;
    }
    container.innerHTML = products.map(p => `
      <a href="marketplace/" class="snap-start shrink-0 w-52 bg-white rounded-xl overflow-hidden shadow card-hover border border-green-100">
        <div class="h-36 bg-green-100 overflow-hidden">
          ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover" />` : '<div class="w-full h-full flex items-center justify-center text-brand-green"><svg class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg></div>'}
        </div>
        <div class="p-3">
          <p class="font-semibold text-sm text-gray-800 truncate">${p.name}</p>
          <p class="text-xs text-gray-500 truncate">${p.profiles?.farm_name || p.profiles?.full_name || 'HSI Farmer'}</p>
          <p class="text-green-700 font-bold text-sm mt-1">RM ${parseFloat(p.price).toFixed(2)} / ${p.unit}</p>
        </div>
      </a>
    `).join('');
  }

  // ANNOUNCEMENTS
  async function loadAnnouncements() {
    const { data: items } = await sb.from('mkt_announcements')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(3);
    if (!items || items.length === 0) return;
    document.getElementById('announcements-section').classList.remove('hidden');
    document.getElementById('announcements-list').innerHTML = items.map(a => `
      <div class="bg-white rounded-xl overflow-hidden shadow card-hover border border-green-100">
        ${a.image_url ? `<img src="${a.image_url}" alt="${a.title}" class="w-full h-36 object-cover" />` : ''}
        <div class="p-5">
          <h4 class="font-bold text-green-900 mb-1">${a.title}</h4>
          <p class="text-gray-600 text-sm">${a.body || ''}</p>
        </div>
      </div>
    `).join('');
  }

  initNav();

  // PWA install logic
  let deferredPrompt = null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;

  function showInstallBanner() {
    if (isStandalone) return;
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    if (isIOS) {
      document.getElementById('install-subtitle').textContent = 'Tap Share → Add to Home Screen';
      document.getElementById('install-btn').textContent = 'How to Install';
    } else {
      document.getElementById('install-subtitle').textContent = 'Install app for quick access';
      document.getElementById('install-btn').textContent = deferredPrompt ? 'Install' : 'How to Install';
    }
    banner.classList.remove('hidden');
  }

  window.handleInstall = async function() {
    // If Chrome gave us the native prompt, use it
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === 'accepted') {
        document.getElementById('pwa-install-banner').classList.add('hidden');
      }
      return;
    }
    // Otherwise show step-by-step instructions for the platform
    const modal = document.getElementById('install-modal');
    document.getElementById('ios-steps').classList.toggle('hidden', !isIOS);
    document.getElementById('android-steps').classList.toggle('hidden', isIOS);
    modal.classList.remove('hidden');
  };

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Update button to say "Install" now that native prompt is ready
    const btn = document.getElementById('install-btn');
    if (btn) btn.textContent = 'Install';
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-install-banner').classList.add('hidden');
    deferredPrompt = null;
  });

  // Show banner immediately on any mobile browser (not just when beforeinstallprompt fires)
  if (isMobile) showInstallBanner();

  // PWA service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'activated') window.location.reload();
        });
      });
    }).catch(() => {});
  }
