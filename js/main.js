import { Stickman } from './stickman.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
let DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));

const HOLD_TO_DRAG_MS = 140;
const DRAG_THRESHOLD_PX = 6;
const ROOM_MARGIN = 0.06;

const DEFAULT_PHRASES = [
  'Ma davvero?',
  'Ehi, con calma!',
  'Ti sembro un pupazzo?',
  'Ahi!',
  'Sempre a tormentarmi...',
  'Lasciami riposare.',
  'Non di nuovo.',
  'Basta tirarmi!',
  'Uff.',
  'Che noia!'
];

const state = {
  room: { x: 0, y: 0, w: 0, h: 0, stroke: 0 },
  lastT: 0,
  msg: { text: '', until: 0, x: 0, y: 0 },
  phrases: [...DEFAULT_PHRASES],
  input: {
    pointerId: null,
    pendingIndex: null,
    dragging: false,
    tappedHead: false,
    lastPX: 0,
    lastPY: 0,
    lastPT: 0,
    vX: 0,
    vY: 0,
    downPX: 0,
    downPY: 0,
    downPT: 0,
  },
};

const stickman = new Stickman();

function setCanvasSize() {
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = vw * DPR;
  canvas.height = vh * DPR;
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(DPR, DPR);

  const marginX = Math.round(vw * ROOM_MARGIN);
  const marginY = Math.round(vh * ROOM_MARGIN);
  state.room.x = marginX;
  state.room.y = marginY;
  state.room.w = Math.max(160, vw - marginX * 2);
  state.room.h = Math.max(160, vh - marginY * 2);
  state.room.stroke = Math.max(2, Math.round(Math.min(vw, vh) * 0.01));
}

function clear() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width / DPR, canvas.height / DPR);
}

function drawRoom() {
  const r = state.room;
  ctx.lineWidth = r.stroke;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function drawMessage() {
  const now = performance.now();
  if (!state.msg.text || now >= state.msg.until) {
    return;
  }
  ctx.save();
  ctx.fillStyle = '#fff';
  const fontSize = Math.max(12, Math.round(stickman.render.headRadius * 0.9));
  ctx.font = `${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textBaseline = 'bottom';
  const textWidth = ctx.measureText(state.msg.text).width;
  const px = clamp(state.msg.x - textWidth / 2, state.room.x + 8, state.room.x + state.room.w - textWidth - 8);
  const py = clamp(state.msg.y - stickman.render.headRadius * 1.4, state.room.y + 20, state.room.y + state.room.h - 20);
  ctx.fillText(state.msg.text, px, py);
  ctx.restore();
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    t: e.timeStamp || performance.now(),
  };
}

function speakAt(x, y) {
  const list = state.phrases.length ? state.phrases : DEFAULT_PHRASES;
  const line = list[Math.floor(Math.random() * list.length)] || DEFAULT_PHRASES[0];
  state.msg = {
    text: line,
    until: performance.now() + 1300,
    x,
    y,
  };
  if (navigator.vibrate) {
    navigator.vibrate(12);
  }
}

async function loadPhrases() {
  try {
    const res = await fetch('frasi.txt', { cache: 'no-store' });
    if (!res.ok) {
      return;
    }
    const txt = await res.text();
    const lines = txt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length) {
      state.phrases = lines;
    }
  } catch (err) {
    console.warn('Impossibile caricare frasi personalizzate', err);
  }
}

function onPointerDown(e) {
  if (state.input.pointerId !== null) {
    return;
  }
  const p = canvasPoint(e);
  const idx = stickman.nearestGrab(p.x, p.y);
  if (idx === -1) {
    return;
  }
  stickman.notifyUserAction();
  state.input.pointerId = e.pointerId;
  state.input.pendingIndex = idx;
  state.input.tappedHead = idx === stickman.render.headIndex;
  state.input.lastPX = p.x;
  state.input.lastPY = p.y;
  state.input.lastPT = p.t;
  state.input.downPX = p.x;
  state.input.downPY = p.y;
  state.input.downPT = p.t;
  state.input.vX = 0;
  state.input.vY = 0;
  state.input.dragging = false;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    console.debug('Pointer capture non disponibile', err);
  }
  if (navigator.vibrate) {
    navigator.vibrate(4);
  }
}

function onPointerMove(e) {
  if (state.input.pointerId !== e.pointerId) {
    return;
  }
  const p = canvasPoint(e);
  const dt = Math.max(0.001, (p.t - state.input.lastPT) / 1000);
  state.input.vX = (p.x - state.input.lastPX) / dt;
  state.input.vY = (p.y - state.input.lastPY) / dt;
  if (!state.input.dragging && state.input.pendingIndex !== null) {
    const dist = Math.hypot(p.x - state.input.downPX, p.y - state.input.downPY);
    const held = p.t - state.input.downPT;
    if (dist >= DRAG_THRESHOLD_PX || held >= HOLD_TO_DRAG_MS) {
      state.input.dragging = true;
      stickman.startGrab(state.input.pendingIndex);
      stickman.dragTo(p.x, p.y, state.room);
      if (navigator.vibrate) {
        navigator.vibrate(8);
      }
    }
  }
  if (state.input.dragging) {
    stickman.dragTo(p.x, p.y, state.room);
  }
  state.input.lastPX = p.x;
  state.input.lastPY = p.y;
  state.input.lastPT = p.t;
}

function onPointerUp(e) {
  if (state.input.pointerId !== e.pointerId) {
    return;
  }
  const wasDragging = state.input.dragging;
  const pendingIndex = state.input.pendingIndex;
  const tappedHead = state.input.tappedHead;
  state.input.pointerId = null;
  state.input.dragging = false;
  state.input.pendingIndex = null;
  state.input.tappedHead = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (err) {
    console.debug('Impossibile rilasciare il pointer capture', err);
  }
  if (wasDragging) {
    stickman.release(state.input.vX, state.input.vY);
    return;
  }
  if (pendingIndex !== null && tappedHead) {
    speakAt(state.input.lastPX, state.input.lastPY);
  }
}

canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
canvas.addEventListener('pointermove', onPointerMove, { passive: true });
canvas.addEventListener('pointerup', onPointerUp, { passive: true });
canvas.addEventListener('pointercancel', onPointerUp, { passive: true });

function frame(t) {
  if (!state.lastT) {
    state.lastT = t;
  }
  const dt = Math.min(0.04, Math.max(0.001, (t - state.lastT) / 1000));
  state.lastT = t;

  clear();
  drawRoom();
  stickman.simulate(dt, state.room);
  stickman.draw(ctx);
  drawMessage();
  requestAnimationFrame(frame);
}

function resize() {
  setCanvasSize();
  if (!stickman.points.length) {
    stickman.init(state.room);
  } else {
    stickman.resize(state.room);
  }
}

window.addEventListener('resize', resize);

resize();
loadPhrases();
requestAnimationFrame(frame);
