  function toggleMobileMenu(){ var m=document.getElementById('mobile-menu'); if(m) m.classList.toggle('hidden'); }
  (function(){
    function sync(){ var b=document.getElementById('lang-toggle'); if(b&&window.getLang) b.textContent=(getLang()==='en'?'BM':'EN'); }
    document.addEventListener('DOMContentLoaded', sync);
    if(window.toggleLang){ var o=window.toggleLang; window.toggleLang=function(){o();sync();}; }
  })();
