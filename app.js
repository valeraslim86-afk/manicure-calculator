/* Мультикалькулятор рентабельности бьюти-услуг. Без сервера: всё считается в браузере.
   Готовые цифры можно передать ссылкой: index.html#p=<base64url(JSON)> (фрагмент после # на сервер не уходит).
   Данные: PROFS и COMMON из presets.js. */
var OWNER_VK = "8499740";
var CONFIG = { collectUrl: "https://beauty-calc-collector.valeraslim86.workers.dev" }; /* приём анонимной статистики (Cloudflare Worker + D1); пусто = сбор выключен */

function $(i) { return document.getElementById(i); }
function num(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; }
function rub(x) { return Math.round(x).toLocaleString("ru-RU") + " ₽"; }
function pct(x) { return (Math.round(x * 10) / 10).toLocaleString("ru-RU") + "%"; }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

/* ---------- Ядро расчёта (те же формулы, что в калькулятор.py, плюс общие расходы кабинета) ---------- */
function calcAll(S) {
  var equipMonth = 0, equipInvest = 0, trainMonth = 0, trainInvest = 0, fixedMonth = 0, i;
  S.equip.forEach(function (e) { if (e.on && e.price > 0 && e.years > 0) { equipMonth += e.price / (e.years * 12); equipInvest += e.price; } });
  S.train.forEach(function (t) { if (t.price > 0 && t.months > 0) { trainMonth += t.price / t.months; trainInvest += t.price; } });
  S.fixed.forEach(function (f) { fixedMonth += f.monthly; });
  var F = equipMonth + trainMonth + fixedMonth;
  var act = S.services.filter(function (s) { return s.on && s.clients > 0; });
  var totalClients = act.reduce(function (a, s) { return a + s.clients; }, 0);
  var fpc = totalClients > 0 ? F / totalClients : 0;
  var tax = S.tax / 100, prof = S.profit / 100;
  var rows = [], revenue = 0, profit = 0, contrSum = 0, allPriced = true;
  act.forEach(function (s) {
    var d = 0; s.mats.forEach(function (m) { if (m.vol > 0) d += m.price / m.vol * m.use; });
    var lRub = s.mode === "rub" ? s.labor : 0, lPct = s.mode === "pct" ? s.labor / 100 : 0;
    var labor = lRub + lPct * s.price, tx = tax * s.price;
    var cost = d + fpc + labor + tx, base = d + fpc + lRub, z = 1 - lPct - tax, den = z - prof;
    var pp = s.price > 0 ? s.price - cost : null;
    if (s.price <= 0) allPriced = false;
    var contr = s.price > 0 ? s.price * z - d - lRub : 0;
    revenue += s.price * s.clients; if (pp !== null) profit += pp * s.clients; contrSum += contr * s.clients;
    rows.push({ name: s.name, clients: s.clients, price: s.price, direct: d, fpc: fpc, labor: labor, tax: tx, cost: cost,
      minZero: z > 0 ? base / z : null, minPrice: den > 0 ? base / den : null, profitPer: pp,
      margin: (pp !== null && s.price > 0) ? pp / s.price * 100 : null });
  });
  var avgContr = totalClients > 0 ? contrSum / totalClients : 0;
  var be = (allPriced && avgContr > 0) ? F / avgContr : null;
  var prBefore = profit + equipMonth + trainMonth;
  return { F: F, equipMonth: equipMonth, trainMonth: trainMonth, fixedMonth: fixedMonth, totalClients: totalClients, fpc: fpc, rows: rows,
    revenue: revenue, profit: allPriced && rows.length ? profit : null, margin: (allPriced && revenue > 0) ? profit / revenue * 100 : null,
    breakEven: be, payback: (allPriced && prBefore > 0 && (equipInvest + trainInvest) > 0) ? (equipInvest + trainInvest) / prBefore : null,
    invest: equipInvest + trainInvest, allPriced: allPriced };
}

