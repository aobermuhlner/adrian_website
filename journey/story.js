// Scroll-driven night map: a light travels the routed journey Seoul -> Zurich.
// Rendering is canvas-based: the map layer redraws only when the scroll state changes,
// and a separate light-effects layer animates the pulsing glow every frame.

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const RD = window.ROUTE_DATA;
const STOPS = RD.stops;
const STOP = Object.fromEntries(STOPS.map(s => [s.id, s]));

// Concatenate all legs into one dense line; remember where each stop sits on it
const LINE = [], SEG_LEG = [], AT = {};
AT[RD.legs[0].from] = 0;
RD.legs.forEach((leg, li) => {
  (li === 0 ? leg.coords : leg.coords.slice(1)).forEach(p => { LINE.push(p); SEG_LEG.push(li); });
  AT[leg.to] = LINE.length - 1;
});
const KM = [0];
for (let i = 1; i < LINE.length; i++) KM.push(KM[i - 1] + d3.geoDistance(LINE[i - 1], LINE[i]) * 6371);

// Countries along the route: ISO3 for the map outline, ISO2 for the flag in the HUD
const COUNTRY = {
  "South Korea": ["KOR", "kr"], "China": ["CHN", "cn"], "Kyrgyzstan": ["KGZ", "kg"], "Uzbekistan": ["UZB", "uz"],
  "Kazakhstan": ["KAZ", "kz"], "Russia": ["RUS", "ru"], "Georgia": ["GEO", "ge"], "Armenia": ["ARM", "am"],
  "Turkey": ["TUR", "tr"], "Bulgaria": ["BGR", "bg"], "Serbia": ["SRB", "rs"], "Hungary": ["HUN", "hu"],
  "Austria": ["AUT", "at"], "Switzerland": ["CHE", "ch"],
};
// Border-crossing stops are named "A → B"
const countriesOf = name => name.split(" → ").filter(n => COUNTRY[n]);
const FLAG_URL = code => `https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/${code}.svg`;

// Distance by means of transport, cumulative at every point of the line
const MODES = [["train", "Train", "#ffc66b", "Train"], ["bus", "Bus", "#6ea8ff", "Bus"],
  ["hitchhike", "Hitchhiking", "#3fc1a5", "Hitch"], ["ferry", "Ferry", "#c58cff", "Ferry"]];
const MODE_KM = [Object.fromEntries(MODES.map(([m]) => [m, 0]))];
for (let i = 1; i < LINE.length; i++) {
  const row = { ...MODE_KM[i - 1] }, mode = RD.legs[SEG_LEG[i]].mode;
  if (mode in row) row[mode] += KM[i] - KM[i - 1];
  MODE_KM.push(row);
}
const MODE_MAX = d3.max(MODES, ([m]) => MODE_KM[MODE_KM.length - 1][m]);

// Spending: each country's total and days are spread over that country's stops, so a running
// "day / CHF spent" counter can follow the light along the route
const BUDGET = RD.budget;
const BUDGET_BY_NAME = Object.fromEntries(BUDGET.map(b => [b.country, b]));
const BUDGET_BY_ISO = Object.fromEntries(BUDGET.map(b => [b.iso3, b]));
// A daily rate is only measured when both the total and the number of days are known
const perDayEstimated = b => b.source === "estimate" || b.daysSource === "estimate";
const SPEND_AT = [], DAY_AT = [];   // cumulative, per stop (in route order)
{
  const n = d3.rollup(STOPS, v => v.length, s => s.country);
  let spend = 0, days = 0;
  STOPS.forEach(s => {
    const b = BUDGET_BY_NAME[s.country];
    if (b) { spend += b.total / n.get(s.country); days += b.days / n.get(s.country); }
    SPEND_AT.push(spend); DAY_AT.push(days);
  });
}
const TRIP_SPEND = d3.sum(BUDGET, b => b.total), TRIP_DAYS = d3.sum(BUDGET, b => b.days);
const ZURICH_MONTHLY = 2000; // placeholder: replace with your own monthly cost of living in Zurich

// Route options considered (PROJECT_STRUCTURE.md, section 2) - schematic, not routed
const ALT_ROUTES = [
  { color: "--alt-blue", pts: [
    [126.978,37.567],[124.394,40.124],[116.407,39.904],[106.917,47.919],[104.297,52.287],[82.920,55.030],
    [60.605,56.839],[37.617,55.756],[30.316,59.939],[24.754,59.437],[24.105,56.950],[21.012,52.230],[16.373,48.208],[8.541,47.377]] },
  { color: "--alt-violet", pts: [
    [126.978,37.567],[124.394,40.124],[116.407,39.904],[108.940,34.341],[75.990,39.470],[72.816,40.513],[69.240,41.299],
    [66.976,39.654],[67.278,37.224],[67.110,36.709],[62.204,34.352],[59.606,36.297],[51.389,35.689],[46.292,38.080],
    [41.276,39.904],[32.860,39.930],[28.978,41.008],[23.322,42.698],[20.457,44.787],[19.040,47.498],[16.373,48.208],[8.541,47.377]] },
];

// ISO numeric ids used by world-atlas
const ISO = { KOR:"410", PRK:"408", CHN:"156", MNG:"496", KGZ:"417", UZB:"860", KAZ:"398", RUS:"643", GEO:"268",
  ARM:"051", TUR:"792", BGR:"100", SRB:"688", HUN:"348", AUT:"040", CHE:"756", AZE:"031", TKM:"795",
  IRN:"364", AFG:"004", UKR:"804", ISR:"376", IND:"356", PAK:"586" };

