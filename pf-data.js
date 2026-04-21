// ═══════════════════════════════════════════════════════════════
// pf-data.js — общий загрузчик данных для всех страниц PF
// Premium Food Astana © 2026
//
// ПРАВИЛЬНЫЙ МАППИНГ КОЛОНОК из 1С (ИсхРеал):
//   Выручка       = «Сумма без налогов»       (sum_bez_nds) — БЕЗ НДС!
//   Себестоимость = «Стоимость (без НДС)»     (sebest)
//   Прибыль       = «Profit (сумма)»           (profit) = sum_bez_nds − sebest
//   Кол-во        = «Кол-во реализации (с возвратами)» (qty_net)
//   Возвраты      = «Сумма возвратов»          (sum_ret) — отрицательное
//   ВНИМАНИЕ: sum_net («Сумма реализации с возвратами») содержит НДС — не использовать как выручку!
// ═══════════════════════════════════════════════════════════════

const PF = {
  PUB_ID:    '2PACX-1vTwyEj5Huy-avrqvCZj1rCqTBJObnOHNJ-GVdZic0J1_fwVafku2G0MpiZtGle8zOXzUUmEer26ylrO',
  GID_REAL:  '1836485982',
  GID_KONTR: '1039539700',
  GID_SKU:   '286897778',
  GID_PRIHOD:'1270219264',

  csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/e/${this.PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  },

  NON_PRODUCT: ['услуг','аренд','дистриб','транспорт','обслуж','сервис','подписк'],
  isDairy(sku) { return !this.NON_PRODUCT.some(k => sku.toLowerCase().includes(k)); },

  MO: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],

  // ── ФОРМАТИРОВАНИЕ ──────────────────────────────────────────
  // Количество — целое число с пробелами: 759 963
  fmtQty(n)  { return Math.round(n||0).toLocaleString('ru-RU'); },

  // КГ — с одним знаком после запятой, пробел как разделитель тысяч: 666 583.4 кг
  // Используем ru-RU локаль — она даёт пробел как разделитель тысяч и запятую как десятичный
  // Но нам нужна точка, поэтому заменяем запятую на точку
  fmtKg(n) {
    const rounded = Math.round((n||0) * 10) / 10;
    // ru-RU: 666583.4 → "666 583,4" → заменяем запятую на точку → "666 583.4"
    return rounded.toLocaleString('ru-RU', {minimumFractionDigits:1, maximumFractionDigits:1}).replace(',','.');
  },

  // Выручка/суммы
  fmtRev(n) {
    const a = Math.abs(n||0);
    if (a >= 1e9) return (n/1e9).toFixed(1) + ' млрд';
    if (a >= 1e6) return (n/1e6).toFixed(1) + ' млн';
    if (a >= 1e3) return Math.round(n).toLocaleString('ru-RU');
    return Math.round(n||0).toLocaleString('ru-RU');
  },
  fmtFull(n)    { return Math.round(n||0).toLocaleString('ru-RU'); },
  fmtPct(n)     { return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; },
  fmtPctAbs(n)  { return n == null ? '—' : Math.abs(n).toFixed(1) + '%'; },

  // ── ПАРСЕРЫ ─────────────────────────────────────────────────
  toNum(s) { return parseFloat(String(s||'').replace(/\s/g,'').replace(',','.')) || 0; },

  toDate(s) {
    s = String(s||'').trim().split(' ')[0];
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

  // ── АГРЕГАЦИЯ ────────────────────────────────────────────────
  agg(rows) {
    let qty=0, rev=0, ret=0, seb=0, prof=0, kg=0, retKg=0, qtyReal=0, sumReal=0;
    for (const x of rows) {
      qty        += x.qtyN;
      rev        += x.sumBezNds;   // ВЫРУЧКА = «Сумма без налогов»
      ret        += x.sumR;
      seb        += x.seb;
      prof       += x.prof;
      kg         += x.kg;
      retKg      += x.retKg;
      qtyRealSum += (x.qtyReal || x.qtyN);
      sumRealSum += (x.sumReal || 0);
    }
    const mar        = rev  ? prof/rev*100   : 0;
    // Цена закупа = Себестоимость / Кол-во без возвратов
    const priceZakup    = qtyRealSum ? seb / qtyRealSum               : 0;
    // Цена продажи с НДС = Сумма реализации (с НДС) / Кол-во без возвратов
    const priceSellNds  = qtyRealSum ? sumRealSum / qtyRealSum         : 0;
    // Цена продажи без НДС = Цена с НДС / 1.16
    const priceSellNoNds= priceSellNds / 1.16;
    // Профит на единицу с НДС = Продажная(с НДС) − Закупочная
    const profitUnitNds  = priceSellNds   - priceZakup;
    // Профит на единицу без НДС = Продажная(без НДС) − Закупочная
    const profitUnitNoNds= priceSellNoNds - priceZakup;
    // Цены: используем qtyReal (без возвратов) как знаменатель
    const priceZakup  = qtyReal ? seb / qtyReal     : 0;  // Себест / Кол-во без возвр = Закупочная цена
    const priceSell   = qtyReal ? sumReal / qtyReal  : 0;  // Сумма реализации / Кол-во = Продажная цена (с НДС)
    const profitUnit  = priceSell - priceZakup;             // Профит на единицу = Продажная − Закупочная
    const retPct     = rev  ? ret/rev*100    : 0;
    const avg        = qty  ? rev/qty        : 0;
    const retKgPct   = kg   ? retKg/kg*100  : 0;
    return {
      qty:      Math.round(qty),
      rev:      Math.round(rev),
      ret:      Math.round(ret),
      retPct:   Math.round(retPct*10)/10,
      seb:      Math.round(seb),
      prof:     Math.round(prof),
      mar:      Math.round(mar*10)/10,
      avg:      Math.round(avg),
      kg:       Math.round(kg*10)/10,
      retKg:    Math.round(retKg*10)/10,
      retKgPct: Math.round(retKgPct*10)/10,
      profKg:       kg ? Math.round(prof/kg)  : 0,
      priceZakup:    Math.round(priceZakup),      // Себест ÷ Кол-во(без возвр)
      priceSellNds:  Math.round(priceSellNds),    // СуммаРеал(с НДС) ÷ Кол-во(без возвр)
      priceSellNoNds:Math.round(priceSellNoNds),  // ÷ 1.16
      profitUnitNds:  Math.round(profitUnitNds),  // Продажная(с НДС) − Закупочная
      profitUnitNoNds:Math.round(profitUnitNoNds),// Продажная(без НДС) − Закупочная
      priceZakup:  Math.round(priceZakup),   // Закупочная цена = Себест÷Кол-во(без возвр)
      priceSell:   Math.round(priceSell),    // Продажная цена = СуммаРеал(с НДС)÷Кол-во(без возвр)
      profitUnit:  Math.round(profitUnit),   // Профит на единицу = Продажная − Закупочная
      sebKg:    kg ? Math.round(seb/kg)  : 0,
    };
  },

  groupBy(arr, fn) {
    const m = {};
    for (const x of arr) { const k = fn(x); (m[k] = m[k]||[]).push(x); }
    return m;
  },

  // ── ОСНОВНАЯ ЗАГРУЗКА ПРОДАЖ ─────────────────────────────────
  async loadSales(onProgress) {
    const p = onProgress || (() => {});

    // 1. SKU справочник (веса + группы)
    p(10, 'SKU справочник (веса, категории)...');
    const skuRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_SKU))).text());
    const skuH    = skuRows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const si = (...ns) => this.findCol(skuH, ...ns);
    const iSN = si('sku1с','sku1c','наим');
    const iSV = si('объем','обьем','вес','vol');
    const iSG = si('группаsku','группаs','группа');

    const skuWeight = {}, skuGroup = {};
    for (let i = 1; i < skuRows.length; i++) {
      const r = skuRows[i];
      const name = String(r[iSN]||'').trim();
      if (name) {
        const w = this.toNum(r[iSV]);
        skuWeight[name] = w > 0 ? w : 1;
        skuGroup[name]  = String(r[iSG]||'').trim() || 'Прочее';
      }
    }

    // 2. Группы контрагентов
    p(25, 'Справочник групп контрагентов...');
    const kRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_KONTR))).text());
    const kH    = kRows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const ki = (...ns) => this.findCol(kH, ...ns);
    const groupMap = {};
    for (let i = 1; i < kRows.length; i++) {
      const knt = String(kRows[i][ki('контрагент','kontragent')]||'').trim();
      const grp = String(kRows[i][ki('новаягруппа','новая','группа')]||'').trim();
      if (knt) groupMap[knt] = grp || '⚠️ Без группы';
    }

    // 3. ИсхРеал
    p(45, 'Данные реализации (ИсхРеал)...');
    const rRows = this.parseCSV(await (await fetch(this.csvUrl(this.GID_REAL))).text());
    const rH    = rRows[0].map(h => h.toLowerCase().replace(/\s/g,''));
    const ri = (...ns) => this.findCol(rH, ...ns);

    const iKnt       = ri('контрагент');
    const iSku       = ri('номенклатура','sku','товар');
    const iDate      = ri('периоддень','период','дата','date');
    // Индексы колонок по позиции (надёжнее для коротких имён)
    const iQtyReal   = rH.findIndex(h => h === 'количествореализации');     // col 5: Кол-во реализации (БЕЗ возвратов)
    const iSumReal   = rH.findIndex(h => h === 'суммареализации');           // col 8: Сумма реализации с НДС (БЕЗ возвратов)
    // Точный поиск по имени колонки (findIndex с проверкой равенства)
    const iQtyReal   = rH.findIndex(h => h === 'количествореализации');  // col 5: Кол-во реализации БЕЗ возвратов
    const iSumReal   = rH.findIndex(h => h === 'суммареализации');        // col 8: Сумма реализации с НДС, БЕЗ возвратов
    const iQtyN      = ri('количествореализации(с','количествосвозвр');
    const iQtyR      = ri('количествовозвратов');
    // ВЫРУЧКА = «Сумма без налогов» (суммабезналогов)
    const iSumBezNds = ri('суммабезналогов','безналогов');
    const iSumR      = ri('суммавозвратов');
    const iSeb       = ri('стоимость(без','стоимость','себест');
    const iProf      = ri('profit','прибыль');

    p(65, 'Обработка строк...');
    const rawRows = [];
    const monthMap = new Map();
    const dayMap   = new Map(); // mk → [{d, rev, qty, prof, seb, kg, ret}]

    for (let i = 1; i < rRows.length; i++) {
      const r   = rRows[i];
      const knt = String(r[iKnt]||'').trim();
      const sku = String(r[iSku]||'').trim();
      if (!knt || !sku || !this.isDairy(sku)) continue;
      const dt = this.toDate(r[iDate]);
      if (!dt) continue;

      const mk  = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      // ВАЖНО: используем локальную дату, а не UTC.
      // toISOString() сдвигает дату в UTC → в часовых поясах UTC+N дата "уезжает" на день назад.
      // Пример бага: 21.04.2026 00:00 по Астане (UTC+5) → 2026-04-20 19:00 UTC → toISOString даёт "2026-04-20"
      const day = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      if (!monthMap.has(mk)) monthMap.set(mk, this.MO[dt.getMonth()] + ' ' + dt.getFullYear());

      const qtyReal   = this.toNum(r[iQtyReal]);  // Кол-во реализации БЕЗ возвратов
      const sumReal   = this.toNum(r[iSumReal]);  // Сумма реализации с НДС, БЕЗ возвратов
      const qtyReal   = this.toNum(r[iQtyReal]);  // Кол-во без возвратов (числитель для цен)
      const sumReal   = this.toNum(r[iSumReal]);  // Сумма реализации с НДС (для цены с НДС)
      const qtyN      = this.toNum(r[iQtyN]);
      const qtyR      = Math.abs(this.toNum(r[iQtyR]));
      const sumBezNds = this.toNum(r[iSumBezNds]);
      const sumR      = this.toNum(r[iSumR]);
      const seb       = this.toNum(r[iSeb]);
      const prof      = this.toNum(r[iProf]);
      const w         = skuWeight[sku] || 1;

      rawRows.push({
        knt, sku, mk, day,
        group:    groupMap[knt]  || '⚠️ Без группы',
        skuGroup: skuGroup[sku]  || 'Прочее',
        weight:   w,
        qtyN, qtyR, qtyReal, sumReal, qtyReal, sumReal,
        sumBezNds,   // ← ВЫРУЧКА (без НДС)
        sumR,
        seb,
        prof,
        kg:    qtyN * w,
        retKg: qtyR * w,
      });
    }

    const months = [...monthMap.entries()].sort((a,b) => a[0].localeCompare(b[0]));
    return { rawRows, groupMap, skuWeight, skuGroup, months };
  },

  // ── ДНЕВНАЯ АГРЕГАЦИЯ ────────────────────────────────────────
  getDailyData(rawRows, mk) {
    const rows = mk === 'all' ? rawRows : rawRows.filter(r => r.mk === mk);
    const byDay = this.groupBy(rows, r => r.day);
    return Object.entries(byDay)
      .map(([day, dr]) => {
        const a = this.agg(dr);
        return { day, ...a };
      })
      .sort((a,b) => a.day.localeCompare(b.day));
  },

  // ── ЗАГРУЗКА ПРИХОДА ─────────────────────────────────────────
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
      const qty   = this.toNum(r[iQty]);
      const price = this.toNum(r[iPrice]);
      const sum   = this.toNum(r[iSum]);
      const nds   = this.toNum(r[iNDS]);
      pRows.push({ sku, sup, dt, mk, qty, price, sum, nds, sumWithNds: sum + nds,
                   ed: String(r[iEd]||'шт').trim() });
    }
    const months = [...monthMap.entries()].sort((a,b) => a[0].localeCompare(b[0]));
    return { pRows, months };
  },
};
