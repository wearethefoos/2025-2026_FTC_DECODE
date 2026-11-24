// Writes the laser-cut body as cut files, from the same plates the 3D model is built from:
//
//   node teardown/pollinator-shared/cutfiles.mjs [--sheet 610x610]
//
// For each material (ply, alu) into teardown/cut/<material>/: one SVG and one DXF per plate, every plate nested onto
// laser-bed sheets (sheet-N.svg / .dxf), a slot-fit comb to cut first, and parts.csv. In the SVGs red is cut and
// blue is engrave (the part name); in the DXFs the layers are CUT and ENGRAVE. Units are millimetres throughout.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MATERIALS, buildPlates, fitComb} from './plates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const [SW, SH] = (argv[argv.indexOf('--sheet') + 1] && argv.includes('--sheet') ? argv[argv.indexOf('--sheet') + 1] : '610x610').split('x').map(Number);
const GAP = 6; // between parts on a sheet
const f = (n) => (Math.round(n * 1000) / 1000).toString();

/** a part as flat geometry in its own frame, min corner at 0,0, y up */
function flat(p) {
  const all = p.poly;
  const u0 = Math.min(...all.map((q) => q[0]));
  const v0 = Math.min(...all.map((q) => q[1]));
  const sh = (q) => [q[0] - u0, q[1] - v0];
  const loops = [p.poly.map(sh)];
  const circles = [];
  for (const h of p.holes) {
    if (h.circle) circles.push([h.circle[0] - u0, h.circle[1] - v0, h.circle[2]]);
    else loops.push(h.poly.map(sh));
  }
  for (const s of p.slots) loops.push(s.poly.map(sh));
  const w = Math.max(...loops[0].map((q) => q[0]));
  const h = Math.max(...loops[0].map((q) => q[1]));
  // the label goes where there is material: the widest clear spot along the middle, simply the centre here
  return {name: p.label ?? p.name, loops, circles, w, h, label: [w / 2, Math.min(h - 6, Math.max(6, h * 0.5))]};
}
const rot = (part) => ({
  ...part,
  loops: part.loops.map((l) => l.map(([x, y]) => [part.h - y, x])),
  circles: part.circles.map(([x, y, r]) => [part.h - y, x, r]),
  w: part.h,
  h: part.w,
  label: [part.h - part.label[1], part.label[0]],
});

/** shelf packing, biggest first, either way round */
function nest(parts) {
  const items = parts.flatMap((p) => Array.from({length: p.qty ?? 1}, () => p)).sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const sheets = [];
  const place = (sheet, part) => {
    for (const cand of [part, rot(part)]) {
      if (cand.w > SW - 2 * GAP || cand.h > SH - 2 * GAP) continue;
      for (const shelf of sheet.shelves)
        if (cand.h <= shelf.h && shelf.x + cand.w <= SW - GAP) {
          sheet.items.push({part: cand, x: shelf.x, y: shelf.y});
          shelf.x += cand.w + GAP;
          return true;
        }
      const y = sheet.shelves.length ? sheet.shelves[sheet.shelves.length - 1].y + sheet.shelves[sheet.shelves.length - 1].h + GAP : GAP;
      if (y + cand.h <= SH - GAP) {
        sheet.shelves.push({y, h: cand.h, x: GAP + cand.w + GAP});
        sheet.items.push({part: cand, x: GAP, y});
        return true;
      }
    }
    return false;
  };
  const tooBig = [];
  for (const part of items) {
    if (!sheets.some((s) => place(s, part))) {
      const s = {shelves: [], items: []};
      if (place(s, part)) sheets.push(s);
      else tooBig.push(part.name);
    }
  }
  return {sheets, tooBig};
}