// Notebook "Geopolitics" map: closed borders vs. active conflict
const GEO_STATUS = { PRK:"closed", TKM:"closed", AZE:"closed", AFG:"taliban",
  RUS:"conflict", UKR:"conflict", IRN:"conflict", ISR:"conflict", IND:"conflict", PAK:"conflict" };

// Who is fighting whom: two arrows run from each side's interior and meet at the clash point.
// Points are [lon, lat]; label offset is in screen pixels from the clash point.
const WARS = [
  { a: [44, 52.5], b: [30.5, 49.5], at: [37.8, 48.2], label: "Russia – Ukraine", off: [0, 18] },
  { a: [35.0, 31.4], b: [53, 32.6], at: [44, 32.2],   label: "Israel – Iran",    off: [0, 20] },
  { a: [78.5, 24.5], b: [68.5, 27.5], at: [74.6, 33.6], label: "India – Pakistan", off: [12, -10], align: "left" },
];
// Afghanistan is not at war with a neighbour but under Taliban rule: it gets its own marker
const TALIBAN_AT = [65.5, 33.6];
// Closed countries get a thick outline and a "not passable" sign instead of a fill
const CLOSED_LABELS = [
  { code: "PRK", at: [127.2, 40.2], name: "North Korea",  note: "border closed", left: true },
  { code: "TKM", at: [59.0, 39.4],  name: "Turkmenistan", note: "not passable" },
  { code: "AZE", at: [47.8, 40.4],  name: "Azerbaijan",   note: "land border closed", left: true },
];

// Visa table from PROJECT_STRUCTURE.md: 0 free, 1 arrival/e-visa, 2 required, 3 very difficult
const VISA = {
  CHN: { swiss:0, german:2, american:2, british:0, korean:0 },
  KGZ: { swiss:0, german:0, american:0, british:0, korean:2 },
  UZB: { swiss:0, german:0, american:0, british:0, korean:2 },
  KAZ: { swiss:0, german:0, american:0, british:0, korean:0 },
  RUS: { swiss:3, german:3, american:3, british:3, korean:3 },
  GEO: { swiss:0, german:0, american:0, british:0, korean:0 },
  ARM: { swiss:0, german:0, american:0, british:0, korean:1 },
  TUR: { swiss:0, german:0, american:1, british:0, korean:0 },
  BGR: { swiss:0, german:0, american:0, british:0, korean:0 },
  SRB: { swiss:0, german:0, american:0, british:0, korean:0 },
  HUN: { swiss:0, german:0, american:0, british:0, korean:0 },
  AUT: { swiss:0, german:0, american:0, british:0, korean:0 },
};
const VISA_VARS = ["--visa-free", "--visa-arrival", "--visa-req", "--visa-hard"];

// Story steps: where the light is, where the camera looks, which overlay shows.
// plans: how strongly the planned routes stay visible (faint behind the conflict and visa maps)
const STEPS = {
  intro:    { at: "seoul",     cam: [80, 42, 1.0],   overlay: null,     future: 0, full: 1 },
  seoul:    { at: "seoul",     cam: [127, 37.5, 5],  overlay: null,     future: 0 },
  flight:   { at: "seoul",     cam: [68, 44, 1.0],   overlay: "flight", future: 0 },
  routes:   { at: "seoul",     cam: [68, 46, 1.0],   overlay: "routes", future: 0, plans: 1 },
  geo:      { at: "seoul",     cam: [72, 40, 1.15],  overlay: "geo",    future: 0, plans: .5 },
  visa:     { at: "seoul",     cam: [76, 43, 1.25],   overlay: "visa",   future: 1, plans: .5 },
  depart:   { at: "dandong",   cam: [123, 38.8, 5],  overlay: null,     future: 1 },
  china:    { at: "kashgar",   cam: [98, 38.5, 2.0], overlay: null,     future: 1 },
  border1:  { at: "osh",       cam: [74.2, 40, 7],   overlay: null,     future: 1, pulse: "irkeshtam" },
  kyrgyz:   { at: "bishkek",   cam: [75.2, 42.3, 5], overlay: null,     future: 1 },
  karakol:  { at: "karakol",   cam: [78, 42.4, 7],   overlay: null,     future: 1, video: "karakol_horse" },
  yurts:    { at: "karakol",   cam: [77.2, 42.2, 5.5], overlay: null,   future: 1, video: "yurt_camp" },
  south:    { at: "bishkek2",  cam: [73.6, 42.2, 5], overlay: null,     future: 1, video: "truck_road" },
  tashkomur:{ at: "tashkomur", cam: [72.5, 41.4, 8], overlay: null,     future: 1, video: "tashkomur_river" },
  uzbek:    { at: "tashkent2", cam: [65, 40.4, 4.5], overlay: null,     future: 1 },
  kazakh:   { at: "atyrau",    cam: [63, 44, 2.0],   overlay: null,     future: 1, pulse: "almaty" },
  russia:   { at: "lars",      cam: [47, 45.5, 3.6], overlay: null,     future: 1 },
  caucasus: { at: "batumi",    cam: [43.5, 41.8, 6], overlay: null,     future: 1 },
  turkey:   { at: "istanbul",  cam: [35, 39.3, 3.6], overlay: null,     future: 1 },
  balkans:  { at: "vienna",    cam: [22, 45.3, 3.6], overlay: null,     future: 1 },
  home:     { at: "zurich",    cam: [12, 47.4, 6.5], overlay: null,     future: 1 },
  budget:   { at: "zurich",    cam: [68, 43, 1.0],   overlay: "budget", future: 1 },
  finale:   { at: "zurich",    cam: [68, 43, 1.0],   overlay: null,     future: 1 },
  next:     { at: "zurich",    cam: [68, 43, 1.0],   overlay: null,     future: 1, full: 1 },
};

