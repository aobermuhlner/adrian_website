// Background soundtrack: one freely licensed recording per region (see the credits in index.html),
// played quietly behind everything else. story.js says which regions are on screen and how much
// (setMix); each track's volume is that share squared, so between two countries both are quiet and
// the transition dips softly instead of two pieces clashing. Tracks pause when out of view and
// continue where they left off. It ducks under clips with sound (setDuck).
// Browsers block audio until the reader has clicked or tapped the page once; until then it waits.
window.journeyMusic = (() => {
  const VOLUME = .3;               // overall level: background, under everything else
  const TRACKS = {
    korea: "media/music/korea.m4a", china: "media/music/china.m4a", central: "media/music/central.m4a",
    russia: "media/music/russia.m4a", caucasus: "media/music/caucasus.m4a", turkey: "media/music/turkey.m4a",
    balkans: "media/music/balkans.m4a", alpine: "media/music/alpine.m4a",
  };

  // Shown above the music button while a track plays (full credits are at the end of the page)
  const TITLES = {
    korea: ["Gayageum, Korean folk", "played by Xia"],
    china: ["Erquan Yingyue, by Abing", "erhu: Zhang Peijian"],
    central: ["Uzbek traditional folk music", "recorded by Teddyboum123"],
    russia: ["Tchaikovsky, The Seasons: October", "piano: Bernd Krüger"],
    caucasus: ["Otar Amayi Champeqi Vra", "Armenian duduk"],
    turkey: ["Hüseyni Saz Semaisi", "Hafız Kemal Bey, kemençe"],
    balkans: ["Oj javore i kolo, 1904", "Muzička družina Cicvarić"],
    alpine: ["Kilchbergsieger Eugen Hasler", "Mosibuebä, Schwyzerörgeli"],
  };
  const label = document.getElementById("now-playing");
  let shown = null;
  function showTitle() {
    if (!label) return;
    const [top, w] = Object.entries(mix).sort((a, b) => b[1] - a[1])[0] || [];
    const name = on && started && ctx && ctx.state === "running" && w > .5 ? top : null;
    if (name === shown) return;
    shown = name;
    label.classList.remove("on");
    if (!name) return;
    setTimeout(() => {                 // swap the text while it is faded out
      if (shown !== name) return;
      label.innerHTML = `<span>Now playing</span><b>${TITLES[name][0]}</b><i>${TITLES[name][1]}</i>`;
      label.classList.add("on");
    }, 300);
  }

  let ctx, out, on = true, duck = 0, mix = {}, started = false;
  const tracks = {};

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
  }

  // Volume goes through Web Audio rather than <audio>.volume, which iOS ignores
  function track(name) {
    if (tracks[name]) return tracks[name];
    const el = new Audio(TRACKS[name]);
    el.loop = true; el.preload = "auto";
    const g = ctx.createGain(); g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(g); g.connect(out);
    return (tracks[name] = { el, g, stopT: null });
  }

  function apply() {
    showTitle();
    if (!ctx) return;
    const t = ctx.currentTime;
    out.gain.setTargetAtTime(on ? VOLUME * (1 - .75 * duck) : 0, t, .4);
    for (const name of Object.keys(TRACKS)) {
      const w = mix[name] || 0, level = w * w;
      if (on && level > .001) {
        const x = track(name);
        if (x.stopT) { clearTimeout(x.stopT); x.stopT = null; }
        if (x.el.paused) x.el.play().catch(() => {});
        x.g.gain.setTargetAtTime(level, t, .3);
      } else if (tracks[name]) {
        const x = tracks[name];
        x.g.gain.setTargetAtTime(0, t, .3);
        if (!x.el.paused && !x.stopT) x.stopT = setTimeout(() => { x.el.pause(); x.stopT = null; }, 2000);   // after the fade
      }
    }
  }

  const allowed = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
  function wake() {
    if (!on) return;
    if (!ctx) { if (!allowed()) return; init(); }
    if (ctx.state === "suspended") ctx.resume().then(showTitle, () => {});
    started = true;
    apply();
  }
  ["pointerdown", "keydown", "touchend"].forEach(ev => addEventListener(ev, () => setTimeout(wake), { capture: true, passive: true }));

  return {
    STYLES: Object.keys(TRACKS),
    // { region: weight } for the regions on screen right now (weights add up to ~1)
    setMix(m) { mix = m; if (ctx) apply(); if (on) wake(); },
    toggle() { on = !on; if (on) wake(); else apply(); return on; },
    // true while a clip or video with sound is playing: the music steps back
    setDuck(d) { duck = d ? 1 : 0; apply(); },
    get on() { return on; },
    get started() { return started; },
    get state() { return ctx ? ctx.state : "not started"; },
    get playing() { return Object.entries(tracks).filter(([, x]) => !x.el.paused).map(([n]) => n); },
  };
})();
