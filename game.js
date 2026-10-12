'use strict';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const FIELD_W = 32;
const FIELD_H = 24;
const GATE_LEN = 2.5;
const TEAM_COLORS = { red: '#d6453d', blue: '#2f6fd6' };

// Pens always have their gate on the south (y1) side, starting at gateX.
// A pen with a colour only accepts sheep of that colour.
const LEVELS = [
  {
    name: 'The Drive',
    intro: 'Drive the flock through the gap and into the pen.',
    pens: [{ x0: 24, y0: 0, x1: 32, y1: 7, gateX: 26.5, color: null }],
    fences: [[14, 0, 14, 8], [14, 13, 14, FIELD_H]],
    circles: [
      { kind: 'pond', x: 19.5, y: 16, r: 2.3 },
      { kind: 'tree', x: 5, y: 5, r: 0.6 },
      { kind: 'tree', x: 8.5, y: 3, r: 0.6 },
      { kind: 'tree', x: 9.5, y: 7.5, r: 0.6 },
      { kind: 'tree', x: 19, y: 21.5, r: 0.6 },
      { kind: 'tree', x: 23.5, y: 22, r: 0.6 },
      { kind: 'tree', x: 28, y: 18.5, r: 0.6 },
      { kind: 'tree', x: 21, y: 10.5, r: 0.6 },
      { kind: 'rock', x: 11.5, y: 18, r: 0.6 },
      { kind: 'rock', x: 17.5, y: 5, r: 0.7 },
      { kind: 'rock', x: 29, y: 13, r: 0.5 },
      { kind: 'rock', x: 16.5, y: 10.5, r: 0.45 },
    ],
    flocks: [{ color: null, count: 10, x: 6, y: 17, r: 2.2 }],
    dogs: [[2.5, 20], [6, 22]],
  },
  {
    name: 'The Shed',
    intro: 'Split the mixed flock: red-marked sheep to the red pen, blue to the blue pen.',
    pens: [
      { x0: 0, y0: 0, x1: 7, y1: 7, gateX: 2, color: 'blue' },
      { x0: 25, y0: 0, x1: 32, y1: 7, gateX: 27, color: 'red' },
    ],
    fences: [[16, 0, 16, 9]],
    circles: [
      { kind: 'pond', x: 24, y: 16.5, r: 2 },
      { kind: 'tree', x: 5, y: 12, r: 0.6 },
      { kind: 'tree', x: 11, y: 20.5, r: 0.6 },
      { kind: 'tree', x: 28, y: 21, r: 0.6 },
      { kind: 'tree', x: 20, y: 11, r: 0.6 },
      { kind: 'tree', x: 11.5, y: 9.5, r: 0.6 },
      { kind: 'rock', x: 6, y: 18, r: 0.6 },
      { kind: 'rock', x: 29.5, y: 12, r: 0.5 },
      { kind: 'rock', x: 19, y: 20.5, r: 0.5 },
    ],
    flocks: [
      { color: 'red', count: 6, x: 15, y: 17, r: 2.4 },
      { color: 'blue', count: 6, x: 15, y: 17, r: 2.4 },
    ],
    dogs: [[10, 22], [20, 22]],
  },
];

const DOG_SPEED = 6.5;
const DOG_ACCEL = 12;
const SHEEP_CALM_SPEED = 0.6;
const SHEEP_PANIC_SPEED = 4.2;
const FLEE_RADIUS = 4.5;       // base radius at which a dog scares sheep
const FLEE_RADIUS_RUN = 1.8;   // extra radius when the dog is sprinting
const SHEEP_R = 0.42;
const DOG_R = 0.4;

const DOG_KEYS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', color: '#d6453d' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', color: '#2f6fd6' },
];

// ---------------------------------------------------------------------------
// Canvas + isometric projection
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let CW = 0, CH = 0, S = 20, OX = 0, OY = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  CW = window.innerWidth;
  CH = window.innerHeight;
  canvas.width = CW * dpr;
  canvas.height = CH * dpr;
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const span = FIELD_W + FIELD_H;
  S = Math.min(CW / (span + 2), CH / (span / 2 + 5));
  OX = CW / 2 - ((FIELD_W - FIELD_H) / 2) * S;
  OY = (CH - (span / 2) * S) / 2 + 1.5 * S;
}
window.addEventListener('resize', resize);
resize();