// Hours in transit per stretch, from the presentation slides
const HOURS = [
  ["China", 103], ["Uzbek. → Kaz.", 59], ["Kaz. → Russia", 44],
  ["Georgia → Turkey", 24], ["Turkey → Austria", 36], ["Austria → CH", 16],
];

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COL = {};
["--night", "--land-dark", "--land-dark-edge", "--land-lit", "--land-lit-edge", "--glow",
 "--alt-blue", "--alt-violet", "--closed", "--conflict", "--taliban", ...VISA_VARS].forEach(v => COL[v] = css(v));

const baseCv = document.getElementById("map"), fxCv = document.getElementById("fx");
const bctx = baseCv.getContext("2d"), fctx = fxCv.getContext("2d");

let W, H, DPR, projection, worlds;   // worlds: { fine, coarse } topologies, Eurasia only
let LOD = {}, landPath, edgePath, countryPath = {}, altPaths = [], flightPath, futurePath;
let P = [], CUM = [], TOTAL = 0;
let WAR_P = [], TALIBAN_P, CLOSED_P = [];  // the geopolitics markers in base projected coordinates
let view = null;        // current camera + route state
let dirty = true;
let nationality = "swiss";
let hatch = null;       // diagonal pattern marking estimated values

const isWide = () => innerWidth > 760;
function mapArea() {    // the part of the screen not covered by story cards
  if (isWide()) return { x0: Math.min(W * .06 + 450, W * .55), y0: 0, x1: W, y1: H };
  return { x0: 0, y0: 0, x1: W, y1: H * .62 };
}

function toPath2D(geo) {
  const p = new Path2D();
  d3.geoPath(projection, p)(geo);
  return p;
}
function lineToPath2D(pts) {
  const p = new Path2D();
  pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]));
  return p;
}

function setup() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 1.5);
  for (const c of [baseCv, fxCv]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }

  const A = mapArea();
  projection = d3.geoMercator().fitExtent([[A.x0 + 20, A.y0 + 40], [A.x1 - 20, A.y1 - 20]],
    { type: "MultiPoint", coordinates: [[-5, 30], [140, 30], [-5, 62], [140, 62]] });

  // Cache all geometry as Path2D in base projected coordinates; the camera is just a transform
  // Two levels of detail: coarse (110m) for wide views, fine (50m) when zoomed in
  for (const [name, w] of Object.entries(worlds)) {
    LOD[name] = {
      land: toPath2D({ type: "FeatureCollection", features: w.features }),
      edge: toPath2D(topojson.mesh(w.topo, { type: "GeometryCollection", geometries: w.geoms })),
    };
  }
  countryPath = {};
  const wanted = new Set(Object.values(ISO));
  worlds.fine.features.forEach(f => { if (wanted.has(f.id)) countryPath[f.id] = toPath2D(f); });

  P = LINE.map(c => projection(c));
  CUM = [0];
  for (let i = 1; i < P.length; i++) CUM.push(CUM[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  TOTAL = CUM[CUM.length - 1];
  // The faint dashed preview doesn't need full detail
  futurePath = lineToPath2D(P.filter((q, j) => j === 0 || j === P.length - 1 || j % 3 === 0));
  altPaths = ALT_ROUTES.map(r => ({ color: COL[r.color], path: lineToPath2D(r.pts.map(projection)) }));
  WAR_P = WARS.map(w => ({ ...w, a: projection(w.a), b: projection(w.b), at: projection(w.at) }));
  TALIBAN_P = projection(TALIBAN_AT);
  CLOSED_P = CLOSED_LABELS.map(l => ({ ...l, at: projection(l.at) }));
  const arc = d3.geoInterpolate(STOP.seoul.c, STOP.zurich.c);
  flightPath = toPath2D({ type: "LineString", coordinates: d3.range(0, 1.001, .02).map(arc) });

  // Hatch pattern for estimated (not measured) budget values
  const pc = document.createElement("canvas"); pc.width = pc.height = 8;
  const px = pc.getContext("2d");
  px.strokeStyle = "rgba(255,198,107,.55)"; px.lineWidth = 1.2;
  px.beginPath(); px.moveTo(0, 8); px.lineTo(8, 0); px.moveTo(-2, 2); px.lineTo(2, -2); px.moveTo(6, 10); px.lineTo(10, 6); px.stroke();
  hatch = bctx.createPattern(pc, "repeat");

  dirty = true;
  onScroll();
}

// Trail path up to point index i (+ the interpolated head p), skipping off-screen and sub-pixel points
function trailPath(i, p, k, tx, ty) {
  const m = 80 / k, x0 = -tx / k - m, y0 = -ty / k - m, x1 = (W - tx) / k + m, y1 = (H - ty) / k + m;
  const minStep = 1.2 / k;
  const inView = q => q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1;
  const path = new Path2D();
  let last = null, lastIn = false;
  const visit = (q, force) => {
    const vin = inView(q);
    if (!last) { path.moveTo(q[0], q[1]); last = q; lastIn = vin; return; }
    if (!vin && !lastIn) { path.moveTo(q[0], q[1]); last = q; return; }
    if (!force && vin && lastIn && Math.abs(q[0] - last[0]) + Math.abs(q[1] - last[1]) < minStep) return;
    path.lineTo(q[0], q[1]); last = q; lastIn = vin;
  };
  for (let j = 0; j <= i; j++) visit(P[j], false);
  visit(p, true);
  return path;
}

// Point along the projected route at a given length
function pointAt(len) {
  len = Math.max(0, Math.min(TOTAL, len));
  const i = Math.min(d3.bisectRight(CUM, len), CUM.length - 1);
  if (i === 0) return { p: P[0], i: 0, t: 0 };
  const a = P[i - 1], b = P[i], t = (len - CUM[i - 1]) / (CUM[i] - CUM[i - 1] || 1);
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i: i - 1, t };
}

