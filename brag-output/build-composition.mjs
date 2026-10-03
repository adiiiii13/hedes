// Generates composition/index.html for the HEDES Studio promo (60s, 1920x1080, 30fps).
// Run: node build-composition.mjs
import { writeFileSync } from "node:fs";

const DUR = 60;
// Music grid (vol-10, ~110 BPM). Scene boundaries land on real beats from the cue preset.
const BND = [4.64, 10.38, 15.82, 21.28, 26.74, 32.19, 37.65, 43.11, 48.55, 54.02, 60];
const CARD = 1.09; // two beats of title card

const SRC = { A: { w: 1608, h: 393 }, B: { w: 1200, h: 800 } };

// kf: { t, f:[fx,fy] source px, p:[px,py] screen px, S }
const scenes = [
  {
    title: ["MEET", "HEDES STUDIO"], tag: "LOCAL CREATIVE WORKSPACE", label: "WORKSPACE",
    line: "Chat, code, preview and terminal. One window.",
    img: "B", cap: { left: 110, bottom: 80 },
    kf: [
      { t: 0, f: [600, 400], p: [960, 400], S: 0.95 },
      { t: 1.5, f: [600, 250], p: [960, 330], S: 1.38, ease: "power3.out" },
      { t: 4.65, f: [520, 260], p: [960, 330], S: 1.5, ease: "none" },
    ],
  },
  {
    title: ["AI CHAT"], tag: "ASSISTANT · PROJECT CONTEXT", label: "AI CHAT",
    line: "Describe it. Hedes builds it, with your project in context.",
    img: "A", cap: { left: 1040, top: 250, width: 780 },
    kf: [
      { t: 0, f: [170, 215], p: [560, 400], S: 1.6 },
      { t: 1.2, f: [170, 215], p: [560, 400], S: 2.0, ease: "power3.out" },
      { t: 2.5, f: [170, 215], p: [560, 400], S: 2.0 },
      { t: 3.7, f: [170, 290], p: [560, 420], S: 2.4, ease: "power2.inOut" },
      { t: D => D, f: [170, 290], p: [560, 420], S: 2.5, ease: "none" },
    ],
    rings: [
      { at: 0.6, to: 2.3, r: [229, 70, 96, 20], w: 1.6 },
      { at: 2.5, to: 99, r: [12, 246, 316, 108], w: 1.6 },
    ],
  },
  {
    title: ["100 BOTS"], tag: "MULTI-AGENT WORKFLOWS", label: "MULTI-AGENT",
    line: "One switch puts 100 bots to work on your task.",
    img: "B", cap: { left: 1130, top: 170, width: 690 },
    kf: [
      { t: 0, f: [170, 690], p: [600, 380], S: 2.3 },
      { t: 1.3, f: [170, 690], p: [600, 380], S: 3.0, ease: "power3.out" },
      { t: D => D, f: [170, 690], p: [600, 380], S: 3.2, ease: "none" },
    ],
    rings: [
      { at: 1.0, to: 2.6, r: [207, 601, 120, 52], w: 1.4 },
      { at: 2.6, to: 99, r: [12, 613, 195, 28], w: 1.4 },
    ],
  },
  {
    title: ["LIVE PREVIEW"], tag: "LOCAL · 127.0.0.1", label: "LIVE PREVIEW",
    line: "See your website running, right next to your chat.",
    img: "B", cap: { left: 110, bottom: 80 },
    kf: [
      { t: 0, f: [630, 285], p: [960, 410], S: 1.6 },
      { t: 1.3, f: [630, 285], p: [960, 410], S: 1.95, ease: "power3.out" },
      { t: 2.6, f: [630, 285], p: [960, 410], S: 1.95 },
      { t: 3.7, f: [700, 150], p: [960, 330], S: 3.0, ease: "power2.inOut" },
      { t: D => D, f: [700, 150], p: [960, 330], S: 3.1, ease: "none" },
    ],
    rings: [{ at: 3.5, to: 99, r: [394, 54, 340, 28], w: 1.2 }],
  },
  {
    title: ["TERMINAL"], tag: "POWERSHELL · CMD", label: "TERMINAL",
    line: "Run commands without leaving the app.",
    img: "B", cap: { left: 110, bottom: 80 },
    kf: [
      { t: 0, f: [630, 645], p: [960, 380], S: 1.9 },
      { t: 1.3, f: [630, 645], p: [960, 380], S: 2.4, ease: "power3.out" },
      { t: 2.8, f: [560, 590], p: [960, 360], S: 3.2, ease: "power2.inOut" },
      { t: D => D, f: [560, 590], p: [960, 360], S: 3.3, ease: "none" },
    ],
    rings: [{ at: 0.9, to: 2.7, r: [346, 553, 272, 22], w: 1.4 }],
  },
  {
    title: ["YOUR LAYOUT"], tag: "EDITOR · PREVIEW · SPLIT VIEW · TERMINAL", label: "FLEXIBLE VIEWS",
    line: "Code, preview, or both side by side.",
    img: "A", cap: { left: 110, bottom: 80 },
    kf: [
      { t: 0, f: [675, 28], p: [960, 330], S: 2.6 },
      { t: 1.0, f: [675, 28], p: [960, 330], S: 3.3, ease: "power3.out" },
      { t: D => D, f: [675, 28], p: [960, 330], S: 3.4, ease: "none" },
    ],
    // one ring that hops across the four view buttons on the beat
    hop: {
      stops: [
        { at: 0.9, r: [478, 10, 90, 36] },
        { at: 1.45, r: [570, 10, 85, 36] },
        { at: 2.0, r: [664, 10, 100, 36] },
        { at: 2.55, r: [773, 10, 98, 36] },
      ],
      w: 1.2,
    },
  },
  {
    title: ["HISTORY"], tag: "FILES · HISTORY · ACTIVITY", label: "PERSISTENT PROJECTS",
    line: "Your files and history are saved with the project.",
    img: "B", cap: { left: 110, bottom: 80 }, dimLeft: true,
    kf: [
      { t: 0, f: [1060, 200], p: [1400, 340], S: 1.7 },
      { t: 1.3, f: [1060, 200], p: [1400, 340], S: 2.3, ease: "power3.out" },
      { t: 2.7, f: [120, 150], p: [760, 330], S: 3.6, ease: "power2.inOut" },
      { t: D => D, f: [120, 150], p: [760, 330], S: 3.7, ease: "none" },
    ],
    rings: [
      { at: 0.8, to: 2.6, r: [928, 228, 264, 34], w: 1.2 },
      { at: 3.0, to: 99, r: [38, 139, 180, 26], w: 1.2 },
    ],
  },
  {
    title: ["VOICE + SHIP"], tag: "VOICE · IMPORT · EXPORT ZIP", label: "VOICE & PROJECTS",
    line: "Talk to it. Import projects. Export a ZIP when you're done.",
    img: "A", cap: { left: 110, bottom: 80 },
    kf: [
      { t: 0, f: [1050, 28], p: [960, 320], S: 3.0 },
      { t: 1.1, f: [1050, 28], p: [960, 320], S: 3.9, ease: "power3.out" },
      { t: 2.7, f: [1340, 28], p: [960, 320], S: 3.9, ease: "power2.inOut" },
      { t: D => D, f: [1340, 28], p: [960, 320], S: 4.0, ease: "none" },
    ],
    rings: [
      { at: 0.8, to: 2.4, r: [901, 10, 88, 36], w: 1.1 },
      { at: 3.2, to: 99, r: [1204, 10, 132, 36], w: 1.1 },
    ],
  },
  {
    title: ["MEMORY", "SKILLS + MCP"], tag: "PLUGINS · TOOLS", label: "BUILT-IN POWER",
    line: "Memory, skills, plugins and MCP tools. Built right in.",
    img: "B", cap: { left: 110, bottom: 80 },
    kf: [
      { t: 0, f: [1060, 787], p: [1000, 330], S: 3.0 },
      { t: 1.2, f: [1060, 787], p: [1000, 330], S: 4.2, ease: "power3.out" },
      { t: 3.0, f: [900, 690], p: [960, 330], S: 2.2, ease: "power2.inOut" },
      { t: D => D, f: [900, 690], p: [960, 330], S: 2.3, ease: "none" },
    ],
    rings: [{ at: 0.9, to: 2.9, r: [1034, 777, 160, 22], w: 1.3 }],
  },
];

