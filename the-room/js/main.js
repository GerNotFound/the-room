import { Stickman } from './entities/stickman.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
let DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));

const state = {
  room: { x:0, y:0, w:0, h:0, stroke:0 },
  lastT: 0,
  phrases: ["Hey"],
  msg: { text:'', until:0, x:0, y:0 },
  input: { pointerId:null, holdTimer:null, HOLD_MS:120, dragging:false, lastPX:0, lastPY:0, lastPT:0, vPX:0, vPY:0 }
};

const stickman = new Stickman();

function setCanvasSize() {
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = vw * DPR; canvas.height = vh * DPR;
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  ctx.setTransform(1,0,0,1,0,0); ctx.scale(DPR, DPR);

  const marginX = Math.round(vw * 0.04);
  const marginY = Math.round(vh * 0.04);
  state.room.x = marginX; state.room.y = marginY;
  state.room.w = Math.max(80, vw - marginX*2);
  state.room.h = Math.max(80, vh - marginY*2);
  state.room.stroke = Math.max(2, Math.round(Math.min(vw, vh) * 0.008));
}
function clear() { ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width/DPR, canvas.height/DPR); }
function drawRoom() { const r=state.room; ctx.lineWidth=r.stroke; ctx.strokeStyle='#fff'; ctx.strokeRect(r.x,r.y,r.w,r.h); }
function drawMessage() {
  const now = performance.now();
  if (now >= state.msg.until || !state.msg.text) return;
  ctx.save(); ctx.fillStyle='#fff';
  const headR = stickman.render.headR || 18;
  ctx.font = `${Math.max(12, Math.round(headR*0.9))}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
  ctx.textBaseline='bottom';
  const text = state.msg.text; const tw = ctx.measureText(text).width;
  const px = Math.min(state.room.x+state.room.w-tw-8, Math.max(state.room.x+8, state.msg.x - tw/2));
  const py = Math.min(state.room.y+state.room.h-8, Math.max(state.room.y+16, state.msg.y - headR*1.4));
  ctx.fillText(text, px, py);
  ctx.restore();
}

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp || performance.now() };
}
function speakAt(x,y){
  const list = state.phrases.length ? state.phrases : ["Hey"];
  const text = (list[(Math.random()*list.length)|0] || "Hey").trim();
  state.msg = { text, until: performance.now()+1100, x, y };
  if (navigator.vibrate) navigator.vibrate(12);
}
async function loadPhrases(){
  try {
    const res = await fetch('frasi.txt', { cache:'no-store' });
    if (!res.ok) return;
    const txt = await res.text();
    const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (lines.length) state.phrases = lines;
  } catch {}
}

function onPointerDown(e){
  const p = canvasPoint(e);
  const idx = stickman.nearestGrab(p.x, p.y);
  if (idx === -1) return;
  state.input.pointerId = e.pointerId;
  state.input.lastPX=p.x; state.input.lastPY=p.y; state.input.lastPT=p.t;
  state.input.vPX=0; state.input.vPY=0;
  stickman.notifyUserAction();
  state.input.holdTimer = setTimeout(()=>{
    state.input.dragging=true;
    stickman.startGrab(idx);
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (navigator.vibrate) navigator.vibrate(8);
  }, state.input.HOLD_MS);
}
function onPointerMove(e){
  if (state.input.pointerId !== e.pointerId) return;
  const p = canvasPoint(e);
  const dt = Math.max(0.001, (p.t - state.input.lastPT)/1000);
  state.input.vPX = (p.x - state.input.lastPX)/dt;
  state.input.vPY = (p.y - state.input.lastPY)/dt;
  if (state.input.dragging) { stickman.notifyUserAction(); stickman.dragTo(p.x, p.y, state.room); }
  state.input.lastPX=p.x; state.input.lastPY=p.y; state.input.lastPT=p.t;
}
function onPointerUp(e){
  if (state.input.pointerId !== e.pointerId) return;
  clearTimeout(state.input.holdTimer);
  const wasDragging = state.input.dragging;
  state.input.pointerId=null; state.input.dragging=false;
  stickman.notifyUserAction();
  if (wasDragging){ stickman.release(state.input.vPX, state.input.vPY); return; }
  speakAt(state.input.lastPX, state.input.lastPY);
}
canvas.addEventListener('pointerdown', onPointerDown, {passive:true});
canvas.addEventListener('pointermove', onPointerMove, {passive:true});
canvas.addEventListener('pointerup', onPointerUp, {passive:true});
canvas.addEventListener('pointercancel', onPointerUp, {passive:true});

function frame(t){
  if (!state.lastT) state.lastT = t;
  const dt = Math.min(0.033, Math.max(0.001, (t - state.lastT)/1000));
  state.lastT = t;
  clear(); drawRoom();
  stickman.simulate(dt, state.room);
  stickman.draw(ctx);
  drawMessage();
  requestAnimationFrame(frame);
}
function resize(){
  setCanvasSize();
  if (!stickman.points.length) stickman.init(state.room);
  else stickman.resize(state.room);
}
window.addEventListener('resize', resize);

resize();
loadPhrases();
requestAnimationFrame(frame);