// ---------------------------------------------------------------------------
// Map layer (redrawn only when the view changes)
// ---------------------------------------------------------------------------
function drawBase() {
  const { k, tx, ty, len, w } = view;
  const c = bctx, cw = baseCv.width, ch = baseCv.height;
  const toMap = ctx => ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * tx, DPR * ty);
  const sx = p => tx + k * p[0], sy = p => ty + k * p[1];

  const { p, i } = pointAt(len);
  const trail = trailPath(i, p, k, tx, ty);
  ({ land: landPath, edge: edgePath } = k < 2.5 ? LOD.coarse : LOD.fine);

  // 1. The dark world, drawn on a transparent canvas so the light can be clipped to land
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
  c.clearRect(0, 0, cw, ch);
  toMap(c);
  c.fillStyle = COL["--land-dark"]; c.fill(landPath);

  // 2. Soft light around the trail, visited stops and the traveler, painted only onto land
  //    (source-atop keeps it off the sea, so no separate mask canvas is needed)
  const lit = COL["--land-lit"], litRGB = d3.rgb(lit);
  const litA = a => `rgba(${litRGB.r},${litRGB.g},${litRGB.b},${a})`;
  c.globalCompositeOperation = "source-atop";
  c.strokeStyle = litA(.45); c.lineWidth = 60 / k; c.lineCap = c.lineJoin = "round"; c.stroke(trail);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const softDot = (x, y, r, a) => {
    if (!isFinite(x + y + r) || x < -r || y < -r || x > W + r || y > H + r) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, litA(a)); g.addColorStop(.55, litA(a * .35)); g.addColorStop(1, litA(0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  };
  const passed = STOPS.filter(s => CUM[AT[s.id]] <= len + .01);
  passed.forEach(s => softDot(sx(P[AT[s.id]]), sy(P[AT[s.id]]), 70, .6));
  softDot(sx(p), sy(p), view.reveal, 1);
  c.globalCompositeOperation = "source-over";
  toMap(c);
  c.lineWidth = .6 / k; c.strokeStyle = "rgba(120,150,200,.22)"; c.stroke(edgePath);
  // Night sky behind everything
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "destination-over";
  c.fillStyle = COL["--night"]; c.fillRect(0, 0, cw, ch);
  c.globalCompositeOperation = "source-over";

  // 3. Country overlays (crossfade with scroll)
  toMap(c);
  if (w.geo > 0) fillCountries(c, code => GEO_STATUS[code] === "conflict" ? COL["--conflict"] :
    GEO_STATUS[code] === "taliban" ? COL["--taliban"] : null, .38 * w.geo);
  if (w.visa > 0) fillCountries(c, code => {
    const v = VISA[code]; return v ? COL[VISA_VARS[v[nationality]]] : null;
  }, .4 * w.visa);

  // The country the traveler is in: a soft glowing outline (hidden while a thematic overlay is up)
  const hl = 1 - Math.min(1, w.geo + w.visa + w.budget + w.routes + w.flight);
  if (hl > 0 && view.here) {
    for (const code of view.here) {
      const path = countryPath[ISO[code]];
      if (!path) continue;
      c.save();
      c.globalAlpha = .07 * hl; c.fillStyle = COL["--glow"]; c.fill(path);
      c.globalAlpha = .9 * hl; c.strokeStyle = COL["--glow"]; c.lineJoin = "round";
      c.shadowColor = COL["--glow"]; c.shadowBlur = 14 * DPR;
      c.lineWidth = 1.4 / k; c.stroke(path);
      c.restore();
    }
  }

  if (w.budget > 0) {
    // Brighter = more expensive per day; hatched = estimated daily rate
    const maxDay = d3.max(BUDGET, b => b.perDay);
    for (const b of BUDGET) {
      const path = countryPath[ISO[b.iso3]];
      if (!path) continue;
      c.globalAlpha = w.budget * (.12 + .6 * b.perDay / maxDay);
      c.fillStyle = COL["--glow"]; c.fill(path);
      if (perDayEstimated(b)) {
        c.save(); c.globalAlpha = w.budget; c.clip(path);
        c.setTransform(DPR, 0, 0, DPR, 0, 0); c.fillStyle = hatch; c.fillRect(0, 0, W, H);
        c.restore();
      }
    }
    c.globalAlpha = 1;
  }

  // 4. Lines: whole route preview, alternatives, flight arc
  c.lineCap = c.lineJoin = "round";
  if (w.future > 0) {
    c.globalAlpha = .18 * w.future; c.strokeStyle = COL["--glow"]; c.lineWidth = 1.2 / k;
    c.setLineDash([2 / k, 5 / k]); c.stroke(futurePath);
  }
  if (w.plans > 0) {
    c.globalAlpha = w.plans; c.lineWidth = 2 / k; c.setLineDash([6 / k, 5 / k]);
    altPaths.forEach(a => { c.strokeStyle = a.color; c.stroke(a.path); });
    c.strokeStyle = COL["--glow"]; c.stroke(futurePath);
  }
  if (w.flight > 0) {
    c.globalAlpha = .6 * w.flight; c.strokeStyle = "#fff"; c.lineWidth = 1.5 / k;
    c.setLineDash([3 / k, 6 / k]); c.stroke(flightPath);
  }
  c.setLineDash([]); c.globalAlpha = 1;

  if (w.geo > 0) drawGeoMarkers(c, w.geo, sx, sy);
  if (w.visa > 0) drawClosed(c, w.visa, k, sx, sy);

  // 5. The glowing trail
  [[14, "rgba(255,138,61,.10)"], [6, "rgba(255,198,107,.28)"], [1.6, "rgba(255,243,214,.95)"]].forEach(([lw, col]) => {
    c.lineWidth = lw / k; c.strokeStyle = col; c.stroke(trail);
  });

  // 6. City lights at every visited stop
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalCompositeOperation = "lighter";
  passed.forEach(s => {
    const x = sx(P[AT[s.id]]), y = sy(P[AT[s.id]]);
    if (!isFinite(x + y)) return;
    const g = c.createRadialGradient(x, y, 0, x, y, 18);
    g.addColorStop(0, "rgba(255,243,214,.6)"); g.addColorStop(.3, "rgba(255,198,107,.3)"); g.addColorStop(1, "rgba(255,138,61,0)");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 18, 0, 7); c.fill();
  });
  c.globalCompositeOperation = "source-over";

  // 7. Labels (screen space, constant size) once zoomed in
  if (k >= 2) {
    c.font = "500 12px Inter, sans-serif"; c.lineWidth = 3; c.strokeStyle = COL["--night"]; c.lineJoin = "round";
    passed.forEach(s => {
      if (s.kind === "repeat") return;
      const x = sx(P[AT[s.id]]) + 8, y = sy(P[AT[s.id]]) - 8;
      if (x < -50 || x > W + 50 || y < -20 || y > H + 20) return;
      c.fillStyle = s.kind === "minor" ? "#a9b3c4" : "#eef1f6";
      c.strokeText(s.name, x, y); c.fillText(s.name, x, y);
    });
  }
}

