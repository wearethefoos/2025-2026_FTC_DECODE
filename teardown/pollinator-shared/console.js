// The Pollinator console, laid out at 1600 x 900: the badge and title, the live aim solution for both turrets, the
// localization panel (Pinpoint pose, Limelight fix, fused error trace), what the robot holds against the G407 limit,
// the turret clearance plan, the routine switch, views, display toggles, the system budget and the routine timeline.
// update(s) redraws every live part from the frame's state; nothing here computes, it only shows.
import {CAT_COL} from './build.js';

export const C = {ink: '#20252b', mute: '#87909a', faint: '#cfd6de', line: '#dfe4ea', panel: 'rgba(250,251,252,.95)', or: '#e4572e', green: '#2f9d5c', pol: '#c99400', nec: '#2563c9', soft: '#eef1f4'};
export const VIEWS = ['hero', 'chase', 'top', 'turrets', 'intake', 'field'];
export const VIEW_LABEL = {hero: 'HERO', chase: 'CHASE', top: 'TOP', turrets: 'TURRETS', intake: 'INTAKE', field: 'FIELD'};
export const DISPLAY = ['labels', 'xray', 'arcs', 'envelopes', 'aim', 'parts'];
export const DISPLAY_LABEL = {labels: 'LABELS', xray: 'X-RAY', arcs: 'ARCS', envelopes: 'ENVELOPES', aim: 'AIM LINES', parts: 'PARTS'};
export const SEQS = ['driveby', 'flower', 'spill', 'sweep'];
export const SEQ_LABEL = {driveby: 'DRIVE-BY', flower: 'FLOWER', spill: 'SPILL', sweep: 'SWEEP'};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(40,60,90,.07)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.8px}
.ph i{display:block;width:3px;height:13px;background:${C.or}}
.pn{position:absolute;font:500 9.5px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.v{font:600 11px 'JetBrains Mono',monospace;white-space:nowrap}
.bt{position:absolute;height:21px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fff;font:700 9.2px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.ink};white-space:nowrap}
.call{position:absolute;white-space:nowrap}
.call b{display:flex;align-items:center;gap:6px;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink};text-shadow:0 0 4px #fff,0 0 8px #fff}
.call b i{display:block;width:6px;height:6px;background:${C.or}}
.call span{display:block;font:500 7.8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:#5d6670;margin-top:2px;text-shadow:0 0 4px #fff,0 0 8px #fff}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.or};opacity:0;z-index:49}
.dot{display:inline-block;border-radius:50%;margin-right:4px;vertical-align:middle}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const deg = (r) => `${r >= 0 ? '+' : '−'}${Math.abs((r * 180) / Math.PI).toFixed(1)}°`;

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:160px;height:89px;background:${C.or}"></div>`);
  {
    // a honeycomb of three hexes
    const hex = (cx, cy, r) => `<path d="${Array.from({length: 6}, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join('')}Z" fill="none" stroke="#fff" stroke-width="2.2"/>`;
    add(`<svg style="position:absolute;left:24px;top:24px" width="60" height="44">${hex(14, 14, 11)}${hex(33, 14, 11)}${hex(23.5, 30.5, 11)}<circle cx="23.5" cy="30.5" r="3.6" fill="#fff"/></svg>`);
  }
  add(`<div class="mo" style="position:absolute;left:92px;top:35px;color:#fff;font-size:14px;font-weight:700;letter-spacing:2px">26·27</div>`);
  add(`<div class="sm" style="position:absolute;left:182px;top:22px;letter-spacing:2.4px">FTC BIOBUZZ · BLUE ALLIANCE</div>`);
  add(`<div style="position:absolute;left:181px;top:37px;font-size:33px;font-weight:700;letter-spacing:-.6px;line-height:1">Twin-Turret Pollinator <span style="color:${C.or};font-weight:400">/</span></div>`);
  add(`<div class="mo" style="position:absolute;left:182px;top:77px;font-size:11.2px;letter-spacing:2.2px;color:#5d6670">SELF-AIMING DRIVE-BY SHOOTER · POLLEN + NECTAR</div>`);
  add(`<div class="sm" style="position:absolute;left:1060px;top:49px;letter-spacing:2.6px;font-size:9.6px">LIMELIGHT 3A + PINPOINT ODOMETRY</div>`);
  const ptsBig = add(`<div style="position:absolute;right:${1600 - 1492}px;top:31px;color:${C.or};font-size:39px;font-weight:700;letter-spacing:-.8px;line-height:1;text-align:right"></div>`);
  add(`<div style="position:absolute;left:1500px;top:33px;width:1px;height:44px;background:${C.faint}"></div>`);
  add(`<div class="sm" style="position:absolute;left:1516px;top:34px;line-height:14px;letter-spacing:2.2px">PTS<br>THIS<br>CYCLE</div>`);
  {
    let h = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) h += `<path d="M${c * 25.5 + 4} ${r * 25.5}v8M${c * 25.5} ${r * 25.5 + 4}h8" stroke="${C.or}" stroke-width="1.1" opacity=".55"/>`;
    add(`<svg style="position:absolute;left:740px;top:80px" width="300" height="64">${h}</svg>`);
  }

  // ------------------------------------------------------------ 01 aim solution
  panel(28, 112, 282, 318, 'AIM SOLUTION', '01');
  const chip = add(`<div style="position:absolute;left:42px;top:150px;width:13px;height:24px;border-radius:2px"></div>`);
  const stTitle = add(`<div style="position:absolute;left:66px;top:148px;font-size:15px;font-weight:600;white-space:nowrap"></div>`);
  const stSub = add(`<div class="sm" style="position:absolute;left:67px;top:167px"></div>`);
  add(`<div style="position:absolute;left:42px;top:186px;width:254px;height:1px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:150px;top:196px;color:${C.pol};font-weight:700">● POLLEN</div>`);
  add(`<div class="sm" style="position:absolute;left:226px;top:196px;color:${C.nec};font-weight:700">● NECTAR</div>`);
  const ROWS = [
    ['MODE', ''],
    ['TURRET YAW', ''],
    ['HOOD', ''],
    ['LEAD', 'DRIVE-BY'],
    ['FLYWHEEL', 'RPM'],
    ['EXIT', 'M/S'],
    ['BACKSPIN', 'RPM'],
    ['FLIGHT', 'S'],
    ['RANGE', 'M'],
    ['MISS', 'MM'],
  ];
  const aim = ROWS.map(([n, u], i) => {
    const y = 216 + i * 20.5;
    add(`<div class="sm" style="position:absolute;left:42px;top:${y}px">${n}${u ? ` <span style="opacity:.6">${u}</span>` : ''}</div>`);
    const a = add(`<div class="v" style="position:absolute;left:150px;top:${y - 2}px"></div>`);
    const b = add(`<div class="v" style="position:absolute;left:226px;top:${y - 2}px"></div>`);
    return [a, b];
  });

  // ------------------------------------------------------------ 02 localization
  panel(28, 444, 282, 196, 'LOCALIZATION', '02');
  const locRows = ['PINPOINT X', 'PINPOINT Y', 'HEADING'].map((n, i) => {
    const y = 480 + i * 19;
    add(`<div class="sm" style="position:absolute;left:42px;top:${y}px">${n}</div>`);
    return add(`<div class="v" style="position:absolute;left:130px;top:${y - 2}px"></div>`);
  });
  const llChip = add(`<div style="position:absolute;left:204px;top:478px;width:92px;height:52px;border-radius:4px;border:1px solid ${C.line}"></div>`);
  const llHead = add(`<div class="sm" style="position:absolute;left:212px;top:485px;font-weight:700">LIMELIGHT</div>`);
  const llVal = add(`<div class="v" style="position:absolute;left:212px;top:500px;font-size:10px"></div>`);
  const llSub = add(`<div class="sm" style="position:absolute;left:212px;top:516px;font-size:7.6px"></div>`);
  add(`<div class="sm" style="position:absolute;left:42px;top:546px">FUSED POSE ERROR</div>`);
  const errBig = add(`<div class="mo" style="position:absolute;left:42px;top:560px;font-size:20px;font-weight:700"></div>`);
  const spark = add(`<svg style="position:absolute;left:132px;top:548px" width="164" height="78"></svg>`);

  // ------------------------------------------------------------ 08 holding
  panel(28, 654, 282, 90, 'HOLDING', '08');
  const holdP = add(`<div style="position:absolute;left:42px;top:690px"></div>`);
  const holdN = add(`<div style="position:absolute;left:42px;top:714px"></div>`);
  const holdBig = add(`<div class="mo" style="position:absolute;right:${1600 - 296}px;top:684px;font-size:22px;font-weight:700"></div>`);
  add(`<div class="sm" style="position:absolute;right:${1600 - 296}px;top:714px">OF 4 · G407</div>`);

  // ------------------------------------------------------------ 03 turret clearance
  panel(1313, 112, 258, 222, 'TURRET CLEARANCE', '03');
  const plan = add(`<svg style="position:absolute;left:1327px;top:146px" width="230" height="140"></svg>`);
  const gapVal = add(`<div class="mo" style="position:absolute;left:1327px;top:292px;font-size:16px;font-weight:700"></div>`);
  add(`<div class="sm" style="position:absolute;left:1327px;top:314px">GAP BETWEEN SWEPT CIRCLES</div>`);
  const yawVals = add(`<div class="sm" style="position:absolute;right:${1600 - 1557}px;top:296px;text-align:right;line-height:13px"></div>`);

  // ------------------------------------------------------------ 04 routine, 05 views, 06 display
  const btn = {};
  panel(1313, 348, 258, 82, 'ROUTINE', '04');
  add(`<div style="position:absolute;left:1327px;top:385px;width:230px;height:30px;border-radius:5px;background:${C.soft}"></div>`);
  SEQS.forEach((k, i) => {
    btn[k] = add(`<div class="bt" style="left:${1329 + i * 56.5}px;top:388px;width:56px;height:24px;border:none;background:transparent;padding:0;font-size:8.6px;letter-spacing:.8px">${SEQ_LABEL[k]}</div>`);
  });
  const btnRow = (keys, labels, x0, y, wmax = 230) => {
    let x = x0;
    let yy = y;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 6.9 + 20);
      if (x + w > x0 + wmax) {
        x = x0;
        yy += 30;
      }
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${yy}px;width:${w}px;height:23px">${labels[k]}</div>`);
      x += w + 6;
    }
  };
  panel(1313, 444, 258, 104, 'VIEWS', '05');
  btnRow(VIEWS, VIEW_LABEL, 1327, 480);
  panel(1313, 562, 258, 104, 'DISPLAY', '06');
  btnRow(DISPLAY, DISPLAY_LABEL, 1327, 598);

  // ------------------------------------------------------------ 09 system
  panel(1313, 680, 258, 164, 'SYSTEM', '09');
  [['8/8', 'MOTORS'], ['7/8', 'SERVOS'], ['24″', 'MAX LENGTH']].forEach(([v, n], i) => {
    const x = 1327 + i * 80;
    if (i) add(`<div style="position:absolute;left:${x - 8}px;top:716px;width:1px;height:38px;background:${C.line}"></div>`);
    add(`<div style="position:absolute;left:${x}px;top:716px;font-size:20px;font-weight:700">${v}</div>`);
    add(`<div class="sm" style="position:absolute;left:${x}px;top:741px">${n}</div>`);
  });
  add(`<div style="position:absolute;left:1327px;top:762px;width:230px;height:1px;background:${C.line}"></div>`);
  const legend = add(`<div style="position:absolute;left:1327px;top:772px;width:230px"></div>`);
  legend.innerHTML = [['rev', 'REV ROBOTICS'], ['printed', '3D-PRINTED · PETG-CF / TPU'], ['cots', 'LIMELIGHT 3A · GOBILDA PODS']]
    .map(([k, n]) => `<div class="sm" style="display:flex;align-items:center;gap:7px;height:19px"><i style="display:block;width:10px;height:10px;border-radius:2px;background:${CAT_COL[k]}"></i>${n}</div>`)
    .join('');

  // ------------------------------------------------------------ 07 routine timeline
  panel(430, 752, 740, 108, 'MATCH ROUTINE', '07');
  btn.play = add(`<div class="bt" style="left:445px;top:795px;width:44px;height:44px;border-radius:50%;border:none;background:${C.or};color:#fff;font-size:15px"></div>`);
  const opFrom = add(`<div class="sm" style="position:absolute;left:506px;top:791px"></div>`);
  const opPhase = add(`<div class="mo" style="position:absolute;left:506px;width:500px;top:790px;text-align:center;font-size:9.6px;font-weight:700;letter-spacing:1.6px;color:${C.or}"></div>`);
  const opTo = add(`<div class="sm" style="position:absolute;right:${1600 - 1010}px;top:791px"></div>`);
  const TL = {x: 508, w: 504};
  add(`<div style="position:absolute;left:${TL.x}px;top:820px;width:${TL.w}px;height:3px;background:${C.soft};border-radius:2px"></div>`);
  const tlTicks = add(`<div style="position:absolute;inset:0"></div>`);
  const tlFill = add(`<div style="position:absolute;left:${TL.x}px;top:820px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const tlKnob = add(`<div style="position:absolute;top:814px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const tlTime = add(`<div class="mo" style="position:absolute;left:506px;top:834px;font-size:9.6px;color:${C.mute};letter-spacing:1px"></div>`);
  add(`<div class="sm" style="position:absolute;left:1029px;top:805px">SPEED</div>`);
  const SP = {x: 1031, w: 92};
  add(`<div style="position:absolute;left:${SP.x}px;top:823px;width:${SP.w}px;height:3px;background:${C.soft};border-radius:2px"></div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:823px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:817px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const spVal = add(`<div class="mo" style="position:absolute;left:1128px;top:818px;font-size:10px;font-weight:700"></div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:27px;top:882px;letter-spacing:2.2px">MECHANISM STUDY &nbsp;·&nbsp; PROCEDURAL MODEL &nbsp;·&nbsp; FIELD NUMBERS FROM THE BIOBUZZ MANUAL §9</div>`);
  add(`<div class="sm" style="position:absolute;right:28px;top:882px;letter-spacing:2.2px">FLOWER + HIVE LAYOUT APPROXIMATE <span style="color:${C.or}">//////</span></div>`);

  // ------------------------------------------------------------ labels, the pointer
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };
  const fmt = (s) => `00:${String(Math.floor(s)).padStart(2, '0')}`;
  let ticksFor = null;

  return {
    spots,
    btn,
    root: ui,
    TL,
    SP,
    update(s) {
      // 01: the state chip and both turrets' numbers
      const [title, sub, kind] = s.state;
      chip.style.background = kind === 'fire' ? C.or : kind === 'track' ? C.green : C.faint;
      stTitle.textContent = title;
      stSub.textContent = sub;
      const T = [s.turret.pollen, s.turret.nectar];
      const cell = (i, txt, col) => {
        aim[i][0].textContent = txt[0];
        aim[i][1].textContent = txt[1];
        aim[i][0].style.color = col?.[0] ?? C.ink;
        aim[i][1].style.color = col?.[1] ?? C.ink;
      };
      const live = T.map((t) => t.mode === 'track' || t.mode === 'place');
      const MODE = {track: 'TRACK', place: 'PLACE', sweep: 'SWEEP', home: 'HOME'};
      cell(0, T.map((t) => (t.mode === 'track' && t.held === 0 ? 'READY' : MODE[t.mode])), T.map((t) => (t.mode === 'place' ? C.or : C.ink)));
      cell(1, T.map((t) => deg(t.yaw)));
      cell(2, T.map((t) => `${((t.hood * 180) / Math.PI).toFixed(1)}°`));
      cell(3, T.map((t, i) => (live[i] && t.mode === 'track' ? deg(t.sol.lead) : '—')), T.map((t) => (Math.abs(t.sol.lead) > 0.05 && t.mode === 'track' ? C.or : C.ink)));
      cell(4, T.map((t) => `${Math.round(t.rpm)}`));
      cell(5, T.map((t, i) => (live[i] ? t.sol.v.toFixed(2) : '—')));
      cell(6, T.map((t, i) => (live[i] ? `${Math.round(t.sol.spin)}` : '—')));
      cell(7, T.map((t, i) => (live[i] ? t.sol.tf.toFixed(2) : '—')));
      cell(8, T.map((t, i) => (live[i] ? t.sol.d.toFixed(2) : '—')));
      cell(9, T.map((t, i) => (live[i] ? `${Math.min(99, t.sol.err * 1000).toFixed(1)}` : '—')));
      // 02: localization
      const L = s.loc;
      locRows[0].textContent = `${L.est.x >= 0 ? '+' : '−'}${Math.abs(L.est.x).toFixed(3)} m`;
      locRows[1].textContent = `${-L.est.z >= 0 ? '+' : '−'}${Math.abs(L.est.z).toFixed(3)} m`;
      locRows[2].textContent = `${((((L.est.psi * 180) / Math.PI + 540) % 360) - 180).toFixed(1)}°`;
      llChip.style.background = L.seen ? 'rgba(47,157,92,.1)' : '#fff';
      llChip.style.borderColor = L.seen ? C.green : C.line;
      llHead.style.color = L.seen ? C.green : C.mute;
      llVal.textContent = L.seen ? `TAGS ${L.tag}–${L.tag + 3}` : 'NO TAGS';
      llSub.textContent = L.seen ? `MEGATAG · ${L.dist.toFixed(2)} M` : 'ODOMETRY ONLY';
      errBig.textContent = `${L.errMm.toFixed(1)} mm`;
      errBig.style.color = L.errMm > 10 ? C.or : C.ink;
      {
        const W = 164;
        const Hh = 70;
        const ys = (e) => Hh - Math.min(1, e / 20) * (Hh - 6);
        let d = '';
        let seen = '';
        s.locHist.forEach((h, i) => {
          if (!h) return;
          const x = (i / (s.locHist.length - 1)) * W;
          d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${ys(h.errMm).toFixed(1)}`;
          if (h.seen) seen += `<rect x="${(x - 1.5).toFixed(1)}" y="${Hh + 3}" width="3" height="4" fill="${C.green}"/>`;
        });
        spark.innerHTML = `<line x1="0" x2="${W}" y1="${Hh}" y2="${Hh}" stroke="${C.line}"/><line x1="0" x2="${W}" y1="${ys(10)}" y2="${ys(10)}" stroke="${C.faint}" stroke-dasharray="3 3"/><text x="${W}" y="${ys(10) - 3}" text-anchor="end" font-size="7.4" fill="${C.mute}" font-family="JetBrains Mono">10 MM</text><path d="${d}" fill="none" stroke="${C.or}" stroke-width="1.4"/>${seen}`;
      }
      // 08: holding
      const dots = (n, col, r) => Array.from({length: 2}, (_, i) => `<span class="dot" style="width:${r}px;height:${r}px;background:${i < n ? col : 'transparent'};border:1.5px solid ${col}"></span>`).join('');
      holdP.innerHTML = `<span class="sm" style="display:inline-block;width:64px">POLLEN</span>${dots(s.held.pollen, C.pol, 12)}`;
      holdN.innerHTML = `<span class="sm" style="display:inline-block;width:64px">NECTAR</span>${dots(s.held.nectar, C.nec, 15)}`;
      holdBig.textContent = `${s.held.pollen + s.held.nectar}`;
      ptsBig.textContent = `${s.score.points}`;
      // 03: the plan of the two swept circles, turret lines, the robot's box
      {
        const k = 290; // px per metre
        const cx = 115;
        const cz = 72;
        const P = (x, z) => [cx - x * k, cz - z * k];
        let h = '';
        const [x0, z0] = P(0.2286, 0.2286);
        h += `<rect x="${x0}" y="${z0}" width="${0.4572 * k}" height="${0.4572 * k}" fill="none" stroke="${C.faint}" stroke-width="1"/>`;
        h += `<text x="${cx}" y="${z0 - 3}" text-anchor="middle" font-size="7" fill="${C.mute}" font-family="JetBrains Mono" letter-spacing="1">FRONT · 18 IN.</text>`;
        for (const [key, col] of [['pollen', C.pol], ['nectar', C.nec]]) {
          const t = s.turret[key];
          const [px, pz] = P(t.x, t.z);
          const a = t.yaw;
          // the turret's pointing line (yaw about +y: forward is up on the plan, left is left)
          const ex = px - Math.sin(a) * t.sweep * k;
          const ez = pz - Math.cos(a) * t.sweep * k;
          h += `<circle cx="${px}" cy="${pz}" r="${t.sweep * k}" fill="${col}" fill-opacity=".08" stroke="${col}" stroke-width="1.2"/>`;
          h += `<line x1="${px}" y1="${pz}" x2="${ex.toFixed(1)}" y2="${ez.toFixed(1)}" stroke="${col}" stroke-width="2.4"/><circle cx="${px}" cy="${pz}" r="2.4" fill="${col}"/>`;
        }
        // the gap, marked between the circles
        const gx = cx - ((s.turret.pollen.x - s.turret.pollen.sweep + s.turret.nectar.x + s.turret.nectar.sweep) / 2) * k;
        const [, gz] = P(0, s.turret.pollen.z);
        h += `<line x1="${gx - 4}" x2="${gx + 4}" y1="${gz}" y2="${gz}" stroke="${C.or}" stroke-width="1.2"/><line x1="${gx}" x2="${gx}" y1="${gz - 10}" y2="${gz + 10}" stroke="${C.or}" stroke-width="1" stroke-dasharray="2 2"/>`;
        plan.innerHTML = h;
        gapVal.innerHTML = `${(s.gap * 1000).toFixed(1)} mm <span style="font-size:9px;color:${C.green};letter-spacing:1px">✓ ANY ANGLES</span>`;
        yawVals.innerHTML = `<span style="color:${C.pol}">P ${deg(s.turret.pollen.yaw)}</span><br><span style="color:${C.nec}">N ${deg(s.turret.nectar.yaw)}</span>`;
      }
      // 04-06 buttons
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.or : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.or : C.faint;
      };
      for (const k of SEQS) {
        const on = s.seq === k;
        btn[k].style.background = on ? C.or : 'transparent';
        btn[k].style.color = on ? '#fff' : '#7d8690';
        btn[k].style.borderRadius = '4px';
      }
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      legend.style.opacity = s.display.parts ? '1' : '.55';
      // 07 timeline
      btn.play.innerHTML = s.paused ? '▶' : '❚❚';
      opFrom.textContent = s.from;
      opTo.textContent = s.to;
      opPhase.textContent = s.phase;
      if (ticksFor !== s.dur) {
        ticksFor = s.dur;
        tlTicks.innerHTML = s.ticks.map((x) => `<div style="position:absolute;left:${TL.x + (x / s.dur) * TL.w - 0.5}px;top:816px;width:1px;height:11px;background:${C.faint}"></div>`).join('');
      }
      const kx = TL.x + (s.tau / s.dur) * TL.w;
      tlFill.style.width = `${((s.tau / s.dur) * TL.w).toFixed(1)}px`;
      tlKnob.style.left = `${kx.toFixed(1)}px`;
      tlTime.textContent = `${fmt(s.tau)} / ${fmt(s.dur)}`;
      const sk = SP.x + s.speedK * SP.w;
      spFill.style.width = `${(s.speedK * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${sk.toFixed(1)}px`;
      spVal.textContent = `${s.speed.toFixed(1)}×`;
      // labels
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const right = lx > ax;
        const ex = right ? lx - 6 : lx + c.w + 6;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${(ly + 6).toFixed(1)}" fill="none" stroke="${C.or}" stroke-width=".9" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.4" fill="${C.or}" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 1).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b><i></i>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
