// Writes ../pollinator-film/timeline.json from the routine itself, so the score and the review sheets use the same
// times the film does:  node teardown/pollinator-shared/timeline.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DURATION, PICKS, SHOTS, tipTime} from './routine.js';

// film.js imports the kit (a browser module), so its script times are read from the source
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'film.js'), 'utf8');
const script = src.slice(src.indexOf('export const SCRIPT'), src.indexOf('];', src.indexOf('export const SCRIPT')));
const clicks = [...script.matchAll(/\{t: ([\d.]+),/g)].map((m) => Number(m[1])).filter((t) => t > 0);
const r2 = (x) => Math.round(x * 100) / 100;
const tl = {
  duration: DURATION,
  shots: SHOTS.filter((s) => !s.place).map((s) => r2(s.t)),
  lands: SHOTS.filter((s) => !s.place).map((s) => r2(s.land)),
  places: SHOTS.filter((s) => s.place).map((s) => r2(s.t)),
  tip: r2(tipTime()),
  picks: PICKS.map((p) => r2(p.t)),
  clicks,
};
fs.writeFileSync(path.join(here, '../pollinator-film/timeline.json'), JSON.stringify(tl));
console.log(tl);