// Closed countries (visa map): thick red outline with a dark halo, plus a "no entry" sign and a note
function drawClosed(c, alpha, k, sx, sy) {
  c.save();
  c.lineJoin = "round";
  for (const { code } of CLOSED_LABELS) {
    const path = countryPath[ISO[code]];
    if (!path) continue;
    c.globalAlpha = alpha;
    c.strokeStyle = COL["--night"]; c.lineWidth = 6 / k; c.stroke(path);
    c.strokeStyle = COL["--closed"]; c.lineWidth = 3.2 / k; c.stroke(path);
  }

  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalAlpha = alpha; c.textBaseline = "middle";
  const scr = q => [sx(q), sy(q)];
  for (const l of CLOSED_P) {
    const [lx, ly] = scr(l.at), red = COL["--closed"];
    c.beginPath(); c.arc(lx, ly, 8, 0, 7); c.fillStyle = red; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = COL["--night"]; c.stroke();
    c.fillStyle = "#fff"; c.fillRect(lx - 4.5, ly - 1.4, 9, 2.8);
    const tx = l.left ? lx - 12 : lx + 12;
    c.textAlign = l.left ? "right" : "left"; c.lineWidth = 3; c.strokeStyle = COL["--night"];
    c.font = "600 11px Inter, sans-serif";
    c.strokeText(l.name, tx, ly - 6); c.fillStyle = "#ffb3b3"; c.fillText(l.name, tx, ly - 6);
    c.font = "500 10px Inter, sans-serif";
    c.strokeText(l.note.toUpperCase(), tx, ly + 7); c.fillStyle = red; c.fillText(l.note.toUpperCase(), tx, ly + 7);
  }
  c.restore();
}

// War arrows and the Taliban badge, drawn in screen space so they keep a constant size
function drawGeoMarkers(c, alpha, sx, sy) {
  const scr = q => [sx(q), sy(q)];
  c.save();
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalAlpha = alpha; c.lineCap = c.lineJoin = "round";
  const war = COL["--conflict"];

  const arrow = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy);
    if (len < 14) return;
    const ux = dx / len, uy = dy / len, gap = 7, head = 8;
    const ex = to[0] - ux * gap, ey = to[1] - uy * gap;
    const shaft = new Path2D(); shaft.moveTo(from[0], from[1]); shaft.lineTo(ex - ux * head * .6, ey - uy * head * .6);
    const tip = new Path2D(); tip.moveTo(ex, ey);
    tip.lineTo(ex - ux * head - uy * head * .55, ey - uy * head + ux * head * .55);
    tip.lineTo(ex - ux * head + uy * head * .55, ey - uy * head - ux * head * .55); tip.closePath();
    // Dark halo first so the arrow reads on top of the orange country fill
    c.strokeStyle = COL["--night"]; c.lineWidth = 5; c.stroke(shaft); c.lineWidth = 4; c.stroke(tip);
    c.strokeStyle = war; c.lineWidth = 2.2; c.stroke(shaft);
    c.fillStyle = war; c.fill(tip);
  };
  const burst = (x, y, r) => {   // a small spiked "clash" mark
    c.beginPath();
    for (let j = 0; j < 16; j++) {
      const rr = j % 2 ? r * .45 : r, t = j * Math.PI / 8;
      c.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
    }
    c.closePath();
    c.fillStyle = "#fff3d6"; c.strokeStyle = war; c.lineWidth = 1.5; c.fill(); c.stroke();
  };

  c.font = "600 11px Inter, sans-serif"; c.textBaseline = "middle";
  const label = (text, x, y, align) => {
    c.textAlign = align; c.lineWidth = 3; c.strokeStyle = COL["--night"];
    c.strokeText(text, x, y); c.fillStyle = "#ffd2a6"; c.fillText(text, x, y);
  };

  for (const wp of WAR_P) {
    const a = scr(wp.a), b = scr(wp.b), at = scr(wp.at);
    arrow(a, at); arrow(b, at); burst(at[0], at[1], 7);
    label(wp.label, at[0] + wp.off[0], at[1] + wp.off[1], wp.align || "center");
  }

  // Taliban badge: a dark disc with a flag on a pole
  const [x, y] = scr(TALIBAN_P), tal = COL["--taliban"];
  c.beginPath(); c.arc(x, y, 12, 0, 7);
  c.fillStyle = COL["--night"]; c.fill(); c.strokeStyle = tal; c.lineWidth = 1.5; c.stroke();
  c.strokeStyle = tal; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(x - 4.5, y + 7); c.lineTo(x - 4.5, y - 7); c.stroke();
  c.fillStyle = tal; c.beginPath();
  c.moveTo(x - 4.5, y - 7); c.lineTo(x + 6, y - 5.2); c.lineTo(x + 3.5, y - 2.8); c.lineTo(x + 6, y - .4); c.lineTo(x - 4.5, y + .8);
  c.closePath(); c.fill();
  label("Taliban rule", x, y + 22, "center");

  c.restore();
}