// World (x, y, height z) -> screen
function iso(x, y, z = 0) {
  return { x: OX + (x - y) * S, y: OY + (x + y) * S * 0.5 - z * S };
}
// World direction -> screen direction (unnormalised)
function isoDir(dx, dy) {
  return { x: dx - dy, y: (dx + dy) * 0.5 };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
const GAME_KEYS = new Set(DOG_KEYS.flatMap(k => [k.up, k.down, k.left, k.right]));

window.addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code) || e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  ensureAudio();
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyM') muted = !muted;
  if ((e.code === 'KeyN' || e.code === 'Enter') && game.state === 'won' && levelIdx + 1 < LEVELS.length) {
    levelIdx++;
    reset();
  }
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit && LEVELS[digit[1] - 1]) {
    levelIdx = digit[1] - 1;
    reset();
  }
  if (GAME_KEYS.has(e.code) && game.state === 'ready') startGame();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Screen-relative input ("up" moves up the screen) converted to a world direction.
function readDogInput(map) {
  let sx = 0, sy = 0;
  if (keys.has(map.left)) sx -= 1;
  if (keys.has(map.right)) sx += 1;
  if (keys.has(map.up)) sy -= 1;
  if (keys.has(map.down)) sy += 1;
  if (!sx && !sy) return { x: 0, y: 0 };
  // inverse of isoDir: x = sy + sx/2, y = sy - sx/2
  const wx = sy + sx / 2, wy = sy - sx / 2;
  const len = Math.hypot(wx, wy);
  return { x: wx / len, y: wy / len };
}

// ---------------------------------------------------------------------------
// Audio: a tiny synthesised "baa"
// ---------------------------------------------------------------------------
let actx = null;
let muted = false;
let baaCooldown = 0;

function ensureAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    else if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}

function baa(pitch = 1) {
  if (!actx || muted || baaCooldown > 0) return;
  baaCooldown = 0.35;
  const t = actx.currentTime;
  const f0 = 230 * pitch;
  const o = actx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 1.12, t);
  o.frequency.linearRampToValueAtTime(f0, t + 0.12);
  o.frequency.linearRampToValueAtTime(f0 * 0.88, t + 0.5);
  const lfo = actx.createOscillator();
  lfo.frequency.value = 26;
  const lfoGain = actx.createGain();
  lfoGain.gain.value = f0 * 0.07;
  lfo.connect(lfoGain).connect(o.frequency);
  const filt = actx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1000;
  filt.Q.value = 1.3;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.04);
  g.gain.setValueAtTime(0.1, t + 0.32);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(filt).connect(g).connect(actx.destination);
  o.start(t); lfo.start(t);
  o.stop(t + 0.65); lfo.stop(t + 0.65);
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------
// ?level=2 jumps straight to a level
let levelIdx = Math.max(0, Math.min(LEVELS.length - 1,
  (parseInt(new URLSearchParams(location.search).get('level'), 10) || 1) - 1));
const level = { segs: [], circles: [], pens: [] };

function buildLevel() {
  const def = LEVELS[levelIdx];
  const segs = [];
  const fence = (x1, y1, x2, y2) => segs.push({ x1, y1, x2, y2 });

  // Field boundary
  fence(0, 0, FIELD_W, 0);
  fence(FIELD_W, 0, FIELD_W, FIELD_H);
  fence(FIELD_W, FIELD_H, 0, FIELD_H);
  fence(0, FIELD_H, 0, 0);

  for (const f of def.fences) fence(...f);

  // Pen walls; sides lying on the field boundary reuse the boundary fence
  level.pens = def.pens.map(p => {
    if (p.x0 > 0) fence(p.x0, p.y0, p.x0, p.y1);
    if (p.x1 < FIELD_W) fence(p.x1, p.y0, p.x1, p.y1);
    fence(p.x0, p.y1, p.gateX, p.y1);
    fence(p.gateX + GATE_LEN, p.y1, p.x1, p.y1);
    // Gate swings from open (pointing out into the field) to closed (across the gap)
    return { ...p, angle: Math.PI / 2, target: Math.PI / 2, closed: false };
  });

  // Per-tile grass shade, precomputed so the ground doesn't flicker
  const shade = [];
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) shade.push(Math.random());
  }

  level.segs = segs;
  level.circles = def.circles;
  level.shade = shade;
}

