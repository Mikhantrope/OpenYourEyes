(function(){
  const PFU = window.PFU || {};
  PFU.fmtN = v => Math.round(Number(v)||0).toLocaleString('ru-RU');
  PFU.fmtRev = v => {
    v = Number(v)||0; const a=Math.abs(v);
    if(a>=1e9) return (v/1e9).toFixed(1)+' млрд';
    if(a>=1e6) return (v/1e6).toFixed(1)+' млн';
    if(a>=1e3) return Math.round(v).toLocaleString('ru-RU');
    return Math.round(v).toLocaleString('ru-RU');
  };
  PFU.fmtPct = v => (Number(v)>=0?'+':'')+(Number(v)||0).toFixed(1)+'%';
  PFU.copyText = async function(text, btn){
    const old = btn ? btn.textContent : '';
    try{
      if(btn){btn.classList.add('busy');btn.textContent='Копирую...';}
      if(navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      if(btn){btn.classList.remove('busy','err');btn.classList.add('ok');btn.textContent='✅ Скопировано';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=old;},1600);}
      return true;
    }catch(e){ console.error(e); if(btn){btn.classList.remove('busy','ok');btn.classList.add('err');btn.textContent='❌ Ошибка';setTimeout(()=>{btn.classList.remove('err');btn.textContent=old;},2000);} return false; }
  };
  PFU.loadHtml2Canvas = function(){
    if(window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload=()=>resolve(window.html2canvas); s.onerror=reject; document.head.appendChild(s); });
  };
  PFU.downloadBlob = function(blob, filename){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename||'pf-screenshot.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),800); };
  PFU.copyElementScreenshot = async function(el, btn, filename, title, subtitle){
    const old = btn ? btn.textContent : '';
    try{
      if(!el) throw new Error('Элемент не найден');
      if(btn){btn.classList.add('busy');btn.textContent='Готовлю скрин...';}
      const html2canvas = await PFU.loadHtml2Canvas();
      const wrap=document.createElement('div'); wrap.className='pf-shot-wrap';
      wrap.innerHTML=`<div class="pf-shot-title">${title||document.title}</div><div class="pf-shot-sub">${subtitle||new Date().toLocaleString('ru-RU')}</div>`;
      const clone=el.cloneNode(true); clone.removeAttribute('id'); wrap.appendChild(clone); document.body.appendChild(wrap);
      const canvas = await html2canvas(wrap,{backgroundColor:getComputedStyle(document.body).getPropertyValue('--bg')||'#07090f',scale:2,useCORS:true,logging:false,windowWidth:Math.max(wrap.scrollWidth,1200),windowHeight:Math.max(wrap.scrollHeight,700)});
      wrap.remove();
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('PNG не создан');
      if(navigator.clipboard && window.ClipboardItem){ await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); if(btn){btn.classList.remove('busy','err');btn.classList.add('ok');btn.textContent='✅ Картинка';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=old;},1800);} }
      else { PFU.downloadBlob(blob, filename||'pf-screenshot.png'); if(btn){btn.classList.remove('busy','err');btn.classList.add('ok');btn.textContent='⬇️ PNG';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=old;},1800);} }
      return true;
    }catch(e){ console.error(e); if(btn){btn.classList.remove('busy','ok');btn.classList.add('err');btn.textContent='❌ Скрин';setTimeout(()=>{btn.classList.remove('err');btn.textContent=old;},2200);} return false; }
  };
  PFU.getPage = () => (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  PFU.ensureDirLink = function(){
    const navs=[...document.querySelectorAll('.nav')];
    navs.forEach(nav=>{
      const has=[...nav.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('dir.html'));
      if(!has){ const nr=nav.querySelector('.nav-r'); const a=document.createElement('a'); a.href='dir.html'; a.textContent='📑 ДиР'; if(PFU.getPage()==='dir.html') a.classList.add('active'); nav.insertBefore(a,nr||null); }
      [...nav.querySelectorAll('a')].forEach(a=>{ const href=(a.getAttribute('href')||'').split('#')[0].toLowerCase(); if(href && href===PFU.getPage()) a.classList.add('active'); });
    });
  };
  PFU.applyTheme = function(theme){
    theme = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme=theme;
    try{localStorage.setItem('pf.theme',theme);}catch(e){};
    const btn=document.getElementById('pfThemeBtn');
    if(btn) btn.textContent = theme==='light'?'🌙 Тёмная':'☀️ Светлая';
    /* Update Chart.js globals if loaded */
    if(window.Chart){
      const cs=getComputedStyle(document.body);
      Chart.defaults.color=cs.getPropertyValue('--muted').trim()||'#5a7a96';
      Chart.defaults.borderColor=cs.getPropertyValue('--border').trim()||'#1e2d40';
      /* Re-render all active charts */
      Object.values(Chart.instances||{}).forEach(c=>{try{c.update();}catch(e){}});
    }
  };
  PFU.toggleTheme = function(){ PFU.applyTheme(document.body.dataset.theme==='light'?'dark':'light'); };
  PFU.initTheme = function(){ let theme='dark'; try{ theme=localStorage.getItem('pf.theme') || 'dark'; }catch(e){} PFU.applyTheme(theme); if(!document.getElementById('pfThemeBtn')){ const btn=document.createElement('button'); btn.id='pfThemeBtn'; btn.className='pf-theme-btn'; btn.type='button'; btn.onclick=PFU.toggleTheme; const target=document.querySelector('.hdr-r') || document.querySelector('.nav-r') || document.querySelector('.nav'); if(target) target.appendChild(btn); PFU.applyTheme(theme); } };
  PFU.initPage = function(){ PFU.ensureDirLink(); PFU.initTheme(); };
  window.PFU = PFU;
  document.addEventListener('DOMContentLoaded', PFU.initPage);
})();