/* ---------- Состояние ---------- */
var uid = 0;
function newService(prof, name) {
  var p = PROFS[prof];
  return { id: "s" + (++uid), prof: prof, name: name, on: true, price: 0, clients: 0, labor: 0, mode: "rub",
    mats: p.mats.map(function (n) { return { name: n, price: 0, vol: 0, use: 0 }; }) };
}
function emptyState() { return { profs: [], services: [], equip: [], train: [], fixed: [], tax: 0, profit: 30 }; }
function hasName(list, name) { return list.some(function (x) { return x.name === name; }); }
function addProfession(S, prof) {
  if (S.profs.indexOf(prof) >= 0) return;
  S.profs.push(prof);
  var p = PROFS[prof];
  p.services.forEach(function (n, i) { var s = newService(prof, n); s.on = i === 0; S.services.push(s); });
  p.equip.forEach(function (n) { if (!hasName(S.equip, n)) S.equip.push({ name: n, price: 0, years: 5, on: false }); });
  if (!S.train.length) COMMON.train.forEach(function (n) { S.train.push({ name: n, price: 0, months: 12 }); });
  if (!S.fixed.length) COMMON.fixed.forEach(function (n) { S.fixed.push({ name: n, monthly: 0 }); });
}
function removeProfession(S, prof) {
  S.profs = S.profs.filter(function (p) { return p !== prof; });
  S.services = S.services.filter(function (s) { return s.prof !== prof; });
  var keep = {}; S.profs.forEach(function (k) { PROFS[k].equip.forEach(function (n) { keep[n] = 1; }); });
  S.equip = S.equip.filter(function (e) { return e.on || e.price > 0 || keep[e.name] || PROFS[prof].equip.indexOf(e.name) < 0; });
}

/* ---------- Отрисовка (пересобирается только при структурных изменениях) ---------- */
function rowMat(m) { return '<div class="row"><input class="mn" value="' + esc(m.name) + '" placeholder="Название"><input class="mp" type="text" inputmode="decimal" value="' + (m.price || "") + '"><input class="mv" type="text" inputmode="decimal" value="' + (m.vol || "") + '"><input class="mu" type="text" inputmode="decimal" value="' + (m.use || "") + '"><button class="x" type="button" title="Убрать">×</button></div>'; }
function buildServices(S) {
  $("svcList").innerHTML = S.services.map(function (s) {
    return '<details class="svc" data-id="' + s.id + '" data-prof="' + s.prof + '"' + (s.on ? " open" : "") + '>' +
      '<summary><label class="chk" onclick="event.stopPropagation()"><input type="checkbox" class="son"' + (s.on ? " checked" : "") + '></label><input class="sname" value="' + esc(s.name) + '" onclick="event.stopPropagation()"><span class="tag">' + esc(PROFS[s.prof].name) + '</span></summary>' +
      '<div class="svc-body"><div class="two"><div><label>Цена для клиента, ₽</label><input class="sprice" type="text" inputmode="decimal" value="' + (s.price || "") + '"></div><div><label>Клиентов в месяц</label><input class="scli" type="text" inputmode="decimal" value="' + (s.clients || "") + '"></div></div>' +
      '<div class="two"><div><label>Оплата мастера</label><input class="slab" type="text" inputmode="decimal" value="' + (s.labor || "") + '"></div><div><label>Как считается</label><select class="smode"><option value="rub"' + (s.mode === "rub" ? " selected" : "") + '>₽ за услугу</option><option value="pct"' + (s.mode === "pct" ? " selected" : "") + '>% от цены</option></select></div></div>' +
      '<p class="hint" style="margin-top:12px">Материалы на одного клиента. «Цена» за упаковку, «В упаковке» сколько штук, мл или г, «На клиента» сколько уходит на одну услугу.</p>' +
      '<div class="row head"><div>Что</div><div>Цена, ₽</div><div>В упаковке</div><div>На клиента</div><div></div></div><div class="mats">' + s.mats.map(rowMat).join("") + '</div>' +
      '<button class="add addmat" type="button">+ добавить материал</button><button class="link delsvc" type="button">Удалить услугу</button></div></details>';
  }).join("") || '<p class="hint">Выбери профиль выше, и здесь появятся типовые услуги.</p>';
  document.querySelectorAll(".svc").forEach(function (el) {
    el.querySelector(".addmat").onclick = function () { el.querySelector(".mats").insertAdjacentHTML("beforeend", rowMat({ name: "", price: 0, vol: 0, use: 0 })); bindMats(el); upd(); };
    el.querySelector(".delsvc").onclick = function () { readAll(); S_.services = S_.services.filter(function (s) { return s.id !== el.dataset.id; }); buildServices(S_); upd(); };
    bindMats(el);
  });
}
function bindMats(el) { el.querySelectorAll(".mats .x").forEach(function (b) { b.onclick = function () { b.parentNode.remove(); upd(); }; }); }
function buildEquip(S) {
  $("equip").innerHTML = S.equip.map(function (e) {
    return '<div class="row eq"><label class="chk"><input type="checkbox" class="eon"' + (e.on ? " checked" : "") + '></label><input class="en" value="' + esc(e.name) + '" placeholder="Название"><input class="ep" type="text" inputmode="decimal" placeholder="Цена, ₽" value="' + (e.price || "") + '"><input class="ey" type="text" inputmode="decimal" placeholder="Срок, лет" value="' + (e.years || "") + '"><span class="am"></span><button class="x" type="button" title="Убрать">×</button></div>';
  }).join("");
  $("equip").querySelectorAll(".x").forEach(function (b) { b.onclick = function () { b.parentNode.remove(); upd(); }; });
}
function buildTrain(S) {
  $("train").innerHTML = S.train.map(function (t) {
    return '<div class="row tr"><input class="tn" value="' + esc(t.name) + '" placeholder="Название"><input class="tp" type="text" inputmode="decimal" placeholder="Стоимость, ₽" value="' + (t.price || "") + '"><input class="tm" type="text" inputmode="decimal" placeholder="Окупать, мес." value="' + (t.months || "") + '"><span class="am"></span><button class="x" type="button" title="Убрать">×</button></div>';
  }).join("");
  $("train").querySelectorAll(".x").forEach(function (b) { b.onclick = function () { b.parentNode.remove(); upd(); }; });
}
function buildFixed(S) {
  $("fixed").innerHTML = S.fixed.map(function (f) {
    return '<div class="row f"><input class="fn" value="' + esc(f.name) + '" placeholder="Название"><input class="fm" type="text" inputmode="decimal" placeholder="₽ в месяц" value="' + (f.monthly || "") + '"><button class="x" type="button" title="Убрать">×</button></div>';
  }).join("");
  $("fixed").querySelectorAll(".x").forEach(function (b) { b.onclick = function () { b.parentNode.remove(); upd(); }; });
}
function buildAll(S) {
  document.querySelectorAll("#chips .chip input").forEach(function (c) { c.checked = S.profs.indexOf(c.value) >= 0; });
  buildServices(S); buildEquip(S); buildTrain(S); buildFixed(S);
  $("tax").value = S.tax || ""; $("profit").value = S.profit;
}