function gateSeg(p) {
  return {
    x1: p.gateX, y1: p.y1,
    x2: p.gateX + Math.cos(p.angle) * GATE_LEN,
    y2: p.y1 + Math.sin(p.angle) * GATE_LEN,
  };
}

function allSegs() {
  return level.segs.concat(level.pens.map(gateSeg));
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
let sheep = [];
let dogs = [];
const game = { state: 'ready', time: 0, closeTimer: 0 };

function makeSheep(x, y, color) {
  return {
    x, y, vx: 0, vy: 0, color,
    heading: Math.random() * Math.PI * 2,
    wander: Math.random() * Math.PI * 2,
    grazing: Math.random() < 0.5,
    grazeT: Math.random() * 3,
    fear: 0,
    phase: Math.random() * 10,
    pitch: 0.85 + Math.random() * 0.35,
    pen: null,      // pen the sheep is standing in, if any
    penned: false,  // standing in a pen that accepts it
  };
}

function makeDog(x, y, i) {
  return { x, y, vx: 0, vy: 0, heading: -Math.PI * 0.75, phase: 0, idx: i };
}

function reset() {
  const def = LEVELS[levelIdx];
  buildLevel();
  sheep = [];
  for (const f of def.flocks) {
    for (let i = 0; i < f.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * f.r;
      sheep.push(makeSheep(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, f.color));
    }
  }
  dogs = def.dogs.map(([x, y], i) => makeDog(x, y, i));
  game.state = 'ready';
  game.time = 0;
  game.closeTimer = 0;
  document.getElementById('levelName').textContent = `Level ${levelIdx + 1}: ${def.name}`;
  document.getElementById('introTitle').textContent = `Level ${levelIdx + 1}: ${def.name}`;
  document.getElementById('introText').textContent = def.intro;
  document.getElementById('intro').classList.remove('hidden');
  document.getElementById('win').classList.add('hidden');
  document.getElementById('total').textContent = sheep.length;
}

function startGame() {
  game.state = 'playing';
  document.getElementById('intro').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Physics helpers
// ---------------------------------------------------------------------------
function closestOnSeg(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - s.x1) * dx + (py - s.y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: s.x1 + dx * t, y: s.y1 + dy * t };
}

// Push an entity out of fences and solid obstacles, killing velocity into walls.
function resolveStatic(e, r, segs) {
  for (const s of segs) {
    const c = closestOnSeg(e.x, e.y, s);
    const dx = e.x - c.x, dy = e.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < r && d > 1e-6) {
      const nx = dx / d, ny = dy / d;
      e.x += nx * (r - d);
      e.y += ny * (r - d);
      const vn = e.vx * nx + e.vy * ny;
      if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
    }
  }
  for (const o of level.circles) {
    const dx = e.x - o.x, dy = e.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = r + o.r;
    if (d < min && d > 1e-6) {
      const nx = dx / d, ny = dy / d;
      e.x += nx * (min - d);
      e.y += ny * (min - d);
      const vn = e.vx * nx + e.vy * ny;
      if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
    }
  }
}

function separate(a, b, ra, rb, wa) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = ra + rb;
  if (d < min && d > 1e-6) {
    const push = (min - d);
    const nx = dx / d, ny = dy / d;
    a.x -= nx * push * wa;
    a.y -= ny * push * wa;
    b.x += nx * push * (1 - wa);
    b.y += ny * push * (1 - wa);
  }
}

function penAt(e) {
  const m = 0.2;
  return level.pens.find(p => e.x > p.x0 + m && e.x < p.x1 - m && e.y > p.y0 + m && e.y < p.y1 - 0.3) || null;
}

// Anywhere in the pen (including the gateway) or within reach of the swinging gate
function inGateZone(e, p) {
  const inside = e.x > p.x0 && e.x < p.x1 && e.y > p.y0 && e.y < p.y1;
  const dx = e.x - p.gateX, dy = e.y - p.y1;
  const inSwing = dx > -0.6 && dy > -0.6 && Math.hypot(dx, dy) < GATE_LEN + 0.8;
  return inside || inSwing;
}

