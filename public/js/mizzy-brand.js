/* MYS-UPDATE-20 */
try{if(location.pathname==='/'&&localStorage.getItem('ksl_token'))location.replace('/dashboard');}catch(e){}
/* Apply the owner-configured logo to shared brand marks without changing page behavior. */
(function(){
  function imageUrl(value){
    try{
      var u=new URL(String(value||''),location.href);
      if(u.protocol!=='https:'&&u.origin!==location.origin)return '';
      return u.href;
    }catch(e){return '';}
  }
  function applyLogo(url){
    if(!url)return;
    /* MYS-LOADER-FIX: preload first; a missing/expired logo must never replace the built-in one */
    var probe=new Image();
    probe.onload=function(){ applyLogoNow(url); };
    probe.onerror=function(){};
    probe.src=url;
  }
  function applyLogoNow(url){
    if(!url)return;
    document.querySelectorAll('.kb-logo').forEach(function(el){
      el.style.backgroundImage='none';
      var img=document.createElement('img');img.src=url;img.alt='Mizzy Sales';img.decoding='async';
      img.style.cssText='width:100%;height:100%;object-fit:contain;border-radius:inherit;position:relative;z-index:1';
      el.replaceChildren(img);
    });
    document.querySelectorAll('.footer-crown,.tb-logo,.dbfl-crown-svg').forEach(function(el){
      var img=document.createElement('img');img.src=url;img.alt='Mizzy Sales';img.decoding='async';
      img.style.cssText='width:100%;height:100%;object-fit:contain;border-radius:inherit';
      el.replaceChildren(img);
    });
    document.querySelectorAll('.nav-brand').forEach(function(el){
      if(el.querySelector('img[data-site-logo]'))return;
      if(el.firstChild&&el.firstChild.nodeType===3)el.firstChild.nodeValue=el.firstChild.nodeValue.replace(/^\s*\s*/,'');
      var img=document.createElement('img');img.src=url;img.alt='';img.dataset.siteLogo='1';img.decoding='async';
      img.style.cssText='width:26px;height:26px;object-fit:contain;vertical-align:middle;margin-right:6px';
      el.insertBefore(img,el.firstChild);
    });
  }
  function loadLogo(){
    fetch('/api/public/site-links',{cache:'no-store'}).then(function(r){
      if(!r.ok)throw new Error('Logo settings are unavailable');
      return r.json();
    }).then(function(data){applyLogo(imageUrl(data.logoUrl));}).catch(function(){});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadLogo);
  else loadLogo();
})();
/* MYS-UPDATE-19 */
(function(){
  var p=location.pathname.replace(/\/+$/,'')||'/';
  if(!/^\/(dashboard|marketplace[0-9]?|deposit|wallet|purchases|transactions|referrals|settings|boost[a-z0-9-]*|buy-number[a-z0-9-]*|number-history|tools|groups|messages|chat|notifications)$/.test(p))return;
  var t=null;try{t=localStorage.getItem('ksl_token');}catch(e){}
  if(!t){document.documentElement.style.display='none';location.replace('/login?next='+encodeURIComponent(p));return;}
  fetch('/api/user/me',{headers:{Authorization:'Bearer '+t}}).then(function(r){
    if(r.status===401||r.status===403){try{localStorage.removeItem('ksl_token');localStorage.removeItem('ksl_user');}catch(e){}location.replace('/login?next='+encodeURIComponent(p));}
  }).catch(function(){});
})();
/* MIZZY SALES background selection and light-touch brand consistency. */
(function(){
  function pick(){
    var p=(location.pathname||'/').toLowerCase();
    if(p==='/' || p.endsWith('/index.html') || p==='/login' || p==='/register') return 'kb-bg-wave';
    if(/buy-number|number-history|virtual-account|deposit|wallet|transactions|purchases|referral|settings/.test(p)) return 'kb-bg-phone';
    if(/boost|marketplace|tools|game|groups|giveaway|data-bill/.test(p)) return 'kb-bg-speed';
    return 'kb-bg-wave';
  }
  function apply(){
    try{
      var b=document.body; if(!b) return;
      b.classList.remove('kb-bg-hero','kb-bg-phone','kb-bg-speed','kb-bg-social','kb-bg-wave');
      b.classList.add(pick());
    }catch(e){}
  }
  try {
    apply();
    // The main app switches pages without reloading, so re-pick the artwork on every navigation.
    ['pushState','replaceState'].forEach(function(fn){
      var orig=history[fn];
      history[fn]=function(){ var r=orig.apply(this,arguments); setTimeout(apply,0); return r; };
    });
    window.addEventListener('popstate',apply);
    // Keep existing application logic intact; update only document branding.
          } catch(e) {}
})();

