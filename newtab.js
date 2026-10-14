const $ = s => document.querySelector(s);
const DEF = {
  glass: .16, blur: 18, dim: .35, mode: "random", bg: "", idx: 0, hour12: true,
  slide: 0, units: "c", city: "", lat: null, lon: null,
  fx: true, accentAuto: true, accent: "#d9a7ff",
  ver: 3, hint: false, title: "Ash Redwan",
  live: "liquid",
  lv: { speed: 1, q: 1, saver: false, vib: 1.35, dim: .04,
        l1: "#12084a", l2: "#4b2bff", l3: "#ff3d8f", ls: .7,
        hue: 0, warp: 0, noise: 0,
        b1: "#de443b", b2: "#006bb4", b3: "#162325", bc: 3.5, bm: true,
        a1: "#f7f7f7", a2: "#e100ff", ab: 1.6, am: true },
  links: [
    { name: "YouTube", url: "https://youtube.com" },
    { name: "GitHub", url: "https://github.com" },
    { name: "Gmail", url: "https://mail.google.com" },
    { name: "Drive", url: "https://drive.google.com" }
  ]
};
let S = { ...DEF }, images = [], cur = null, front = 0, timer = null, autoRgb = null, imgDim = null, brandSrc = "", brandFirst = true;
const layers = [$("#bgA"), $("#bgB")];
const isLive = () => S.live !== "none";

/* ---------- storage ---------- */
const save = () => chrome.storage.local.set({ s: S });
function applyStyle() {
  const r = document.documentElement.style;
  r.setProperty("--glass", S.glass); r.setProperty("--blur", S.blur + "px"); r.setProperty("--dim", S.dim);
  r.setProperty("--vib", S.lv.vib); r.setProperty("--ldim", S.lv.dim);
  document.body.classList.toggle("nofx", !S.fx);
}

/* ---------- colour helpers ---------- */
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map(v => Math.round((v + m) * 255));
}
const tune = c => { const [h, s, l] = rgb2hsl(c); return hsl2rgb(h, Math.max(s, .7), Math.min(Math.max(l, .58), .72)); };
const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function vibrant(img) {   // img can be an <img> or a <canvas>
  const n = 24, c = document.createElement("canvas"); c.width = c.height = n;
  const x = c.getContext("2d", { willReadFrequently: true });
  let d;
  try { x.drawImage(img, 0, 0, n, n); d = x.getImageData(0, 0, n, n).data; } catch { return null; }
  let R = 0, G = 0, B = 0, W = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === mn) continue;
    const l = (mx + mn) / 510, s = (mx - mn) / (255 - Math.abs(mx + mn - 255));
    const w = s * s * (1 - Math.abs(l - .55) * 1.4);
    R += r * w; G += g * w; B += b * w; W += w;
  }
  return W < .5 ? null : [R / W, G / W, B / W].map(Math.round);
}
let curAcc = null, accAnim = null;
function setAccent(base) {
  const [h, s] = rgb2hsl(base), a2 = hsl2rgb(h + 45, Math.max(s, .8), .64), r = document.documentElement.style;
  r.setProperty("--accent-rgb", base.join(",")); r.setProperty("--accent2-rgb", a2.join(","));
}
function easeAccent(c) {            // smooth colour change
  const to = tune(c);
  if (!curAcc) { curAcc = to; setAccent(to); return; }
  clearInterval(accAnim);
  const from = curAcc.slice(); let k = 0;
  accAnim = setInterval(() => {
    k++; const f = k / 8;
    curAcc = from.map((v, i) => Math.round(v + (to[i] - v) * f)); setAccent(curAcc);
    if (k >= 8) clearInterval(accAnim);
  }, 100);
}
function refreshAccent() {
  if (S.accentAuto) { if (autoRgb) easeAccent(autoRgb); }
  else { clearInterval(accAnim); curAcc = hex2rgb(S.accent); setAccent(curAcc); }
}