/* ---------- Чтение формы ---------- */
var S_ = emptyState();
function readAll() {
  var S = S_;
  var byId = {}; S.services.forEach(function (s) { byId[s.id] = s; });
  document.querySelectorAll(".svc").forEach(function (el) {
    var s = byId[el.dataset.id]; if (!s) return;
    s.on = el.querySelector(".son").checked; s.name = el.querySelector(".sname").value || s.name;
    s.price = num(el.querySelector(".sprice").value); s.clients = num(el.querySelector(".scli").value);
    s.labor = num(el.querySelector(".slab").value); if (el.querySelector(".smode").value === "pct") s.labor = Math.min(s.labor, 100); s.mode = el.querySelector(".smode").value;
    s.mats = []; el.querySelectorAll(".mats .row").forEach(function (r) { s.mats.push({ name: r.querySelector(".mn").value || "материал", price: num(r.querySelector(".mp").value), vol: num(r.querySelector(".mv").value), use: num(r.querySelector(".mu").value) }); });
  });
  S.equip = []; document.querySelectorAll("#equip .row").forEach(function (r) { S.equip.push({ name: r.querySelector(".en").value || "оборудование", price: num(r.querySelector(".ep").value), years: num(r.querySelector(".ey").value), on: r.querySelector(".eon").checked }); });
  S.train = []; document.querySelectorAll("#train .row").forEach(function (r) { S.train.push({ name: r.querySelector(".tn").value || "обучение", price: num(r.querySelector(".tp").value), months: num(r.querySelector(".tm").value) }); });
  S.fixed = []; document.querySelectorAll("#fixed .row").forEach(function (r) { S.fixed.push({ name: r.querySelector(".fn").value || "расход", monthly: num(r.querySelector(".fm").value) }); });
  S.tax = Math.min(num($("tax").value), 60); S.profit = Math.min(num($("profit").value), 90);
  return S;
}