function accepts(pen, s) {
  return pen.color === null || pen.color === s.color;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateDogs(dt, segs) {
  for (const d of dogs) {
    const input = game.state === 'playing' ? readDogInput(DOG_KEYS[d.idx]) : { x: 0, y: 0 };
    const k = Math.min(1, DOG_ACCEL * dt);
    d.vx += (input.x * DOG_SPEED - d.vx) * k;
    d.vy += (input.y * DOG_SPEED - d.vy) * k;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > 0.3) d.heading = Math.atan2(d.vy, d.vx);
    d.phase += sp * dt * 3.2;
    resolveStatic(d, DOG_R, segs);
  }
  separate(dogs[0], dogs[1], DOG_R, DOG_R, 0.5);
}

function updateSheep(dt, segs) {
  for (const s of sheep) {
    let ax = 0, ay = 0;

    // Flee from dogs. Faster dogs are scarier from further away.
    let fear = 0;
    for (const d of dogs) {
      const dx = s.x - d.x, dy = s.y - d.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const run = Math.min(1, Math.hypot(d.vx, d.vy) / DOG_SPEED);
      const R = FLEE_RADIUS + FLEE_RADIUS_RUN * run;
      if (dist < R) {
        const f = 1 - dist / R;
        fear = Math.max(fear, f);
        ax += (dx / dist) * f * 16;
        ay += (dy / dist) * f * 16;
      }
    }
    if (s.fear < 0.35 && fear > 0.55 && Math.random() < 0.6) baa(s.pitch);
    s.fear = fear;

    // Flocking: separation, cohesion, alignment. Scared sheep bunch up.
    // Sheep prefer their own colour, which is what makes shedding possible.
    let cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
    for (const o of sheep) {
      if (o === s) continue;
      const dx = s.x - o.x, dy = s.y - o.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      if (dist < 1.1) {
        const f = 1 - dist / 1.1;
        ax += (dx / dist) * f * 9;
        ay += (dy / dist) * f * 9;
      }
      // A penned sheep doesn't drag outside sheep around (and vice versa)
      if (dist < 5 && o.pen === s.pen) {
        const w = o.color === s.color ? 1 : 0.5;
        cx += o.x * w; cy += o.y * w; avx += o.vx * w; avy += o.vy * w; n += w;
      }
    }
    if (n) {
      const coh = 0.25 + fear * 1.6;
      ax += (cx / n - s.x) * coh;
      ay += (cy / n - s.y) * coh;
      const ali = 0.3 + fear * 1.8;
      ax += (avx / n - s.vx) * ali;
      ay += (avy / n - s.vy) * ali;
    }

    // Calm behaviour: alternate between grazing and ambling about.
    s.grazeT -= dt;
    if (s.grazeT <= 0) {
      s.grazing = !s.grazing;
      s.grazeT = s.grazing ? 2 + Math.random() * 4 : 1 + Math.random() * 2.5;
    }
    s.wander += (Math.random() - 0.5) * dt * 4;
    const calm = 1 - Math.min(1, fear * 2.5);
    if (!s.grazing) {
      ax += Math.cos(s.wander) * 1.2 * calm;
      ay += Math.sin(s.wander) * 1.2 * calm;
    }

    // Sheep in the right pen are content and drift toward the back of it.
    // Sheep in the wrong pen get no such comfort and can be driven back out.
    s.pen = penAt(s);
    s.penned = !!s.pen && accepts(s.pen, s);
    if (s.penned) {
      ax += ((s.pen.x0 + s.pen.x1) / 2 - s.x) * 0.25;
      ay += ((s.pen.y0 + s.pen.y1) / 2 - 1 - s.y) * 0.25;
    }

    // Steer away from walls and obstacles before touching them.
    for (const seg of segs) {
      const c = closestOnSeg(s.x, s.y, seg);
      const dx = s.x - c.x, dy = s.y - c.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      if (dist < 1.2) {
        const f = 1 - dist / 1.2;
        ax += (dx / dist) * f * 6;
        ay += (dy / dist) * f * 6;
      }
    }
    for (const o of level.circles) {
      const dx = s.x - o.x, dy = s.y - o.y;
      const dist = (Math.hypot(dx, dy) || 1e-6);
      const gap = dist - o.r;
      if (gap < 1.4) {
        const f = 1 - Math.max(0, gap) / 1.4;
        ax += (dx / dist) * f * 7;
        ay += (dy / dist) * f * 7;
      }
    }

    // Integrate
    s.vx += ax * dt;
    s.vy += ay * dt;
    const friction = s.grazing && fear < 0.05 ? 4 : 1.2;
    const damp = Math.max(0, 1 - friction * dt);
    s.vx *= damp;
    s.vy *= damp;
    const max = SHEEP_CALM_SPEED + (SHEEP_PANIC_SPEED - SHEEP_CALM_SPEED) * Math.min(1, fear * 1.4);
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > max) { s.vx *= max / sp; s.vy *= max / sp; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (sp > 0.15) {
      const target = Math.atan2(s.vy, s.vx);
      let diff = target - s.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      s.heading += diff * Math.min(1, dt * 8);
    }
    s.phase += sp * dt * 5;
  }

  // Bodies: sheep vs sheep, dogs shove sheep
  for (let i = 0; i < sheep.length; i++) {
    for (let j = i + 1; j < sheep.length; j++) separate(sheep[i], sheep[j], SHEEP_R, SHEEP_R, 0.5);
    for (const d of dogs) separate(d, sheep[i], DOG_R, SHEEP_R, 0.15);
  }
  for (const s of sheep) resolveStatic(s, SHEEP_R, segs);
  for (const d of dogs) resolveStatic(d, DOG_R, segs);

  // Rare idle baa
  if (Math.random() < dt * 0.08) baa(sheep[(Math.random() * sheep.length) | 0].pitch);
}