/* ---------- editable title ---------- */
function applyTitle() {
  const t = (S.title || "").trim().slice(0, 24), tag = $(".tag"), n = Math.max(t.length, 1);
  tag.classList.toggle("hidden", !t);
  $("#brand").textContent = t; $(".brand-shadow").textContent = t;
  tag.style.setProperty("--len", n); tag.style.setProperty("--k", 1400 / n);
  alignBrand();
}

/* ---------- IndexedDB (user-added images) ---------- */
const db = () => new Promise((res, rej) => {
  const r = indexedDB.open("ash-bg", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("img", { keyPath: "id", autoIncrement: true });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const uploads = async () => { const d = await db(); return new Promise(r => { const q = d.transaction("img").objectStore("img").getAll(); q.onsuccess = () => r(q.result); }); };
const addUpload = async f => { const d = await db(); return new Promise(r => { const t = d.transaction("img", "readwrite"); t.objectStore("img").add({ blob: f }); t.oncomplete = r; }); };
const clearUploads = async () => { const d = await db(); return new Promise(r => { const t = d.transaction("img", "readwrite"); t.objectStore("img").clear(); t.oncomplete = r; }); };

/* ---------- image backgrounds ---------- */
async function loadImages() {
  images = [];
  try {
    const list = await (await fetch("assets/background/list.json")).json();
    list.forEach(f => images.push({ id: f, src: "assets/background/" + encodeURIComponent(f) }));
  } catch (e) { console.warn("No list.json", e); }
  (await uploads()).forEach(u => images.push({ id: "u" + u.id, src: URL.createObjectURL(u.blob) }));
}
function next() {
  if (!images.length) return null;
  if (S.mode === "fixed") return images.find(i => i.id === S.bg) || images[0];
  if (S.mode === "cycle") { S.idx = (S.idx + 1) % images.length; save(); return images[S.idx]; }
  if (images.length === 1) return images[0];
  let i; do { i = images[Math.floor(Math.random() * images.length)]; } while (i === cur);
  return i;
}
/* name letters are see-through windows onto the wallpaper (image mode) */
function alignBrand() {
  const b = $("#brand"); if (!brandSrc || !imgDim) return;
  const vw = innerWidth, vh = innerHeight, sc = Math.max(vw / imgDim.w, vh / imgDim.h);
  const dw = imgDim.w * sc, dh = imgDim.h * sc, ox = (vw - dw) / 2, oy = (vh - dh) / 2;
  const r = b.getBoundingClientRect(), left = r.left + r.width / 2 - b.offsetWidth / 2, top = r.top + r.height / 2 - b.offsetHeight / 2;
  b.style.backgroundSize = `${dw}px ${dh}px`;
  b.style.backgroundPosition = `${ox - left}px ${oy - top}px`;
}
function setBrandBg(src) {
  const b = $("#brand"), go = () => { brandSrc = src; b.style.backgroundImage = `url("${src}")`; alignBrand(); b.classList.remove("swap"); };
  if (brandFirst) { brandFirst = false; go(); return; }
  b.classList.add("swap"); setTimeout(go, 350);
}
function showBg(img) {
  if (!img) return;
  cur = img;
  const im = new Image();
  im.onload = () => {
    if (isLive()) return;
    const n = layers[1 - front], o = layers[front];
    n.style.backgroundImage = `url("${img.src}")`;
    n.classList.add("on"); o.classList.remove("on");
    front = 1 - front;
    imgDim = { w: im.naturalWidth, h: im.naturalHeight };
    setBrandBg(img.src);
    const c = vibrant(im); if (c) autoRgb = c;
    refreshAccent();
  };
  im.src = img.src;
}
function setTimer() {
  clearInterval(timer);
  if (S.slide > 0) timer = setInterval(() => {
    if (isLive() || S.mode === "fixed" || images.length < 2 || document.hidden) return;
    showBg(next());
  }, S.slide * 1000);
}
function renderThumbs() {
  const t = $("#thumbs"); t.innerHTML = "";
  images.forEach(i => {
    const d = document.createElement("div");
    d.style.backgroundImage = `url("${i.src}")`;
    if (S.mode === "fixed" && S.bg === i.id) d.classList.add("on");
    d.onclick = () => { S.mode = "fixed"; S.bg = i.id; $("#mode").value = "fixed"; save(); if (isLive()) setLive("none"); else showBg(i); renderThumbs(); };
    t.appendChild(d);
  });
}

/* ---------- live backgrounds ---------- */
function syncLiveUI() {
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.live === S.live));
  document.querySelectorAll(".fxset").forEach(e => e.classList.toggle("hidden", !(e.dataset.for === S.live || (e.dataset.for === "any" && isLive()))));
}
function setLive(kind) {
  S.live = kind; save();
  document.body.classList.toggle("live-on", isLive());
  Live.stop();
  $("#lmsg").textContent = "";
  if (isLive()) {
    const ok = Live.start(kind, S.lv, cv => { const c = vibrant(cv); if (c) { autoRgb = c; refreshAccent(); } });
    if (!ok) {
      S.live = "none"; save(); document.body.classList.remove("live-on");
      $("#lmsg").textContent = "WebGL isn't available here, so live backgrounds can't run.";
    }
  }
  if (!isLive()) showBg(cur || next());
  syncLiveUI();
}

/* ---------- graffiti extras ---------- */
function drips() {
  const w = $("#drips"); w.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const s = document.createElement("span");
    s.style.cssText = `left:${6 + Math.random() * 88}%;--h:${24 + Math.random() * 50}px;--w:${5 + Math.random() * 4}px;animation-delay:${1 + Math.random() * 1.8}s;animation-duration:${1.8 + Math.random() * 1.6}s`;
    w.appendChild(s);
  }
}
function splat() {
  const w = $("#splat"), cl = [[5, 90], [97, 8], [93, 88], [3, 12]];
  w.querySelectorAll(".dot").forEach(d => d.remove());
  for (let i = 0; i < 46; i++) {
    const c = cl[i % 4], sp = i % 7 === 0 ? 22 : 12, big = Math.random() < .12;
    const s = big ? 10 + Math.random() * 12 : 2 + Math.random() * 6, d = document.createElement("i");
    d.className = "dot " + "aabbc"[Math.floor(Math.random() * 5)];
    d.style.cssText = `left:${c[0] + (Math.random() - .5) * sp * 2}%;top:${c[1] + (Math.random() - .5) * sp * 2}%;width:${s}px;height:${s}px;opacity:${.35 + Math.random() * .55}${big ? ";filter:blur(1px)" : ""}`;
    w.appendChild(d);
  }
}