const f2 = n => Number(n.toFixed(3));
let html = "";
let js = "";
const audio = [];
let sfxN = 0;
const DURS = {click_003:0.01, drop_001:0.13, impactBell_heavy_000:1.48, impactGeneric_light_001:0.11, switch_002:0.6};
const sfx = (file, t, vol) => {
  const dur = DURS[file];
  sfxN++;
  audio.push(`<audio id="sfx${sfxN}" data-start="${f2(t)}" data-duration="${dur}" data-volume="${vol}" src="assets/audio/${file}.mp3"></audio>`);
};

const view = (k) => ({ x: f2(k.p[0] - k.f[0] * k.S), y: f2(k.p[1] - k.f[1] * k.S), scale: k.S });
const vs = o => `{x:${o.x},y:${o.y},scale:${o.scale}}`;

scenes.forEach((sc, i) => {
  const s = BND[i];
  const u = f2(s + CARD);
  const D = f2(BND[i + 1] - u);
  const src = SRC[sc.img];

  // ---- title card ----
  const words = sc.title.map((line, li) =>
    `<span class="tl">${line.split(" ").map((w, wi) => `<span class="tw tw${i}">${w}</span>`).join(" ")}</span>`).join("");
  html += `
    <section class="clip card" id="card${i}" data-start="${f2(s)}" data-duration="${CARD}" data-track-index="1">
      <div class="card-bg"></div>
      <div class="card-num">0${i}</div>
      <div class="card-text">
        <div class="card-title" id="ct${i}">${words}</div>
        <div class="card-tag" id="cg${i}"><b></b>${sc.tag}</div>
      </div>
      <div class="wipe" id="wipe${i}"></div>
    </section>`;
  js += `
  // card ${i}
  tl.fromTo("#wipe${i}", {xPercent:-105}, {xPercent:105, duration:0.42, ease:"power3.inOut"}, ${f2(s)});
  tl.fromTo(".tw${i}", {y:90, opacity:0}, {y:0, opacity:1, duration:0.34, ease:"expo.out", stagger:0.07}, ${f2(s + 0.14)});
  tl.fromTo("#cg${i}", {x:-30, opacity:0}, {x:0, opacity:1, duration:0.35, ease:"power3.out"}, ${f2(s + 0.42)});
  tl.fromTo("#card${i} .card-num", {opacity:0, x:60}, {opacity:1, x:0, duration:0.5, ease:"power3.out"}, ${f2(s + 0.1)});`;
  sfx("impactGeneric_light_001", s + 0.06, 0.55);

  // ---- UI scene ----
  const kfs = sc.kf.map(k => ({ ...k, t: typeof k.t === "function" ? k.t(D) : k.t }));
  const cap = sc.cap;
  const capStyle = Object.entries(cap).map(([k, v]) => `${k}:${v}px`).join(";");
  const ringsHtml = (sc.rings || []).map((r, ri) =>
    `<div class="ring" id="r${i}_${ri}" style="left:${r.r[0]}px;top:${r.r[1]}px;width:${r.r[2]}px;height:${r.r[3]}px;border-width:${r.w}px;border-radius:${Math.min(6, r.r[3] / 2)}px"></div>`).join("");
  const hopHtml = sc.hop ? `<div class="ring" id="hop${i}" style="left:${sc.hop.stops[0].r[0]}px;top:${sc.hop.stops[0].r[1]}px;width:${sc.hop.stops[0].r[2]}px;height:${sc.hop.stops[0].r[3]}px;border-width:${sc.hop.w}px;border-radius:6px"></div>` : "";
  html += `
    <section class="clip ui" id="ui${i}" data-start="${u}" data-duration="${D}" data-track-index="2">
      <div class="stage">
        <div class="cam" id="cam${i}" style="width:${src.w}px;height:${src.h}px">
          <img src="assets/img/${sc.img}.png" width="${src.w}" height="${src.h}" alt="HEDES Studio screenshot" />
          ${ringsHtml}${hopHtml}${sc.dimLeft ? `<div class="dimrect" id="dim${i}" style="left:344px;top:50px;width:573px;height:470px"></div>` : ""}
        </div>
      </div>
      <div class="cap" id="cap${i}" style="${capStyle}">
        <div class="cap-label"><b></b>${sc.label}</div>
        <div class="cap-line">${sc.line}</div>
      </div>
    </section>`;

  // camera
  js += `
  // ui ${i}
  tl.set("#cam${i}", ${vs(view(kfs[0]))}, ${u});`;
  for (let k = 0; k < kfs.length - 1; k++) {
    const a = kfs[k], b = kfs[k + 1];
    const dur = f2(b.t - a.t);
    if (dur <= 0) continue;
    js += `
  tl.fromTo("#cam${i}", ${vs(view(a))}, {...${vs(view(b))}, duration:${dur}, ease:"${b.ease || "power2.inOut"}"}, ${f2(u + a.t)});`;
  }
  js += `
  tl.fromTo("#cap${i}", {y:40, opacity:0}, {y:0, opacity:1, duration:0.45, ease:"power3.out"}, ${f2(u + 0.2)});`;
  sfx("click_003", u + 0.22, 0.5, 0.5);
  (sc.rings || []).forEach((r, ri) => {
    js += `
  tl.fromTo("#r${i}_${ri}", {opacity:0, scale:1.25}, {opacity:1, scale:1, duration:0.3, ease:"back.out(2)"}, ${f2(u + r.at)});`;
    if (r.to < 90) js += `
  tl.to("#r${i}_${ri}", {opacity:0, duration:0.25, ease:"power1.in"}, ${f2(u + r.to)});`;
    sfx("switch_002", u + r.at, 0.28, 0.6);
  });
  if (sc.hop) {
    const st = sc.hop.stops;
    js += `
  tl.fromTo("#hop${i}", {opacity:0, scale:1.25}, {opacity:1, scale:1, duration:0.3, ease:"back.out(2)"}, ${f2(u + st[0].at)});`;
    sfx("switch_002", u + st[0].at, 0.28, 0.6);
    for (let h = 1; h < st.length; h++) {
      const dx = st[h].r[0] - st[0].r[0];
      js += `
  tl.to("#hop${i}", {x:${dx}, width:${st[h].r[2]}, duration:0.28, ease:"power3.inOut"}, ${f2(u + st[h].at - 0.04)});`;
      sfx("click_003", u + st[h].at, 0.45, 0.5);
    }
  }
  if (sc.dimLeft) {
    js += `
  tl.fromTo("#dim${i}", {opacity:0}, {opacity:1, duration:0.5, ease:"power2.out"}, ${u});`;
  }
});

