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
  GID_REAL:  '1836485982',
  GID_KONTR: '1039539700',
  GID_SKU:   '286897778',
  GID_PRIHOD:'1270219264',
  GID_PLAN:  '311695615',   // Лист Планы — план закупа по поставщикам

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
    const retPct         = rev  ? ret/rev*100   : 0;
    const avg            = qty  ? rev/qty       : 0;
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
    p(10,'SKU справочник...');
    const skuRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_SKU))).text());
    const skuH    = skuRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
    const si = (...ns) => this.findCol(skuH,...ns);
    const iSN=si('sku1с','sku1c','наим');
    const iSV=si('объем','обьем','вес','vol');
    const iSG=si('группаsku','группаs','группа');

    const skuWeight={}, skuGroup={};
    for (let i=1;i<skuRows.length;i++) {
      const r=skuRows[i];
      const name=String(r[iSN]||'').trim();
      if (name) {
        const w=this.toNum(r[iSV]);
        skuWeight[name]=w>0?w:1;
        skuGroup[name]=String(r[iSG]||'').trim()||'Прочее';
      }
    }

    // 2. Группы контрагентов
    p(25,'Справочник групп...');
    const kRows=this.parseCSV(await (await fetch(this.csvUrl(this.GID_KONTR))).text());
    const kH=kRows[0].map(h=>h.toLowerCase().replace(/\s/g,''));
    const ki=(...ns)=>this.findCol(kH,...ns);
    const groupMap={};
    const groupMapNorm={};  // нормализованный ключ для нечёткого сопоставления
    const normKey = s => s.toLowerCase().replace(/\s+/g,' ').replace(/[«»"'`]/g,'').trim();
    for (let i=1;i<kRows.length;i++) {
      const knt=String(kRows[i][ki('контрагент','kontragent')]||'').trim();
      const grp=String(kRows[i][ki('новаягруппа','новая','группа')]||'').trim();
      if (knt) {
        groupMap[knt]=grp||'⚠️ Без группы';
        groupMapNorm[normKey(knt)]=grp||'⚠️ Без группы';
      }
    }
    // Функция поиска группы: 3 уровня
    // 1) точное совпадение
    // 2) нормализованное (lowercase, без кавычек, trim)
    // 3) fallback по первым 20 символам (нечёткое)
    const groupMapPrefix={};
    for(const [k,v] of Object.entries(groupMap)){
      const pfx = normKey(k).slice(0,20);
      if(!groupMapPrefix[pfx]) groupMapPrefix[pfx]=v;
    }
    const findGroup = knt => {
      // Торговые точки — всегда группа "Торговые точки"
      if(knt.startsWith('ТТ ')) return 'Торговые точки';
      if(groupMap[knt]) return groupMap[knt];
      const nk = normKey(knt);
      if(groupMapNorm[nk]) return groupMapNorm[nk];
      const pfx = nk.slice(0,20);
      if(groupMapPrefix[pfx]) return groupMapPrefix[pfx];
      return '⚠️ Без группы';
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

    for (let i=1;i<rRows.length;i++) {
      const r=rRows[i];
      let knt=String(r[iKnt]||'').trim();
      const sku=String(r[iSku]||'').trim();
      const sklad=iSklad>=0 ? String(r[iSklad]||'').trim() : '';

      // Торговые точки: Розничная выручка/покупатель → разделяем по складам
      const TT_SKLADS={'Сауран':'ТТ Сауран','Коктал':'ТТ Коктал','Артем':'ТТ Артем',
        'Евразия':'ТТ Евразия','Акмол Женис':'ТТ Акмол Женис','Шапагат ТД':'ТТ Шапагат ТД'};
      if(knt.toLowerCase().includes('розничн') && TT_SKLADS[sklad]){
        knt = TT_SKLADS[sklad];
      }

      // Пропускаем: пустые, строку "Итого", нетоварные
      if (!knt||!sku) continue;
      if (knt.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
      if (!this.isDairy(sku)) continue;

      const dt=this.toDate(r[iDate]);
      if (!dt) continue;

      const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      // Локальная дата — НЕ toISOString() — иначе UTC+5 сдвигает на день назад
      const day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      if (!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());

      const qtyReal  =this.toNum(r[iQtyReal]);
      const sumReal  =this.toNum(r[iSumReal]);
      const sumRealS =iSumRealS>=0 ? this.toNum(r[iSumRealS]) : (sumReal + sumR);  // J+K или колонка L
      const qtyN     =this.toNum(r[iQtyN]);
      const qtyR     =Math.abs(this.toNum(r[iQtyR]));
      const sumBezNds=this.toNum(r[iSumBezNds]);
      const sumR     =this.toNum(r[iSumR]);
      const seb      =this.toNum(r[iSeb]);
      const prof     =this.toNum(r[iProf]);
      const w        =skuWeight[sku]||1;

      // Себестоимость из прихода: цена ближайшего прихода ДО даты продажи
      // Основная себестоимость считается БЕЗ НДС, чтобы корректно сравнивать с выручкой без НДС.
      const prikhodCost = this.getPrikhodCostPrices(sku, day);
      // Себест. ₸ = цена прихода × qtyN (финансовая себест., как и выручка — с возвратами)
      const sebNew      = prikhodCost ? prikhodCost.priceNoNds  * qtyN    : seb;
      const sebWithNds  = prikhodCost ? prikhodCost.priceWithNds * qtyN   : seb;
      // Для цены закупа — только строки продаж (qtyReal), не смешиваем с возвратами
      const sebSale         = prikhodCost ? prikhodCost.priceNoNds  * qtyReal : seb;
      const sebSaleWithNds  = prikhodCost ? prikhodCost.priceWithNds * qtyReal : seb;
      const profNew = sumBezNds - sebNew;

      rawRows.push({
        knt,sku,mk,day,
        ndsSuspect: (() => {
          // Проверяем только строки без возвратов (для строк с возвратами формула другая)
          const hasReturn = Math.abs(qtyR) > 0 || Math.abs(sumR) > 0;
          if(!hasReturn && sumReal && Math.abs(sumBezNds - sumReal/1.16) > 5) return true;
          return false;
        })(),
        group:    findGroup(knt),
        skuGroup: skuGroup[sku]||'Прочее',
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
      });
    }

    const months=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    return {rawRows,groupMap,skuWeight,skuGroup,months};
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
};
