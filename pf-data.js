// ═══════════════════════════════════════════════════════
// pf-data.js — общий загрузчик данных для всех страниц
// Premium Food Astana © 2026
// ═══════════════════════════════════════════════════════

const PF = {
  // CONFIG
  PUB_ID:    '2PACX-1vTwyEj5Huy-avrqvCZj1rCqTBJObnOHNJ-GVdZic0J1_fwVafku2G0MpiZtGle8zOXzUUmEer26ylrO',
  GID_REAL:  '1836485982',
  GID_KONTR: '1039539700',
  GID_SKU:   '286897778',
  GID_PRIHOD:'1270219264',

  csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/e/${this.PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  },

  // Нетоварные позиции — исключаем из анализа продаж
  NON_PRODUCT: ['услуг','аренд','дистриб','транспорт','обслуж','сервис','подписк'],
  isDairy(sku) { return !this.NON_PRODUCT.some(k => sku.toLowerCase().includes(k)); },

  // Месяцы RU
  MO: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],

  // ── ПАРСЕРЫ ─────────────────────────────────────────
  toNum(s) { return parseFloat(String(s||'').replace(/\s/g,'').replace(',','.')) || 0; },

  toDate(s) {
    s = String(s||'').trim().split(' ')[0]; // убираем время если есть
    if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
      const [d,m,y] = s.split('.'); return new Date(+y, +m-1, +d);
    }
    const d = new Date(s); return isNaN(d) ? null : d;
  },

  parseCSV(text) {
    const rows = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const cols = []; let cur = '', inQ = false;
      for (const c of line) {
        if (c === '"') { inQ = !inQ; continue; }
        if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += c;
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

  // ── ФОРМАТИРОВАНИЕ ───────────────────────────────────
  fmtRev(n) {
    // Выручка / суммы — миллионы
    const a = Math.abs(n||0);
    if (a >= 1e9) return (n/1e9).toFixed(1) + ' млрд';
    if (a >= 1e6) return (n/1e6).toFixed(1) + ' млн';
    if (a >= 1e3) return Math.round(n).toLocaleString('ru-RU');
    return Math.round(n||0).toLocaleString('ru-RU');
  },
  fmtFull(n)  { return Math.round(n||0).toLocaleString('ru-RU'); },
  fmtQty(n)   { return Math.round(n||0).toLocaleString('ru-RU'); },          // целое число
  fmtKg(n)    { return (Math.round((n||0)*10)/10).toLocaleString('ru-RU'); }, // 1 знак после запятой
  fmtPct(n)   { return (n==null?'—':(n>0?'+':'')+n.toFixed(1)+'%'); },
  fmtPctAbs(n){ return (n==null?'—':Math.abs(n).toFixed(1)+'%'); },

  // ── АГРЕГАЦИЯ ────────────────────────────────────────
  // ПРАВИЛЬНЫЕ колонки:
  // Выручка       = sumBezNds  ("Сумма без налогов" из 1С)
  // Себестоимость = sebest     ("Стоимость (без НДС)")
  // Прибыль       = profit     ("Profit (сумма)" — уже посчитан в 1С как sumBezNds − sebest)
  // Возврат       = sumR       ("Сумма возвратов")
  // Кол-во        = qtyN       ("Количество реализации (с возвратами)")
  agg(rows) {
    let qty=0, rev=0, ret=0, seb=0, prof=0, kg=0, retKg=0;
    for (const x of rows) {
      qty  += x.qtyN;
      rev  += x.sumBezNds;  // ← ВЫРУЧКА БЕЗ НДС (правильная)
      ret  += x.sumR;
      seb  += x.seb;
      prof += x.prof;
      kg   += x.kg;
      retKg+= x.retKg;
    }
    const mar      = rev  ? prof/rev*100  : 0;
    const retPct   = rev  ? ret/rev*100   : 0;
    const avg      = qty  ? rev/qty       : 0;
    const retKgPct = kg   ? retKg/kg*100  : 0;
    const profKg   = kg   ? prof/kg       : 0;
    const sebKg    = kg   ? seb/kg        : 0;
    return {
      qty:   Math.round(qty),
      rev:   Math.round(rev),
      ret:   Math.round(ret),
      retPct: Math.round(retPct*10)/10,
      seb:   Math.round(seb),
      prof:  Math.round(prof),
      mar:   Math.round(mar*10)/10,
      avg:   Math.round(avg),
      kg:    Math.round(kg*10)/10,
      retKg: Math.round(retKg*10)/10,
      retKgPct: Math.round(retKgPct*10)/10,
      profKg: kg ? Math.round(prof/kg) : 0,
      sebKg:  kg ? Math.round(seb/kg)  : 0,
    };
  },

  groupBy(arr, fn) {
    const m = {};
    for (const x of arr) { const k = fn(x); (m[k] = m[k]||[]).push(x); }
    return m;
  },

  // ── ОСНОВНАЯ ЗАГРУЗКА ────────────────────────────────
  async loadSales(onProgress) {
    const p = onProgress || (() => {});

    // 1. SKU справочник
    p(10, 'SKU справочник (веса, категории)...');
    const skuRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_SKU))).text());
    const skuH    = skuRows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const si = (...ns) => this.findCol(skuH, ...ns);
    const iSN = si('sku1с','sku1c','наим'), iSV = si('объем','обьем','вес','vol'), iSG = si('группаsku','группаs','группа');

    const skuWeight = {}, skuGroup = {};
    for (let i = 1; i < skuRows.length; i++) {
      const r = skuRows[i];
      const name = String(r[iSN]||'').trim();
      if (name) { skuWeight[name] = this.toNum(r[iSV])||1; skuGroup[name] = String(r[iSG]||'').trim()||'Прочее'; }
    }

    // 2. Группы контрагентов
    p(25, 'Справочник групп контрагентов...');
    const kRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_KONTR))).text());
    const kH    = kRows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const ki = (...ns) => this.findCol(kH, ...ns);
    const groupMap = {};
    for (let i = 1; i < kRows.length; i++) {
      const knt = String(kRows[i][ki('контрагент','kontragent')]||'').trim();
      const grp = String(kRows[i][ki('новаягруппа','новая','группа','group')]||'').trim();
      if (knt) groupMap[knt] = grp || '⚠️ Без группы';
    }

    // 3. ИсхРеал
    p(45, 'Данные реализации (ИсхРеал)...');
    const rRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_REAL))).text());
    const rH    = rRows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const ri = (...ns) => this.findCol(rH, ...ns);

    const iKnt      = ri('контрагент');
    const iSku      = ri('номенклатура','sku','товар');
    const iDate     = ri('периоддень','период','дата','date');
    const iQtyN     = ri('количествореализации(с','количествосвозвр');
    const iQtyR     = ri('количествовозвратов');
    const iSumBezNds= ri('суммабезналогов','безналогов','безнал');  // ← ПРАВИЛЬНАЯ ВЫРУЧКА ("Сумма без налогов")
    const iSumR     = ri('суммавозвратов');
    const iSeb      = ri('стоимость(без','стоимость','себест');
    const iProf     = ri('profit','прибыль');

    p(65, 'Обработка строк...');
    const rawRows = [];
    const monthMap = new Map();

    for (let i = 1; i < rRows.length; i++) {
      const r   = rRows[i];
      const knt = String(r[iKnt]||'').trim();
      const sku = String(r[iSku]||'').trim();
      if (!knt || !sku || !this.isDairy(sku)) continue;
      const dt = this.toDate(r[iDate]);
      if (!dt) continue;

      const mk = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!monthMap.has(mk)) monthMap.set(mk, this.MO[dt.getMonth()] + ' ' + dt.getFullYear());

      const qtyN    = this.toNum(r[iQtyN]);
      const qtyR    = Math.abs(this.toNum(r[iQtyR]));
      const w       = skuWeight[sku] || 1;

      rawRows.push({
        knt, sku, mk, dt,
        group:    groupMap[knt]  || '⚠️ Без группы',
        skuGroup: skuGroup[sku]  || 'Прочее',
        weight:   w,
        qtyN, qtyR,
        sumNet:    this.toNum(r[ri('суммареализации(с','суммарелс')]),   // с НДС (инфо)
        sumBezNds: this.toNum(r[iSumBezNds]),   // ← ВЫРУЧКА (без НДС)
        sumR:      this.toNum(r[iSumR]),
        seb:       this.toNum(r[iSeb]),
        prof:      this.toNum(r[iProf]),
        kg:        qtyN * w,
        retKg:     qtyR * w,
      });
    }

    const months = [...monthMap.entries()].sort((a,b) => a[0].localeCompare(b[0]));
    return { rawRows, groupMap, skuWeight, skuGroup, months };
  },

  // ── ЗАГРУЗКА ПРИХОДА ─────────────────────────────────
  async loadPrikhod(onProgress) {
    const p = onProgress || (() => {});
    p(30, 'Загрузка журнала прихода...');
    const rows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_PRIHOD))).text());
    const H = rows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const fi = (...ns) => this.findCol(H, ...ns);

    const iSku   = fi('номенклатура','sku');
    const iSup   = fi('контрагент','поставщик','supplier','ссылка.контрагент');
    const iDate  = fi('дата','date','ссылка.дата');
    const iQty   = fi('количество','qty');
    const iPrice = fi('цена','price');
    const iSum   = fi('сумма','sum');
    const iNDS   = fi('нд','nds');
    const iEd    = fi('ед.','единица','ед_изм','unit');

    const pRows = []; const monthMap = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const sku = String(r[iSku]||'').trim();
      const sup = String(r[iSup]||'').trim();
      if (!sku) continue;
      const dt = this.toDate(r[iDate]);
      if (!dt) continue;
      const mk = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!monthMap.has(mk)) monthMap.set(mk, this.MO[dt.getMonth()] + ' ' + dt.getFullYear());
      pRows.push({ sku, sup, dt, mk, qty: this.toNum(r[iQty]), price: this.toNum(r[iPrice]),
                   sum: this.toNum(r[iSum]), nds: this.toNum(r[iNDS]), ed: String(r[iEd]||'шт').trim() });
    }
    const months = [...monthMap.entries()].sort((a,b) => a[0].localeCompare(b[0]));
    return { pRows, months };
  },
};
