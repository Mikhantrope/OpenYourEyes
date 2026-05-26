// ═══════════════════════════════════════════════════════════════
// pf-data.js — общий загрузчик данных для всех страниц PF
// Premium Food Astana © 2026
//
// МАППИНГ КОЛОНОК из 1С (ИсхРеал):
//   Выручка       = «Сумма без налогов»                   (sumBezNds)
//   Себестоимость = «Стоимость (без НДС)»                 (seb)
//   Прибыль       = «Profit (сумма)»                      (prof)
//   Кол-во        = «Кол-во реализации (с возвратами)»    (qtyN)
//   Кол-во чистое = «Кол-во реализации» (без скобок)      (qtyReal) — для цен
//   Сумма реал.   = «Сумма реализации» (без скобок)       (sumReal) — цена с НДС
//   Возвраты      = «Сумма возвратов»                     (sumR)
// ═══════════════════════════════════════════════════════════════

const PF = {
  PUB_ID:    '2PACX-1vTwyEj5Huy-avrqvCZj1rCqTBJObnOHNJ-GVdZic0J1_fwVafku2G0MpiZtGle8zOXzUUmEer26ylrO',
  GID_REAL:  '1186338740',
  GID_REAL_AO: '1376311466',  // ИсхРеалАО — данные от Астана-Өнім
  GID_REAL_MAY:'1919783760',  // ИсхРеалМай — отдельный лист майской реализации
  GID_KONTR: '1039539700',
  GID_SKU:   '286897778',
  GID_PRIHOD:'1270219264',
  GID_PLAN:  '311695615',   // Лист Планы — план закупа по поставщикам
  GID_PRIHOD2:'739937881',  // Приход для ДиР / веса по поставщикам
  GID_RASHOD:'753197950',   // Расходы для ДиР
  GID_ZP_DET:'1431078713',  // ЗП Детально
  GID_ZP_OBH:'2144268074',  // ЗП Общее

  csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/e/${this.PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  },

  NON_PRODUCT: ['услуг','аренд','дистриб','транспорт','обслуж','сервис','подписк'],
  isDairy(sku) { return !this.NON_PRODUCT.some(k => sku.toLowerCase().includes(k)); },

  MO: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],

  // ── ФОРМАТИРОВАНИЕ ──────────────────────────────────────────
  fmtQty(n)  { return Math.round(n||0).toLocaleString('ru-RU'); },
  fmtKg(n) {
    const r = Math.round((n||0)*10)/10;
    return r.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}).replace(',','.');
  },
  fmtRev(n) {
    const a = Math.abs(n||0);
    if (a >= 1e9) return (n/1e9).toFixed(1)+' млрд';
    if (a >= 1e6) return (n/1e6).toFixed(1)+' млн';
    if (a >= 1e3) return Math.round(n).toLocaleString('ru-RU');
    return Math.round(n||0).toLocaleString('ru-RU');
  },
  fmtFull(n)   { return Math.round(n||0).toLocaleString('ru-RU'); },
  fmtPct(n)    { return n==null?'—':(n>0?'+':'')+n.toFixed(1)+'%'; },
  fmtPctAbs(n) { return n==null?'—':Math.abs(n).toFixed(1)+'%'; },

  // ── ПАРСЕРЫ ─────────────────────────────────────────────────
  toNum(s) { return parseFloat(String(s||'').replace(/\s/g,'').replace(',','.')) || 0; },

  toDate(s) {
    s = String(s||'').trim().split(' ')[0];
    if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
      const [d,m,y] = s.split('.'); return new Date(+y,+m-1,+d);
    }
    const d = new Date(s); return isNaN(d) ? null : d;
  },

  parseCSV(text) {
    const rows = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const cols = []; let cur='', inQ=false;
      for (const c of line) {
        if (c==='"'){inQ=!inQ;continue;}
        if (c===','&&!inQ){cols.push(cur.trim());cur='';}
        else cur+=c;
      }
      cols.push(cur.trim()); rows.push(cols);
    }
    return rows;
  },

  findCol(header, ...needles) {
    for (const n of needles) {
      const i = header.findIndex(h => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  },

  // ── АГРЕГАЦИЯ ────────────────────────────────────────────────
  agg(rows) {
    let qty=0,rev=0,ret=0,seb=0,sebWithNds=0,prof=0,kg=0,retKg=0,qtyRealSum=0,sumRealSum=0,sebRealSum=0,sebWithNdsRealSum=0,sumRealTotal=0,sumRealSTotal=0,revSaleOnly=0,sebSaleOnly=0;
    for (const x of rows) {
      qty        += x.qtyN;
      rev        += x.sumBezNds;
      ret        += x.sumR;
      sumRealTotal += (x.sumReal||0);
      sumRealSTotal += (x.sumRealS||0);   // Сумма реал с возвратами (колонка L)
      // Для profNet: только строки продаж (не возвратов)
      if((x.qtyReal||0) > 0){
        revSaleOnly += (x.sumBezNds||0);  // выручка только от продаж (без НДС)
        sebSaleOnly += (x.sebSale||x.seb||0);  // себест только от продаж (priceNoNds × qtyReal)
      }
      seb        += x.seb;
      sebWithNds += (x.sebWithNds ?? x.seb);
      prof       += x.prof;
      kg         += x.kg;
      retKg      += x.retKg;
      // Цены считаем ТОЛЬКО по строкам продаж (qtyReal > 0)
      // Возвратные строки имеют отрицательную себестоимость — они искажают цену
      if((x.qtyReal||0) > 0){
        qtyRealSum += x.qtyReal;
        sumRealSum += (x.sumReal||0);
        sebRealSum        += (x.sebSale    ?? x.seb);  // себест. только продаж (qtyReal)
        sebWithNdsRealSum += (x.sebSaleWithNds ?? x.sebWithNds ?? x.seb); // себестоимость с НДС для режима цен «НДС»
      }
    }
    const mar            = rev  ? prof/rev*100  : 0;
    const retPct         = sumRealSTotal  ? ret/sumRealSTotal*100   : 0;
    const avg            = qtyRealSum ? revSaleOnly/qtyRealSum : 0;  // ср.цена только по строкам продаж
    const retKgPct       = kg   ? retKg/kg*100 : 0;
    const priceZakup     = qtyRealSum ? sebRealSum/qtyRealSum            : 0;  // без НДС, только из строк продаж
    const priceZakupNds  = qtyRealSum ? sebWithNdsRealSum/qtyRealSum     : 0;  // с НДС, только для режима отображения цен
    const priceSellNds   = qtyRealSum ? sumRealSum/qtyRealSum            : 0;
    const priceSellNoNds = priceSellNds/1.16;
    const profitUnitNds  = priceSellNds  - priceZakupNds;
    const profitUnitNoNds= priceSellNoNds- priceZakup;

    return {
      qty:            Math.round(qty),    // Кол-во с возвратами (qtyNet)
      qtyReal:        Math.round(qtyRealSum), // Кол-во реализации (без возвратов)
      qtyRet:         Math.round(qty - qtyRealSum < 0 ? qty - qtyRealSum : 0), // Кол-во возвратов
      rev:            Math.round(rev),
      sumReal:        Math.round(sumRealTotal),   // Сумма реализации с НДС (колонка J, все строки)
      sumRealS:       Math.round(sumRealSTotal),  // Сумма реализации с возвратами (колонка L = J+K)
      ret:            Math.round(ret),
      retPct:         Math.round(retPct*10)/10,
      seb:            Math.round(seb),
      sebWithNds:     Math.round(sebWithNds),
      prof:           Math.round(prof),
      profNet:        Math.round(revSaleOnly - sebSaleOnly), // прибыль без потерь от возвратов
      mar:            rev ? Math.round(prof/rev*1000)/10 : 0,
      marNet:         revSaleOnly ? Math.round((revSaleOnly-sebSaleOnly)/revSaleOnly*1000)/10 : 0,
      avg:            Math.round(avg),
      kg:             Math.round(kg*10)/10,
      retKg:          Math.round(retKg*10)/10,
      retKgPct:       Math.round(retKgPct*10)/10,
      profKg:         kg?Math.round(prof/kg):0,
      sebKg:          kg?Math.round(seb/kg):0,
      priceZakup:     Math.round(priceZakup),
      priceZakupNds:  Math.round(priceZakupNds),
      priceSellNds:   Math.round(priceSellNds),
      priceSellNoNds: Math.round(priceSellNoNds),
      profitUnitNds:  Math.round(profitUnitNds),
      profitUnitNoNds:Math.round(profitUnitNoNds),
    };
  },

  groupBy(arr, fn) {
    const m = {};
    for (const x of arr) { const k=fn(x); (m[k]=m[k]||[]).push(x); }
    return m;
  },

  // ── ОСНОВНАЯ ЗАГРУЗКА ПРОДАЖ ─────────────────────────────────
  // ── СЕБЕСТОИМОСТЬ ИЗ ПРИХОДА ─────────────────────────────
  // Ищет ближайшую цену прихода ДО даты продажи.
  // Для финансовых расчётов возвращаем цену БЕЗ НДС:
  //   если sum_nds > 0  → цена без НДС = (sum - sum_nds) / qty
  //   если sum_nds = 0  → поставщик/строка без НДС, цену НЕ делим
  // Отдельно храним цену с НДС для режима отображения цен «НДС».
  _prikhodCostIndex: null,

  _buildPrikhodCostIndex(){
    if (this._prikhodCostIndex) return this._prikhodCostIndex;

    const idx = {};
    const push = (sku, dt, priceNoNds, priceWithNds) => {
      sku = String(sku || '').trim();
      dt = String(dt || '').trim().slice(0, 10);
      priceNoNds = Number(priceNoNds) || 0;
      priceWithNds = Number(priceWithNds) || 0;
      if (!sku || !dt || priceNoNds <= 0) return;
      (idx[sku] = idx[sku] || []).push({ dt, priceNoNds, priceWithNds: priceWithNds || priceNoNds });
    };

    // Новый формат PRIKHOD_PRICES: {sku: [[dt, priceNoNds, priceWithNds], ...]}
    if (typeof PRIKHOD_PRICES !== 'undefined') {
      for (const [sku, entries] of Object.entries(PRIKHOD_PRICES)) {
        for (const [dt, pNoNds, pNds] of entries || []) {
          push(sku, dt, Number(pNoNds)||0, Number(pNds)||0);
        }
      }
    }

    for (const entries of Object.values(idx)) {
      entries.sort((a, b) => a.dt.localeCompare(b.dt));
    }

    this._prikhodCostIndex = idx;
    return idx;
  },

  getPrikhodCostPrices(sku, saleDate){
    const entries = this._buildPrikhodCostIndex()[sku];
    if (!entries || entries.length === 0) return null;

    // Минимально допустимая цена: 10 ₸ с НДС
    // Цены ниже — это ошибки в 1С (технические строки, списания и т.д.)
    const MIN_PRICE = 10;
    const valid = entries.filter(e => (e.priceWithNds || e.priceNoNds) >= MIN_PRICE);
    if (!valid.length) return null;

    let best = null;
    for (const entry of valid) {
      if (entry.dt <= saleDate) best = entry;
      else break;
    }

    return best || valid[0]; // если прихода ДО нет — берём первый валидный
  },

  async loadSales(onProgress) {
    const p = onProgress || (()=>{});

    // 1. SKU справочник
    // Колонка C = собирательный SKU (все варианты из исходников) — ключ для маппинга
    // Колонка D = итоговое название для дашборда (без дублей)
    // Колонка E = объём/вес
    // Строки с "Не брать в Dashboard" — пропускаем
    p(10,'SKU справочник...');
    const skuRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_SKU))).text());
    const skuH    = skuRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
    const si = (...ns) => this.findCol(skuH,...ns);
    const iSN=si('sku1с','sku1c','наим','собирательный','всевозможные');  // col C — source names
    const iSD=si('итоговые','итоговоеназвание','длядашборда','displaysku','dashboard');  // col D — display name
    const iSV=si('объем','обьем','вес','vol');  // col E — weight
    const iSG=si('группаsku','группаs','группа');

    const skuWeight={}, skuGroup={}, skuDisplayMap={};
    const skuSkipSet=new Set();
    for (let i=1;i<skuRows.length;i++) {
      const r=skuRows[i];
      const srcName=String(r[iSN]||'').trim();
      const dispName=iSD>=0 ? String(r[iSD]||'').trim() : '';
      if (!srcName) continue;
      // Пропускаем строки "Не брать в Dashboard"
      if(dispName.toLowerCase().includes('не брать')){ skuSkipSet.add(srcName); continue; }
      const finalName = dispName || srcName;  // если display пустой — используем source
      const w=this.toNum(r[iSV]);
      const grp=String(r[iSG]||'').trim()||'Прочее';
      skuWeight[srcName]=w>0?w:1;
      skuWeight[finalName]=w>0?w:1;
      skuGroup[srcName]=grp;
      skuGroup[finalName]=grp;
      if(dispName && dispName !== srcName) skuDisplayMap[srcName]=dispName;
    }
    // Функция: получить display name для SKU
    const findSkuDisplay = sku => skuDisplayMap[sku] || sku;

    // 2. Группы контрагентов
    // ТЕКУЩАЯ СТРУКТУРА КонтрагентыСправочник:
    //   B = КонтрагентИсходник      — имя как в источниках 1С
    //   C = Контрагент              — очищенное имя
    //   D = Общее название          — итоговое имя для сайта/дашборда
    //   E = Группа                  — верхний уровень
    //   F = Подгруппа               — второй уровень
    p(25,'Справочник контрагентов...');
    const kRows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_KONTR))).text());
    const kH=kRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
    const ki=(...ns)=>this.findCol(kH,...ns);
    const exactK=(...ns)=>{
      for(const n of ns){
        const needle=String(n||'').toLowerCase().replace(/\s/g,'');
        const idx=kH.findIndex(h=>h===needle);
        if(idx>=0) return idx;
      }
      return -1;
    };

    let iKSrc=ki('контрагентисходник','контрагентиисходник','исходник','source');
    let iKName=exactK('контрагент');
    let iKDisplay=ki('общееназвание','общееназваниедлядашборда','дашборд','dashboard','display');
    let iKGroup=exactK('группа');
    let iKSub=ki('подгруппа','подгруппы','subgroup','sub');

    // Жесткий fallback под текущий лист: B/C/D/E/F.
    if(iKSrc<0) iKSrc=1;
    if(iKName<0) iKName=2;
    if(iKDisplay<0) iKDisplay=3;
    if(iKGroup<0) iKGroup=4;
    if(iKSub<0) iKSub=5;

    const groupMap={}, groupMapNorm={}, groupMapPrefix={};
    const subgroupMap={}, subgroupMapNorm={}, subgroupMapPrefix={};
    const displayMap={}, displayMapNorm={}, displayMapPrefix={};
    const ttCandidates=[];
    const normKey = s => String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[«»"'`]/g,'').trim();

    const putMap=(map,normMap,prefixMap,key,value)=>{
      key=String(key||'').trim();
      value=String(value||'').trim();
      if(!key || !value) return;
      map[key]=value;
      const nk=normKey(key);
      normMap[nk]=value;
      const pfx=nk.slice(0,24);
      if(!prefixMap[pfx]) prefixMap[pfx]=value;
    };

    for (let i=1;i<kRows.length;i++) {
      const r=kRows[i]||[];
      const src=String(r[iKSrc]||'').trim();
      const clean=String(r[iKName]||'').trim();
      const display=String(r[iKDisplay]||'').trim();
      const grp=String(r[iKGroup]||'').trim()||'⚠️ Без группы';
      const sub=String(r[iKSub]||'').trim();
      const finalName=display || clean || src;
      const keys=[src,clean,finalName].filter(Boolean);

      for(const key of keys){
        putMap(displayMap,displayMapNorm,displayMapPrefix,key,finalName);
        putMap(groupMap,groupMapNorm,groupMapPrefix,key,grp);
        if(sub) putMap(subgroupMap,subgroupMapNorm,subgroupMapPrefix,key,sub);
      }

      const allTxt=normKey([src,clean,finalName,grp,sub].join(' '));
      if(finalName && (grp.toLowerCase().includes('фирмен') || allTxt.includes('тт ') || allTxt.includes('сауран') || allTxt.includes('коктал') || allTxt.includes('артем') || allTxt.includes('евраз') || allTxt.includes('шапагат') || allTxt.includes('акмол') || allTxt.includes('женис'))){
        ttCandidates.push({name:finalName, group:grp, subgroup:sub});
      }
    }

    const findMapped=(map,normMap,prefixMap,key)=>{
      key=String(key||'').trim();
      if(!key) return '';
      if(map[key]) return map[key];
      const nk=normKey(key);
      if(normMap[nk]) return normMap[nk];
      const pfx=nk.slice(0,24);
      if(prefixMap[pfx]) return prefixMap[pfx];
      for(const [k,v] of Object.entries(normMap)){
        if(k.length>5 && nk.length>5 && (k.includes(nk) || nk.includes(k))) return v;
      }
      return '';
    };

    const isRetailRaw = knt => {
      const nk=normKey(knt);
      return nk.includes('розничная выручка') || nk.includes('розничный покупатель') || nk.includes('чл-розничная реализация');
    };

    const TT_ALIASES=[
      {keys:['артем','artem'], name:'ТТ Артем'},
      {keys:['сауран','sauran'], name:'ТТ Сауран'},
      {keys:['коктал','koktal'], name:'ТТ Коктал'},
      {keys:['евраз','eurasia'], name:'ТТ Евразия'},
      {keys:['шапагат','shapagat'], name:'ТТ Шапагат ТД'},
      {keys:['акмол','женис','жеңіс','zhenis'], name:'ТТ Акмол Женис'},
    ];

    const findRetailPointBySklad = sklad => {
      const sk=normKey(sklad);
      if(!sk) return 'Розница без склада';

      // Сначала пытаемся вернуть ровно то название, которое уже есть в справочнике.
      for(const c of ttCandidates){
        const cn=normKey(c.name);
        if(cn && (cn.includes(sk) || sk.includes(cn))) return c.name;
      }

      // Потом — по ключевым словам склада.
      for(const a of TT_ALIASES){
        if(a.keys.some(k=>sk.includes(k))){
          const fromDict=ttCandidates.find(c=>a.keys.some(k=>normKey(c.name).includes(k)));
          return fromDict ? fromDict.name : a.name;
        }
      }

      return `ТТ ${String(sklad||'').trim()}`;
    };

    const findDisplayName = (rawKnt, sklad) => {
      if(isRetailRaw(rawKnt)) return findRetailPointBySklad(sklad);
      return findMapped(displayMap,displayMapNorm,displayMapPrefix,rawKnt) || rawKnt;
    };

    const findGroup = (rawKnt, displayKnt='') => {
      if(isRetailRaw(rawKnt) || String(displayKnt).startsWith('ТТ ')){
        return findMapped(groupMap,groupMapNorm,groupMapPrefix,displayKnt) || 'Фирменные точки';
      }
      return findMapped(groupMap,groupMapNorm,groupMapPrefix,rawKnt) || findMapped(groupMap,groupMapNorm,groupMapPrefix,displayKnt) || '⚠️ Без группы';
    };

    const findSubgroup = (rawKnt, displayKnt='') => {
      if(isRetailRaw(rawKnt) || String(displayKnt).startsWith('ТТ ')){
        return findMapped(subgroupMap,subgroupMapNorm,subgroupMapPrefix,displayKnt) || 'Фирменные точки';
      }
      return findMapped(subgroupMap,subgroupMapNorm,subgroupMapPrefix,rawKnt) || findMapped(subgroupMap,subgroupMapNorm,subgroupMapPrefix,displayKnt) || '';
    };

    // 3. ИсхРеал
    p(45,'Данные реализации...');
    const rRows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_REAL))).text());
    const rH=rRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
    const ri=(...ns)=>this.findCol(rH,...ns);

    const iKnt      = ri('контрагент');
    const iSku      = ri('номенклатура','sku','товар');
    const iDate     = ri('периоддень','период','дата','date');
    const iQtyN     = ri('количествореализации(с','количествосвозвр');
    const iQtyR     = ri('количествовозвратов');
    const iSumBezNds= ri('суммабезналогов','безналогов');
    const iSumR     = ri('суммавозвратов');
    const iSeb      = ri('стоимость(без','стоимость','себест');
    const iProf     = ri('profit','прибыль');
    // Точный поиск без скобок — для цен
    const iQtyReal  = rH.findIndex(h=>h==='количествореализации');
    const iSumReal  = rH.findIndex(h=>h==='суммареализации');
    const iSumRealS = rH.findIndex(h=>h==='суммареализации(свозвратами)');
    const iSklad    = ri('склад');

    p(65,'Обработка строк...');
    const rawRows=[];
    const monthMap=new Map();
    const unmappedContractorMap=new Map();
    const retailPointStats={};

    const addUnmappedContractor=(row)=>{
      const key=[row.sourceSheet,row.rawKnt,row.knt,row.sklad].join('||');
      if(!unmappedContractorMap.has(key)){
        unmappedContractorMap.set(key,{
          sourceSheet:row.sourceSheet,
          sourceGid:row.sourceGid,
          firstSourceRow:row.sourceRow,
          rawKnt:row.rawKnt,
          knt:row.knt,
          subgroup:row.subgroup||'',
          sklad:row.sklad||'',
          rows:0,
          rev:0,
          kg:0,
          examples:new Set()
        });
      }
      const x=unmappedContractorMap.get(key);
      x.rows+=1;
      x.rev+=(row.sumBezNds||0);
      x.kg+=(row.kg||0);
      if(row.sourceRow && x.firstSourceRow>row.sourceRow) x.firstSourceRow=row.sourceRow;
      if(x.examples.size<4 && row.sku) x.examples.add(row.sku);
    };

    for (let i=1;i<rRows.length;i++) {
      const r=rRows[i];
      const rawKnt=String(r[iKnt]||'').trim();
      const rawSku=String(r[iSku]||'').trim();
      const sklad=iSklad>=0 ? String(r[iSklad]||'').trim() : '';

      // Display names
      const knt = findDisplayName(rawKnt, sklad);
      const sku = findSkuDisplay(rawSku);

      // Пропускаем: пустые, строку "Итого", нетоварные, "Не брать в Dashboard"
      if (!rawKnt||!knt||!rawSku) continue;
      if (rawKnt.toLowerCase().includes('итого')||knt.toLowerCase().includes('итого')||rawSku.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
      if (skuSkipSet.has(rawSku) || skuSkipSet.has(sku)) continue;
      if (!this.isDairy(rawSku) && !this.isDairy(sku)) continue;

      const dt=this.toDate(r[iDate]);
      if (!dt) continue;

      const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      // Локальная дата — НЕ toISOString() — иначе UTC+5 сдвигает на день назад
      const day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      if (!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());

      const qtyN     =this.toNum(r[iQtyN]);
      const qtyR     =Math.abs(this.toNum(r[iQtyR]));
      // qtyReal/sumReal: если отдельная колонка есть и заполнена — берём её, иначе берём "с возвратами"
      const _rawQtyReal = iQtyReal>=0 ? r[iQtyReal] : undefined;
      const _rawSumReal = iSumReal>=0 ? r[iSumReal] : undefined;
      const qtyReal  = (_rawQtyReal != null && String(_rawQtyReal).trim() !== '') ? this.toNum(_rawQtyReal) : qtyN;
      const sumR     =this.toNum(r[iSumR]);
      const sumRealS =iSumRealS>=0 ? this.toNum(r[iSumRealS]) : (this.toNum(_rawSumReal) + sumR);
      const sumReal  = (_rawSumReal != null && String(_rawSumReal).trim() !== '') ? this.toNum(_rawSumReal) : sumRealS;
      const sumBezNds=this.toNum(r[iSumBezNds]);
      const w        =skuWeight[rawSku]||skuWeight[sku]||1;

      // Себестоимость из прихода: цена ближайшего прихода ДО даты продажи
      // Колонка "Стоимость (без НДС)" из исходника НЕ используется — она неточная.
      // Основная себестоимость считается БЕЗ НДС, чтобы корректно сравнивать с выручкой без НДС.
      const prikhodCost = this.getPrikhodCostPrices(rawSku, day) || this.getPrikhodCostPrices(sku, day);
      // Себест. ₸ = цена прихода × qtyN (финансовая себест., как и выручка — с возвратами)
      const sebNew      = prikhodCost ? prikhodCost.priceNoNds  * qtyN    : 0;
      const sebWithNds  = prikhodCost ? prikhodCost.priceWithNds * qtyN   : 0;
      // Для цены закупа — только строки продаж (qtyReal), не смешиваем с возвратами
      const sebSale         = prikhodCost ? prikhodCost.priceNoNds  * qtyReal : 0;
      const sebSaleWithNds  = prikhodCost ? prikhodCost.priceWithNds * qtyReal : 0;
      const profNew = sumBezNds - sebNew;
      const mappedGroup=findGroup(rawKnt,knt);
      const mappedSubgroup=findSubgroup(rawKnt,knt);
      if(isRetailRaw(rawKnt)){
        retailPointStats[knt]=(retailPointStats[knt]||0)+1;
      }

      const rowObj={
        knt,rawKnt,sku,rawSku,mk,day,
        sourceSheet:'ИсхРеал',
        sourceGid:this.GID_REAL,
        sourceRow:i+1,
        sklad,
        ndsSuspect: (() => {
          // Проверяем только строки без возвратов (для строк с возвратами формула другая)
          const hasReturn = Math.abs(qtyR) > 0 || Math.abs(sumR) > 0;
          if(!hasReturn && sumReal && Math.abs(sumBezNds - sumReal/1.16) > 5) return true;
          return false;
        })(),
        group:    mappedGroup,
        subgroup: mappedSubgroup,
        skuGroup: skuGroup[rawSku]||skuGroup[sku]||'Прочее',
        weight:w,
        qtyN,qtyR,qtyReal,sumReal,sumRealS,
        sumBezNds,
        sumR,
        seb:          sebNew,
        sebWithNds,
        sebSale,
        sebSaleWithNds,
        prof: profNew,
        kg:    qtyN*w,
        retKg: qtyR*w,
      };
      if(mappedGroup==='⚠️ Без группы'){
        addUnmappedContractor(rowObj);
      }
      rawRows.push(rowObj);
    }

    const months=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));

    // 3b. ИсхРеалАО — данные от Астана-Өнім (тот же формат, мержим в rawRows)
    try {
      p(75,'Данные АО...');
      const aoRows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_REAL_AO))).text());
      if(aoRows.length>1){
        const aoH=aoRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
        const ai=(...ns)=>this.findCol(aoH,...ns);
        const aiKnt=ai('контрагент'), aiSku=ai('номенклатура','sku','товар'), aiDate=ai('периоддень','период','дата');
        const aiQtyN=ai('количествореализации(с','количествосвозвр'), aiQtyR=ai('количествовозвратов');
        const aiQtyReal=aoH.findIndex(h=>h==='количествореализации');
        const aiSumReal=aoH.findIndex(h=>h==='суммареализации');
        const aiSumRealS=ai('суммареализации(с','суммасвозвр');
        const aiSumR=ai('суммавозвратов'), aiSumBezNds=ai('суммабезналогов','безналогов');
        const aiSklad=ai('склад');
        for(let i=1;i<aoRows.length;i++){
          const r=aoRows[i];
          const rawKnt=String(r[aiKnt]||'').trim();
          const rawSku=String(r[aiSku]||'').trim();
          if(!rawKnt||!rawSku) continue;
          const sku=findSkuDisplay(rawSku);
          if(rawKnt.toLowerCase().includes('итого')||rawSku.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
          if(skuSkipSet.has(rawSku) || skuSkipSet.has(sku)) continue;
          if(!this.isDairy(rawSku) && !this.isDairy(sku)) continue;
          const dt=this.toDate(r[aiDate]); if(!dt) continue;
          const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
          const day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          if(!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());
          const sklad=aiSklad>=0?String(r[aiSklad]||'').trim():'';
          const knt=findDisplayName(rawKnt, sklad);
          const qtyN=this.toNum(r[aiQtyN]), qtyR=Math.abs(this.toNum(r[aiQtyR]));
          const _rQR=aiQtyReal>=0?r[aiQtyReal]:undefined, _rSR=aiSumReal>=0?r[aiSumReal]:undefined;
          const qtyReal=(_rQR!=null&&String(_rQR).trim()!=='')?this.toNum(_rQR):qtyN;
          const sumR=this.toNum(r[aiSumR]);
          const sumRealS=aiSumRealS>=0?this.toNum(r[aiSumRealS]):(this.toNum(_rSR)+sumR);
          const sumReal=(_rSR!=null&&String(_rSR).trim()!=='')?this.toNum(_rSR):sumRealS;
          const sumBezNds=this.toNum(r[aiSumBezNds]);
          const w=skuWeight[rawSku]||skuWeight[sku]||1;
          const prikhodCost=this.getPrikhodCostPrices(rawSku,day)||this.getPrikhodCostPrices(sku,day);
          const sebNew=prikhodCost?prikhodCost.priceNoNds*qtyN:0;
          const sebWithNds=prikhodCost?prikhodCost.priceWithNds*qtyN:0;
          const sebSale=prikhodCost?prikhodCost.priceNoNds*qtyReal:0;
          const sebSaleWithNds=prikhodCost?prikhodCost.priceWithNds*qtyReal:0;
          const mappedGroup=findGroup(rawKnt,knt);
          const mappedSubgroup=findSubgroup(rawKnt,knt);
          if(isRetailRaw(rawKnt)){
            retailPointStats[knt]=(retailPointStats[knt]||0)+1;
          }
          const rowObj={
            knt,rawKnt,sku,rawSku,mk,day,ndsSuspect:false,
            sourceSheet:'ИсхРеалАО',
            sourceGid:this.GID_REAL_AO,
            sourceRow:i+1,
            sklad,
            group:mappedGroup,
            subgroup:mappedSubgroup,
            skuGroup:skuGroup[rawSku]||skuGroup[sku]||'Прочее',weight:w,
            qtyN,qtyR,qtyReal,sumReal,sumRealS,sumBezNds,sumR,
            seb:sebNew,sebWithNds,sebSale,sebSaleWithNds,
            prof:sumBezNds-sebNew,kg:qtyN*w,retKg:qtyR*w,
          };
          if(mappedGroup==='⚠️ Без группы'){
            addUnmappedContractor(rowObj);
          }
          rawRows.push(rowObj);
        }
        p(85,'АО: '+aoRows.length+' строк');
      }
    }catch(e){ console.warn('ИсхРеалАО не загружен:',e); }

    // 3c. ИсхРеалМай — отдельный источник майской реализации (тот же формат, мержим в rawRows)
    try {
      p(88,'Данные Май...');
      const mayRows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_REAL_MAY))).text());
      if(mayRows.length>1){
        const mayH=mayRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
        const mi=(...ns)=>this.findCol(mayH,...ns);
        const miKnt=mi('контрагент'), miSku=mi('номенклатура','sku','товар'), miDate=mi('периоддень','период','дата');
        const miQtyN=mi('количествореализации(с','количествосвозвр'), miQtyR=mi('количествовозвратов');
        const miQtyReal=mayH.findIndex(h=>h==='количествореализации');
        const miSumReal=mayH.findIndex(h=>h==='суммареализации');
        const miSumRealS=mi('суммареализации(с','суммасвозвр');
        const miSumR=mi('суммавозвратов'), miSumBezNds=mi('суммабезналогов','безналогов');
        const miSklad=mi('склад');
        for(let i=1;i<mayRows.length;i++){
          const r=mayRows[i];
          const rawKnt=String(r[miKnt]||'').trim();
          const rawSku=String(r[miSku]||'').trim();
          if(!rawKnt||!rawSku) continue;
          const sku=findSkuDisplay(rawSku);
          if(rawKnt.toLowerCase().includes('итого')||rawSku.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
          if(skuSkipSet.has(rawSku) || skuSkipSet.has(sku)) continue;
          if(!this.isDairy(rawSku) && !this.isDairy(sku)) continue;
          const dt=this.toDate(r[miDate]); if(!dt) continue;
          const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
          const day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          if(!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());
          const sklad=miSklad>=0?String(r[miSklad]||'').trim():'';
          const knt=findDisplayName(rawKnt, sklad);
          const qtyN=this.toNum(r[miQtyN]), qtyR=Math.abs(this.toNum(r[miQtyR]));
          const _rQR=miQtyReal>=0?r[miQtyReal]:undefined, _rSR=miSumReal>=0?r[miSumReal]:undefined;
          const qtyReal=(_rQR!=null&&String(_rQR).trim()!=='')?this.toNum(_rQR):qtyN;
          const sumR=this.toNum(r[miSumR]);
          const sumRealS=miSumRealS>=0?this.toNum(r[miSumRealS]):(this.toNum(_rSR)+sumR);
          const sumReal=(_rSR!=null&&String(_rSR).trim()!=='')?this.toNum(_rSR):sumRealS;
          const sumBezNds=this.toNum(r[miSumBezNds]);
          const w=skuWeight[rawSku]||skuWeight[sku]||1;
          const prikhodCost=this.getPrikhodCostPrices(rawSku,day)||this.getPrikhodCostPrices(sku,day);
          const sebNew=prikhodCost?prikhodCost.priceNoNds*qtyN:0;
          const sebWithNds=prikhodCost?prikhodCost.priceWithNds*qtyN:0;
          const sebSale=prikhodCost?prikhodCost.priceNoNds*qtyReal:0;
          const sebSaleWithNds=prikhodCost?prikhodCost.priceWithNds*qtyReal:0;
          const mappedGroup=findGroup(rawKnt,knt);
          const mappedSubgroup=findSubgroup(rawKnt,knt);
          if(isRetailRaw(rawKnt)){
            retailPointStats[knt]=(retailPointStats[knt]||0)+1;
          }
          const rowObj={
            knt,rawKnt,sku,rawSku,mk,day,ndsSuspect:false,
            sourceSheet:'ИсхРеалМай',
            sourceGid:this.GID_REAL_MAY,
            sourceRow:i+1,
            sklad,
            group:mappedGroup,
            subgroup:mappedSubgroup,
            skuGroup:skuGroup[rawSku]||skuGroup[sku]||'Прочее',weight:w,
            qtyN,qtyR,qtyReal,sumReal,sumRealS,sumBezNds,sumR,
            seb:sebNew,sebWithNds,sebSale,sebSaleWithNds,
            prof:sumBezNds-sebNew,kg:qtyN*w,retKg:qtyR*w,
          };
          if(mappedGroup==='⚠️ Без группы'){
            addUnmappedContractor(rowObj);
          }
          rawRows.push(rowObj);
        }
        p(92,'Май: '+mayRows.length+' строк');
      }
    }catch(e){ console.warn('ИсхРеалМай не загружен:',e); }

    const months2=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const unmappedContractors=[...unmappedContractorMap.values()]
      .map(x=>({...x,rev:Math.round(x.rev),kg:Math.round(x.kg*10)/10,examples:[...x.examples]}))
      .sort((a,b)=>b.rev-a.rev);
    const retailPoints=Object.entries(retailPointStats)
      .map(([point,rows])=>({point,rows}))
      .sort((a,b)=>a.point.localeCompare(b.point,'ru'));
    const diagnostics={
      sources:[{name:'ИсхРеал',gid:this.GID_REAL},{name:'ИсхРеалАО',gid:this.GID_REAL_AO},{name:'ИсхРеалМай',gid:this.GID_REAL_MAY}],
      contractorDictionaryGid:this.GID_KONTR,
      unmappedContractors,
      retailPoints,
    };
    this._lastSalesDiagnostics=diagnostics;
    if(typeof window!=='undefined'){
      window.PF_SALES_DIAGNOSTICS=diagnostics;
      if(unmappedContractors.length){
        console.warn('PF: есть контрагенты без группы. Открой window.PF_SALES_DIAGNOSTICS.unmappedContractors');
        console.table(unmappedContractors.slice(0,50));
      }
    }
    return {rawRows,groupMap,subgroupMap,skuWeight,skuGroup,skuDisplayMap,months:months2,diagnostics};
  },

  // ── ЗАГРУЗКА ПРИХОДА ─────────────────────────────────────────
  async loadPrikhod(onProgress) {
    const p=onProgress||(()=>{});
    p(30,'Загрузка журнала прихода...');
    const rows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_PRIHOD))).text());
    const H=rows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
    const fi=(...ns)=>this.findCol(H,...ns);

    const iSku  =fi('номенклатура','sku');
    const iSup  =fi('контрагент','поставщик','supplier','ссылка.контрагент');
    const iDate =fi('дата','date','ссылка.дата');
    const iQty  =fi('количество','qty');
    const iPrice=fi('цена','price');
    const iSum  =fi('сумма','sum');
    const iNDS  =fi('нд','nds');
    const iEd   =fi('ед.','единица','ед_изм','unit');

    const pRows=[];const monthMap=new Map();
    for (let i=1;i<rows.length;i++) {
      const r=rows[i];
      const sku=String(r[iSku]||'').trim();
      const sup=String(r[iSup]||'').trim();
      if (!sku) continue;
      const dt=this.toDate(r[iDate]);
      if (!dt) continue;
      const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());
      const qty  =this.toNum(r[iQty]);
      const price=this.toNum(r[iPrice]);
      const sum  =this.toNum(r[iSum]);
      const nds  =this.toNum(r[iNDS]);
      pRows.push({sku,sup,dt,mk,qty,price,sum,nds,sumWithNds:sum+nds,
                  ed:String(r[iEd]||'шт').trim()});
    }
    const months=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    return {pRows,months};
  },

  // ── ЗАГРУЗКА ДАННЫХ ДЛЯ ДиР / P&L ────────────────────────
  // Расходы + ЗП + вес прихода по поставщикам + сырые планы.
  async loadDirData(onProgress) {
    const p=onProgress||(()=>{});
    const monthKeyFromText = raw => {
      const s=String(raw||'').trim();
      const dt=this.toDate(s);
      if(dt && !isNaN(dt)) return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      const mm=s.match(/([А-Яа-яЁёA-Za-z]+)\s+(\d{4})/);
      if(mm){
        const mi=this.MO.findIndex(m=>m.toLowerCase()===mm[1].toLowerCase());
        if(mi>=0) return `${mm[2]}-${String(mi+1).padStart(2,'0')}`;
      }
      return '';
    };
    const fetchCsvRows = async gid => this.parseCSV(await (await fetch(this.csvUrl(gid))).text());

    // 1. Расходы
    p(10,'Загрузка расходов...');
    const rRows=await fetchCsvRows(this.GID_RASHOD);
    const rH=(rRows[0]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
    const ri=(...ns)=>this.findCol(rH,...ns);
    const iRA=ri('аналитика','analitika','наименование');
    const iRVid=ri('вид');
    const iRPeriod=ri('период.началомесяца','период','period');
    const iRKat=ri('категориязатрат','категория');
    const iRVidNal=ri('видрасходоввналоговомучете','видрасходов');
    const iRName=ri('наименование','name');
    const iRSchet=ri('счет','account');
    const iRSum=ri('сумма','sum');

    const rashod=[];
    for(let i=1;i<rRows.length;i++){
      const r=rRows[i]||[];
      const analitika=String(r[iRA>=0?iRA:'']||'').trim();
      const vid=String(r[iRVid>=0?iRVid:'']||'').trim();
      const period=String(r[iRPeriod>=0?iRPeriod:'']||'').trim();
      const kat=String(r[iRKat>=0?iRKat:'']||'').trim();
      const name=String(r[iRName>=0?iRName:'']||'').trim();
      const schet=String(r[iRSchet>=0?iRSchet:'']||'').trim();
      const vidNal=String(r[iRVidNal>=0?iRVidNal:'']||'').trim();
      const sum=this.toNum(r[iRSum>=0?iRSum:'']);
      if(!analitika || !sum) continue;
      const mk=monthKeyFromText(period);
      let tip='прочие';
      if(schet.includes('7010')) tip='себестоимость';
      else if(schet.includes('7110')) tip='реализация';
      else if(schet.includes('7210')) tip='административные';
      const isAmort=vidNal.toLowerCase().includes('амортиз') || analitika.toLowerCase().includes('амортиз');
      rashod.push({analitika,vid,period,mk,kat,name,schet,tip,vidNal,sum,isAmort});
    }

    // 2. ЗП Общее
    p(32,'Загрузка ЗП общего листа...');
    let zpObh=[];
    try{
      const zRows=await fetchCsvRows(this.GID_ZP_OBH);
      const zH=(zRows[0]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
      const zi=(...ns)=>this.findCol(zH,...ns);
      const iZPodrazd=zi('подразделениеорганизации','подразделение','department');
      const iZDolj=zi('должность','position');
      const iZPeriod=zi('месяцрегистрацииначислений','месяц','period');
      const iZNach=zi('начисление','accrual');
      const iZSotr=zi('сотрудник','employee');
      const iZSum=zi('начислено','sum','сумма');
      for(let i=1;i<zRows.length;i++){
        const r=zRows[i]||[];
        const podrazd=String(r[iZPodrazd>=0?iZPodrazd:'']||'').trim();
        const dolj=String(r[iZDolj>=0?iZDolj:'']||'').trim();
        const periodRaw=String(r[iZPeriod>=0?iZPeriod:'']||'').trim();
        const nach=String(r[iZNach>=0?iZNach:'']||'').trim();
        const sotr=String(r[iZSotr>=0?iZSotr:'']||'').trim();
        const sum=this.toNum(r[iZSum>=0?iZSum:'']);
        if(!sum) continue;
        const mk=monthKeyFromText(periodRaw);
        zpObh.push({podrazd,dolj,nach,sotr,periodRaw,mk,sum});
      }
    }catch(e){ console.warn('ЗП Общее не загружено:',e); }

    // 3. ЗП Детально — сохраняем очищенный raw-слой для детализации
    p(44,'Загрузка ЗП детально...');
    let zpDet=[];
    try{
      const dRows=await fetchCsvRows(this.GID_ZP_DET);
      const dH=(dRows[0]||[]).map(h=>String(h||'').trim());
      zpDet=dRows.slice(1).filter(r=>r.some(v=>String(v||'').trim())).map(r=>({row:r,header:dH}));
    }catch(e){ console.warn('ЗП Детально не загружено:',e); }

    // 4. Приход — вес по поставщикам AO/BM
    p(58,'Загрузка прихода для ДиР...');
    const pData=await this.loadPrikhod2();

    // 5. Планы — текущий лист планов оставляем доступным сырым массивом
    p(78,'Загрузка листа планов...');
    let plans={raw:[],header:[]};
    try{
      const plRows=await fetchCsvRows(this.GID_PLAN);
      plans={raw:plRows,header:(plRows[0]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''))};
    }catch(e){ console.warn('Планы не загружены:',e); }

    p(95,'ДиР-данные готовы');
    return {rashod,zpObh,zpDet,prikhod:pData,plans};
  },

  // Приход из отдельного листа ДиР: агрегация веса/суммы по AO, BM и прочим.
  async loadPrikhod2() {
    const rows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_PRIHOD2))).text());
    const H=(rows[0]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
    const fi=(...ns)=>this.findCol(H,...ns);
    const iSku=fi('номенклатура','sku');
    const iSup=fi('контрагент','поставщик','ссылка.контрагент');
    const iDate=fi('дата','date','ссылка.дата');
    const iQty=fi('количество','qty');
    const iSum=fi('сумма','sum');
    const iNDS=fi('нд','nds','сумманд','суммандс');
    const bySupMonth={};
    for(let i=1;i<rows.length;i++){
      const r=rows[i]||[];
      const sku=String(r[iSku>=0?iSku:'']||'').trim();
      if(!sku) continue;
      const sup=String(r[iSup>=0?iSup:'']||'').trim();
      const dt=this.toDate(r[iDate>=0?iDate:'']);
      if(!dt) continue;
      const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      const qty=this.toNum(r[iQty>=0?iQty:'']);
      const sum=this.toNum(r[iSum>=0?iSum:'']);
      const nds=this.toNum(r[iNDS>=0?iNDS:'']);
      if(!bySupMonth[mk]) bySupMonth[mk]={};
      const s=sup.toLowerCase();
      const supKey=s.includes('burabay')?'BM':(s.includes('астана')||s.includes('astana')?'AO':'OTHER');
      if(!bySupMonth[mk][supKey]) bySupMonth[mk][supKey]={kg:0,sum:0,sumNoNds:0};
      bySupMonth[mk][supKey].kg+=qty;
      bySupMonth[mk][supKey].sum+=sum;
      bySupMonth[mk][supKey].sumNoNds+=sum-nds;
    }
    return bySupMonth;
  },

};