/* ---------- Результат ---------- */
var last = null;
function upd() {
  var S = readAll(), R = calcAll(S); last = { S: S, R: R };
  document.querySelectorAll("#equip .row").forEach(function (r, i) { var e = S.equip[i]; r.querySelector(".am").textContent = (e.price > 0 && e.years > 0) ? rub(e.price / (e.years * 12)) + "/мес" : ""; });
  document.querySelectorAll("#train .row").forEach(function (r, i) { var t = S.train[i]; r.querySelector(".am").textContent = (t.price > 0 && t.months > 0) ? rub(t.price / t.months) + "/мес" : ""; });
  var k = [];
  k.push(["main", "Прибыль в месяц", R.profit === null ? "нужны цены" : rub(R.profit)]);
  k.push(["", "Рентабельность", R.margin === null ? "-" : pct(R.margin)]);
  k.push(["", "Выручка в месяц", R.revenue > 0 ? rub(R.revenue) : "-"]);
  k.push(["", "Расходы кабинета в месяц", rub(R.F)]);
  k.push(["", "Безубыточность", R.breakEven === null ? "-" : Math.ceil(R.breakEven) + " клиентов/мес"]);
  k.push(["", "Окупаемость вложений", R.payback === null ? "-" : (Math.round(R.payback * 10) / 10) + " мес"]);
  $("kpi").innerHTML = k.map(function (x) { return '<div class="k ' + x[0] + '"><span>' + x[1] + '</span><b>' + x[2] + '</b></div>'; }).join("");
  var parts = [["Оборудование", R.equipMonth, "var(--c2)"], ["Обучение", R.trainMonth, "var(--c3)"], ["Аренда и прочее", R.fixedMonth, "var(--c4)"]];
  var tot = parts.reduce(function (s, p) { return s + p[1]; }, 0) || 1;
  $("bar").innerHTML = parts.map(function (p) { return '<i style="width:' + (p[1] / tot * 100) + '%;background:' + p[2] + '"></i>'; }).join("");
  $("leg").innerHTML = parts.map(function (p) { return '<span><u style="background:' + p[2] + '"></u>' + p[0] + ' ' + rub(p[1]) + '</span>'; }).join("");
  $("tbl").innerHTML = R.rows.length ? '<table><tr><th>Услуга</th><th>Себестоим.</th><th>Мин. цена</th><th>Прибыль</th><th>Рент.</th></tr>' + R.rows.map(function (r) {
    return '<tr><td>' + esc(r.name) + '</td><td>' + rub(r.cost) + '</td><td>' + (r.minPrice === null ? "-" : rub(r.minPrice)) + '</td><td class="' + (r.profitPer !== null && r.profitPer < 0 ? "bad" : "") + '">' + (r.profitPer === null ? "-" : rub(r.profitPer)) + '</td><td>' + (r.margin === null ? "-" : pct(r.margin)) + '</td></tr>';
  }).join("") + '</table>' : "";
  markDone(S, R);
  var n = "";
  if (!R.rows.length) n = "Отметь услугу и впиши, сколько у неё клиентов в месяц.";
  else if (!R.allPriced) n = "Впиши цену у каждой включённой услуги, чтобы увидеть прибыль и рентабельность.";
  else if (R.rows.some(function (r) { return r.price > 0 && r.margin !== null && r.margin < 0; })) n = '<span class="bad">Есть услуга, которая приносит убыток при такой цене. Смотри таблицу ниже.</span>';
  else n = R.profit >= 0 ? '<span class="ok">Кабинет в плюсе.</span> Мин. цена считается с учётом желаемой прибыли ' + S.profit + '%.' : '<span class="bad">При таких ценах кабинет в минусе.</span>';
  $("note").innerHTML = n;
}

/* ---------- Отметки «заполнено» у сворачиваемых блоков ---------- */
function markDone(S, R) {
  var ok = [
    S.profs.length > 0,
    S.services.some(function (s) { return s.on && s.price > 0 && s.clients > 0; }),
    S.equip.some(function (e) { return e.on && e.price > 0 && e.years > 0; }),
    S.train.some(function (t) { return t.price > 0 && t.months > 0; }),
    S.fixed.some(function (f) { return f.monthly > 0; }),
    S.tax > 0
  ];
  document.querySelectorAll("details.sec").forEach(function (d) {
    var i = parseInt(d.dataset.sec, 10) - 1, el = d.querySelector(".done");
    if (el) el.textContent = ok[i] ? "✓ заполнено" : "";
  });
}

