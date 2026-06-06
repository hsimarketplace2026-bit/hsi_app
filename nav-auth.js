// Shared header auth wiring for the static pages (About, Activities, Partners).
// Detects the current session and swaps the Login/Register button for a
// role-specific Portal button (and a cart button when the user is a buyer).
// Requires the @supabase/supabase-js CDN to be loaded first.
(function () {
  const URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(URL, KEY);

  function rel(target) {
    // Pages under /about/, /activities/, /partners/ link out with ../, the
    // landing page is at the repo root. Detect by checking the path depth.
    const segments = window.location.pathname.split('/').filter(Boolean);
    const depth = segments.length > 0 && segments[segments.length - 1].includes('.') ? segments.length - 1 : segments.length;
    return (depth > 0 ? '../' : './') + target;
  }

  sb.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    const { data: profile } = await sb
      .from('shared_profiles')
      .select('role,status')
      .eq('id', session.user.id)
      .single();
    if (!profile) return;

    const portal = document.getElementById('nav-portal-btn');
    const auth = document.getElementById('nav-auth-btn');
    const cart = document.getElementById('nav-cart-btn');
    if (!portal) return;

    const role = profile.role;
    let label = 'Buyer Portal', target = 'buyer/';
    if (role === 'admin') { label = 'Admin Portal'; target = 'admin/'; }
    else if (role === 'seller' && profile.status === 'active') { label = 'Seller Portal'; target = 'seller/'; }

    portal.textContent = label;
    portal.href = rel(target);
    portal.classList.remove('hidden');
    if (auth) auth.classList.add('hidden');

    // Cart only for buyers (or sellers/admins who can still shop).
    if (cart && (role === 'buyer' || !role)) {
      cart.href = rel('buyer/?cart=open');
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
  });
})();
