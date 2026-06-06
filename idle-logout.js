/* idle-logout.js — auto sign-out after 15 min with no user interaction */
(function () {
  const IDLE_MS = 15 * 60 * 1000;
  const SUPABASE_URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';

  const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  let timer = null;
  let client = null;

  function rootHref() {
    const segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    return segs.length > 1 ? '../' : './';
  }

  async function doLogout() {
    if (!client) return;
    await client.auth.signOut();
    window.location.href = rootHref();
  }

  function resetTimer() {
    clearTimeout(timer);
    timer = setTimeout(doLogout, IDLE_MS);
  }

  function startWatching() {
    EVENTS.forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
  }

  function stopWatching() {
    EVENTS.forEach(ev => document.removeEventListener(ev, resetTimer));
    clearTimeout(timer);
    timer = null;
  }

  async function init() {
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') return;
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: { session } } = await client.auth.getSession();
    if (session) startWatching();

    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') startWatching();
      if (event === 'SIGNED_OUT') stopWatching();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