/* ---------- clock ---------- */
let lastKey = "";
function tick() {
  const n = new Date();
  const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", hourCycle: S.hour12 ? "h12" : "h23" }).formatToParts(n);
  let h = "", m = "", ap = "";
  parts.forEach(p => { if (p.type === "hour") h = p.value; if (p.type === "minute") m = p.value; if (p.type === "dayPeriod") ap = p.value; });
  if (!S.hour12) h = h.padStart(2, "0");
  const key = h + m + ap;
  if (key !== lastKey) {
    lastKey = key;
    $("#time").innerHTML = `<span>${h}</span><span class="colon">:</span><span>${m}</span>${S.hour12 && ap ? `<em>${ap}</em>` : ""}`;
  }
  $("#date").textContent = n.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/* ---------- weather (Open-Meteo, no API key) ---------- */
const WMO = c => c === 0 ? ["Clear", "☀️", "🌙"] : c <= 2 ? ["Partly cloudy", "⛅", "☁️"] : c === 3 ? ["Cloudy", "☁️", "☁️"]
  : c <= 48 ? ["Fog", "🌫️", "🌫️"] : c <= 57 ? ["Drizzle", "🌦️", "🌦️"] : c <= 67 ? ["Rain", "🌧️", "🌧️"]
  : c <= 77 ? ["Snow", "❄️", "❄️"] : c <= 82 ? ["Showers", "🌧️", "🌧️"] : c <= 86 ? ["Snow showers", "🌨️", "🌨️"] : ["Thunderstorm", "⛈️", "⛈️"];

async function weather() {
  const box = $("#weather");
  if (S.lat == null) { box.classList.add("hidden"); return; }
  const key = `${S.lat},${S.lon},${S.units}`;
  const c = (await chrome.storage.local.get("w")).w;
  let d;
  if (c && c.key === key && Date.now() - c.t < 15 * 60 * 1000) d = c.d;
  else {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&temperature_unit=${S.units === "f" ? "fahrenheit" : "celsius"}`;
      d = await (await fetch(u)).json();
      chrome.storage.local.set({ w: { key, t: Date.now(), d } });
    } catch { d = c && c.d; }
  }
  if (!d || !d.current) { box.classList.add("hidden"); return; }
  const [desc, day, night] = WMO(d.current.weather_code), deg = S.units === "f" ? "°F" : "°C";
  $("#wIcon").textContent = d.current.is_day ? day : night;
  $("#wTemp").textContent = Math.round(d.current.temperature_2m) + deg;
  $("#wDesc").textContent = desc;
  $("#wHL").textContent = `H ${Math.round(d.daily.temperature_2m_max[0])}° · L ${Math.round(d.daily.temperature_2m_min[0])}°`;
  $("#wCity").textContent = S.city;
  box.classList.remove("hidden");
}
async function setCity() {
  const name = $("#city").value.trim(); if (!name) return;
  $("#wmsg").textContent = "Searching…";
  try {
    const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`)).json();
    if (!r.results) { $("#wmsg").textContent = "City not found."; return; }
    const p = r.results[0];
    S.city = p.name; S.lat = p.latitude; S.lon = p.longitude; save();
    $("#wmsg").textContent = `Set to ${p.name}${p.country ? ", " + p.country : ""}`;
    chrome.storage.local.remove("w"); weather();
  } catch { $("#wmsg").textContent = "Network error."; }
}
function useLocation() {
  $("#wmsg").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(p => {
    S.lat = p.coords.latitude; S.lon = p.coords.longitude; S.city = "My location"; save();
    $("#wmsg").textContent = "Using your location"; chrome.storage.local.remove("w"); weather();
  }, () => $("#wmsg").textContent = "Location blocked. Type a city instead.");
}

