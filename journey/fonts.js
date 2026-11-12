// Font explorer (draft tool): open the page with ?fonts to get a picker in the bottom-left corner.
// Each pairing sets --font-display (headings, numbers) and --font-body (text, map labels).
// The choice is remembered in this browser, so it sticks while you scroll through the story.
(() => {
  const PAIRS = [
    { id: "fraunces", name: "Fraunces + Inter", note: "current: soft editorial serif",
      display: '"Fraunces", serif', body: '"Inter", system-ui, sans-serif', css: null },
    { id: "newsreader", name: "Newsreader + Inter", note: "newspaper feature",
      display: '"Newsreader", serif', body: '"Inter", system-ui, sans-serif',
      css: "family=Newsreader:opsz,wght@6..72,300;6..72,600" },
    { id: "playfair", name: "Playfair Display + Source Sans 3", note: "classic magazine",
      display: '"Playfair Display", serif', body: '"Source Sans 3", sans-serif',
      css: "family=Playfair+Display:wght@400;600&family=Source+Sans+3:wght@400;500;600" },
    { id: "instrument", name: "Instrument Serif + Inter Tight", note: "elegant, thin headlines",
      display: '"Instrument Serif", serif', body: '"Inter Tight", sans-serif',
      css: "family=Instrument+Serif&family=Inter+Tight:wght@400;500;600" },
    { id: "dm", name: "DM Serif Display + DM Sans", note: "bold contrast, friendly",
      display: '"DM Serif Display", serif', body: '"DM Sans", sans-serif',
      css: "family=DM+Serif+Display&family=DM+Sans:wght@400;500;600" },
    { id: "cormorant", name: "Cormorant Garamond + Work Sans", note: "travel journal, literary",
      display: '"Cormorant Garamond", serif', body: '"Work Sans", sans-serif',
      css: "family=Cormorant+Garamond:wght@300;600&family=Work+Sans:wght@400;500;600" },
    { id: "plex", name: "IBM Plex Serif + Plex Sans", note: "data journalism, technical",
      display: '"IBM Plex Serif", serif', body: '"IBM Plex Sans", sans-serif',
      css: "family=IBM+Plex+Serif:wght@300;600&family=IBM+Plex+Sans:wght@400;500;600" },
    { id: "space", name: "Space Grotesk", note: "modern, map / tech feel",
      display: '"Space Grotesk", sans-serif', body: '"Space Grotesk", sans-serif',
      css: "family=Space+Grotesk:wght@300;400;500;600" },
    { id: "syne", name: "Syne + Manrope", note: "expressive, adventurous",
      display: '"Syne", sans-serif', body: '"Manrope", sans-serif',
      css: "family=Syne:wght@500;700&family=Manrope:wght@400;500;600" },
    { id: "bricolage", name: "Bricolage Grotesque + Figtree", note: "playful, warm",
      display: '"Bricolage Grotesque", sans-serif', body: '"Figtree", sans-serif',
      css: "family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,600&family=Figtree:wght@400;500;600" },
  ];
  const KEY = "journey-font";
  const store = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
                  set: v => { try { localStorage.setItem(KEY, v); } catch {} } };
  const loaded = new Set();

  function apply(pair) {
    if (pair.css && !loaded.has(pair.id)) {
      loaded.add(pair.id);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?${pair.css}&display=swap`;
      document.head.appendChild(link);
    }
    const root = document.documentElement.style;
    root.setProperty("--font-display", pair.display);
    root.setProperty("--font-body", pair.body);
    const redraw = () => dispatchEvent(new Event("fontchange"));
    redraw();
    if (document.fonts) document.fonts.load(`16px ${pair.body}`).then(redraw, redraw);
  }

  const enabled = new URLSearchParams(location.search).has("fonts");
  const saved = PAIRS.find(p => p.id === store.get());
  if (enabled && saved) apply(saved);
  if (!enabled) return;

  const style = document.createElement("style");
  style.textContent = `
    #fontx { position: fixed; left: 16px; bottom: 16px; z-index: 20; font: 13px/1.4 var(--font-body); color: var(--ink); }
    #fontx > button { font: 600 15px var(--font-display); color: var(--night); background: var(--glow); border: 0;
      border-radius: 99px; padding: 8px 14px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
    #fontx .panel { display: none; position: absolute; left: 0; bottom: 46px; width: min(320px, calc(100vw - 32px));
      max-height: 70vh; overflow: auto; padding: 8px; border-radius: 14px; background: rgba(8,12,20,.96);
      border: 1px solid var(--card-edge); box-shadow: 0 20px 60px rgba(0,0,0,.6); }
    #fontx.open .panel { display: grid; gap: 4px; }
    #fontx .opt { text-align: left; background: none; border: 1px solid transparent; border-radius: 10px; padding: 8px 10px;
      color: var(--ink); cursor: pointer; }
    #fontx .opt:hover { background: rgba(255,255,255,.06); }
    #fontx .opt[aria-pressed="true"] { border-color: var(--glow); background: rgba(255,198,107,.1); }
    #fontx .opt .h { display: block; font-size: 19px; line-height: 1.2; }
    #fontx .opt .b { display: block; font-size: 12px; color: var(--ink-2); }
  `;
  document.head.appendChild(style);

  // Load every pairing up front so the previews render in their own fonts
  PAIRS.forEach(p => {
    if (!p.css) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = `https://fonts.googleapis.com/css2?${p.css}&display=swap`;
    document.head.appendChild(link); loaded.add(p.id);
  });

  const box = document.createElement("div");
  box.id = "fontx";
  box.innerHTML = `<div class="panel" role="group" aria-label="Font pairings"></div><button type="button">Aa · Fonts</button>`;
  const panel = box.querySelector(".panel");
  const current = () => store.get() || "fraunces";
  PAIRS.forEach(p => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "opt"; b.setAttribute("aria-pressed", p.id === current());
    b.innerHTML = `<span class="h" style="font-family:${p.display.replace(/"/g, "'")}">A Long Way Home</span>` +
      `<span class="b" style="font-family:${p.body.replace(/"/g, "'")}">${p.name} · ${p.note}</span>`;
    b.addEventListener("click", () => {
      apply(p); store.set(p.id);
      panel.querySelectorAll(".opt").forEach(o => o.setAttribute("aria-pressed", o === b));
    });
    panel.appendChild(b);
  });
  box.querySelector(":scope > button").addEventListener("click", () => box.classList.toggle("open"));
  document.body.appendChild(box);
})();