function fillCountries(c, colorFor, alpha) {
  c.globalAlpha = alpha;
  for (const [code, id] of Object.entries(ISO)) {
    const col = colorFor(code);
    if (col && countryPath[id]) { c.fillStyle = col; c.fill(countryPath[id]); }
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Light-effects layer (animated every frame, cheap)
// ---------------------------------------------------------------------------
function drawFx(now) {
  const c = fctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, fxCv.width, fxCv.height);
  if (!view) return;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const { k, tx, ty } = view;
  const [x, y] = [tx + k * view.p[0], ty + k * view.p[1]];
  if (!isFinite(x + y)) return;   // e.g. a zero-size viewport during load
  const ph = (now / 1800) % 1;

  c.globalCompositeOperation = "lighter";
  const g = c.createRadialGradient(x, y, 0, x, y, 90);
  g.addColorStop(0, "rgba(255,243,214,1)"); g.addColorStop(.12, "rgba(255,198,107,.85)");
  g.addColorStop(.45, "rgba(255,138,61,.18)"); g.addColorStop(1, "rgba(255,138,61,0)");
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 90, 0, 7); c.fill();
  c.globalCompositeOperation = "source-over";

  c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill();
  c.strokeStyle = `rgba(255,198,107,${1 - ph})`; c.lineWidth = 1.5;
  c.beginPath(); c.arc(x, y, 6 + ph * 28, 0, 7); c.stroke();

  if (view.w.geo > 0) {
    c.lineWidth = 1.5;
    WAR_P.forEach(wp => {
      const ax = tx + k * wp.at[0], ay = ty + k * wp.at[1];
      c.strokeStyle = `rgba(255,154,61,${(1 - ph) * view.w.geo})`;
      c.beginPath(); c.arc(ax, ay, 8 + ph * 18, 0, 7); c.stroke();
    });
  }

  if (view.pulse) {
    const q = P[AT[view.pulse]], ax = tx + k * q[0], ay = ty + k * q[1];
    c.strokeStyle = `rgba(255,90,90,${1 - ph})`; c.lineWidth = 2;
    c.beginPath(); c.arc(ax, ay, 10 + ph * 30, 0, 7); c.stroke();
  }
}

// ---------------------------------------------------------------------------
// Scroll -> interpolate between neighbouring steps (anchored at step centers)
// ---------------------------------------------------------------------------
const stepEls = [...document.querySelectorAll(".step")];
const stepDefs = stepEls.map(el => ({ ...STEPS[el.dataset.step], key: el.dataset.step }));
const ease = d3.easeCubicInOut;
const hudCountry = document.getElementById("hud-country"), hudMeta = document.getElementById("hud-meta"),
      hudMode = document.getElementById("hud-mode"), hudFlags = document.getElementById("hud-flags"), hudSpend = document.getElementById("hud-spend"), hudBar = document.getElementById("hud-bar");
const MODE_LABEL = { train: "by train", bus: "by bus", hitchhike: "hitchhiking", ferry: "by ferry" };

