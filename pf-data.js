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
  GID_PRIHOD:'739937881',   // Приход — универсальный отчёт «Поступление ТМЗ и услуг» (тот же физический лист, что и GID_PRIHOD2 ниже)
  GID_PLAN:  '311695615',   // Лист Планы — план закупа по поставщикам
  GID_PRIHOD2:'739937881',  // Приход для ДиР / веса по поставщикам — тот же лист; fetchCsvCached сам избежит двойной загрузки одного gid
  GID_RASHOD:'753197950',   // Расходы для ДиР
  GID_ZP_DET:'1431078713',  // ЗП Детально
  GID_ZP_OBH:'2144268074',  // ЗП Общее

  csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/e/${this.PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  },

  // ── КЭШ CSV МЕЖДУ СТРАНИЦАМИ (sessionStorage, TTL по умолчанию 15 мин) ──
  // Тяжёлые листы реализации (ИсхРеал/АО/Май) кэшируем тоже — квота обычно
  // хватает; если sessionStorage переполнится, ловим ошибку и просто не кэшируем.
  async fetchCsvCached(gid, ttlMin = 15) {
    const key = 'pf.csv.' + gid;
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < ttlMin * 60000) return c.text;
    } catch (e) {}
    const resp = await fetch(this.csvUrl(gid));
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' (gid ' + gid + ')');
    const text = await resp.text();
    try {
      sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), text }));
      sessionStorage.setItem('pf.csv.updatedAt', String(Date.now()));
    } catch (e) {
      // превышена квота sessionStorage — работаем без кэша для этого листа
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pf:dataUpdated'));
    return text;
  },

  clearCsvCache() {
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith('pf.csv.')).forEach(k => sessionStorage.removeItem(k));
    } catch (e) {}
  },

  // Скачать и распарсить один лист (с кэшем)
  async fetchCsvRows(gid, ttlMin) {
    return this.parseCSV(await this.fetchCsvCached(gid, ttlMin));
  },

  NON_PRODUCT: ['услуг','аренд','дистриб','транспорт','обслуж','сервис','подписк'],
  isDairy(sku) { return !this.NON_PRODUCT.some(k => sku.toLowerCase().includes(k)); },

  VAT: 1.16, // ставка НДС (16%, Казахстан 2026) — единая константа для всех расчётов «без НДС»

  // Фиксированный порядок каналов
  GROUP_ORDER: ['Фирменные точки','Категория А','BC','Кофейни','ГосЗакуп','Horeca','Юридические лица','Регион Бурабай','Кымызнай'],
  groupSortIdx(g) { const i=this.GROUP_ORDER.indexOf(g); return i>=0?i:998; },

  // Дефолтный «молочный» порядок групп SKU (утверждён пользователем) — действует только пока
  // пользователь явно не выбрал сортировку по показателю (см. userSorted в index.html)
  SKU_GROUP_ORDER: ['Молоко','Сметана','Творог','Кисломолочная','Масло','Национальный продукт','Сыр','Сливки'],
  skuGroupSortIdx(v){
    const s = String(v||'').toLowerCase();
    const i = this.SKU_GROUP_ORDER.findIndex(g => s.includes(g.toLowerCase()));
    return i === -1 ? 900 + (s.charCodeAt(0)||0) : i;   // неизвестные — в конец, стабильно (по первой букве)
  },

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

  // Некоторые листы 1С («универсальный отчёт») имеют мусорную шапку сверху (заголовок отчёта,
  // пустая строка) прежде чем начинаются реальные названия колонок. Ищем строку заголовков по
  // наличию ключевого слова (обычно «номенклатура») среди первых нескольких строк листа.
  _findHeaderRowIdx(rows, keyword='номенклатура', maxScan=10) {
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
      const cells = (rows[i]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
      if (cells.some(c => c.includes(keyword))) return i;
    }
    return 0;
  },

  // ── АГРЕГАЦИЯ ────────────────────────────────────────────────
  agg(rows) {
    let qty=0,rev=0,ret=0,seb=0,sebWithNds=0,prof=0,kg=0,retKg=0,qtyRealSum=0,sumRealSum=0,sebRealSum=0,sebWithNdsRealSum=0,sumRealTotal=0,sumRealSTotal=0,revSaleNoRet=0,sebSaleNoRet=0,sebSaleWithNdsNoRet=0;
    for (const x of rows) {
      qty        += x.qtyN;
      rev        += x.sumBezNds;
      ret        += x.sumR;
      sumRealTotal += (x.sumReal||0);
      sumRealSTotal += (x.sumRealS||0);   // Сумма реал с возвратами (колонка L)
      // profNet/marNet: выручка и себест продаж БЕЗ возвратов — считаем по ВСЕМ строкам через явные
      // поля revSaleBezNds/sebSale (не через фильтр qtyReal>0 — старые и новые форматы строк несовместимы
      // с таким фильтром, см. ТЗ fix-profNet-vozvraty). В возвратных строках оба поля равны 0 естественным образом.
      revSaleNoRet += (x.revSaleBezNds || 0);
      sebSaleNoRet += (x.sebSale || 0);
      sebSaleWithNdsNoRet += (x.sebSaleWithNds || 0);
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
    const retPct         = sumRealSTotal  ? Math.abs(ret)/sumRealSTotal*100   : 0;
    const avg            = qtyRealSum ? revSaleNoRet/qtyRealSum : 0;  // ср.цена только по строкам продаж
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
      revSale:        Math.round(revSaleNoRet),   // выручка б/НДС только продаж (возвраты исключены арифметически)
      sumReal:        Math.round(sumRealTotal),   // Сумма реализации с НДС (колонка J, все строки)
      sumRealS:       Math.round(sumRealSTotal),  // Сумма реализации с возвратами (колонка L = J+K)
      ret:            Math.round(ret),
      retBez:         Math.round(ret / this.VAT),  // возврат без НДС (ret хранится с НДС = Σ sumR)
      retPct:         Math.round(retPct*10)/10,
      seb:            Math.round(seb),
      sebWithNds:     Math.round(sebWithNds),
      sebSale:        Math.round(sebSaleNoRet),          // себест продаж (без возвр.), без НДС
      sebSaleWithNds: Math.round(sebSaleWithNdsNoRet),   // себест продаж (без возвр.), с НДС
      prof:           Math.round(prof),
      profNet:        Math.round(revSaleNoRet - sebSaleNoRet), // прибыль без потерь от возвратов
      mar:            rev ? Math.round(prof/rev*1000)/10 : 0,
      marNet:         revSaleNoRet ? Math.round((revSaleNoRet-sebSaleNoRet)/revSaleNoRet*1000)/10 : 0,
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
  _prikhodCostNormIndex: null,

  _normPrikhodKey(s) {
    // Унифицируем точки/запятые: "м.д.ж" и "м,д,ж" → одинаковый ключ
    return String(s||'').trim().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  },

  _buildPrikhodCostIndex(){
    if (this._prikhodCostIndex) return this._prikhodCostIndex;

    // Минимально допустимая цена: 10 ₸ с НДС. Цены ниже — ошибки в 1С
    // (технические строки, списания и т.д.) — фильтруем ОДИН раз здесь,
    // а не на каждый вызов getPrikhodCostPrices (P0.4).
    const MIN_PRICE = 10;
    const idx = {};
    const normIdx = {};
    const push = (sku, dt, priceNoNds, priceWithNds) => {
      sku = String(sku || '').trim();
      dt = String(dt || '').trim().slice(0, 10);
      priceNoNds = Number(priceNoNds) || 0;
      priceWithNds = Number(priceWithNds) || 0;
      if (!sku || !dt || priceNoNds <= 0) return;
      if ((priceWithNds || priceNoNds) < MIN_PRICE) return;
      const entry = { dt, priceNoNds, priceWithNds: priceWithNds || priceNoNds };
      (idx[sku] = idx[sku] || []).push(entry);
      const nk = this._normPrikhodKey(sku);
      (normIdx[nk] = normIdx[nk] || []).push(entry);
    };

    // Новый формат PRIKHOD_PRICES: {sku: [[dt, priceNoNds, priceWithNds], ...]}
    let _maxStaticDay = ''; // самая свежая дата, УЖЕ покрытая статикой pf-prikhod.js (глобально, по всем SKU)
    if (typeof PRIKHOD_PRICES !== 'undefined') {
      for (const [sku, entries] of Object.entries(PRIKHOD_PRICES)) {
        for (const [dt, pNoNds, pNds] of entries || []) {
          push(sku, dt, Number(pNoNds)||0, Number(pNds)||0);
          const dtStr = String(dt||'').trim().slice(0,10);
          if (dtStr > _maxStaticDay) _maxStaticDay = dtStr;
        }
      }
    }

    // Живые цены из листа «Приход» (GID_PRIHOD) — добавляем ТОЛЬКО даты СТРОГО ПОЗЖЕ
    // последней известной статичной цены (_maxStaticDay, обычно ~дата генерации pf-prikhod.js).
    // Это принципиально: себестоимость ВСЕХ строк реализации (включая январь-апрель) уже
    // считается через этот индекс, а не из колонки «Стоимость» 1С. Без такого ограничения
    // лист мог бы случайно сдвинуть исторические цены (другое округление/агрегация при
    // пересчёте средневзвешенной), нарушив требование «январь-апрель без изменений».
    // Ограничивая лист датами после cutoff, гарантируем: старые месяцы решаются исключительно
    // статикой (как и раньше), а лист лишь ПРОДОЛЖАЕТ историю цен вперёд — на май-июнь и далее.
    for (const [sku, dt, pNo, pW] of this._prikhodSheetPrices || []) {
      if (_maxStaticDay && dt <= _maxStaticDay) continue;
      push(sku, dt, pNo, pW);
    }

    for (const entries of Object.values(idx)) {
      entries.sort((a, b) => a.dt.localeCompare(b.dt));
    }
    for (const entries of Object.values(normIdx)) {
      entries.sort((a, b) => a.dt.localeCompare(b.dt));
    }

    this._prikhodCostIndex = idx;
    this._prikhodCostNormIndex = normIdx;
    this._prikhodCostMemo = new Map();
    return idx;
  },

  getPrikhodCostPrices(sku, saleDate){
    this._buildPrikhodCostIndex();
    // Мемоизация по ключу sku+day (P0.4) — вызывается 2 раза на строку реализации
    const memoKey = sku + '|' + saleDate;
    if (this._prikhodCostMemo.has(memoKey)) return this._prikhodCostMemo.get(memoKey);

    // Сначала точное совпадение, потом нормализованное (точки↔запятые)
    let entries = this._prikhodCostIndex[sku];
    if (!entries || !entries.length) {
      entries = this._prikhodCostNormIndex[this._normPrikhodKey(sku)];
    }
    let result;
    if (!entries || entries.length === 0) {
      result = null;
    } else {
      // Цены уже отфильтрованы по MIN_PRICE в _buildPrikhodCostIndex
      let best = null;
      for (const entry of entries) {
        if (entry.dt <= saleDate) best = entry;
        else break;
      }
      result = best || entries[0]; // если прихода ДО нет — берём первый валидный
    }
    this._prikhodCostMemo.set(memoKey, result);
    return result;
  },

  // ── ЖИВЫЕ ЦЕНЫ ПРИХОДА ИЗ ЛИСТА (поверх статичного pf-prikhod.js) ──────
  // pf-prikhod.js (PRIKHOD_PRICES) — база и фолбэк, устаревает между обновлениями файла.
  // Лист «Приход» (this.GID_PRIHOD, тот же, что читает loadPrikhod() для prikhod.html) —
  // источник актуальных цен: подтягиваем его сюда и добавляем поверх статики в индекс.
  _prikhodSheetPrices: null,

  async ensurePrikhodPrices() {
    if (this._prikhodSheetPrices) return; // уже загружено в этой сессии — не перезапрашиваем
    try {
      const rows = this.parseCSV(await this.fetchCsvCached(this.GID_PRIHOD));
      if (!rows.length) { this._prikhodSheetPrices = []; return; }

      // Лист — «универсальный отчёт» 1С: сверху может быть мусорная шапка.
      const headerRowIdx = this._findHeaderRowIdx(rows, 'номенклатура');
      const H = (rows[headerRowIdx]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
      const fi = (...ns) => this.findCol(H,...ns);

      const iSku = fi('номенклатура','sku');
      const iDate= fi('дата','date','ссылка.дата');
      const iQty = fi('количество','qty');
      // «Сумма НДС» и «Сумма» обе содержат подстроку «сумма» — сначала ищем НДС-колонку
      // отдельно (с «нд»), затем «Сумма» явно БЕЗ «нд», чтобы не перепутать местами.
      let iNDS = H.findIndex(h => h.includes('сумма') && h.includes('нд'));
      if (iNDS < 0) iNDS = fi('нд','nds');
      let iSum = H.findIndex(h => h.includes('сумма') && !h.includes('нд'));
      if (iSum < 0) iSum = fi('сумма','sum');

      // Средневзвешенная цена по sku+день, если за день несколько поступлений
      const acc = new Map(); // key = sku+'||'+day → {qty, sum, nds}
      for (let i = headerRowIdx+1; i < rows.length; i++) {
        const r = rows[i]||[];
        const sku = String(r[iSku]||'').trim();
        if (!sku) continue;
        const dt = this.toDate(r[iDate]);
        if (!dt) continue;
        const qty = this.toNum(r[iQty]);
        const sum = this.toNum(r[iSum]);
        if (qty <= 0 || sum <= 0) continue; // мусорные/технические строки — пропускаем
        const nds = iNDS>=0 ? this.toNum(r[iNDS]) : 0;
        const day = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        const key = sku+'||'+day;
        const a = acc.get(key) || {qty:0, sum:0, nds:0};
        a.qty += qty; a.sum += sum; a.nds += nds;
        acc.set(key, a);
      }

      const MIN_PRICE = 10; // то же правило, что и в pf-prikhod.js / _buildPrikhodCostIndex
      const out = [];
      for (const [key, a] of acc) {
        if (a.qty <= 0) continue;
        const sepIdx = key.lastIndexOf('||');
        const sku = key.slice(0, sepIdx), day = key.slice(sepIdx+2);
        const priceWithNds = a.sum / a.qty;
        if (priceWithNds < MIN_PRICE) continue;
        const priceNoNds = a.nds > 0 ? (a.sum - a.nds) / a.qty : priceWithNds;
        out.push([sku, day, priceNoNds, priceWithNds]);
      }

      this._prikhodSheetPrices = out;
      // Сбрасываем ленивый кэш индекса — пересоберётся при следующем getPrikhodCostPrices с учётом свежих цен
      this._prikhodCostIndex = null;
      this._prikhodCostNormIndex = null;
      if (this._prikhodCostMemo) this._prikhodCostMemo.clear();
    } catch (e) {
      console.warn('Цены прихода из листа не загружены, работаем по статичному pf-prikhod.js:', e);
      this._prikhodSheetPrices = []; // не ретраить в этой сессии
    }
  },

  async loadSales(onProgress) {
    const p = onProgress || (()=>{});

    // P0.1: качаем все листы ОДНИМ Promise.all — вместо последовательных await
    // (было: SKU → контрагенты → ИсхРеал → ИсхРеалАО → ИсхРеалМай подряд, 10-20 сек).
    // Обрабатываем результаты по-прежнему последовательно: сначала справочники, потом реализация.
    p(5,'Загрузка листов...');
    let _loaded = 0; const _total = 6;
    const _track = (pr,label) => pr.then(r => { _loaded++; p(5 + Math.round(_loaded/_total*40), label || `Листы ${_loaded}/${_total}...`); return r; });

    const [skuRows, kRows, rRows, aoRowsPre, mayRowsPre] = await Promise.all([
      _track(this.fetchCsvRows(this.GID_SKU), 'SKU справочник...'),
      _track(this.fetchCsvRows(this.GID_KONTR), 'Контрагенты...'),
      _track(this.fetchCsvRows(this.GID_REAL), 'ИсхРеал...'),
      _track(this.fetchCsvRows(this.GID_REAL_AO).catch(e => { console.warn('ИсхРеалАО не загружен:', e); return []; }), 'ИсхРеалАО...'),
      _track(this.fetchCsvRows(this.GID_REAL_MAY).catch(e => { console.warn('ИсхРеалМай не загружен:', e); return []; }), 'ИсхРеалМай...'),
      _track(this.ensurePrikhodPrices(), 'Цены прихода...'), // живые цены прихода — должны быть готовы ДО обработки строк реализации
    ]);

    // 1. SKU справочник
    // ТЕКУЩАЯ СТРУКТУРА SKUСправочник:
    //   B = ГруппаSKU
    //   C = SKUИсходник   — имя как в источниках реализации
    //   D = SKUКонечный   — итоговое имя для сайта/дашборда
    //   E = Объем         — вес/объем для расчёта кг
    // Строки с "Не брать в Dashboard" — пропускаем
    p(50,'Обработка SKU справочника...');
    const skuH    = (skuRows[0]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
    const si = (...ns) => this.findCol(skuH,...ns);
    const exactSkuCol=(...ns)=>{
      for(const n of ns){
        const needle=String(n||'').toLowerCase().replace(/\s/g,'');
        const idx=skuH.findIndex(h=>h===needle);
        if(idx>=0) return idx;
      }
      return -1;
    };

    let iSG=exactSkuCol('группаsku','группа');
    let iSN=exactSkuCol('skuисходник','skuисходный','исходник');
    let iSD=exactSkuCol('skuконечный','итоговоеsku','итоговоеназвание','skuдлядашборда');
    let iSV=exactSkuCol('объем','обьем','вес','vol');

    // Жесткий fallback под текущий лист Google Sheets: B/C/D/E.
    if(iSG<0) iSG=1;
    if(iSN<0) iSN=2;
    if(iSD<0) iSD=3;
    if(iSV<0) iSV=4;

    const skuWeight={}, skuGroup={}, skuDisplayMap={};
    const skuWeightNorm={}, skuGroupNorm={}, skuDisplayMapNorm={};
    const skuSkipSet=new Set(), skuSkipNormSet=new Set();
    const skuNorm = s => String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[«»"'`]/g,'').trim();
    const markSkuSkip = name => {
      name=String(name||'').trim();
      if(!name) return;
      skuSkipSet.add(name);
      skuSkipNormSet.add(skuNorm(name));
    };
    const isSkuSkipped = name => {
      name=String(name||'').trim();
      if(!name) return false;
      return skuSkipSet.has(name) || skuSkipNormSet.has(skuNorm(name));
    };
    const putSkuMap = (key, finalName, grp, w) => {
      key=String(key||'').trim();
      if(!key) return;
      const nk=skuNorm(key);
      skuWeight[key]=w;
      skuWeightNorm[nk]=w;
      skuGroup[key]=grp;
      skuGroupNorm[nk]=grp;
      if(finalName){
        skuDisplayMap[key]=finalName;
        skuDisplayMapNorm[nk]=finalName;
      }
    };

    for (let i=1;i<skuRows.length;i++) {
      const r=skuRows[i]||[];
      const srcName=String(r[iSN]||'').trim();
      const dispName=String(r[iSD]||'').trim();
      const grpRaw=String(r[iSG]||'').trim();
      const rawWeight=String(r[iSV]||'').trim();

      if (!srcName) continue;

      const skipText=skuNorm([srcName,dispName,grpRaw,rawWeight].join(' '));
      if(skipText.includes('не брать') && skipText.includes('dashboard')){
        markSkuSkip(srcName);
        markSkuSkip(dispName);
        continue;
      }

      const finalName = dispName || srcName;
      const w=this.toNum(rawWeight);
      const weight=w>0?w:1;
      const grp=grpRaw||'Прочее';

      putSkuMap(srcName, finalName, grp, weight);
      putSkuMap(finalName, finalName, grp, weight);
    }

    const findSkuDisplay = sku => {
      const s=String(sku||'').trim();
      if(!s) return '';
      return skuDisplayMap[s] || skuDisplayMapNorm[skuNorm(s)] || s;
    };
    const findSkuWeight = (...names) => {
      for(const name of names){
        const s=String(name||'').trim();
        if(!s) continue;
        if(skuWeight[s]) return skuWeight[s];
        const n=skuNorm(s);
        if(skuWeightNorm[n]) return skuWeightNorm[n];
      }
      return 1;
    };
    const findSkuGroup = (...names) => {
      for(const name of names){
        const s=String(name||'').trim();
        if(!s) continue;
        if(skuGroup[s]) return skuGroup[s];
        const n=skuNorm(s);
        if(skuGroupNorm[n]) return skuGroupNorm[n];
      }
      return 'Прочее';
    };
    // P0.3: мемоизация по входному ключу (одни SKU повторяются тысячами строк)
    const _skuDisplayMemo=new Map();
    const findSkuDisplayM = sku => { const k=String(sku||''); let v=_skuDisplayMemo.get(k); if(v===undefined){v=findSkuDisplay(sku); _skuDisplayMemo.set(k,v);} return v; };
    const _skuWeightMemo=new Map();
    const findSkuWeightM = (raw,disp) => { const k=raw+'||'+disp; let v=_skuWeightMemo.get(k); if(v===undefined){v=findSkuWeight(raw,disp); _skuWeightMemo.set(k,v);} return v; };
    const _skuGroupMemo=new Map();
    const findSkuGroupM = (raw,disp) => { const k=raw+'||'+disp; let v=_skuGroupMemo.get(k); if(v===undefined){v=findSkuGroup(raw,disp); _skuGroupMemo.set(k,v);} return v; };

    // 2. Группы контрагентов
    // ТЕКУЩАЯ СТРУКТУРА КонтрагентыСправочник:
    //   B = КонтрагентИсходник      — имя как в источниках 1С
    //   C = Контрагент              — очищенное имя
    //   D = Общее название          — итоговое имя для сайта/дашборда
    //   E = Группа                  — верхний уровень
    //   F = Подгруппа               — второй уровень
    p(55,'Обработка справочника контрагентов...');
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
      if(finalName && (grp.toLowerCase().includes('фирмен') || allTxt.includes('тт ') || allTxt.includes('фт ') || allTxt.includes('сауран') || allTxt.includes('коктал') || allTxt.includes('артем') || allTxt.includes('евраз') || allTxt.includes('шапагат') || allTxt.includes('акмол') || allTxt.includes('женис'))){
        ttCandidates.push({name:finalName, group:grp, subgroup:sub});
      }
    }

    // Глубокая нормализация: только буквы и цифры, без пунктуации/пробелов/невидимых символов
    const deepNorm = s => String(s||'').replace(/[^а-яёa-z0-9]/gi, '').toLowerCase();

    // P0.3: deepNorm по всем ключам словаря считаем ОДИН РАЗ при построении
    // (было: пересчёт deepNorm(k) для каждого ключа normMap на каждый вызов findMapped)
    const _deepNormMapCache = new WeakMap();
    const getDeepNormMap = (normMap) => {
      let dnMap = _deepNormMapCache.get(normMap);
      if (dnMap) return dnMap;
      dnMap = {};
      for (const [k,v] of Object.entries(normMap)) {
        const dk = deepNorm(k);
        if (dk.length > 5 && !(dk in dnMap)) dnMap[dk] = v;
      }
      _deepNormMapCache.set(normMap, dnMap);
      return dnMap;
    };

    const findMapped=(map,normMap,prefixMap,key)=>{
      key=String(key||'').trim();
      if(!key) return '';
      if(map[key]) return map[key];
      const nk=normKey(key);
      if(normMap[nk]) return normMap[nk];
      const pfx=nk.slice(0,24);
      if(prefixMap[pfx]) return prefixMap[pfx];
      // Deep normalization fallback — стрипает ВСЮ пунктуацию, пробелы, невидимые символы
      const dk = deepNorm(key);
      if(dk.length > 5) {
        const dnMap = getDeepNormMap(normMap);
        if(dnMap[dk]) return dnMap[dk];
      }
      // Substring fallback (редкий путь — срабатывает только когда все остальные не нашли совпадения)
      for(const [k,v] of Object.entries(normMap)){
        if(k.length>5 && nk.length>5 && (k.includes(nk) || nk.includes(k))) return v;
      }
      return '';
    };

    // P0.3: мемоизация мапперов — findGroup/findSubgroup/... вызываются на КАЖДУЮ
    // строку реализации, а одни и те же контрагенты/SKU повторяются тысячами строк.
    const memo2 = fn => { const m = new Map(); return (a,b) => { const k = a+'||'+b; let v=m.get(k); if(v===undefined){ v=fn(a,b); m.set(k,v);} return v; }; };

    const isRetailRaw = knt => {
      const nk=normKey(knt);
      return nk.includes('розничная выручка') || nk.includes('розничный покупатель') || nk.includes('чл-розничная реализация');
    };

    const TT_ALIASES=[
      {keys:['артем','artem'], name:'ФТ Артем'},
      {keys:['сауран','sauran'], name:'ФТ Сауран'},
      {keys:['коктал','koktal'], name:'ФТ Коктал'},
      {keys:['евраз','eurasia'], name:'ФТ Евразия'},
      {keys:['шапагат','shapagat'], name:'ФТ Шапагат'},
      {keys:['акмол','женис','жеңіс','zhenis'], name:'ФТ Акмол Женис'},
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

      return 'Розница без склада';
    };

    const findDisplayName = (rawKnt, sklad) => {
      if(isRetailRaw(rawKnt)) return findRetailPointBySklad(sklad);
      return findMapped(displayMap,displayMapNorm,displayMapPrefix,rawKnt) || rawKnt;
    };
    const findDisplayNameM = memo2(findDisplayName);

    const isFTName = s => { const d=String(s); return d.startsWith('ТТ ') || d.startsWith('ФТ '); };

    const findGroup = (rawKnt, displayKnt='') => {
      if(isRetailRaw(rawKnt) || isFTName(displayKnt)){
        // Розница без склада → BC (не портит статистику ФТ)
        if(displayKnt === 'Розница без склада') return 'BC';
        return findMapped(groupMap,groupMapNorm,groupMapPrefix,displayKnt) || 'Фирменные точки';
      }
      return findMapped(groupMap,groupMapNorm,groupMapPrefix,rawKnt) || findMapped(groupMap,groupMapNorm,groupMapPrefix,displayKnt) || '⚠️ Без группы';
    };
    const findGroupM = memo2(findGroup);

    const findSubgroup = (rawKnt, displayKnt='') => {
      if(isRetailRaw(rawKnt) || isFTName(displayKnt)){
        if(displayKnt === 'Розница без склада') return 'BC';
        return findMapped(subgroupMap,subgroupMapNorm,subgroupMapPrefix,displayKnt) || 'Фирменные точки';
      }
      return findMapped(subgroupMap,subgroupMapNorm,subgroupMapPrefix,rawKnt) || findMapped(subgroupMap,subgroupMapNorm,subgroupMapPrefix,displayKnt) || '';
    };
    const findSubgroupM = memo2(findSubgroup);

    // 3. ИсхРеал
    p(65,'Обработка данных реализации...');
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

    // Диагностика SKU без группы (попали в 'Прочее') — две причины:
    //  1) inDictionary=true  — SKU ЕСТЬ в справочнике (по сырому или итоговому имени), но ячейка
    //     «ГруппаSKU» для этой строки справочника пустая → нужно заполнить группу в самом справочнике.
    //  2) inDictionary=false — такого SKU (ни сырого, ни итогового имени) в справочнике вообще нет
    //     → нужно добавить новую строку в SKUСправочник для этого товара.
    const unmappedSkuMap=new Map();
    const addUnmappedSku=(row)=>{
      const key=[row.sourceSheet,row.rawSku,row.sku].join('||');
      if(!unmappedSkuMap.has(key)){
        const inDictionary = !!(skuGroup[row.rawSku] || skuGroup[row.sku]
          || skuGroupNorm[skuNorm(row.rawSku)] || skuGroupNorm[skuNorm(row.sku)]);
        unmappedSkuMap.set(key,{
          sourceSheet:row.sourceSheet,
          sourceGid:row.sourceGid,
          firstSourceRow:row.sourceRow,
          rawSku:row.rawSku,
          sku:row.sku,
          inDictionary,
          rows:0,
          rev:0,
          kg:0,
        });
      }
      const x=unmappedSkuMap.get(key);
      x.rows+=1;
      x.rev+=(row.sumBezNds||0);
      x.kg+=(row.kg||0);
      if(row.sourceRow && x.firstSourceRow>row.sourceRow) x.firstSourceRow=row.sourceRow;
    };

    // Мусорные строки-технические артефакты 1С: SKU вида "0" (пустая/битая ячейка номенклатуры).
    // Раньше такие строки тихо пропускались без следа — теперь исключаем ЯВНО, с диагностикой,
    // чтобы было видно что именно убрали из статистики и почему (а не молча потеряли данные).
    const isGarbageSku = s => /^\d+$/.test(String(s||'').trim());
    const excludedGarbageMap=new Map();
    const addExcludedGarbage=(sourceSheet,sourceGid,sourceRow,rawSku,rev,qty)=>{
      const key=[sourceSheet,rawSku].join('||');
      if(!excludedGarbageMap.has(key)){
        excludedGarbageMap.set(key,{sourceSheet,sourceGid,firstSourceRow:sourceRow,rawSku,rows:0,rev:0,qty:0});
      }
      const x=excludedGarbageMap.get(key);
      x.rows+=1;
      x.rev+=(rev||0);
      x.qty+=(qty||0);
      if(sourceRow && x.firstSourceRow>sourceRow) x.firstSourceRow=sourceRow;
    };

    for (let i=1;i<rRows.length;i++) {
      const r=rRows[i];
      const rawKnt=String(r[iKnt]||'').trim();
      const rawSku=String(r[iSku]||'').trim();
      const sklad=iSklad>=0 ? String(r[iSklad]||'').trim() : '';

      // Display names
      const knt = findDisplayNameM(rawKnt, sklad);
      const sku = findSkuDisplayM(rawSku);

      // Пропускаем: пустые, строку "Итого", нетоварные, "Не брать в Dashboard"
      if (!rawKnt||!knt||!rawSku) continue;
      if (rawKnt.toLowerCase().includes('итого')||knt.toLowerCase().includes('итого')||rawSku.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
      if (isGarbageSku(rawSku)) {
        addExcludedGarbage('ИсхРеал', this.GID_REAL, i+1, rawSku, this.toNum(r[iSumBezNds]), this.toNum(r[iQtyN]));
        continue;
      }
      if (isSkuSkipped(rawSku) || isSkuSkipped(sku)) continue;
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
      // Если колонки J нет — «только продажи» = сумма с возвратами МИНУС возвраты
      const sumReal  = (_rawSumReal != null && String(_rawSumReal).trim() !== '') ? this.toNum(_rawSumReal) : (sumRealS - sumR);
      const sumBezNds=this.toNum(r[iSumBezNds]);
      const w        =findSkuWeightM(rawSku, sku);

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
      // Выручка продаж БЕЗ возвратов, устойчиво к обоим форматам строк:
      //  - новые данные (скилл): возврат — отдельная минусовая строка (sumBezNds<0) → в продажи не входит;
      //  - старые данные: продажа и возврат в одной строке, sumBezNds = продажа − возврат → продажа = sumBezNds + |возврат|.
      // Выручка продаж БЕЗ возвратов, без НДС: колонка «Сумма реализации» (sumReal, ТОЛЬКО продажи, без НДС).
      // Прямая колонка, а не реконструкция — одинаково верна для старых (смешанных) и новых (раздельных) строк.
      const revSaleBezNds = sumReal > 0 ? sumReal / this.VAT : 0;
      const mappedGroup=findGroupM(rawKnt,knt);
      const mappedSubgroup=findSubgroupM(rawKnt,knt);
      if(isRetailRaw(rawKnt)){
        retailPointStats[knt]=(retailPointStats[knt]||0)+1;
      }

      const rowObj={
        knt,rawKnt,sku,rawSku,mk,day,
        sourceSheet:'ИсхРеал',
        sourceGid:this.GID_REAL,
        sourceRow:i+1,
        sklad,
        manager:'',
        ndsSuspect: (() => {
          // Проверяем только строки без возвратов (для строк с возвратами формула другая)
          const hasReturn = Math.abs(qtyR) > 0 || Math.abs(sumR) > 0;
          if(!hasReturn && sumReal && Math.abs(sumBezNds - sumReal/1.16) > 5) return true;
          return false;
        })(),
        group:    mappedGroup,
        subgroup: mappedSubgroup,
        skuGroup: findSkuGroupM(rawSku, sku),
        weight:w,
        qtyN,qtyR,qtyReal,sumReal,sumRealS,
        sumBezNds,
        sumR,
        seb:          sebNew,
        sebWithNds,
        sebSale,
        sebSaleWithNds,
        prof: profNew,
        revSaleBezNds,
        kg:    qtyN*w,
        retKg: qtyR*w,
      };
      if(mappedGroup==='⚠️ Без группы'){
        addUnmappedContractor(rowObj);
      }
      if(rowObj.skuGroup==='Прочее'){
        addUnmappedSku(rowObj);
      }
      rawRows.push(rowObj);
    }

    const months=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));

    // 3b. ИсхРеалАО — данные от Астана-Өнім (тот же формат, мержим в rawRows)
    try {
      p(85,'Обработка данных АО...');
      const aoRows=aoRowsPre;
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
          const sku=findSkuDisplayM(rawSku);
          if(rawKnt.toLowerCase().includes('итого')||rawSku.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
          if (isGarbageSku(rawSku)) {
            addExcludedGarbage('ИсхРеалАО', this.GID_REAL_AO, i+1, rawSku, this.toNum(r[aiSumBezNds]), this.toNum(r[aiQtyN]));
            continue;
          }
          if(isSkuSkipped(rawSku) || isSkuSkipped(sku)) continue;
          if(!this.isDairy(rawSku) && !this.isDairy(sku)) continue;
          const dt=this.toDate(r[aiDate]); if(!dt) continue;
          const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
          const day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          if(!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());
          const sklad=aiSklad>=0?String(r[aiSklad]||'').trim():'';
          const knt=findDisplayNameM(rawKnt, sklad);
          const qtyN=this.toNum(r[aiQtyN]), qtyR=Math.abs(this.toNum(r[aiQtyR]));
          const _rQR=aiQtyReal>=0?r[aiQtyReal]:undefined, _rSR=aiSumReal>=0?r[aiSumReal]:undefined;
          const qtyReal=(_rQR!=null&&String(_rQR).trim()!=='')?this.toNum(_rQR):qtyN;
          const sumR=this.toNum(r[aiSumR]);
          const sumRealS=aiSumRealS>=0?this.toNum(r[aiSumRealS]):(this.toNum(_rSR)+sumR);
          const sumReal=(_rSR!=null&&String(_rSR).trim()!=='')?this.toNum(_rSR):(sumRealS-sumR);
          const sumBezNds=this.toNum(r[aiSumBezNds]);
          const w=findSkuWeightM(rawSku, sku);
          const prikhodCost=this.getPrikhodCostPrices(rawSku,day)||this.getPrikhodCostPrices(sku,day);
          const sebNew=prikhodCost?prikhodCost.priceNoNds*qtyN:0;
          const sebWithNds=prikhodCost?prikhodCost.priceWithNds*qtyN:0;
          const sebSale=prikhodCost?prikhodCost.priceNoNds*qtyReal:0;
          const sebSaleWithNds=prikhodCost?prikhodCost.priceWithNds*qtyReal:0;
          // Выручка продаж БЕЗ возвратов, без НДС: sumReal (ТОЛЬКО продажи) без НДС — прямая колонка.
          const revSaleBezNds = sumReal > 0 ? sumReal / this.VAT : 0;
          const mappedGroup=findGroupM(rawKnt,knt);
          const mappedSubgroup=findSubgroupM(rawKnt,knt);
          if(isRetailRaw(rawKnt)){
            retailPointStats[knt]=(retailPointStats[knt]||0)+1;
          }
          const rowObj={
            knt,rawKnt,sku,rawSku,mk,day,ndsSuspect:false,
            sourceSheet:'ИсхРеалАО',
            sourceGid:this.GID_REAL_AO,
            sourceRow:i+1,
            sklad,
            manager:'',
            group:mappedGroup,
            subgroup:mappedSubgroup,
            skuGroup:findSkuGroupM(rawSku, sku),weight:w,
            qtyN,qtyR,qtyReal,sumReal,sumRealS,sumBezNds,sumR,
            seb:sebNew,sebWithNds,sebSale,sebSaleWithNds,
            prof:sumBezNds-sebNew,revSaleBezNds,kg:qtyN*w,retKg:qtyR*w,
          };
          if(mappedGroup==='⚠️ Без группы'){
            addUnmappedContractor(rowObj);
          }
          if(rowObj.skuGroup==='Прочее'){
            addUnmappedSku(rowObj);
          }
          rawRows.push(rowObj);
        }
        p(85,'АО: '+aoRows.length+' строк');
      }
    }catch(e){ console.warn('ИсхРеалАО не загружен:',e); }

    // 3c. ИсхРеалМай — отдельный источник майской реализации (тот же формат, мержим в rawRows)
    try {
      p(92,'Обработка данных Май...');
      const mayRows=mayRowsPre;
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
        const miManager=mi('менеджер','торговый','manager');
        for(let i=1;i<mayRows.length;i++){
          const r=mayRows[i];
          const rawKnt=String(r[miKnt]||'').trim();
          const rawSku=String(r[miSku]||'').trim();
          if(!rawKnt||!rawSku) continue;
          const sku=findSkuDisplayM(rawSku);
          if(rawKnt.toLowerCase().includes('итого')||rawSku.toLowerCase().includes('итого')||sku.toLowerCase().includes('итого')) continue;
          if (isGarbageSku(rawSku)) {
            addExcludedGarbage('ИсхРеалМай', this.GID_REAL_MAY, i+1, rawSku, this.toNum(r[miSumBezNds]), this.toNum(r[miQtyN]));
            continue;
          }
          if(isSkuSkipped(rawSku) || isSkuSkipped(sku)) continue;
          if(!this.isDairy(rawSku) && !this.isDairy(sku)) continue;
          const dt=this.toDate(r[miDate]); if(!dt) continue;
          const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
          const day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          if(!monthMap.has(mk)) monthMap.set(mk,this.MO[dt.getMonth()]+' '+dt.getFullYear());
          const sklad=miSklad>=0?String(r[miSklad]||'').trim():'';
          const knt=findDisplayNameM(rawKnt, sklad);
          const qtyN=this.toNum(r[miQtyN]), qtyR=Math.abs(this.toNum(r[miQtyR]));
          const _rQR=miQtyReal>=0?r[miQtyReal]:undefined, _rSR=miSumReal>=0?r[miSumReal]:undefined;
          const qtyReal=(_rQR!=null&&String(_rQR).trim()!=='')?this.toNum(_rQR):qtyN;
          const sumR=this.toNum(r[miSumR]);
          const sumRealS=miSumRealS>=0?this.toNum(r[miSumRealS]):(this.toNum(_rSR)+sumR);
          const sumReal=(_rSR!=null&&String(_rSR).trim()!=='')?this.toNum(_rSR):(sumRealS-sumR);
          const sumBezNds=this.toNum(r[miSumBezNds]);
          const w=findSkuWeightM(rawSku, sku);
          const prikhodCost=this.getPrikhodCostPrices(rawSku,day)||this.getPrikhodCostPrices(sku,day);
          const sebNew=prikhodCost?prikhodCost.priceNoNds*qtyN:0;
          const sebWithNds=prikhodCost?prikhodCost.priceWithNds*qtyN:0;
          const sebSale=prikhodCost?prikhodCost.priceNoNds*qtyReal:0;
          const sebSaleWithNds=prikhodCost?prikhodCost.priceWithNds*qtyReal:0;
          // Выручка продаж БЕЗ возвратов, без НДС: sumReal (ТОЛЬКО продажи) без НДС — прямая колонка.
          const revSaleBezNds = sumReal > 0 ? sumReal / this.VAT : 0;
          const mappedGroup=findGroupM(rawKnt,knt);
          const mappedSubgroup=findSubgroupM(rawKnt,knt);
          if(isRetailRaw(rawKnt)){
            retailPointStats[knt]=(retailPointStats[knt]||0)+1;
          }
          const rowObj={
            knt,rawKnt,sku,rawSku,mk,day,ndsSuspect:false,
            sourceSheet:'ИсхРеалМай',
            sourceGid:this.GID_REAL_MAY,
            sourceRow:i+1,
            sklad,
            manager:miManager>=0?String(r[miManager]||'').trim():'',
            group:mappedGroup,
            subgroup:mappedSubgroup,
            skuGroup:findSkuGroupM(rawSku, sku),weight:w,
            qtyN,qtyR,qtyReal,sumReal,sumRealS,sumBezNds,sumR,
            seb:sebNew,sebWithNds,sebSale,sebSaleWithNds,
            prof:sumBezNds-sebNew,revSaleBezNds,kg:qtyN*w,retKg:qtyR*w,
          };
          if(mappedGroup==='⚠️ Без группы'){
            addUnmappedContractor(rowObj);
          }
          if(rowObj.skuGroup==='Прочее'){
            addUnmappedSku(rowObj);
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

    // Диагностика цен прихода: сколько цен из статики (pf-prikhod.js) и сколько из листа «Приход»,
    // и не устарели ли они относительно самой свежей даты продажи в rawRows.
    const pricesFromSheet = (this._prikhodSheetPrices||[]).length;
    const pricesFromStatic = (typeof PRIKHOD_PRICES !== 'undefined')
      ? Object.values(PRIKHOD_PRICES).reduce((s,arr)=>s+(arr?arr.length:0),0) : 0;
    let maxPriceDay='';
    if (this._prikhodCostIndex) {
      for (const entries of Object.values(this._prikhodCostIndex)) {
        for (const e of entries) if (e.dt > maxPriceDay) maxPriceDay = e.dt;
      }
    }
    let maxSaleDay='';
    for (const row of rawRows) if (row.day > maxSaleDay) maxSaleDay = row.day;
    try {
      if (maxSaleDay) sessionStorage.setItem('pf.data.lastSaleDay', maxSaleDay);  // формат YYYY-MM-DD
    } catch (e) {}
    let priceStaleWarning='';
    if (maxPriceDay && maxSaleDay) {
      const diffDays = (new Date(maxSaleDay) - new Date(maxPriceDay)) / 86400000;
      if (diffDays > 14) {
        priceStaleWarning = `⚠️ Цены прихода устарели: последняя цена ${maxPriceDay}, последняя продажа ${maxSaleDay} — себестоимость свежих продаж считается по старым ценам. Обнови лист Приход.`;
      }
    }

    const unmappedSkus=[...unmappedSkuMap.values()]
      .map(x=>({...x,rev:Math.round(x.rev),kg:Math.round(x.kg*10)/10}))
      .sort((a,b)=>b.rev-a.rev);

    const excludedGarbage=[...excludedGarbageMap.values()]
      .map(x=>({...x,rev:Math.round(x.rev)}))
      .sort((a,b)=>b.rev-a.rev);

    const diagnostics={
      sources:[{name:'ИсхРеал',gid:this.GID_REAL},{name:'ИсхРеалАО',gid:this.GID_REAL_AO},{name:'ИсхРеалМай',gid:this.GID_REAL_MAY}],
      contractorDictionaryGid:this.GID_KONTR,
      skuDictionaryGid:this.GID_SKU,
      unmappedContractors,
      unmappedSkus,
      excludedGarbage,
      retailPoints,
      groupMap,groupMapNorm,displayMap,displayMapNorm,
      prikhodPrices:{pricesFromStatic,pricesFromSheet,maxPriceDay,maxSaleDay,staleWarning:priceStaleWarning},
    };
    this._lastSalesDiagnostics=diagnostics;
    if(typeof window!=='undefined'){
      window.PF_SALES_DIAGNOSTICS=diagnostics;
      if(unmappedContractors.length){
        console.warn('PF: есть контрагенты без группы. Открой window.PF_SALES_DIAGNOSTICS.unmappedContractors');
        console.table(unmappedContractors.slice(0,50));
      }
      if(unmappedSkus.length){
        console.warn('PF: есть SKU без группы (попали в "Прочее"). Открой window.PF_SALES_DIAGNOSTICS.unmappedSkus — inDictionary=true значит SKU есть в справочнике, но ячейка ГруппаSKU пустая; inDictionary=false значит такого SKU в справочнике нет вообще.');
        console.table(unmappedSkus.slice(0,50));
      }
      if(excludedGarbage.length){
        console.warn('PF: из статистики исключены строки с мусорным SKU (номенклатура вида "0" — битая/пустая ячейка в 1С). Открой window.PF_SALES_DIAGNOSTICS.excludedGarbage, чтобы проверить сумму и строки.');
        console.table(excludedGarbage);
      }
      if(priceStaleWarning) console.warn('PF: '+priceStaleWarning);
      window.dispatchEvent(new CustomEvent('pf:dataUpdated'));
    }
    return {rawRows,groupMap,subgroupMap,skuWeight,skuGroup,skuDisplayMap,months:months2,diagnostics};
  },

  // ── ЗАГРУЗКА ПРИХОДА ─────────────────────────────────────────
  async loadPrikhod(onProgress) {
    const p=onProgress||(()=>{});
    p(30,'Загрузка журнала прихода...');
    const rows=await this.fetchCsvRows(this.GID_PRIHOD);
    // Лист — «универсальный отчёт» 1С: сверху мусорная шапка (заголовок отчёта, пустая строка).
    const headerRowIdx=this._findHeaderRowIdx(rows, 'номенклатура');
    const H=(rows[headerRowIdx]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
    const fi=(...ns)=>this.findCol(H,...ns);

    const iSku  =fi('номенклатура','sku');
    const iSup  =fi('контрагент','поставщик','supplier','ссылка.контрагент');
    const iDate =fi('дата','date','ссылка.дата');
    const iQty  =fi('количество','qty');
    const iPrice=fi('цена','price');
    // «Сумма НДС» и «% НДС» обе содержат подстроку «нд» — ищем сумму НДС явно через «сумма»+«нд»,
    // а «Сумма» — явно БЕЗ «нд», чтобы не перепутать с колонкой процента НДС.
    let iNDS = H.findIndex(h => h.includes('сумма') && h.includes('нд'));
    if (iNDS < 0) iNDS = fi('нд','nds');
    let iSum = H.findIndex(h => h.includes('сумма') && !h.includes('нд'));
    if (iSum < 0) iSum = fi('сумма','sum');
    const iEd   =fi('ед.','единица','ед_изм','unit','ед,');

    const pRows=[];const monthMap=new Map();
    for (let i=headerRowIdx+1;i<rows.length;i++) {
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
    const fetchCsvRows = (gid, ttl) => this.fetchCsvRows(gid, ttl);

    // P0.1: расходы, ЗП×2, планы, приход2 — качаем ОДНИМ Promise.all вместо
    // последовательных await (было 5 запросов подряд).
    p(10,'Загрузка листов ДиР...');
    const [rRows, zRowsRaw, dRowsRaw, plRowsRaw, prihod2Rows] = await Promise.all([
      fetchCsvRows(this.GID_RASHOD),
      fetchCsvRows(this.GID_ZP_OBH).catch(e => { console.warn('ЗП Общее не загружено:', e); return null; }),
      fetchCsvRows(this.GID_ZP_DET).catch(e => { console.warn('ЗП Детально не загружено:', e); return null; }),
      fetchCsvRows(this.GID_PLAN).catch(e => { console.warn('Планы не загружены:', e); return null; }),
      this.fetchCsvCached(this.GID_PRIHOD2).then(text => this.parseCSV(text)).catch(e => { console.warn('Приход2 не загружен:', e); return null; }),
    ]);

    // 1. Расходы
    p(40,'Обработка расходов...');
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
    p(55,'Обработка ЗП общего листа...');
    let zpObh=[];
    try{
      if(!zRowsRaw) throw new Error('нет данных');
      const zRows=zRowsRaw;
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
    p(65,'Обработка ЗП детально...');
    let zpDet=[];
    try{
      if(!dRowsRaw) throw new Error('нет данных');
      const dRows=dRowsRaw;
      const dH=(dRows[0]||[]).map(h=>String(h||'').trim());
      zpDet=dRows.slice(1).filter(r=>r.some(v=>String(v||'').trim())).map(r=>({row:r,header:dH}));
    }catch(e){ console.warn('ЗП Детально не загружено:',e); }

    // 4. Приход — вес по поставщикам AO/BM
    p(78,'Обработка прихода для ДиР...');
    const pData=this._aggregatePrikhod2(prihod2Rows||[]);

    // 5. Планы — текущий лист планов оставляем доступным сырым массивом
    p(90,'Обработка листа планов...');
    let plans={raw:[],header:[]};
    try{
      if(!plRowsRaw) throw new Error('нет данных');
      const plRows=plRowsRaw;
      plans={raw:plRows,header:(plRows[0]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''))};
    }catch(e){ console.warn('Планы не загружены:',e); }

    p(95,'ДиР-данные готовы');
    return {rashod,zpObh,zpDet,prikhod:pData,plans};
  },

  // Приход из отдельного листа ДиР: агрегация веса/суммы по AO, BM и прочим.
  async loadPrikhod2() {
    const rows=await this.fetchCsvRows(this.GID_PRIHOD2);
    return this._aggregatePrikhod2(rows);
  },

  _aggregatePrikhod2(rows) {
    // Лист — «универсальный отчёт» 1С: сверху мусорная шапка (заголовок отчёта, пустая строка).
    const headerRowIdx=this._findHeaderRowIdx(rows, 'номенклатура');
    const H=(rows[headerRowIdx]||[]).map(h=>String(h||'').toLowerCase().replace(/\s/g,''));
    const fi=(...ns)=>this.findCol(H,...ns);
    const iSku=fi('номенклатура','sku');
    const iSup=fi('контрагент','поставщик','ссылка.контрагент');
    const iDate=fi('дата','date','ссылка.дата');
    const iQty=fi('количество','qty');
    // «Сумма НДС» и «% НДС» обе содержат «нд» — сначала ищем сумму НДС явно через «сумма»+«нд»,
    // а «Сумма» — явно БЕЗ «нд», чтобы не перепутать колонки местами.
    let iNDS = H.findIndex(h => h.includes('сумма') && h.includes('нд'));
    if (iNDS < 0) iNDS = fi('нд','nds','сумманд','суммандс');
    let iSum = H.findIndex(h => h.includes('сумма') && !h.includes('нд'));
    if (iSum < 0) iSum = fi('сумма','sum');
    const bySupMonth={};
    for(let i=headerRowIdx+1;i<rows.length;i++){
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