/* Moving "Mizzy Sales" name behind the whole site + appear animation for feature cards. */
(function(){
  'use strict';
  function buildDrift(){
    try{
      if(document.getElementById('kb-drift')||!document.body) return;
      var wrap=document.createElement('div'); wrap.id='kb-drift'; wrap.setAttribute('aria-hidden','true');
      var small=window.innerWidth<700, rows=small?9:11, h=window.innerHeight||800;
      for(var i=0;i<rows;i++){
        var row=document.createElement('div');
        row.className='kb-row'+(i%3===0?' kb-fill':'')+(i%2?' kb-pink':'');
        var size=small?(34+(i%3)*10):(54+(i%3)*16);
        row.style.fontSize=size+'px';
        row.style.top=Math.round((i/rows)*h-size*0.2)+'px';
        row.style.setProperty('--kb-dur',(46+(i*7)%34)+'s');
        row.style.setProperty('--kb-dir',i%2?'reverse':'normal');
        var html='';
        for(var k=0;k<24;k++) html+='<span>Mizzy Sales</span>';   // list is longer than 2 screens; it slides by half its width
        row.innerHTML=html; wrap.appendChild(row);
      }
      var spots=small?3:5;
      for(var j=0;j<spots;j++){
        var f=document.createElement('div'); f.className='kb-float'; f.textContent='Mizzy Sales';
        f.style.left=(6+(j*83)%80)+'%'; f.style.top=(10+(j*37)%75)+'%';
        f.style.fontSize=(small?20:30)+(j%3)*6+'px';
        f.style.setProperty('--kb-dur',(12+j*3)+'s'); f.style.setProperty('--kb-del',(-j*2.3)+'s');
        f.style.setProperty('--kb-rot',((j%2)?8:-8)+'deg'); wrap.appendChild(f);
      }
      document.body.appendChild(wrap);
    }catch(e){}
  }
  var CARD_SEL='.why-card,.mys-what-card,.rs-item,.mys-step';
  function setupReveal(){
    try{
      if(!('IntersectionObserver' in window)) return;
      var io=new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(en.isIntersecting){ en.target.classList.add('kb-in'); io.unobserve(en.target); }
        });
      },{threshold:0.12,rootMargin:'0px 0px -6% 0px'});
      function scan(){
        var groups=new Map();
        document.querySelectorAll(CARD_SEL).forEach(function(c){
          if(c.dataset.kbSeen) return; c.dataset.kbSeen='1';
          var p=c.parentElement, idx=groups.get(p)||0; groups.set(p,idx+1);
          c.classList.add('kb-reveal');
          if(idx%3===0) c.classList.add('kb-from-left'); else if(idx%3===2) c.classList.add('kb-from-right');
          c.style.setProperty('--kb-d',Math.min(idx*0.09,0.6)+'s');
          io.observe(c);
        });
      }
      scan();
      // pages are swapped without reloading, so look again after navigation
      ['pushState','popstate'].forEach(function(n){ if(n==='popstate') window.addEventListener(n,function(){setTimeout(scan,300);}); else{ var o=history[n]; history[n]=function(){var r=o.apply(this,arguments); setTimeout(scan,300); return r;}; }});
      // safety net: never leave a card invisible
      setTimeout(function(){ document.querySelectorAll('.kb-reveal:not(.kb-in)').forEach(function(c){ var r=c.getBoundingClientRect(); if(r.top<window.innerHeight&&r.bottom>0) c.classList.add('kb-in'); }); },2500);
    }catch(e){}
  }
  function init(){ buildDrift(); setupReveal(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();



/* Mizzy crown + logo loader: visible while a page loads and while we leave for the next one. */
(function(){
  'use strict';
  var t0=Date.now(), el=null;
  function make(){
    if(el||!document.body) return el;
    el=document.createElement('div'); el.id='kb-loader'; el.setAttribute('aria-hidden','true');
    el.innerHTML='<div class="kb-logo"></div>';
    document.body.appendChild(el); return el;
  }
  function show(){ var e=make(); if(e) e.classList.remove('kb-hide'); }
  function hide(){ var e=make(); if(!e) return; var wait=Math.max(0,(location.pathname==='/'?700:1200)-(Date.now()-t0)); setTimeout(function(){ e.classList.add('kb-hide'); },wait); }
  make();                                              // up immediately on first paint of the new page
  if(document.readyState==='complete') hide(); else window.addEventListener('load',hide);
  setTimeout(hide,6000);                               // never trap the visitor if something is slow
  window.addEventListener('pageshow',function(ev){ if(ev.persisted){ t0=0; hide(); } });
  window.addEventListener('beforeunload',show);        // leaving: show it until the next page enters
  document.addEventListener('click',function(ev){      // same-site links
    var a=ev.target.closest&&ev.target.closest('a[href]'); if(!a||ev.defaultPrevented||ev.metaKey||ev.ctrlKey||ev.shiftKey) return;
    if(a.target==='_blank'||a.hasAttribute('download')) return;
    var h=a.getAttribute('href'); if(!h||h.charAt(0)==='#'||/^(mailto|tel|javascript):/i.test(h)) return;
    try{ var u=new URL(a.href,location.href); if(u.origin===location.origin && (u.pathname!==location.pathname||u.search!==location.search)){ show(); setTimeout(function(){ if(document.visibilityState==='visible') hide(); },5000); } }catch(e){}
  },true);
})();

/* MYS-UPDATE-3 */
(function(){
  var re=/notif|bell|lang|flag|support|headset|help|contact|chat/i;
  function run(){
    var els=document.querySelectorAll('a,button,div,span');
    for(var i=0;i<els.length;i++){
      var e=els[i];
      if(e.dataset.mysHid)continue;
      var sig=(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)+' '+(e.id||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('href')||'');
      if(!re.test(sig))continue;
      if(e.closest('.mys-drawer'))continue;
      var r=e.getBoundingClientRect();
      if(r.width>90||r.height>90||r.width<10)continue;
      if(r.top<0||r.top>110)continue;
      var fixed=false,n=e;
      while(n&&n!==document.body){if(getComputedStyle(n).position==='fixed'){fixed=true;break;}n=n.parentElement;}
      if(fixed)continue;
      e.style.setProperty('display','none','important');
      e.dataset.mysHid='1';
    }
  }
  document.addEventListener('DOMContentLoaded',function(){run();setTimeout(run,600);setTimeout(run,1800);});
})();

/* MYS-UPDATE-5 */
(function(){
  if(!document.getElementById('numHowToCard'))return;
  var heads=['how buying works on this server','notifications you will get'];
  function hasCtl(n){return n.querySelector&&n.querySelector('button,input,select,textarea,a');}
  function clean(){
    document.querySelectorAll('.step-label').forEach(function(e){
      var t=(e.textContent||'').trim().toLowerCase();
      if(heads.indexOf(t)<0)return;
      var n=e.nextElementSibling,c=0;
      while(n&&c<6&&n.className.indexOf('step-label')<0&&!hasCtl(n)&&!/^H[1-6]$/.test(n.tagName)){
        n.style.setProperty('display','none','important');n=n.nextElementSibling;c++;
      }
      e.style.setProperty('display','none','important');
    });
    document.querySelectorAll('div,p,span').forEach(function(e){
      if(e.children.length===0&&/Stock and prices here change/i.test(e.textContent||'')){
        var p=e.parentElement,tgt=(p&&p!==document.body&&(p.textContent||'').length<(e.textContent||'').length+40)?p:e;
        tgt.style.setProperty('display','none','important');
      }
    });
  }
  var tm=null;
  function later(){clearTimeout(tm);tm=setTimeout(clean,120);}
  document.addEventListener('DOMContentLoaded',function(){
    clean();
    new MutationObserver(later).observe(document.body,{childList:true,subtree:true});
  });
})();

/* MYS-UPDATE-9 */
try{if(localStorage.getItem('ksl_token'))document.documentElement.classList.add('mys-in');}catch(e){}

/* MYS-UPDATE-10 */
(function(){
  function grid(){
    var it=document.querySelector('.dsh-svc-item');
    if(!it||!it.parentElement)return;
    var g=it.parentElement,st=g.style;
    st.setProperty('display','grid','important');
    st.setProperty('grid-template-columns','repeat(4,minmax(0,1fr))','important');
    st.setProperty('gap','8px','important');
    st.setProperty('flex-direction','row','important');
    g.querySelectorAll('.dsh-svc-item').forEach(function(e){
      e.style.setProperty('width','auto','important');
      e.style.setProperty('min-width','0','important');
      e.style.setProperty('padding','10px 4px','important');
    });
  }
  function pills(){
    document.querySelectorAll('body *').forEach(function(e){
      if(e.dataset.mysPill)return;
      var cs=getComputedStyle(e);
      if(cs.position!=='fixed'&&cs.position!=='sticky')return;
      var r=e.getBoundingClientRect();
      if(r.height<10||r.height>36||r.width<30||r.width>170)return;
      if((e.textContent||'').trim()!=='')return;
      if(e.querySelector('svg,img,button,a,input'))return;
      if(e.closest('.mys-drawer,.mys-sheet'))return;
      var sig=(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)+' '+e.id;
      if(/fab|support|float|headset|chat/i.test(sig))return;
      e.style.setProperty('display','none','important');
      e.dataset.mysPill='1';
    });
  }
  function run(){grid();pills();}
  document.addEventListener('DOMContentLoaded',function(){
    run();
    var n=0,iv=setInterval(function(){run();if(++n>12)clearInterval(iv);},800);
  });
  window.addEventListener('load',run);
})();

/* MYS-UPDATE-11 */
(function(){
  function chips(){
    var w=[].slice.call(document.querySelectorAll('button,a')).find(function(e){return /^wallet$/i.test((e.textContent||'').trim());});
    if(!w||!w.parentElement)return;
    var p=w.parentElement;
    /* mys-skip-navcenter */ if(p.id==='navCenter'||(p.classList&&p.classList.contains('nav-center')))return;
    p.style.setProperty('display','flex','important');p.style.setProperty('flex-wrap','wrap','important');
    p.style.setProperty('gap','8px','important');p.style.setProperty('padding','12px 14px','important');
    p.querySelectorAll('button,a').forEach(function(b){
      var on=/active|selected|on/i.test(b.className||'');
      b.style.setProperty('background',on?'#0b7cf5':'#ffffff','important');
      b.style.setProperty('color',on?'#fff':'#0b1b3a','important');
      b.style.setProperty('border','1px solid '+(on?'#0b7cf5':'#c5d6ee'),'important');
      b.style.setProperty('padding','8px 14px','important');
      b.style.setProperty('border-radius','999px','important');
      b.style.setProperty('font-size','13px','important');
      b.style.setProperty('white-space','nowrap','important');
    });
  }
  function overlay(t){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;z-index:100000;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#0b1b3a;font:600 15px system-ui';
    o.innerHTML='<div style="width:54px;height:54px;border-radius:50%;border:3px solid rgba(24,160,251,.25);border-top-color:#18a0fb;animation:kshsp 1s linear infinite"></div><div>'+t+'</div><style>@keyframes kshsp{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(o);
  }
  document.addEventListener('click',function(ev){
    var e=ev.target&&ev.target.closest?ev.target.closest('#mysLogout,[onclick*="logout" i],[data-logout]'):null;
    if(!e||e.dataset.mysGo)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    overlay('Logging you out...');
    setTimeout(function(){e.dataset.mysGo='1';e.click();},1500);
  },true);
  document.addEventListener('DOMContentLoaded',function(){
    chips();var n=0,iv=setInterval(function(){chips();if(++n>15)clearInterval(iv);},700);
  });
})();

/* MYS-UPDATE-12 */
document.addEventListener('click',function(ev){
  var t=ev.target&&ev.target.closest?ev.target.closest('[onclick]'):null;
  if(!t)return;
  var oc=t.getAttribute('onclick')||'';
  if(oc.indexOf('showPage')<0)return;
  var dest=oc.indexOf('register')>-1?'/register':(oc.indexOf('login')>-1?'/login':'');
  if(!dest)return;
  var tok=null;try{tok=localStorage.getItem('ksl_token');}catch(e){}
  if(tok||location.pathname===dest)return;
  ev.preventDefault();ev.stopImmediatePropagation();
  location.href=dest;
},true);

/* MYS-UPDATE-13 */
(function(){
  function full(e){var t=e.textContent||'';return t.length<220&&/Number order/i.test(t)&&/\u20A6/.test(t)&&/failed|success|pending|completed|refunded|cancel/i.test(t);}
  function rows(){
    document.querySelectorAll('div,li,a,section,article').forEach(function(e){
      if(e.dataset.mysBrandRow||!full(e))return;
      var kids=[].slice.call(e.children);
      if(kids.some(full))return;
      e.dataset.mysBrandRow='1';e.classList.add('mys-brandrow');
      e.querySelectorAll('*').forEach(function(c){if(c.children.length>1&&!c.closest('svg'))c.classList.add('mys-brandrow-in');});
    });
  }
  document.addEventListener('DOMContentLoaded',function(){
    rows();new MutationObserver(function(){rows();}).observe(document.body,{childList:true,subtree:true});
  });
})();


/* MYS-BROKEN-IMG-GUARD: a broken logo image must never show (broken icon + "Mizzy Sales" alt text) */
document.addEventListener('error',function(e){
  var t=e.target;
  if(t&&t.tagName==='IMG'&&t.closest&&t.closest('#kb-loader,.dbfl-overlay,.kb-logo,.dbfl-crown-svg')){ try{ t.remove(); }catch(_){ t.style.display='none'; } }
},true);
