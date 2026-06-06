// Shared auth modal — works on any page that loads it.
// On the landing page, app.js defines openAuth first so these guards make
// this file a no-op there. On every other page it injects the full panel.
(function () {
  'use strict';
  if (typeof window.openAuth === 'function') return; // landing page already owns this

  var SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  if (!window.supabase) return;
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Depth-aware root path (same logic as nav-auth.js rel())
  function rootHref() {
    var segs = window.location.pathname.split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    var isFile = last.indexOf('.') !== -1;
    var depth = isFile ? segs.length - 1 : segs.length;
    return depth > 0 ? '../'.repeat(depth) : './';
  }

  // ── Inject panel HTML + slide-in CSS once ──────────────────────────────
  function ensurePanel() {
    if (document.getElementById('auth-panel')) return;

    var st = document.createElement('style');
    st.textContent = '#auth-panel{transform:translateX(100%);transition:transform 0.3s ease;}#auth-panel.open{transform:translateX(0);}';
    document.head.appendChild(st);

    var overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'hidden fixed inset-0 bg-black bg-opacity-40 z-40';
    overlay.onclick = function () { window.closeAuth(); };
    document.body.appendChild(overlay);

    var panel = document.createElement('div');
    panel.id = 'auth-panel';
    panel.className = 'fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-2xl overflow-y-auto';
    panel.innerHTML = `
<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-brand-bluedark" data-i18n="auth.welcome">Welcome</h2>
    <button onclick="closeAuth()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
  </div>

  <!-- LOGIN FORM -->
  <form id="login-form" onsubmit="return false;">
    <div class="space-y-4">
      <div id="login-error" class="hidden bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3"></div>
      <div id="login-info" class="hidden bg-green-50 border border-green-300 text-green-700 text-sm rounded-lg px-4 py-3"></div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.email">Email</label>
        <input type="email" id="login-email" required placeholder="you@example.com" autocomplete="email"
          class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.password">Password</label>
        <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password"
          onkeydown="if(event.key==='Enter') doLogin()"
          class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
      </div>
      <button type="button" id="login-btn" onclick="doLogin()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg transition text-sm" data-i18n="auth.login_btn">Login</button>
      <div class="text-center pt-1">
        <button type="button" onclick="doForgotPassword()" class="text-sm text-brand-blue hover:text-brand-bluedark font-medium hover:underline" data-i18n="auth.forgot_password">Forgot password?</button>
      </div>
      <div class="text-center text-sm text-gray-500">
        <span data-i18n="auth.no_account">Don't have an account?</span>
        <button type="button" onclick="switchTab('register')" class="text-brand-blue font-semibold hover:underline ml-1" data-i18n="auth.sign_up">Sign up</button>
      </div>
    </div>
  </form>

  <!-- REGISTER FORM -->
  <form id="register-form" class="hidden" onsubmit="doRegister(event)">
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.full_name">Full Name</label>
        <input type="text" id="reg-name" required placeholder="Juan dela Cruz"
          class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.email">Email</label>
        <input type="email" id="reg-email" required placeholder="you@example.com" autocomplete="email"
          class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.password">Password</label>
        <input type="password" id="reg-password" required placeholder="Min. 6 characters" minlength="6" autocomplete="new-password"
          class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.phone">Phone</label>
        <input type="tel" id="reg-phone" placeholder="+60 12 345 6789"
          class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2" data-i18n="auth.role_prompt">I am a…</label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="role" value="buyer" checked onchange="toggleSellerFields()" class="accent-brand-green" />
            <span class="text-sm" data-i18n="auth.role_buyer">Buyer</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="role" value="seller" onchange="toggleSellerFields()" class="accent-brand-green" />
            <span class="text-sm" data-i18n="auth.role_seller">Seller / Farmer</span>
          </label>
        </div>
      </div>
      <div id="seller-fields" class="hidden space-y-3 border-l-4 border-brand-green pl-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.farm_name">Farm Name</label>
          <input type="text" id="reg-farm-name" placeholder="Green Acres Farm"
            class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" data-i18n="auth.farm_location">Farm Location</label>
          <input type="text" id="reg-farm-location" placeholder="Barangay, City, Province"
            class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-blue text-sm" />
        </div>
        <p class="text-xs text-amber-600 bg-amber-50 rounded p-2" data-i18n="auth.seller_warning">Seller accounts require admin approval before you can list products.</p>
      </div>
      <button type="submit" id="reg-btn" class="w-full btn-primary text-white font-semibold py-3 rounded-lg transition text-sm" data-i18n="auth.create_account">Create Account</button>
      <div id="reg-error" class="hidden bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3"></div>
      <div class="text-center text-sm text-gray-500 pt-1">
        <span data-i18n="auth.have_account">Already have an account?</span>
        <button type="button" onclick="switchTab('login')" class="text-brand-blue font-semibold hover:underline ml-1" data-i18n="auth.log_in">Log in</button>
      </div>
    </div>
  </form>

  <!-- EMAIL CONFIRMATION NOTICE -->
  <div id="confirm-notice" class="hidden text-center py-4">
    <div class="w-16 h-16 bg-brand-greenlight rounded-full flex items-center justify-center mx-auto mb-4">
      <svg class="w-8 h-8 text-brand-greendark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
    </div>
    <h3 class="text-lg font-bold text-gray-900 mb-2" data-i18n="auth.check_email_title">Check your email</h3>
    <p class="text-gray-600 text-sm mb-1" data-i18n="auth.check_email_subtitle">We sent a confirmation link to:</p>
    <p id="confirm-email-display" class="font-semibold text-brand-blue text-sm mb-4"></p>
    <p class="text-gray-500 text-xs" data-i18n="auth.check_email_hint">Click the link in the email to activate your account, then come back here to log in.</p>
    <button onclick="switchTab('login')" class="mt-5 w-full border border-brand-green text-brand-greendark font-semibold py-2.5 rounded-lg text-sm hover:bg-brand-greenlight transition" data-i18n="auth.back_to_login">Back to Login</button>
  </div>
</div>`;
    document.body.appendChild(panel);
  }

  // ── Panel open / close ─────────────────────────────────────────────────
  window.openAuth = function (tab) {
    ensurePanel();
    document.getElementById('auth-panel').classList.add('open');
    document.getElementById('auth-overlay').classList.remove('hidden');
    switchTab(tab || 'login');
  };
  window.closeAuth = function () {
    var p = document.getElementById('auth-panel');
    var o = document.getElementById('auth-overlay');
    if (p) p.classList.remove('open');
    if (o) o.classList.add('hidden');
  };

  // ── Tab switching ──────────────────────────────────────────────────────
  window.switchTab = function (tab) {
    ensurePanel();
    var forms = ['login-form', 'register-form', 'confirm-notice'];
    forms.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    var show = tab === 'register' ? 'register-form' : tab === 'confirm' ? 'confirm-notice' : 'login-form';
    var el = document.getElementById(show);
    if (el) el.classList.remove('hidden');
  };

  window.toggleSellerFields = function () {
    var el = document.querySelector('input[name="role"]:checked');
    var fields = document.getElementById('seller-fields');
    if (el && fields) fields.classList.toggle('hidden', el.value !== 'seller');
  };

  // ── Route after login ──────────────────────────────────────────────────
  function routeAfterLogin(profile) {
    var root = rootHref();
    if (!profile) { window.location.href = root + 'buyer/'; return; }
    if (profile.role === 'admin') { window.location.href = root + 'admin/'; return; }
    if (profile.role === 'seller' && profile.status !== 'active') {
      alert('Your seller account is pending admin approval.');
      window.closeAuth();
      return;
    }
    if (profile.role === 'seller') { window.location.href = root + 'seller/'; return; }
    window.location.href = root + 'buyer/';
  }

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

  // ── Login ──────────────────────────────────────────────────────────────
  window.doLogin = async function () {
    var btn = document.getElementById('login-btn');
    var errBox = document.getElementById('login-error');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    var res = await sb.auth.signInWithPassword({
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value
    });
    if (res.error) {
      var msg = res.error.message;
      if (msg.toLowerCase().includes('not confirmed')) msg = 'Please check your email and click the confirmation link before logging in.';
      else if (msg.toLowerCase().includes('invalid login')) msg = 'Incorrect email or password.';
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Login';
      return;
    }
    btn.textContent = 'Redirecting…';
    var profRes = await sb.from('shared_profiles').select('role,status').eq('id', res.data.user.id).single();
    if (profRes.error || !profRes.data) {
      await ensureProfile(res.data.user, res.data.user.user_metadata || {});
      profRes = await sb.from('shared_profiles').select('role,status').eq('id', res.data.user.id).single();
    }
    routeAfterLogin(profRes.data);
  };

  // ── Forgot password ────────────────────────────────────────────────────
  window.doForgotPassword = async function () {
    var email = document.getElementById('login-email').value.trim();
    var errBox = document.getElementById('login-error');
    var infoBox = document.getElementById('login-info');
    errBox.classList.add('hidden');
    infoBox.classList.add('hidden');
    if (!email) { errBox.textContent = 'Enter your email address first.'; errBox.classList.remove('hidden'); return; }
    var { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + rootHref() });
    if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
    infoBox.textContent = 'Reset link sent! Check your inbox.';
    infoBox.classList.remove('hidden');
  };

  // ── Register ───────────────────────────────────────────────────────────
  window.doRegister = async function (e) {
    e.preventDefault();
    var btn = document.getElementById('reg-btn');
    var errBox = document.getElementById('reg-error');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Creating account…';
    var email = document.getElementById('reg-email').value.trim();
    var roleEl = document.querySelector('input[name="role"]:checked');
    var role = roleEl ? roleEl.value : 'buyer';
    var meta = {
      full_name: document.getElementById('reg-name').value.trim(),
      role: role,
      phone: document.getElementById('reg-phone').value.trim(),
      farm_name: (document.getElementById('reg-farm-name').value || '').trim() || null,
      farm_location: (document.getElementById('reg-farm-location').value || '').trim() || null
    };
    var res = await sb.auth.signUp({
      email: email,
      password: document.getElementById('reg-password').value,
      options: { data: meta, emailRedirectTo: window.location.origin + rootHref() }
    });
    if (res.error) {
      errBox.textContent = res.error.message;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Create Account';
      return;
    }
    var disp = document.getElementById('confirm-email-display');
    if (disp) disp.textContent = email;
    switchTab('confirm');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  };
})();