function update(dt) {
  baaCooldown -= dt;
  const segs = allSegs();
  updateDogs(dt, segs);
  updateSheep(dt, segs);

  const penned = sheep.filter(s => s.penned).length;
  document.getElementById('penned').textContent = penned;

  if (game.state === 'playing') {
    game.time += dt;
    // A gate swings shut once its pen holds every sheep it wants and nothing
    // else is inside or in the gate's path. If something gets in the way
    // mid-swing it swings back open, so nothing can be swept in and trapped.
    for (const p of level.pens) {
      if (p.closed) continue;
      const blocked = dogs.some(d => inGateZone(d, p)) ||
        sheep.some(s => !accepts(p, s) && inGateZone(s, p));
      const ready = !blocked && sheep.every(s => !accepts(p, s) || s.pen === p);
      p.target = ready ? 0 : Math.PI / 2;
      if (ready && p.angle < 0.03) {
        p.closed = true;
        if (level.pens.length > 1) baa(1.1);
      }
    }
    if (level.pens.every(p => p.closed)) game.state = 'closing';
  }

  // Swing gates toward their target angle
  for (const p of level.pens) p.angle += (p.target - p.angle) * Math.min(1, dt * 4);

  if (game.state === 'closing') {
    game.closeTimer += dt;
    if (game.closeTimer > 0.4) win();
  }
  document.getElementById('time').textContent = fmtTime(game.time);
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function win() {
  game.state = 'won';
  let best = null;
  const key = levelIdx === 0 ? 'sheepdog-best' : `sheepdog-best-${levelIdx + 1}`;
  try {
    best = parseFloat(localStorage.getItem(key));
    if (!(best > 0) || game.time < best) {
      localStorage.setItem(key, String(game.time));
      best = null;
    }
  } catch (e) { best = undefined; }
  document.getElementById('winTime').textContent = fmtTime(game.time);
  document.getElementById('best').textContent =
    best === null ? 'New best time!' : best ? `Best: ${fmtTime(best)}` : '';
  const hasNext = levelIdx + 1 < LEVELS.length;
  document.getElementById('winNext').innerHTML = hasNext
    ? 'Press <kbd>N</kbd> for the next level, or <kbd>R</kbd> to replay'
    : 'That was the last level! Press <kbd>R</kbd> to replay, or <kbd>1</kbd> to start over';
  document.getElementById('win').classList.remove('hidden');
  baa(1.2);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function poly(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function groundEllipse(x, y, r, fill) {
  const p = iso(x, y);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * Math.SQRT2 * S, r * Math.SQRT2 * 0.5 * S, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawGround() {
  // Earthy sides to make the field look like a diorama
  const depth = 1.2;
  ctx.fillStyle = '#8a6a43';
  poly([iso(0, FIELD_H), iso(FIELD_W, FIELD_H), iso(FIELD_W, FIELD_H, -depth), iso(0, FIELD_H, -depth)]);
  ctx.fill();
  ctx.fillStyle = '#6f5434';
  poly([iso(FIELD_W, 0), iso(FIELD_W, FIELD_H), iso(FIELD_W, FIELD_H, -depth), iso(FIELD_W, 0, -depth)]);
  ctx.fill();

  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      const v = level.shade[y * FIELD_W + x];
      const pen = level.pens.find(p => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1);
      let col;
      if (pen && pen.color === 'red') {
        col = `hsl(10, ${42 + v * 10}%, ${66 + v * 5}%)`;
      } else if (pen && pen.color === 'blue') {
        col = `hsl(212, ${32 + v * 10}%, ${68 + v * 5}%)`;
      } else if (pen) {
        col = `hsl(38, ${40 + v * 10}%, ${62 + v * 6}%)`;
      } else {
        const checker = (x + y) % 2 ? 0 : 3;
        col = `hsl(${95 + v * 12}, ${45 + v * 10}%, ${50 + checker + v * 4}%)`;
      }
      ctx.fillStyle = col;
      poly([iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)]);
      ctx.fill();
    }
  }

  // Pond
  for (const o of level.circles) {
    if (o.kind !== 'pond') continue;
    groundEllipse(o.x, o.y, o.r + 0.25, '#7a9a55');
    groundEllipse(o.x, o.y, o.r, '#4f9fc9');
    groundEllipse(o.x - 0.4, o.y - 0.4, o.r * 0.6, 'rgba(255,255,255,0.18)');
  }

  // Shadows
  const shadow = 'rgba(30, 50, 20, 0.25)';
  for (const s of sheep) groundEllipse(s.x, s.y, 0.42, shadow);
  for (const d of dogs) {
    groundEllipse(d.x, d.y, 0.62, DOG_KEYS[d.idx].color + '55');
    groundEllipse(d.x, d.y, 0.38, shadow);
  }
  for (const o of level.circles) {
    if (o.kind === 'tree') groundEllipse(o.x + 0.3, o.y + 0.3, 1.0, shadow);
  }
}

function drawFencePiece(p) {
  const a0 = iso(p.x1, p.y1, 0), b0 = iso(p.x2, p.y2, 0);
  ctx.lineCap = 'round';
  // rails
  for (const h of [0.3, 0.62]) {
    const a = iso(p.x1, p.y1, h), b = iso(p.x2, p.y2, h);
    ctx.strokeStyle = '#5b3d22';
    ctx.lineWidth = S * 0.14;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#a77a4c';
    ctx.lineWidth = S * 0.08;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // posts
  const posts = p.endPost ? [a0, b0] : [a0];
  for (const q of posts) {
    ctx.strokeStyle = '#4a311b';
    ctx.lineWidth = S * 0.2;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - S * 0.85); ctx.stroke();
    ctx.strokeStyle = '#8c6239';
    ctx.lineWidth = S * 0.12;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - S * 0.85); ctx.stroke();
  }
}

