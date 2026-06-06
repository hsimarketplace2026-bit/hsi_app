// Auto-logout: signs out on page reload, or after 30 minutes of inactivity.
(function () {
  'use strict';
  var URL = 'https://kdhcxmzwgiwyskfamvkb.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGN4bXp3Z2l3eXNrZmFtdmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODYzMDgsImV4cCI6MjA5NTg2MjMwOH0.gvvp2oKrkEPLtbjmBsj_u4Hby8nyy52qi7tSNaDU3Bk';
  var IDLE_MS = 30 * 60 * 1000;

  if (!window.supabase) return;
  var sb = window.supabase.createClient(URL, KEY);

  function rootHref() {
    var segs = window.location.pathname.split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    var isFile = last.indexOf('.') !== -1;
    var depth = isFile ? segs.length - 1 : segs.length;
    return depth > 0 ? '../'.repeat(depth) : './';
  }

  function expire() {
    sb.auth.signOut().catch(function () {}).finally(function () {
      window.location.replace(rootHref());
    });
  }

  sb.auth.getSession().then(function (result) {
    var session = result && result.data && result.data.session;
    if (!session) return;

    // Sign out immediately when the user reloads the page.
    var nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload') { expire(); return; }

    // Sign out after 30 minutes of inactivity.
    var timer;
    function reset() {
      clearTimeout(timer);
      timer = setTimeout(expire, IDLE_MS);
    }
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (e) {
      document.addEventListener(e, reset, { passive: true });
    });
    reset();
  }).catch(function () {});
})();
