// Shared header auth + nav wiring for the static public pages (Home, About,
// Activities, Partners, Contact). Detects the current Supabase session and
// hides/shows the role-specific Portal / Shop / Cart / user-menu pills so the
// header behaves identically to the landing-page header (driven by app.js's
// initNav on index.html).
//
// Requires the @supabase/supabase-js CDN to be loaded first. Safe to load
// alongside the landing page's own app.js — exported window helpers only
// install themselves if not already defined.

// Close the mobile slide-down menu when the user taps anywhere outside it.
document.addEventListener('click', function (e) {
  var menu = document.getElementById('mobile-menu');
  if (menu && !menu.classList.contains('hidden')) {
    var insideMenu = menu.contains(e.target);
    var trigger = e.target.closest && e.target.closest('[aria-label="Open menu"]');
    if (!insideMenu && !trigger) menu.classList.add('hidden');
  }
  // Close the user dropdown when clicking outside of it.
  var userMenu = document.getElementById('nav-user-menu');
  if (userMenu && !userMenu.classList.contains('hidden') && !userMenu.contains(e.target)) {
    var dd = document.getElementById('user-dropdown');
    if (dd) dd.classList.add('hidden');
  }
});

(function () {
  const URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(URL, KEY);

  // Returns a path relative to the current page that lands inside the repo
  // root's `target` directory. Pages under /about/, /activities/, /partners/,
  // /contact/ live one directory deep, so they need `../target`; the landing
  // page is at the root and uses `target` directly. An empty `target` returns
  // the repo root.
  function rel(target) {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const last = segments.length > 0 ? segments[segments.length - 1] : '';
    const isFile = last.includes('.');
    const depth = isFile ? segments.length - 1 : segments.length;
    const prefix = depth > 0 ? '../' : './';
    return prefix + target;
  }

  // --- Shared window helpers (only install if landing-page app.js hasn't already)
  if (typeof window.toggleMobileMenu !== 'function') {
    window.toggleMobileMenu = function () {
      var m = document.getElementById('mobile-menu');
      if (m) m.classList.toggle('hidden');
    };
  }
  if (typeof window.toggleUserMenu !== 'function') {
    window.toggleUserMenu = function () {
      var dd = document.getElementById('user-dropdown');
      if (dd) dd.classList.toggle('hidden');
    };
  }
  if (typeof window.closeUserMenu !== 'function') {
    window.closeUserMenu = function () {
      var dd = document.getElementById('user-dropdown');
      if (dd) dd.classList.add('hidden');
    };
  }
  if (typeof window.doLogout !== 'function') {
    window.doLogout = async function () {
      try { await sb.auth.signOut(); } catch (_) {}
      window.location.href = rel('');
    };
  }
  if (typeof window.goToProfile !== 'function') {
    window.goToProfile = async function () {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { window.location.href = rel(''); return; }
      const { data: profile } = await sb
        .from('shared_profiles')
        .select('role,status')
        .eq('id', session.user.id)
        .single();
      if (!profile) { window.location.href = rel('buyer/?tab=profile'); return; }
      if (profile.role === 'admin') { window.location.href = rel('admin/'); return; }
      if (profile.role === 'seller' && profile.status === 'active') {
        window.location.href = rel('seller/?tab=profile');
        return;
      }
      window.location.href = rel('buyer/?tab=profile');
    };
  }
  if (typeof window.goToDashboard !== 'function') {
    window.goToDashboard = async function () {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { window.location.href = rel(''); return; }
      const { data: profile } = await sb
        .from('shared_profiles')
        .select('role,status')
        .eq('id', session.user.id)
        .single();
      if (!profile) { window.location.href = rel('buyer/'); return; }
      if (profile.role === 'admin') { window.location.href = rel('admin/'); return; }
      if (profile.role === 'seller' && profile.status === 'active') {
        window.location.href = rel('seller/');
        return;
      }
      window.location.href = rel('buyer/');
    };
  }
  if (typeof window.openAuth !== 'function') {
    // On the public pages we don't have the auth panel — bounce the user to
    // the landing page where openAuth() is defined and the panel exists.
    window.openAuth = function () { window.location.href = rel(''); };
  }

  // --- Greeting helper ---------------------------------------------------
  function writeGreeting(fullName) {
    const span = document.getElementById('nav-user-greeting');
    if (!span) return;
    const first = (fullName || '').split(' ')[0] || fullName || '';
    let hi = '';
    if (typeof window.t === 'function') {
      const v = window.t('nav.greeting');
      if (v && v !== 'nav.greeting') hi = v;
    }
    if (!hi) hi = (typeof window.getLang === 'function' && window.getLang() === 'bm') ? 'Hai' : 'Hi';
    span.textContent = first ? `${hi}, ${first}` : hi;
  }

  // --- Main wiring -------------------------------------------------------
  sb.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    const { data: profile } = await sb
      .from('shared_profiles')
      .select('full_name,role,status')
      .eq('id', session.user.id)
      .single();
    if (!profile) return;

    const portal   = document.getElementById('nav-portal-btn');
    const auth     = document.getElementById('nav-auth-btn');
    const lang     = document.getElementById('lang-toggle');
    const shop     = document.getElementById('nav-shop-btn');
    const cart     = document.getElementById('nav-cart-btn');
    const userMenu = document.getElementById('nav-user-menu');

    const role = profile.role;
    let label = 'Buyer Portal', target = 'buyer/';
    if (role === 'admin') { label = 'Admin Portal'; target = 'admin/'; }
    else if (role === 'seller' && profile.status === 'active') { label = 'Seller Portal'; target = 'seller/'; }

    if (portal) {
      portal.textContent = label;
      portal.removeAttribute('data-i18n'); // prevent applyTranslations from overwriting role-specific label
      portal.href = rel(target);
      portal.classList.remove('hidden');
    }
    if (auth) auth.classList.add('hidden');
    if (lang) lang.classList.add('hidden');

    // Shop + cart are only meaningful for buyers (or profiles missing a role).
    if (role === 'buyer' || !role) {
      if (shop) {
        shop.href = rel('marketplace/');
        shop.classList.remove('hidden');
      }
      if (cart) {
        // On non-landing pages the cart link can't open the landing-page drawer,
        // so route it to the marketplace cart view; on the landing page the
        // inline onclick="toggleCart()" handler still wins.
        if (!cart.getAttribute('onclick')) {
          cart.setAttribute('href', rel('marketplace/?cart=open'));
        }
        cart.classList.remove('hidden');
        const { count } = await sb
          .from('mkt_cart_items')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', session.user.id);
        const badge = document.getElementById('cart-badge');
        if (badge && count && count > 0) {
          badge.textContent = count;
          badge.classList.remove('hidden');
        }
      }
    }

    // Sellers and admins should not see the SHOP link in the header — they
    // cannot place orders.
    if (role === 'seller' || role === 'admin') {
      document.querySelectorAll('[data-i18n="nav.shop"]').forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
      });
    }

    if (userMenu) {
      userMenu.classList.remove('hidden');
      writeGreeting(profile.full_name || session.user.email || '');
    }
  });
})();