function drawGate(p, color) {
  const corners = [iso(p.x1, p.y1, 0.15), iso(p.x2, p.y2, 0.15), iso(p.x2, p.y2, 0.75), iso(p.x1, p.y1, 0.75)];
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3d2a17';
  ctx.lineWidth = S * 0.14;
  poly(corners); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); ctx.lineTo(corners[2].x, corners[2].y); ctx.stroke();
  ctx.strokeStyle = color ? TEAM_COLORS[color] : '#d9b26a';
  ctx.lineWidth = S * 0.08;
  poly(corners); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); ctx.lineTo(corners[2].x, corners[2].y); ctx.stroke();
}

function drawTree(o) {
  const base = iso(o.x, o.y);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(base.x - S * 0.14, base.y - S * 1.2, S * 0.28, S * 1.2);
  const c = iso(o.x, o.y, 1.9);
  const blobs = [[-0.45, 0.2, 0.62], [0.45, 0.2, 0.62], [0, -0.25, 0.7], [0, 0.35, 0.6]];
  ctx.fillStyle = '#2f6b33';
  for (const [dx, dy, r] of blobs) {
    ctx.beginPath(); ctx.arc(c.x + dx * S, c.y + dy * S, r * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#4a9147';
  for (const [dx, dy, r] of blobs) {
    ctx.beginPath(); ctx.arc(c.x + dx * S - r * S * 0.15, c.y + dy * S - r * S * 0.2, r * S * 0.75, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRock(o) {
  const p = iso(o.x, o.y);
  const w = o.r * S * 1.5, h = o.r * S * 1.1;
  ctx.fillStyle = '#7d8086';
  ctx.beginPath();
  ctx.moveTo(p.x - w, p.y);
  ctx.quadraticCurveTo(p.x - w, p.y - h * 1.4, p.x - w * 0.1, p.y - h * 1.5);
  ctx.quadraticCurveTo(p.x + w, p.y - h * 1.3, p.x + w, p.y);
  ctx.quadraticCurveTo(p.x, p.y + h * 0.5, p.x - w, p.y);
  ctx.fill();
  ctx.fillStyle = '#a3a6ab';
  ctx.beginPath();
  ctx.ellipse(p.x - w * 0.25, p.y - h * 1.05, w * 0.45, h * 0.35, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSheep(s) {
  const moving = Math.hypot(s.vx, s.vy) > 0.15;
  const bob = moving ? Math.abs(Math.sin(s.phase)) * 0.1 : 0;
  const ground = iso(s.x, s.y);
  const p = iso(s.x, s.y, 0.42 + bob);
  const hd = isoDir(Math.cos(s.heading), Math.sin(s.heading));
  const hl = Math.hypot(hd.x, hd.y);
  const ux = hd.x / hl, uy = hd.y / hl;

  // legs
  ctx.strokeStyle = '#3a3330';
  ctx.lineWidth = S * 0.09;
  ctx.lineCap = 'round';
  const legs = [[-0.2, -0.05], [0.2, -0.05], [-0.14, 0.08], [0.14, 0.08]];
  legs.forEach(([lx, ly], i) => {
    const swing = moving ? Math.sin(s.phase * 2 + i * Math.PI) * 0.07 : 0;
    ctx.beginPath();
    ctx.moveTo(ground.x + lx * S, p.y + S * 0.1);
    ctx.lineTo(ground.x + (lx + swing) * S, ground.y + ly * S);
    ctx.stroke();
  });

  const grazeDip = s.grazing && !moving ? 0.12 : 0;
  const head = { x: p.x + ux * S * 0.42, y: p.y + uy * S * 0.3 + S * (0.05 + grazeDip) };
  const drawHead = () => {
    ctx.fillStyle = '#2e2926';
    ctx.beginPath(); ctx.ellipse(head.x, head.y, S * 0.15, S * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(head.x - S * 0.15, head.y - S * 0.05, S * 0.08, S * 0.04, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(head.x + S * 0.15, head.y - S * 0.05, S * 0.08, S * 0.04, 0.4, 0, Math.PI * 2); ctx.fill();
  };
  if (uy < 0) drawHead();

  // fluffy body
  const puffs = [[-0.24, 0, 0.22], [0.24, 0, 0.22], [0, -0.12, 0.24], [0, 0.08, 0.24], [-0.12, -0.08, 0.2], [0.12, -0.08, 0.2]];
  ctx.fillStyle = '#b9b2a6';
  for (const [dx, dy, r] of puffs) {
    ctx.beginPath(); ctx.arc(p.x + dx * S, p.y + dy * S, (r + 0.035) * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = s.penned ? '#fffdf2' : '#f7f3e8';
  for (const [dx, dy, r] of puffs) {
    ctx.beginPath(); ctx.arc(p.x + dx * S, p.y + dy * S, r * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(p.x - S * 0.06, p.y - S * 0.16, S * 0.11, 0, Math.PI * 2); ctx.fill();

  // Raddle mark on the back, like farmers spray on real sheep
  if (s.color) {
    ctx.fillStyle = TEAM_COLORS[s.color];
    ctx.beginPath(); ctx.ellipse(p.x + S * 0.02, p.y - S * 0.08, S * 0.17, S * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  }

  if (uy >= 0) drawHead();

  // panic marker
  if (s.fear > 0.6) {
    ctx.fillStyle = '#d6453d';
    ctx.font = `bold ${Math.round(S * 0.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', p.x, p.y - S * 0.45);
  }
}

function drawDog(d) {
  const color = DOG_KEYS[d.idx].color;
  const sp = Math.hypot(d.vx, d.vy);
  const moving = sp > 0.3;
  const ground = iso(d.x, d.y);
  const bob = moving ? Math.abs(Math.sin(d.phase)) * 0.08 : 0;
  const p = iso(d.x, d.y, 0.35 + bob);
  const hd = isoDir(Math.cos(d.heading), Math.sin(d.heading));
  const hl = Math.hypot(hd.x, hd.y);
  const ux = hd.x / hl, uy = hd.y / hl;
  const ang = Math.atan2(uy, ux);

  // legs
  ctx.strokeStyle = '#1f1d1c';
  ctx.lineWidth = S * 0.08;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const along = i < 2 ? 0.22 : -0.22;
    const side = i % 2 ? 0.07 : -0.07;
    const swing = moving ? Math.sin(d.phase * 2 + (i < 2 ? 0 : Math.PI) + side * 10) * 0.12 : 0;
    const bx = p.x + ux * along * S - uy * side * S;
    const by = p.y + uy * along * S * 0.5 + S * 0.05;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + ux * swing * S, ground.y + uy * along * S * 0.5 + side * S);
    ctx.stroke();
  }

  // tail
  const tb = { x: p.x - ux * S * 0.36, y: p.y - uy * S * 0.18 };
  ctx.strokeStyle = '#1f1d1c';
  ctx.lineWidth = S * 0.09;
  ctx.beginPath();
  ctx.moveTo(tb.x, tb.y);
  ctx.quadraticCurveTo(tb.x - ux * S * 0.25, tb.y - S * 0.1, tb.x - ux * S * 0.3 + Math.sin(d.phase * 3) * S * 0.05, tb.y - S * 0.32);
  ctx.stroke();

  const head = { x: p.x + ux * S * 0.38, y: p.y + uy * S * 0.2 - S * 0.2 };
  const drawHead = () => {
    ctx.fillStyle = '#1f1d1c';
    ctx.beginPath(); ctx.arc(head.x, head.y, S * 0.16, 0, Math.PI * 2); ctx.fill();
    // snout
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath(); ctx.ellipse(head.x + ux * S * 0.12, head.y + S * 0.04, S * 0.09, S * 0.07, ang, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f1d1c';
    ctx.beginPath(); ctx.arc(head.x + ux * S * 0.2, head.y + S * 0.03, S * 0.035, 0, Math.PI * 2); ctx.fill();
    // ears
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(head.x + side * S * 0.06, head.y - S * 0.1);
      ctx.lineTo(head.x + side * S * 0.16, head.y - S * 0.27);
      ctx.lineTo(head.x + side * S * 0.16, head.y - S * 0.06);
      ctx.fill();
    }
  };
  if (uy < 0) drawHead();

  // body
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.scale(1, 0.75 + Math.abs(Math.sin(ang)) * 0.25);
  ctx.fillStyle = '#1f1d1c';
  ctx.beginPath(); ctx.ellipse(0, 0, S * 0.38, S * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath(); ctx.ellipse(S * 0.22, 0, S * 0.12, S * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // collar
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x + ux * S * 0.3, p.y + uy * S * 0.15 - S * 0.08, S * 0.08, 0, Math.PI * 2); ctx.fill();

  if (uy >= 0) drawHead();
}

function render() {
  ctx.clearRect(0, 0, CW, CH);
  drawGround();

  // Collect everything with height and paint back-to-front (by x + y)
  const items = [];
  for (const seg of level.segs) {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const n = Math.max(1, Math.round(len));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const piece = {
        x1: seg.x1 + (seg.x2 - seg.x1) * t0, y1: seg.y1 + (seg.y2 - seg.y1) * t0,
        x2: seg.x1 + (seg.x2 - seg.x1) * t1, y2: seg.y1 + (seg.y2 - seg.y1) * t1,
        endPost: i === n - 1,
      };
      items.push({ depth: (piece.x1 + piece.x2 + piece.y1 + piece.y2) / 2, draw: () => drawFencePiece(piece) });
    }
  }
  for (const pen of level.pens) {
    const gs = gateSeg(pen);
    items.push({ depth: (gs.x1 + gs.x2 + gs.y1 + gs.y2) / 2, draw: () => drawGate(gs, pen.color) });
  }
  for (const o of level.circles) {
    if (o.kind === 'tree') items.push({ depth: o.x + o.y, draw: () => drawTree(o) });
    if (o.kind === 'rock') items.push({ depth: o.x + o.y, draw: () => drawRock(o) });
  }
  for (const s of sheep) items.push({ depth: s.x + s.y, draw: () => drawSheep(s) });
  for (const d of dogs) items.push({ depth: d.x + d.y, draw: () => drawDog(d) });

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
