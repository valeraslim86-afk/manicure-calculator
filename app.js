/* Калькулятор себестоимости. Без сервера: всё считается в браузере.
   Готовые цифры можно передать ссылкой: index.html#p=<base64url(JSON)>. Фрагмент после # на сервер не уходит. */
var OWNER_VK = "8499740"; /* публичный id страницы ВК, куда открывается диалог */
var DEFAULT_D = ["База", "Гель-лак", "Топ", "Перчатки", "Антисептик", "Пилка", "Баф"].map(function (n) { return [n, "", "", ""]; });
var DEFAULT_F = [["Аренда", ""], ["Оборудование (лампа), в месяц", ""]];

function $(i) { return document.getElementById(i); }
function num(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; }
function rub(x) { return Math.round(x).toLocaleString("ru-RU") + " ₽"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

/* Ядро расчёта: те же формулы, что в калькулятор.py */
function calc(direct, fixed, o) {
  var d = 0, f = 0, i;
  for (i = 0; i < direct.length; i++) { var r = direct[i]; if (r.vol > 0) d += r.price / r.vol * r.use; }
  for (i = 0; i < fixed.length; i++) f += fixed[i];
  var fps = o.cli > 0 ? f / o.cli : 0;
  var laborRub = o.mode === "rub" ? o.labor : 0, laborPct = o.mode === "pct" ? o.labor / 100 : 0;
  var taxPct = o.tax / 100, prof = o.profit / 100;
  var lab = laborRub + laborPct * o.price, tx = taxPct * o.price;
  var cost = d + fps + lab + tx, base = d + fps + laborRub;
  var z = 1 - laborPct - taxPct, den = z - prof;
  var contr = o.price > 0 ? o.price * z - d - laborRub : null;
  var be = (contr && contr > 0) ? f / contr : null;
  var pp = o.price > 0 ? o.price - cost : null;
  return { direct: d, fixedMonth: f, fixedPer: fps, labor: lab, tax: tx, cost: cost, base: base,
    minZero: z > 0 ? base / z : null, minPrice: den > 0 ? base / den : null, be: be,
    profitPer: pp, profitMonth: pp === null ? null : pp * o.cli };
}

function readDirect() { var r = []; document.querySelectorAll("#direct .row").forEach(function (e) { var v = e.querySelectorAll("input"); r.push({ name: v[0].value || "материал", price: num(v[1].value), vol: num(v[2].value), use: num(v[3].value) }); }); return r; }
function readFixed() { var r = [], n = []; document.querySelectorAll("#fixed .row").forEach(function (e) { var v = e.querySelectorAll("input"); r.push(num(v[1].value)); n.push(v[0].value || "расход"); }); return { v: r, n: n }; }
function addD(v) { v = (v && v.length) ? v : ["", "", "", ""]; var e = document.createElement("div"); e.className = "row"; e.innerHTML = '<input value="' + esc(v[0]) + '" placeholder="Название"><input type="number" min="0" inputmode="decimal" value="' + esc(v[1]) + '"><input type="number" min="0" inputmode="decimal" value="' + esc(v[2]) + '"><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(v[3]) + '"><button class="x" type="button" title="Убрать">×</button>'; e.querySelector("button").onclick = function () { e.remove(); upd(); }; e.oninput = upd; $("direct").appendChild(e); }
function addF(v) { v = (v && v.length) ? v : ["", ""]; var e = document.createElement("div"); e.className = "row f"; e.innerHTML = '<input value="' + esc(v[0]) + '" placeholder="Название"><input type="number" min="0" inputmode="decimal" value="' + esc(v[1]) + '"><button class="x" type="button" title="Убрать">×</button>'; e.querySelector("button").onclick = function () { e.remove(); upd(); }; e.oninput = upd; $("fixed").appendChild(e); }
function opts() { return { labor: num($("labor").value), mode: $("laborMode").value, tax: num($("tax").value), profit: num($("profit").value), price: num($("price").value), cli: num($("cli").value) || 1 }; }

var last = null;
function upd() {
  var o = opts(), fx = readFixed(), dr = readDirect(), R = calc(dr, fx.v, o);
  $("priceV").textContent = o.price; $("cliV").textContent = o.cli;
  last = { o: o, R: R, dr: dr, fx: fx };
  var k = [];
  k.push(['main', 'Себестоимость услуги', o.price > 0 ? rub(R.cost) : rub(R.base) + (o.tax > 0 || o.mode === "pct" ? " + %" : "")]);
  k.push(['', 'Цена без прибыли', R.minZero === null ? "-" : rub(R.minZero)]);
  k.push(['', 'Цена с желаемой прибылью', R.minPrice === null ? "недостижима" : rub(R.minPrice)]);
  k.push(['', 'Безубыточность', R.be === null ? "нужна цена" : Math.ceil(R.be) + " клиентов/мес"]);
  if (o.price > 0) k.push(['', 'Прибыль с услуги', rub(R.profitPer)], ['', 'Прибыль в месяц', rub(R.profitMonth)]);
  $("kpi").innerHTML = k.map(function (x) { return '<div class="k ' + x[0] + '"><span>' + x[1] + '</span><b>' + x[2] + '</b></div>'; }).join("");
  var parts = [["Материалы", R.direct, "var(--c1)"], ["Постоянные", R.fixedPer, "var(--c2)"], ["Мастер", R.labor, "var(--c3)"], ["Налоги", R.tax, "var(--c4)"]];
  var tot = parts.reduce(function (s, p) { return s + p[1]; }, 0) || 1;
  $("bar").innerHTML = parts.map(function (p) { return '<i style="width:' + (p[1] / tot * 100) + '%;background:' + p[2] + '"></i>'; }).join("");
  $("leg").innerHTML = parts.map(function (p) { return '<span><u style="background:' + p[2] + '"></u>' + p[0] + ' ' + rub(p[1]) + '</span>'; }).join("");
  var n = "";
  if (o.price > 0) n = R.profitPer >= 0 ? '<span class="ok">Цена покрывает затраты.</span>' : '<span class="bad">При такой цене ты работаешь в минус.</span>';
  else n = "Задай цену ползунком, чтобы увидеть прибыль и безубыточность.";
  if (R.minPrice === null) n += ' <span class="bad">Мастер, налоги и прибыль вместе дают 100% цены и больше, такой цены не существует.</span>';
  $("note").innerHTML = n;
}

function report() {
  var L = last, o = L.o, R = L.R, t = [];
  t.push("Расчёт себестоимости маникюра");
  t.push("Клиентов в месяц: " + o.cli);
  t.push("Материалы на 1 клиента: " + rub(R.direct));
  L.dr.forEach(function (r) { t.push("  - " + r.name + ": " + r.price + " ₽ / " + r.vol + ", на клиента " + r.use); });
  t.push("Постоянные в месяц: " + rub(R.fixedMonth) + " (на 1 клиента " + rub(R.fixedPer) + ")");
  L.fx.n.forEach(function (n, i) { t.push("  - " + n + ": " + L.fx.v[i] + " ₽"); });
  t.push("Мастер: " + o.labor + (o.mode === "rub" ? " ₽ за услугу" : " % от цены") + "; налоги и комиссии: " + o.tax + "%; желаемая прибыль: " + o.profit + "%");
  t.push("Цена услуги: " + (o.price > 0 ? rub(o.price) : "не задана"));
  t.push("Себестоимость: " + (o.price > 0 ? rub(R.cost) : rub(R.base) + " + проценты от цены"));
  t.push("Цена без прибыли: " + (R.minZero === null ? "-" : rub(R.minZero)));
  t.push("Цена с желаемой прибылью: " + (R.minPrice === null ? "недостижима" : rub(R.minPrice)));
  t.push("Безубыточность: " + (R.be === null ? "-" : Math.ceil(R.be) + " клиентов в месяц"));
  if (o.price > 0) t.push("Прибыль: " + rub(R.profitPer) + " с услуги, " + rub(R.profitMonth) + " в месяц");
  return t.join("\n");
}

function send() {
  var txt = report(), m = $("msg");
  window.open("https://vk.com/write" + OWNER_VK, "_blank");
  m.innerHTML = "";
  var t = document.createElement("textarea"); t.value = txt; t.readOnly = true; m.appendChild(t);
  var b = document.createElement("button"); b.className = "btn ghost"; b.type = "button"; b.textContent = "Скопировать расчёт";
  var st = document.createElement("div"); st.className = "st";
  b.onclick = function () {
    function ok() { st.textContent = "Скопировано. Вставь в диалог со мной."; }
    function fb() { t.focus(); t.select(); t.setSelectionRange(0, 99999); var r = false; try { r = document.execCommand("copy"); } catch (e) { } st.textContent = r ? "Скопировано. Вставь в диалог со мной." : "Выдели текст выше, скопируй и вставь в диалог со мной."; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fb); else fb();
  };
  m.appendChild(b); m.appendChild(st);
  var i = document.createElement("div"); i.className = "st"; i.textContent = "Если диалог не открылся, вернись в ВК и вставь расчёт туда сам."; m.appendChild(i);
  b.click();
}

function fromHash() {
  try {
    var m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return null;
    var s = m[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch (e) { return null; }
}

var P = fromHash() || {};
(P.d || DEFAULT_D).forEach(addD);
(P.f || DEFAULT_F).forEach(addF);
if (P.cli) $("cli").value = P.cli;
$("addD").onclick = function () { addD(); };
$("addF").onclick = function () { addF(); };
$("send").onclick = send;
["labor", "laborMode", "tax", "profit", "cli"].forEach(function (i) { $(i).oninput = upd; });
$("price").oninput = function () { $("priceN").value = ""; upd(); };
$("priceN").oninput = function () { var v = num($("priceN").value); $("price").max = Math.max(10000, v); $("price").value = v; upd(); };
upd();
