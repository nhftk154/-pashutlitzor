(function(){
  document.getElementById('year').textContent = new Date().getFullYear();

  fetch('../content/site-text.json').then(function(r){ return r.json(); }).then(function(t){
    if(t && t.footer){
      if(t.footer.brand){
        document.getElementById('footer-brand-logo').textContent = t.footer.brand;
        document.getElementById('footer-brand-copy').textContent = t.footer.brand;
      }
      if(t.footer.rights){
        document.getElementById('footer-rights').textContent = t.footer.rights;
      }
    }
  }).catch(function(err){
    console.error('טעינת טקסט הפוטר נכשלה:', err);
  });

  var burger = document.getElementById('nav-burger');
  var mobileNav = document.getElementById('nav-mobile');
  burger.addEventListener('click', function(){
    var open = mobileNav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'סגירת תפריט' : 'פתיחת תפריט');
  });
  mobileNav.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){
      mobileNav.classList.remove('open');
      burger.setAttribute('aria-expanded','false');
      burger.setAttribute('aria-label','פתיחת תפריט');
    });
  });
})();