function onScroll() {
  if (!projection) return;
  const mid = innerHeight / 2;
  const centers = stepEls.map(el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
  let i = centers.findIndex(c => c > mid), a, b, t;
  if (i === 0) { a = b = stepDefs[0]; t = 0; }
  else if (i === -1) { a = b = stepDefs[stepDefs.length - 1]; t = 0; }
  else { a = stepDefs[i - 1]; b = stepDefs[i]; t = ease(Math.max(0, Math.min(1, (mid - centers[i - 1]) / (centers[i] - centers[i - 1])))); }

  const lenA = CUM[AT[a.at]], lenB = CUM[AT[b.at]];
  const len = lenA + (lenB - lenA) * t;
  // Zoom interpolated in log space so it feels like a smooth flight
  const z = Math.exp(Math.log(a.cam[2]) * (1 - t) + Math.log(b.cam[2]) * t);
  const lon = a.cam[0] + (b.cam[0] - a.cam[0]) * t, lat = a.cam[1] + (b.cam[1] - a.cam[1]) * t;
  const full = (a.full || 0) * (1 - t) + (b.full || 0) * t;

  // Full-bleed steps (centered title cards) widen the view to the whole screen
  const A = mapArea();
  const k = z * (1 + full * (W / (A.x1 - A.x0) - 1));
  const [x, y] = projection([lon, lat]);
  const cx = (A.x0 + A.x1) / 2 * (1 - full) + W / 2 * full, cy = (A.y0 + A.y1) / 2 * (1 - full) + H / 2 * full;

  const w = { geo: 0, visa: 0, routes: 0, flight: 0, budget: 0, future: (a.future || 0) * (1 - t) + (b.future || 0) * t,
             plans: (a.plans || 0) * (1 - t) + (b.plans || 0) * t };
  if (a.overlay) w[a.overlay] += 1 - t;
  if (b.overlay) w[b.overlay] += t;

  setVideos(a, b, t, i);

  const pos = pointAt(len);
  view = { k, tx: cx - k * x, ty: cy - k * y, len, w, p: pos.p,
           pulse: t < .5 ? a.pulse : b.pulse, reveal: a.key === "intro" && t < .5 ? 220 : 300 };
  dirty = true;
  updateHud(pos, len);
}

// Background footage fades in like the map overlays; only the clips of nearby steps get loaded
const BG_OPACITY = .5;
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bgVideos = Object.fromEntries([...document.querySelectorAll("#bgvideo video")].map(v => [v.dataset.id, v]));
const bgShade = document.querySelector("#bgvideo .shade");

function setVideos(a, b, t, i) {
  const w = {};
  if (a.video) w[a.video] = (w[a.video] || 0) + 1 - t;
  if (b.video) w[b.video] = (w[b.video] || 0) + t;
  const next = i >= 0 && stepDefs[i + 1] ? stepDefs[i + 1].video : null;
  for (const [id, v] of Object.entries(bgVideos)) {
    const o = w[id] || 0;
    v.style.opacity = o * BG_OPACITY;
    if (o > 0 || id === next) v.preload = "auto";
    if (o > 0 && v.paused && !REDUCED_MOTION) v.play().catch(() => {});
    else if (o === 0 && !v.paused) v.pause();
  }
  bgShade.style.opacity = Math.max(0, ...Object.values(w));
}

// Small clips inside cards: play while on screen, muted until the viewer asks for sound
document.querySelectorAll(".clip").forEach(clip => {
  const v = clip.querySelector("video"), btn = clip.querySelector("button");
  btn.addEventListener("click", () => {
    v.muted = !v.muted;
    btn.textContent = v.muted ? "Sound on" : "Sound off";
    if (!v.muted && v.paused) v.play().catch(() => {});
  });
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !REDUCED_MOTION) { v.preload = "auto"; v.play().catch(() => {}); }
    else if (!e.isIntersecting) v.pause();
  }, { threshold: .6 }).observe(v);
});

const modeRows = MODES.map(([m, label, color, short]) => {
  const row = document.createElement("div");
  row.className = "mode-row";
  row.innerHTML = `<span><span class="full">${label}</span><span class="short">${short}</span></span><div class="track"><i style="background:${color}"></i></div><span class="v">0 km</span>`;
  document.getElementById("hud-modes").appendChild(row);
  return { row, fill: row.querySelector("i"), v: row.querySelector(".v") };
});

function updateHud(pos, len) {
  const leg = RD.legs[SEG_LEG[Math.min(pos.i + 1, SEG_LEG.length - 1)]];
  const arrived = len >= CUM[AT[leg.to]] - .01, atStart = len <= CUM[AT[leg.from]] + .01;
  const here = arrived ? STOP[leg.to] : STOP[leg.from];
  const km = KM[pos.i] + (KM[pos.i + 1] != null ? (KM[pos.i + 1] - KM[pos.i]) * pos.t : 0);
  const names = countriesOf(here.country);
  hudCountry.textContent = names.length ? names.join(" → ") : here.country;
  const key = names.join("|");
  if (hudFlags.dataset.key !== key) {
    hudFlags.dataset.key = key;
    hudFlags.innerHTML = names.map(n => `<img src="${FLAG_URL(COUNTRY[n][1])}" alt="">`).join("<span>→</span>");
  }
  view.here = names.map(n => COUNTRY[n][0]);
  // Kilometres per means of transport so far; bars share one scale so they grow with the trip
  const segMode = leg.mode, a = MODE_KM[pos.i], b = MODE_KM[pos.i + 1] || a;
  MODES.forEach(([m], j) => {
    const km = a[m] + (b[m] - a[m]) * pos.t, r = modeRows[j];
    r.fill.style.width = (km / MODE_MAX * 100) + "%";
    r.v.textContent = Math.round(km).toLocaleString("en") + " km";
    r.row.classList.toggle("on", !arrived && !atStart && m === segMode);   // the mode being used right now
  });
  hudMeta.textContent = `${here.name} · ${Math.round(km).toLocaleString("en")} km`;
  // Running day / spend counter, interpolated between the stops on either side
  const si = STOPS.indexOf(STOP[leg.from]), sj = STOPS.indexOf(STOP[leg.to]);
  const f = Math.max(0, Math.min(1, (len - CUM[AT[leg.from]]) / (CUM[AT[leg.to]] - CUM[AT[leg.from]] || 1)));
  const day = DAY_AT[si] + (DAY_AT[sj] - DAY_AT[si]) * f, spent = SPEND_AT[si] + (SPEND_AT[sj] - SPEND_AT[si]) * f;
  hudSpend.textContent = len > 0 ? `Day ~${Math.max(1, Math.round(day))} · CHF ${Math.round(spent).toLocaleString("en")} spent` : "";
  hudMode.textContent = arrived || atStart ? "" : MODE_LABEL[leg.mode] || leg.mode;
  hudBar.style.width = (len / TOTAL * 100) + "%";
}