// ---------- hook (0 .. 4.64) ----------
const H = BND[0];
html = `
    <section class="clip hook" id="hook" data-start="0" data-duration="${H}" data-track-index="1">
      <img class="hook-bg" id="hookbg" src="assets/img/B.png" width="1200" height="800" alt="" />
      <div class="hook-glow"></div>
      <div class="hook-group" id="hkgrp">
        <div class="hk-idea" id="hkidea">IDEA</div>
        <div class="hk-arrow" id="hkarrow"><i></i><u></u></div>
        <div class="hk-work" id="hkwork">WORKING PROJECT</div>
        <div class="hk-bar" id="hkbar"></div>
      </div>
    </section>` + html;
js = `
  // hook
  tl.fromTo("#hookbg", {scale:2.0, opacity:0.0}, {scale:2.3, opacity:0.2, duration:${H}, ease:"none"}, 0);
  tl.fromTo("#hkidea", {scale:1.4, opacity:0, y:30}, {scale:1, opacity:1, y:0, duration:0.28, ease:"expo.out"}, 0.27); // beat-locked: 0.27s (strong cue 0.267)
  tl.fromTo("#hkgrp", {y:130}, {y:0, duration:0.55, ease:"power2.inOut"}, 1.9);
  tl.fromTo("#hkarrow", {opacity:0}, {opacity:1, duration:0.01}, 1.9);
  tl.fromTo("#hkarrow i", {scaleY:0}, {scaleY:1, duration:0.4, ease:"power2.out"}, 1.9);
  tl.fromTo("#hkarrow u", {opacity:0, y:-20}, {opacity:1, y:0, duration:0.2, ease:"power2.out"}, 2.25);
  tl.fromTo("#hkwork", {scale:1.25, opacity:0, y:40}, {scale:1, opacity:1, y:0, duration:0.3, ease:"expo.out"}, 2.46);
  tl.fromTo("#hkbar", {scaleX:0}, {scaleX:1, duration:0.5, ease:"power3.out"}, 3.55); // beat-locked: 3.55s (strong cue 3.553)
  tl.to("#hkwork", {scale:1.035, duration:0.5, ease:"sine.inOut"}, 3.55);
` + js;
sfx("impactGeneric_light_001", 0.27, 0.7);
sfx("drop_001", 2.46, 0.6, 1);