/* ---------- quick links (glass squircles) ---------- */
function renderLinks() {
  const g = $("#links"); g.innerHTML = "";
  S.links.forEach((l, i) => {
    const a = document.createElement("a"); a.className = "tile loading"; a.href = l.url;
    a.style.setProperty("--i", i); a.style.setProperty("--h", hash(l.name) % 360);
    const card = document.createElement("span"); card.className = "card glass";
    const plate = document.createElement("span"); plate.className = "plate";
    const mo = document.createElement("b"); mo.className = "mono"; mo.textContent = (l.name[0] || "?").toUpperCase();
    const img = document.createElement("img"); img.alt = ""; img.decoding = "async";
    const done = ok => { a.classList.remove("loading"); a.classList.add(ok ? "ok" : "fail"); };
    img.onload = () => { const c = vibrant(img); if (c) a.style.setProperty("--c", tune(c).join(",")); done(true); };
    img.onerror = () => done(false);
    setTimeout(() => { if (a.classList.contains("loading")) done(false); }, 5000);
    img.src = chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + encodeURIComponent(l.url) + "&size=64";
    plate.append(mo, img); card.appendChild(plate);
    const lb = document.createElement("span"); lb.className = "label"; lb.textContent = l.name;
    a.append(card, lb); g.appendChild(a);
  });
  const add = document.createElement("a"); add.className = "tile add"; add.href = "#"; add.style.setProperty("--i", S.links.length);
  add.innerHTML = '<span class="card glass"><span class="plus">+</span></span><span class="label">Add</span>';
  add.onclick = e => { e.preventDefault(); openPanel(); const n = $("#linkName"); n.scrollIntoView({ block: "center" }); n.focus(); };
  g.appendChild(add);
  const e = $("#linkList"); e.innerHTML = "";
  S.links.forEach((l, i) => {
    const r = document.createElement("div"); r.className = "lrow";
    const t = document.createElement("span"); t.textContent = l.name;
    const b = document.createElement("button"); b.type = "button"; b.textContent = "×";
    b.onclick = () => { S.links.splice(i, 1); save(); renderLinks(); };
    r.append(t, b); e.appendChild(r);
  });
}
function addLink() {
  let url = $("#linkUrl").value.trim(), name = $("#linkName").value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { name = name || new URL(url).hostname.replace(/^www\./, ""); } catch { return; }
  S.links.push({ name, url }); save(); renderLinks();
  $("#linkName").value = ""; $("#linkUrl").value = "";
}