// ------------------------------------------------------------ writers
function svg(items, W, H, title) {
  let body = '';
  for (const {part, x, y} of items) {
    const X = (q) => f(x + q[0]);
    const Y = (q) => f(H - (y + q[1]));
    for (const l of part.loops) body += `<path d="M${l.map((q) => `${X(q)} ${Y(q)}`).join('L')}Z"/>`;
    for (const [cx, cy, r] of part.circles) body += `<circle cx="${X([cx, cy])}" cy="${Y([cx, cy])}" r="${f(r)}"/>`;
  }
  let text = '';
  for (const {part, x, y} of items) text += `<text x="${f(x + part.label[0])}" y="${f(H - (y + part.label[1]))}">${part.name}</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<title>${title}</title>
<g id="cut" fill="none" stroke="#ff0000" stroke-width="0.1">${body}</g>
<g id="engrave" fill="#0000ff" font-family="sans-serif" font-size="5" text-anchor="middle">${text}</g>
</svg>
`;
}
function dxf(items) {
  const L = [];
  const e = (...kv) => L.push(...kv.map(String));
  e(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  e(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 2);
  e(0, 'LAYER', 2, 'CUT', 70, 0, 62, 1, 6, 'CONTINUOUS');
  e(0, 'LAYER', 2, 'ENGRAVE', 70, 0, 62, 5, 6, 'CONTINUOUS');
  e(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  for (const {part, x, y} of items) {
    for (const l of part.loops) {
      e(0, 'POLYLINE', 8, 'CUT', 66, 1, 70, 1);
      for (const q of l) e(0, 'VERTEX', 8, 'CUT', 10, f(x + q[0]), 20, f(y + q[1]), 30, 0);
      e(0, 'SEQEND', 8, 'CUT');
    }
    for (const [cx, cy, r] of part.circles) e(0, 'CIRCLE', 8, 'CUT', 10, f(x + cx), 20, f(y + cy), 30, 0, 40, f(r));
    e(0, 'TEXT', 8, 'ENGRAVE', 10, f(x + part.label[0]), 20, f(y + part.label[1]), 30, 0, 40, 5, 1, part.name, 72, 1, 11, f(x + part.label[0]), 21, f(y + part.label[1]), 31, 0);
  }
  e(0, 'ENDSEC', 0, 'EOF');
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------ run
for (const key of Object.keys(MATERIALS)) {
  const {plates, mats} = buildPlates(key);
  const out = path.join(here, '..', 'cut', key);
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(path.join(out, 'parts'), {recursive: true});
  const parts = plates.map((p) => ({...flat(p), qty: p.qty}));
  for (const p of parts) {
    const items = [{part: p, x: 2, y: 2}];
    fs.writeFileSync(path.join(out, 'parts', `${p.name.split(' ')[0]}.svg`), svg(items, Math.ceil(p.w + 4), Math.ceil(p.h + 4), `${p.name} · ${mats.name}`));
    fs.writeFileSync(path.join(out, 'parts', `${p.name.split(' ')[0]}.dxf`), dxf(items));
  }
  const {sheets, tooBig} = nest(parts);
  sheets.forEach((s, i) => {
    fs.writeFileSync(path.join(out, `sheet-${i + 1}.svg`), svg(s.items, SW, SH, `sheet ${i + 1} of ${sheets.length} · ${mats.name}`));
    fs.writeFileSync(path.join(out, `sheet-${i + 1}.dxf`), dxf(s.items));
  });
  // the fit comb
  {
    const c = fitComb(key);
    const comb = {
      name: c.name,
      loops: [c.outline, ...c.slots.map((s) => s.poly), c.tab],
      circles: [],
      w: 150,
      h: 73,
      label: [75, 22],
    };
    const items = [{part: comb, x: 2, y: 2}];
    let s = svg(items, 154, 78, `slot fit comb · ${mats.name}`);
    s = s.replace('</g>\n</svg>', c.slots.map((q) => `<text x="${f(2 + q.at[0])}" y="${f(78 - (2 + q.at[1]))}">${q.label}</text>`).join('') + '</g>\n</svg>');
    fs.writeFileSync(path.join(out, 'fit-comb.svg'), s);
    fs.writeFileSync(path.join(out, 'fit-comb.dxf'), dxf(items));
  }
  const csv = ['part,qty,width_mm,height_mm,material', ...parts.map((p) => `${p.name.split(' ')[0]},${p.qty},${p.w.toFixed(1)},${p.h.toFixed(1)},${mats.name}`)];
  fs.writeFileSync(path.join(out, 'parts.csv'), csv.join('\n') + '\n');
  console.log(`${mats.name}: ${parts.length} parts on ${sheets.length} sheet(s) of ${SW} x ${SH} mm${tooBig.length ? `; too big for the sheet: ${tooBig.join(', ')}` : ''} -> ${path.relative(process.cwd(), out)}`);
}