// Passport toggle
document.querySelectorAll("#nat button").forEach(btn => btn.addEventListener("click", () => {
  nationality = btn.dataset.nat;
  document.querySelectorAll("#nat button").forEach(b => b.setAttribute("aria-pressed", b === btn));
  dirty = true;
}));

// ---------------------------------------------------------------------------
// Small inline charts
// ---------------------------------------------------------------------------
function bars(el, rows, fmt, muted = [], estimated = []) {
  const max = d3.max(rows, r => r[1]);
  el.innerHTML = rows.map(([label, v, tip]) => {
    const est = estimated.includes(label);
    return `
    <div class="bar-row" title="${tip || `${label}: ${fmt(v)}`}">
      <span>${label}</span>
      <div class="track"><div class="fill ${muted.includes(label) ? "muted" : ""} ${est ? "est" : ""}" style="width:${v / max * 100}%"></div></div>
      <span class="v">${est ? "~" : ""}${fmt(v)}</span>
    </div>`;
  }).join("");
}
const routedKm = Math.round(KM[KM.length - 1] / 100) * 100;
bars(document.getElementById("chart-compare"), [["Flight", 8900], ["Main route", routedKm]],
  v => (v / 1000).toLocaleString("en", { maximumFractionDigits: 1 }) + "k km", ["Flight"]);
bars(document.getElementById("chart-hours"), HOURS, v => v + " h");

// Budget chapter
const chf = v => "CHF " + Math.round(v).toLocaleString("en");
bars(document.getElementById("chart-perday"),
  BUDGET.map(b => [b.country, b.perDay,
    `${b.country}: ~CHF ${b.perDay}/day × ${b.days} days = ${chf(b.total)}` +
    ` (total: ${b.source === "estimate" ? "estimate" : "Revolut"}, days: ${b.daysSource === "estimate" ? "estimate" : "Revolut"})` +
    (b.note ? ` · ${b.note}` : "")]),
  v => v, [], BUDGET.filter(perDayEstimated).map(b => b.country));
const zurichSame = ZURICH_MONTHLY * TRIP_DAYS / 30;
bars(document.getElementById("chart-zurich"),
  [["Whole trip", TRIP_SPEND], ["Zurich, same time", zurichSame,
    `Placeholder: CHF ${ZURICH_MONTHLY}/month × ${(TRIP_DAYS / 30).toFixed(1)} months. Replace with your own Zurich costs`]],
  v => (v / 1000).toFixed(1) + "k", ["Zurich, same time"], ["Zurich, same time"]);
document.getElementById("trip-perday").textContent = Math.round(TRIP_SPEND / TRIP_DAYS);
document.getElementById("trip-total").textContent = chf(TRIP_SPEND);
document.getElementById("trip-days").textContent = TRIP_DAYS;
document.getElementById("trip-measured").textContent =
  Math.round(100 * d3.sum(BUDGET.filter(b => b.source !== "estimate"), b => b.total) / TRIP_SPEND) + "%";

// Per-chapter cost tags, generated from the budget data
const CHAPTER_COUNTRIES = { china: ["CHN"], kyrgyz: ["KGZ"], uzbek: ["UZB"], kazakh: ["KAZ"], russia: ["RUS"],
  caucasus: ["GEO", "ARM"], turkey: ["TUR"], balkans: ["BGR", "SRB", "HUN", "AUT"] };
for (const [step, codes] of Object.entries(CHAPTER_COUNTRIES)) {
  const card = document.querySelector(`[data-step=${step}] .card`);
  let tags = card.querySelector(".tags");
  if (!tags) { tags = document.createElement("div"); tags.className = "tags"; card.appendChild(tags); }
  codes.map(c => BUDGET_BY_ISO[c]).filter(Boolean).forEach(b => {
    const est = perDayEstimated(b);
    tags.insertAdjacentHTML("beforeend", `<span class="tag ${est ? "est" : ""}" title="${est ? "Estimate" : "From Revolut"}">` +
      `${codes.length > 1 ? b.country + " " : ""}${est ? "~" : ""}CHF ${b.perDay}/day</span>`);
  });
}

// ---------------------------------------------------------------------------
addEventListener("scroll", onScroll, { passive: true });
let resizeT;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(setup, 150); });

requestAnimationFrame(function loop(now) {
  if (dirty && view) { drawBase(); dirty = false; }
  drawFx(now);
  requestAnimationFrame(loop);
});

// Keep only what can ever be on screen (Europe, Africa's north, Asia): far less to rasterize per frame
function eurasia(topo) {
  const geoms = topo.objects.countries.geometries.filter(g => {
    const [[x0, y0], [x1, y1]] = d3.geoBounds(topojson.feature(topo, g));
    return y1 > 5 && (x1 > -30 || x0 > -30) && x0 < 180 && y0 > -10 || ISO_SET.has(g.id);
  });
  return { topo, geoms, features: geoms.map(g => topojson.feature(topo, g)) };
}
const ISO_SET = new Set(Object.values(ISO));
const ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/";
Promise.all([d3.json(ATLAS + "countries-50m.json"), d3.json(ATLAS + "countries-110m.json")]).then(([fine, coarse]) => {
  worlds = { fine: eurasia(fine), coarse: eurasia(coarse) };
  setup();
});