// ---------- outro (54.02 .. 60) ----------
const O = BND[9];
const OD = f2(DUR - O);
html += `
    <section class="clip outro" id="outro" data-start="${O}" data-duration="${OD}" data-track-index="1">
      <div class="out-glow" id="outglow"></div>
      <img class="out-logo" id="outlogo" src="assets/img/logo.png" width="860" height="860" alt="HEDES logo" />
      <div class="out-tag" id="outtag">From idea to <em>working project.</em></div>
      <div class="out-cta" id="outcta">Build your next idea with HEDES.</div>
      <div class="flash" id="flash"></div>
    </section>`;
js += `
  // outro
  tl.fromTo("#outglow", {opacity:0, scale:0.6}, {opacity:1, scale:1, duration:1.2, ease:"power3.out"}, ${O});
  tl.fromTo("#outlogo", {opacity:0, scale:0.82}, {opacity:1, scale:1, duration:0.7, ease:"expo.out"}, ${O});
  tl.to("#outlogo", {scale:1.05, duration:${f2(OD - 0.7)}, ease:"none"}, ${f2(O + 0.72)});
  tl.fromTo("#flash", {opacity:0.55}, {opacity:0, duration:0.45, ease:"power2.out"}, ${O});
  tl.fromTo("#outtag", {y:36, opacity:0}, {y:0, opacity:1, duration:0.5, ease:"power3.out"}, ${f2(O + 1.1)});
  tl.fromTo("#outcta", {y:30, opacity:0, scale:0.94}, {y:0, opacity:1, scale:1, duration:0.55, ease:"back.out(1.6)"}, ${f2(O + 2.2)});
`;
sfx("impactBell_heavy_000", O, 0.8, 3);
sfx("click_003", O + 2.2, 0.6, 0.5);

