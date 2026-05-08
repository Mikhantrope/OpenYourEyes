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
      else {
        const ta=document.createElement('textarea');
        ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      if(btn){btn.classList.remove('busy','err');btn.classList.add('ok');btn.textContent='✅ Скопировано';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=old;},1600);}
      return true;
    }catch(e){
      console.error(e);
      if(btn){btn.classList.remove('busy','ok');btn.classList.add('err');btn.textContent='❌ Ошибка';setTimeout(()=>{btn.classList.remove('err');btn.textContent=old;},2000);}
      return false;
    }
  };

  PFU.loadHtml2Canvas = function(){
    if(window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload=()=>resolve(window.html2canvas); s.onerror=reject; document.head.appendChild(s);
    });
  };

  PFU.downloadBlob = function(blob, filename){
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=filename||'pf-screenshot.png'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),800);
  };

  PFU.copyElementScreenshot = async function(el, btn, filename, title, subtitle){
    const old = btn ? btn.textContent : '';
    try{
      if(!el) throw new Error('Элемент не найден');
      if(btn){btn.classList.add('busy');btn.textContent='Готовлю скрин...';}
      const html2canvas = await PFU.loadHtml2Canvas();
      const cs=getComputedStyle(document.body);
      const wrap=document.createElement('div'); wrap.className='pf-shot-wrap';
      wrap.innerHTML=`<div class="pf-shot-title">${title||document.title}</div><div class="pf-shot-sub">${subtitle||new Date().toLocaleString('ru-RU')}</div>`;
      const clone=el.cloneNode(true); clone.removeAttribute('id'); wrap.appendChild(clone); document.body.appendChild(wrap);
      const canvas = await html2canvas(wrap,{backgroundColor:cs.getPropertyValue('--bg').trim()||'#07090f',scale:2,useCORS:true,logging:false,windowWidth:Math.max(wrap.scrollWidth,1200),windowHeight:Math.max(wrap.scrollHeight,700)});
      wrap.remove();
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('PNG не создан');
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        if(btn){btn.classList.remove('busy','err');btn.classList.add('ok');btn.textContent='✅ Картинка';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=old;},1800);}
      } else {
        PFU.downloadBlob(blob, filename||'pf-screenshot.png');
        if(btn){btn.classList.remove('busy','err');btn.classList.add('ok');btn.textContent='⬇️ PNG';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=old;},1800);}
      }
      return true;
    }catch(e){
      console.error(e);
      if(btn){btn.classList.remove('busy','ok');btn.classList.add('err');btn.textContent='❌ Скрин';setTimeout(()=>{btn.classList.remove('err');btn.textContent=old;},2200);}
      return false;
    }
  };

  PFU.getPage = () => (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  PFU.ensureDirLink = function(){
    const navs=[...document.querySelectorAll('.nav')];
    navs.forEach(nav=>{
      const has=[...nav.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('dir.html'));
      if(!has){
        const nr=nav.querySelector('.nav-r');
        const a=document.createElement('a'); a.href='dir.html'; a.textContent='📑 ДиР';
        if(PFU.getPage()==='dir.html') a.classList.add('active');
        nav.insertBefore(a,nr||null);
      }
      [...nav.querySelectorAll('a')].forEach(a=>{
        const href=(a.getAttribute('href')||'').split('#')[0].toLowerCase();
        if(href && href===PFU.getPage()) a.classList.add('active');
      });
    });
  };

  PFU.updateChartTheme = function(){
    if(!window.Chart) return;
    const cs=getComputedStyle(document.body);
    const muted=cs.getPropertyValue('--muted').trim()||'#5a7a96';
    const border=cs.getPropertyValue('--border').trim()||'#1e2d40';
    const grid=document.body.dataset.theme==='light'?'rgba(15,23,42,.10)':'rgba(30,45,64,.50)';
    Chart.defaults.color=muted;
    Chart.defaults.borderColor=border;
    const instances = window.Chart.instances ? Object.values(window.Chart.instances) : [];
    for(const chart of instances){
      try{
        const scales=chart.options && chart.options.scales ? chart.options.scales : {};
        Object.values(scales).forEach(scale=>{
          if(scale.grid && scale.grid.display!==false) scale.grid.color=grid;
          if(scale.ticks) scale.ticks.color=muted;
          if(scale.title) scale.title.color=muted;
          if(scale.border) scale.border.color=border;
        });
        const plugins=chart.options.plugins || (chart.options.plugins={});
        if(plugins.legend && plugins.legend.labels) plugins.legend.labels.color=muted;
        if(plugins.title) plugins.title.color=muted;
        chart.update('none');
      }catch(e){}
    }
  };

  PFU.applyTheme = function(theme){
    theme = theme === 'light' ? 'light' : 'dark';
    if(document.documentElement) document.documentElement.dataset.theme=theme;
    if(document.body) document.body.dataset.theme=theme;
    try{localStorage.setItem('pf.theme',theme);}catch(e){}
    const btn=document.getElementById('pfThemeBtn');
    if(btn){
      btn.textContent = theme==='light'?'🌙 Тёмная':'☀️ Светлая';
      btn.title = theme==='light'?'Переключить на тёмную тему':'Переключить на светлую тему';
      btn.setAttribute('aria-label', btn.title);
    }
    PFU.updateChartTheme();
  };

  PFU.toggleTheme = function(){ PFU.applyTheme((document.body && document.body.dataset.theme)==='light'?'dark':'light'); };

  PFU.ensureThemeButton = function(){
    let btn=document.getElementById('pfThemeBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='pfThemeBtn'; btn.className='pf-theme-btn'; btn.type='button'; btn.onclick=PFU.toggleTheme;
    }
    const page=PFU.getPage();
    const hdr=document.querySelector('.hdr-r');
    if(hdr){ hdr.appendChild(btn); return btn; }
    const nav=document.querySelector('.nav');
    if(nav){
      const nr=nav.querySelector('.nav-r');
      if(btn.parentElement!==nav) nav.insertBefore(btn,nr||null);
      return btn;
    }
    document.body.appendChild(btn);
    return btn;
  };

  PFU.initTheme = function(){
    let theme='dark';
    try{ theme=localStorage.getItem('pf.theme') || 'dark'; }catch(e){}
    PFU.ensureThemeButton();
    PFU.applyTheme(theme);
  };

  PFU.initPage = function(){ PFU.ensureDirLink(); PFU.initTheme(); };
  window.PFU = PFU;

  // Apply saved theme immediately, before page-specific scripts create charts.
  try{
    const quickTheme = (localStorage.getItem('pf.theme') || 'dark') === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = quickTheme;
    if(document.body) document.body.dataset.theme = quickTheme;
  }catch(e){}

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', PFU.initPage);
  else PFU.initPage();
})();