/* ---------- search ---------- */
$("#searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("#q").value.trim(); if (!q) return;
  if (/^https?:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q)) location.href = /^https?:/i.test(q) ? q : "https://" + q;
  else chrome.search.query({ text: q, disposition: "CURRENT_TAB" });
});
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#q").focus(); }
  if (e.key === "Escape") closePanel();
});

/* ---------- panel: hidden, double-tap anywhere to toggle ---------- */
const panel = $("#panel"), lastTap = { t: 0, x: 0, y: 0 };
function openPanel() { panel.classList.remove("hidden", "out"); document.body.classList.add("panel-open"); }
function closePanel() {
  if (panel.classList.contains("hidden")) return;
  panel.classList.add("out"); document.body.classList.remove("panel-open");
  setTimeout(() => { if (panel.classList.contains("out")) { panel.classList.add("hidden"); panel.classList.remove("out"); } }, 200);
}
const togglePanel = () => (panel.classList.contains("hidden") || panel.classList.contains("out")) ? openPanel() : closePanel();
document.addEventListener("pointerup", e => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (e.target.closest("a,button:not(#gear),input,select,textarea,label,#panel,form")) return;
  const now = performance.now();
  if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) { lastTap.t = 0; togglePanel(); }
  else { lastTap.t = now; lastTap.x = e.clientX; lastTap.y = e.clientY; }
});
const PALS = [["#12084a", "#4b2bff", "#ff3d8f"], ["#031b3a", "#0a73ff", "#19e6c1"], ["#240046", "#f72585", "#ffb703"], ["#04140b", "#12c25a", "#c6ff00"], ["#1a0206", "#d00028", "#ff7a3d"]];
function bind() {
  $("#gear").onclick = () => { if (document.body.classList.contains("panel-open")) { lastTap.t = 0; closePanel(); } };
  $("#closeP").onclick = closePanel;
  $("#titleIn").value = S.title;
  $("#titleIn").oninput = e => { S.title = e.target.value; applyTitle(); save(); };
  $("#titleReset").onclick = () => { S.title = DEF.title; $("#titleIn").value = S.title; applyTitle(); save(); };
  $("#glass").value = S.glass; $("#blur").value = S.blur; $("#dimR").value = S.dim;
  $("#mode").value = S.mode; $("#slide").value = S.slide; $("#units").value = S.units;
  $("#hour12").checked = S.hour12; $("#city").value = S.city === "My location" ? "" : S.city;
  $("#fx").checked = S.fx; $("#accentAuto").checked = S.accentAuto; $("#accent").value = S.accent;
  $("#glass").oninput = e => { S.glass = +e.target.value; applyStyle(); save(); };
  $("#blur").oninput = e => { S.blur = +e.target.value; applyStyle(); save(); };
  $("#dimR").oninput = e => { S.dim = +e.target.value; applyStyle(); save(); };
  $("#fx").onchange = e => { S.fx = e.target.checked; applyStyle(); save(); };
  $("#accentAuto").onchange = e => { S.accentAuto = e.target.checked; save(); refreshAccent(); };
  $("#accent").oninput = e => { S.accent = e.target.value; S.accentAuto = false; $("#accentAuto").checked = false; save(); refreshAccent(); };
  $("#mode").onchange = e => { S.mode = e.target.value; save(); renderThumbs(); if (S.mode === "fixed" && !isLive()) showBg(next()); };
  $("#slide").onchange = e => { S.slide = +e.target.value; save(); setTimer(); };
  $("#units").onchange = e => { S.units = e.target.value; save(); weather(); };
  $("#hour12").onchange = e => { S.hour12 = e.target.checked; lastKey = ""; save(); tick(); };
  $("#upload").onchange = async e => { for (const f of e.target.files) await addUpload(f); await loadImages(); renderThumbs(); };
  $("#clearUp").onclick = async () => { await clearUploads(); await loadImages(); renderThumbs(); };
  $("#citySet").onclick = setCity; $("#locBtn").onclick = useLocation;
  $("#city").addEventListener("keydown", e => { if (e.key === "Enter") setCity(); });
  $("#linkAdd").onclick = addLink;

  /* live background controls (S.lv is shared by reference with the renderer) */
  document.querySelectorAll(".chip").forEach(c => c.onclick = () => setLive(c.dataset.live));
  const lv = (id, key, kind) => {
    const el = $("#" + id);
    if (kind === "bool") { el.checked = S.lv[key]; el.onchange = () => { S.lv[key] = el.checked; save(); }; }
    else { el.value = S.lv[key]; el.oninput = el.onchange = () => { S.lv[key] = kind === "str" ? el.value : +el.value; save(); if (key === "q") Live.resize(); if (key === "vib" || key === "dim") applyStyle(); }; }
  };
  lv("lvL1", "l1", "str"); lv("lvL2", "l2", "str"); lv("lvL3", "l3", "str"); lv("lvLS", "ls");
  lv("lvVib", "vib"); lv("lvDim", "dim");
  const pb = $("#pals");
  PALS.forEach(p => {
    const b = document.createElement("button"); b.type = "button"; b.className = "pal";
    b.style.background = `linear-gradient(135deg,${p[0]},${p[1]} 55%,${p[2]})`;
    b.onclick = () => { ["l1", "l2", "l3"].forEach((k, i) => { S.lv[k] = p[i]; $("#lvL" + (i + 1)).value = p[i]; }); save(); };
    pb.appendChild(b);
  });
  lv("lvHue", "hue"); lv("lvWarp", "warp"); lv("lvNoise", "noise");
  lv("lvB1", "b1", "str"); lv("lvB2", "b2", "str"); lv("lvB3", "b3", "str"); lv("lvBC", "bc"); lv("lvBM", "bm", "bool");
  lv("lvA1", "a1", "str"); lv("lvA2", "a2", "str"); lv("lvAB", "ab"); lv("lvAM", "am", "bool");
  lv("lvSpeed", "speed"); lv("lvQ", "q"); lv("lvSaver", "saver", "bool");
  syncLiveUI();
}

(async () => {
  const st = await chrome.storage.local.get("s");
  S = { ...DEF, ...(st.s || {}), lv: { ...DEF.lv, ...((st.s && st.s.lv) || {}) } };
  if (((st.s && st.s.ver) || 0) < 3) {          // upgrade: sharper, more vivid live background
    S.ver = 3; S.live = "liquid"; S.lv.q = 1; S.lv.ab = Math.max(S.lv.ab, 1.6); S.lv.vib = DEF.lv.vib; S.lv.dim = DEF.lv.dim; save();
  }
  applyStyle(); drips(); splat(); applyTitle();
  await loadImages();
  document.body.classList.toggle("live-on", isLive());
  if (isLive()) { cur = next(); setLive(S.live); } else showBg(next());
  bind(); renderThumbs(); renderLinks(); tick(); setInterval(tick, 1000);
  setTimer(); weather();
  addEventListener("resize", alignBrand);
  setTimeout(alignBrand, 1300);
  if (!S.hint) {
    S.hint = true; save();
    const t = $("#toast"); t.classList.remove("hidden");
    setTimeout(() => t.classList.add("fade"), 4500); setTimeout(() => t.classList.add("hidden"), 5300);
  }
})();