/* ---------- Обратная связь ---------- */
function sendFeedback() {
  var st = $("fbstatus"), text = $("fbtext").value.trim();
  if (text.length < 3) { st.textContent = "Напиши хотя бы пару слов."; return; }
  if (!CONFIG.collectUrl) { st.textContent = "Отправка сейчас недоступна."; return; }
  var kind = document.querySelector("input[name=fbk]:checked").value;
  var btn = $("fbsend"); btn.disabled = true; st.textContent = "Отправляю...";
  fetch(CONFIG.collectUrl + "/feedback", { method: "POST", headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ kind: kind, text: text, contact: $("fbcontact").value.trim(), profs: S_.profs }) })
    .then(function (r) {
      if (r.status === 204) { st.textContent = "Спасибо! Получил."; $("fbtext").value = ""; }
      else if (r.status === 429) st.textContent = "Сегодня уже много сообщений, попробуй завтра.";
      else st.textContent = "Не получилось отправить. Напиши на почту внизу страницы.";
    })
    .catch(function () { st.textContent = "Не получилось отправить. Напиши на почту внизу страницы."; })
    .then(function () { btn.disabled = false; });
}

/* ---------- Итог и анонимный снимок ---------- */
function clip(x) { return String(x == null ? "" : x).slice(0, 40); }
function known(list, name) { return list.indexOf(name) >= 0; }
function snapshot() {
  var S = last.S, R = last.R;
  var allMats = [], allEq = [];
  Object.keys(PROFS).forEach(function (k) { allMats = allMats.concat(PROFS[k].mats); allEq = allEq.concat(PROFS[k].equip); });
  var allSvc = []; Object.keys(PROFS).forEach(function (k) { allSvc = allSvc.concat(PROFS[k].services); });
  return {
    v: 1, t: new Date().toISOString(), profs: S.profs, tax: S.tax, profit: S.profit,
    services: S.services.filter(function (s) { return s.on && s.clients > 0; }).map(function (s) {
      return { prof: s.prof, name: known(allSvc, s.name) ? s.name : "", custom: !known(allSvc, s.name), price: s.price, clients: s.clients, labor: s.labor, mode: s.mode,
        mats: s.mats.filter(function (m) { return m.price > 0; }).map(function (m) { return { name: clip(m.name), std: known(allMats, m.name), price: m.price, vol: m.vol, use: m.use }; }) };
    }),
    equip: S.equip.filter(function (e) { return e.on && e.price > 0; }).map(function (e) { return { name: clip(e.name), std: known(allEq, e.name), price: e.price, years: e.years }; }),
    train: S.train.filter(function (t) { return t.price > 0; }).map(function (t) { return { name: clip(t.name), std: known(COMMON.train, t.name), price: t.price, months: t.months }; }),
    fixed: S.fixed.filter(function (f) { return f.monthly > 0; }).map(function (f) { return { name: clip(f.name), std: known(COMMON.fixed, f.name), monthly: f.monthly }; }),
    res: { profit: R.profit, margin: R.margin, revenue: R.revenue, F: R.F, clients: R.totalClients }
  };
}
var lastSent = "";
function show() {
  upd();
  $("result").hidden = false; $("pre").hidden = true;
  var st = $("sent"); st.textContent = "";
  if ($("consent").checked && CONFIG.collectUrl) {
    var snap = snapshot(), body = JSON.stringify(snap);
    snap.t = ""; var key = JSON.stringify(snap); /* время не участвует в сравнении: одинаковые цифры не дублируем */
    if (key === lastSent) { st.textContent = "Эти цифры уже добавлены в статистику."; }
    else {
      st.textContent = "Добавляю в статистику...";
      fetch(CONFIG.collectUrl, { method: "POST", headers: { "Content-Type": "text/plain" }, body: body })
        .then(function (r) { if (r.status === 204) { lastSent = key; st.textContent = "Цифры анонимно добавлены в статистику. Спасибо!"; } else st.textContent = "В статистику добавить не получилось, итог выше это не меняет."; })
        .catch(function () { st.textContent = "В статистику добавить не получилось, итог выше это не меняет."; });
    }
  } else if (!$("consent").checked) { st.textContent = "Цифры остались только у тебя."; }
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- Ссылка с готовыми цифрами (в том числе старого формата #p= {d,f,cli}) ---------- */
function fromHash() {
  try {
    var m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return null;
    var s = m[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch (e) { return null; }
}
function stateFromHash(P) {
  var S = emptyState();
  if (P.v === 2) { return P.S; }
  addProfession(S, "manicure");
  var s = S.services[0]; s.name = "Маникюр"; s.on = true; s.clients = P.cli || 0;
  s.mats = (P.d || []).map(function (r) { return { name: r[0], price: num(r[1]), vol: num(r[2]), use: num(r[3]) }; });
  S.fixed = []; (P.f || []).forEach(function (r) { S.fixed.push({ name: r[0], monthly: num(r[1]) }); });
  S.equip.forEach(function (e) { e.on = false; });
  return S;
}

/* ---------- Запуск ---------- */
function init(P) {
  var box = $("chips");
  box.innerHTML = Object.keys(PROFS).map(function (k) { return '<label class="chip"><input type="checkbox" value="' + k + '"><span>' + PROFS[k].name + '</span></label>'; }).join("");
  box.querySelectorAll("input").forEach(function (c) {
    c.onchange = function () {
      readAll();
      if (c.checked) addProfession(S_, c.value);
      else {
        var has = S_.services.some(function (s) { return s.prof === c.value && (s.price > 0 || s.clients > 0 || s.mats.some(function (m) { return m.price > 0; })); });
        if (has && !confirm("У профиля «" + PROFS[c.value].name + "» уже введены цифры. Убрать его вместе с ними?")) { c.checked = true; return; }
        removeProfession(S_, c.value);
      }
      buildAll(S_); upd();
    };
  });
  var pm = /[#&]prof=([a-z,]+)/.exec(location.hash); /* ссылка вида #prof=epil открывает калькулятор сразу с нужным профилем */
  if (P) { try { S_ = stateFromHash(P); if (!S_ || !Array.isArray(S_.services) || !Array.isArray(S_.equip) || !Array.isArray(S_.train) || !Array.isArray(S_.fixed) || S_.services.some(function (s) { return !PROFS[s.prof] || !Array.isArray(s.mats); })) throw 0; } catch (e) { S_ = emptyState(); P = null; } }
  else if (pm) { pm[1].split(",").forEach(function (k) { if (PROFS[k]) addProfession(S_, k); }); }
  if (!S_.profs.length) addProfession(S_, "manicure");
  S_.services.forEach(function (s) { var n = parseInt(String(s.id).slice(1), 10); if (n > uid) uid = n; });
  buildAll(S_);
  ["tax", "profit"].forEach(function (i) { $(i).oninput = upd; });
  $("addEq").onclick = function () { readAll(); S_.equip.push({ name: "", price: 0, years: 5, on: true }); buildEquip(S_); upd(); };
  $("addTr").onclick = function () { readAll(); S_.train.push({ name: "", price: 0, months: 12 }); buildTrain(S_); upd(); };
  $("addFx").onclick = function () { readAll(); S_.fixed.push({ name: "", monthly: 0 }); buildFixed(S_); upd(); };
  $("show").onclick = show;
  $("fbsend").onclick = sendFeedback;
  document.querySelectorAll("details.sec .next").forEach(function (b) {
    b.onclick = function () {
      var d = b.closest("details.sec"); d.open = false;
      var nx = d.nextElementSibling; while (nx && !(nx.matches && nx.matches("details.sec"))) nx = nx.nextElementSibling;
      if (nx) { nx.open = true; nx.scrollIntoView({ behavior: "smooth", block: "start" }); }
    };
  });
  document.addEventListener("input", function (e) { if (e.target.closest && e.target.closest("#svcList,#equip,#train,#fixed")) upd(); });
  document.addEventListener("change", function (e) { if (e.target.closest && e.target.closest("#svcList,#equip")) upd(); });
  upd();
}

/* Короткая ссылка со сжатыми цифрами: #z=<base64url(deflate-raw(JSON))>. Распаковка встроенная в браузер. */
function fromZ(cb) {
  var m = /[#&]z=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m || typeof DecompressionStream === "undefined") { cb(null); return; }
  try {
    var s = m[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text()
      .then(function (t) { cb(JSON.parse(t)); }, function () { cb(null); });
  } catch (e) { cb(null); }
}
fromZ(function (Z) { init(Z || fromHash()); });