const css = `
@font-face{font-family:"HF Display";src:url("assets/fonts/bahnschrift.ttf");font-weight:100 900;font-style:normal}
@font-face{font-family:"HF Mono";src:url("assets/fonts/consola.ttf");font-weight:400;font-style:normal}
@font-face{font-family:"HF Mono";src:url("assets/fonts/consolab.ttf");font-weight:700;font-style:normal}
:root{--bg:#05070d;--ink:#f2f5fa;--muted:#9fb0c6;--teal:#2ee6c5;--violet:#8b6cff;--ember:#ff8a3d}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:var(--bg)}
#root{position:relative;width:100%;height:100%;background:var(--bg);color:var(--ink);font-family:"HF Display",sans-serif;overflow:hidden}
.clip{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}

/* hook */
.hook{background:radial-gradient(1200px 800px at 18% 90%,rgba(255,138,61,.16),transparent 60%),radial-gradient(1000px 700px at 90% 10%,rgba(139,108,255,.18),transparent 60%),var(--bg)}
.hook-bg{position:absolute;left:360px;top:140px;width:1200px;height:800px;filter:blur(10px)}
.hook-glow{position:absolute;inset:0;background:radial-gradient(900px 600px at 50% 55%,transparent 20%,var(--bg) 85%)}
.hook-group{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.hk-idea{font-size:300px;font-weight:800;line-height:.95;letter-spacing:-.02em;color:var(--ink)}
.hk-arrow{position:relative;width:60px;height:120px;display:block;margin:4px 0 22px}
.hk-arrow i{position:absolute;left:27px;top:0;width:6px;height:100px;background:var(--teal);transform-origin:50% 0;border-radius:3px}
.hk-arrow u{position:absolute;left:12px;top:70px;width:36px;height:36px;border-right:6px solid var(--teal);border-bottom:6px solid var(--teal);transform:rotate(45deg) scale(.8);text-decoration:none}
.hk-work{font-size:158px;font-weight:800;line-height:1;letter-spacing:-.01em;background:linear-gradient(90deg,var(--teal),#7ff5e0 50%,var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;padding:0 12px}
.hk-bar{width:1100px;height:10px;margin-top:14px;background:linear-gradient(90deg,var(--ember),var(--teal));transform-origin:0 50%;border-radius:5px}

/* title cards */
.card{background:var(--bg)}
.card-bg{position:absolute;inset:0;background:radial-gradient(900px 700px at 15% 100%,rgba(46,230,197,.14),transparent 60%),radial-gradient(900px 700px at 100% 0%,rgba(139,108,255,.2),transparent 60%)}
.card-num{position:absolute;right:90px;bottom:-60px;font-family:"HF Mono",monospace;font-weight:700;font-size:520px;line-height:1;color:rgba(255,255,255,.055)}
.card-text{z-index:6;position:absolute;left:150px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:34px}
.card-title{font-size:230px;font-weight:800;line-height:.92;letter-spacing:-.015em;color:var(--ink)}
.card-title .tl{display:block;overflow:visible}
.card-title .tw{display:inline-block}
.card-tag{font-family:"HF Mono",monospace;font-weight:700;font-size:38px;letter-spacing:.2em;color:var(--teal);display:flex;align-items:center;gap:20px}
.card-tag b,.cap-label b{display:block;width:14px;height:14px;background:var(--ember);transform:rotate(45deg)}
.wipe{position:absolute;inset:0;background:linear-gradient(100deg,#6b300e,#0c5f56 55%,#3d2f8c);border-right:16px solid var(--teal);z-index:5}

/* ui scenes */
.ui{background:radial-gradient(1400px 900px at 50% 40%,#0b1424,var(--bg))}
.stage{position:absolute;inset:0;overflow:hidden}
.cam{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 40px 120px rgba(0,0,0,.6)}
.cam img{display:block}
.ring{position:absolute;border-style:solid;border-color:var(--teal);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 24px rgba(46,230,197,.75),inset 0 0 14px rgba(46,230,197,.35);pointer-events:none}
.dimrect{position:absolute;background:rgba(5,7,13,.93)}
.cap{position:absolute;max-width:1100px;padding:26px 38px 30px 34px;background:rgba(5,9,18,.88);border:1px solid rgba(255,255,255,.12);border-left:6px solid var(--teal);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.55)}
.cap-label{font-family:"HF Mono",monospace;font-weight:700;font-size:26px;letter-spacing:.22em;color:var(--teal);display:flex;align-items:center;gap:16px;margin-bottom:14px}
.cap-label b{width:12px;height:12px}
.cap-line{font-size:56px;font-weight:700;line-height:1.1;letter-spacing:-.005em;color:var(--ink)}

/* outro */
.outro{background:radial-gradient(1200px 800px at 50% 40%,#0c1424,var(--bg))}
.out-glow{position:absolute;left:460px;top:-90px;width:1000px;height:1000px;border-radius:50%;background:radial-gradient(circle,rgba(255,138,61,.35),rgba(139,108,255,.14) 45%,transparent 70%)}
.out-logo{position:absolute;left:530px;top:-70px;width:860px;height:860px;-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 46%,transparent 68%);mask-image:radial-gradient(circle at 50% 50%,#000 46%,transparent 68%)}
.out-tag{position:absolute;left:0;right:0;top:660px;text-align:center;font-size:76px;font-weight:700;letter-spacing:-.005em}
.out-tag em{font-style:normal;color:var(--teal)}
.out-cta{position:absolute;left:50%;top:810px;margin-left:-520px;width:1040px;height:130px;display:flex;align-items:center;justify-content:center;border-radius:70px;background:linear-gradient(90deg,var(--teal),#7ff5e0);color:#03130f;font-size:64px;font-weight:800;letter-spacing:-.005em;box-shadow:0 0 80px rgba(46,230,197,.4)}
.flash{position:absolute;inset:0;background:#fff;opacity:0}
`;

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="vendor/gsap.min.js"></script>
<style>${css}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
${html}
<audio id="music" data-start="0" data-duration="${DUR}" data-volume="0.62" data-fade-out="2.5" src="assets/audio/music.mp3"></audio>
${audio.join("\n")}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${js}
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
writeFileSync(new URL("./composition/index.html", import.meta.url), out);
console.log("wrote composition/index.html", out.length, "bytes; sfx:", sfxN);
