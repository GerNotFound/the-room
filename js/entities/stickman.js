import { clamp, dist, segDist } from '../core/utils.js';
import { integrate, applyBounds, solveSticks } from '../core/constraint.js';
import { dampRotationsAngle, dampRotationsContacts } from '../core/rotational.js';
import { buildTorso } from '../parts/torso.js';
import { buildHead } from '../parts/head.js';
import { buildArm } from '../parts/arm.js';
import { buildLeg } from '../parts/leg.js';
import { jointSpine } from '../joints/spine.js';
import { jointNeck } from '../joints/neck.js';
import { jointShoulders } from '../joints/shoulder.js';
import { jointElbows } from '../joints/elbow.js';
import { jointWrists } from '../joints/wrist.js';
import { jointHips } from '../joints/hip.js';
import { jointKnees } from '../joints/knee.js';
import { jointAnkles } from '../joints/ankle.js';
import { addStabilizers } from '../joints/stabilizers.js';
import { enforceShoulderLimits } from '../limits/shoulder.js';
import { enforceElbowLimits } from '../limits/elbow.js';
import { enforceKneeLimits } from '../limits/knee.js';
import { enforceHipLimits } from '../limits/hip.js';
import { enforceNeckLimits } from '../limits/neck.js';
import { enforceAnkleLimits } from '../limits/ankle.js';
import { enforceWristLimits } from '../limits/wrist.js';
import { sepPointCircle } from '../core/collision.js';

export class Stickman {
  constructor(){
    this.points = [];
    this.sticks = [];
    this.render = {};
    this.metrics = {};

    this.params = {
      airPerSec: 14.0,
      airQuad:  0.006,
      restitution: 0.10,
      friction: 0.93,
      iterations: 12,
      standIterations: 4,
      maxStepFrac: 0.010,
      corrCapFrac: 0.010,
      rotDampK: 0.45,
      rotCap: 0.6
    };

    this.gravity = 1800;
    this.stand = { active:false, alpha:0, t0:0, lastEnd:0, duration:520, cooldownMs:900 };
    this.lastUserMs = 0;

    this.grabbedIndex = -1;
    this.dragging = false;
    this._HIT_TH = 18;

    this.sleep = { active:false, calmFrames:0 };
    this.postDragFrames = 0;
  }

  init(room){ this._build(room); }
  resize(room){ this._build(room); }
  setPhysicsScale(room){ this.gravity = Math.max(1000, Math.round(room.h * 2.0)); }
  notifyUserAction(){ this.lastUserMs = performance.now(); this._cancelStand(); this._wake(); }

  startGrab(index){ this.grabbedIndex = index; this.dragging = true; this._wake(); }
  dragTo(x,y,room){
    if (this.grabbedIndex < 0) return;
    const p = this.points[this.grabbedIndex];
    p.px = p.x; p.py = p.y;
    const l = room.x + room.stroke + 2, r = room.x + room.w - room.stroke - 2;
    const t = room.y + room.stroke + 2, b = room.y + room.h - room.stroke - 2;
    p.x = clamp(x, l, r); p.y = clamp(y, t, b);
  }
  release(vx,vy){
    if (this.grabbedIndex < 0) return;
    const pt = this.points[this.grabbedIndex];
    const dt = 1/60;
    pt.px = pt.x - vx * dt; pt.py = pt.y - vy * dt;
    this.grabbedIndex = -1; this.dragging = false;
    this.postDragFrames = Math.max(this.postDragFrames, 10);
  }
  nearestGrab(x,y){
    let best=-1, bestD=Infinity;
    const ih = this.render.head;
    const dHead = dist(x,y,this.points[ih].x,this.points[ih].y) - this.render.headR;
    if (dHead < bestD){ bestD=dHead; best=ih; }
    for (const st of this.sticks){
      const a=this.points[st.i], b=this.points[st.j];
      const d = segDist(x,y,a.x,a.y,b.x,b.y);
      if (d < bestD){
        const da = dist(x,y,a.x,a.y), db = dist(x,y,b.x,b.y);
        best = da<db ? st.i : st.j; bestD = d;
      }
    }
    return bestD <= this._HIT_TH ? best : -1;
  }

  simulate(dt, room){
    this.setPhysicsScale(room);
    const targetStep = 0.009;
    const steps = Math.max(1, Math.ceil(dt / targetStep));
    const sdt = dt / steps;
    const relaxing = !this.dragging && this.postDragFrames > 0;
    const afterDrag = this.dragging || relaxing;
    const maxD = room.h * this.params.maxStepFrac * (afterDrag ? 2.6 : 1);
    const corrCapBase = room.h * this.params.corrCapFrac;
    const corrCap = afterDrag ? corrCapBase * 4.0 : corrCapBase;

    for (let n=0; n<steps; n++){
      integrate(this.points, sdt, this.gravity, this.params.airPerSec, this.params.airQuad, maxD, this.dragging ? this.grabbedIndex : -1);
      applyBounds(this.points, room, this.params.restitution, this.params.friction);
      this._decayContacts();

      const iters = this.params.iterations + (this.stand.active ? this.params.standIterations : 0) + (afterDrag ? 4 : 0);
      const stiff = this.stand.active ? 0.9 : afterDrag ? 0.82 : 0.68;
      solveSticks(this.points, this.sticks, iters, stiff, this.dragging ? this.grabbedIndex : -1, corrCap);

      dampRotationsAngle(this.points, this.sticks, this.params.rotDampK, this.params.rotCap);
      dampRotationsContacts(this.points, this.sticks, this.params.rotDampK*1.1, this.params.rotCap);

      this._angleLimits();

      this._selfCollisions(room, corrCap);
      let groundStable = this._isOnGroundStable(room);
      this._postDamp(room, groundStable);
      groundStable = this._isOnGroundStable(room);

      this._runStandAssist(room, groundStable);
      this._sleepCheck(room, groundStable);
      this._sanitize(room);
    }
    if (this.postDragFrames > 0 && !this.dragging){
      this.postDragFrames = Math.max(0, this.postDragFrames - 1);
    }
  }

  draw(ctx){
    const r=this.render, L=r.line, P=i=>this.points[i];
    ctx.strokeStyle='#fff'; ctx.lineCap='round'; ctx.lineJoin='round';
    this._line(ctx, P(r.torsoTop), P(r.torsoBot), L);
    this._line(ctx, P(r.shL), P(r.elbL), L);
    this._line(ctx, P(r.elbL), P(r.handL), L);
    this._line(ctx, P(r.shR), P(r.elbR), L);
    this._line(ctx, P(r.elbR), P(r.handR), L);
    this._line(ctx, P(r.hipL), P(r.kneeL), L);
    this._line(ctx, P(r.kneeL), P(r.footL), L);
    this._line(ctx, P(r.hipR), P(r.kneeR), L);
    this._line(ctx, P(r.kneeR), P(r.footR), L);
    this._line(ctx, P(r.shL), P(r.shR), Math.max(1, L*0.7));
    this._line(ctx, P(r.hipL), P(r.hipR), Math.max(1, L*0.7));
    this._line(ctx, P(r.torsoTop), {x:P(r.torsoTop).x, y:P(r.torsoTop).y - this.metrics.headR*0.4}, Math.max(1, L*0.7));
    const head = P(r.head);
    this._circle(ctx, head.x, head.y, r.headR, Math.max(1, L));
    const face = r.face;
    const eyeY = head.y - face.eyeOffsetY;
    this._dot(ctx, head.x - face.eyeOffsetX, eyeY, face.eyeR);
    this._dot(ctx, head.x + face.eyeOffsetX, eyeY, face.eyeR);
    ctx.beginPath();
    ctx.lineWidth = face.noseThickness;
    ctx.moveTo(head.x - face.noseLen/2, head.y);
    ctx.lineTo(head.x + face.noseLen/2, head.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = face.mouthThickness;
    ctx.arc(head.x + face.mouthOffsetX, head.y + face.mouthOffsetY, face.mouthRadius, -0.65*Math.PI, 0.65*Math.PI);
    ctx.stroke();
  }

  _build(room){
    this.points.length = 0;
    this.sticks.length = 0;
    this.render = {};
    this.metrics = {};
    this._cancelStand();
    this.postDragFrames = 0;

    const cx = room.x + room.w/2;
    const cy = room.y + room.h/2 - room.h*0.1;
    const SCALE = 0.4;

    const torso = Math.round(room.h * 0.22 * SCALE);
    const headR = Math.round(room.h * 0.035 * SCALE);
    const shoulderW = Math.round(headR * 2.4 * SCALE);
    const hipW = Math.round(shoulderW * 0.8 * SCALE);
    const upperArm = Math.round(torso * 0.46 * SCALE);
    const foreArm  = Math.round(torso * 0.46 * SCALE);
    const upperLeg = Math.round(torso * 0.66 * SCALE);
    const lowerLeg = Math.round(torso * 0.68 * SCALE);
    this.metrics = { torso, headR, shoulderW, hipW, upperArm, foreArm, upperLeg, lowerLeg };

    const torsoIdx = buildTorso(this.points, cx, cy, torso);
    const headIdx  = buildHead(this.points, cx, this.points[torsoIdx.torsoTop].y - headR*1.6);
    const shY = this.points[torsoIdx.torsoTop].y + headR*0.2;
    const armL = buildArm(this.points, cx - shoulderW/2, shY, upperArm, foreArm);
    const armR = buildArm(this.points, cx + shoulderW/2, shY, upperArm, foreArm, +1);
    const hipY = this.points[torsoIdx.torsoBot].y;
    const legL = buildLeg(this.points, cx - hipW/2, hipY, upperLeg, lowerLeg);
    const legR = buildLeg(this.points, cx + hipW/2, hipY, upperLeg, lowerLeg);

    jointSpine(this.sticks, torsoIdx, torso);
    jointNeck(this.sticks, headIdx, torsoIdx, headR);
    jointShoulders(this.sticks, torsoIdx, armL, armR, shoulderW);
    jointElbows(this.sticks, armL, armR, upperArm);
    jointWrists(this.sticks, armL, armR, foreArm);
    jointHips(this.sticks, torsoIdx, legL, legR, hipW);
    jointKnees(this.sticks, legL, legR, upperLeg);
    jointAnkles(this.sticks, legL, legR, lowerLeg);
    addStabilizers(this.points, this.sticks, torsoIdx, armL, armR, legL, legR, upperLeg, lowerLeg);

    const face = {
      eyeOffsetX: headR * 0.48,
      eyeOffsetY: headR * 0.25,
      eyeR: Math.max(1, Math.round(headR * 0.12)),
      noseLen: Math.max(2, Math.round(headR * 0.45)),
      noseThickness: Math.max(1, Math.round(headR * 0.07)),
      mouthOffsetX: headR * 0.35,
      mouthOffsetY: headR * 0.25,
      mouthRadius: Math.max(2, Math.round(headR * 0.7)),
      mouthThickness: Math.max(1, Math.round(headR * 0.09))
    };

    this.render = {
      head: headIdx.head, headR,
      torsoTop: torsoIdx.torsoTop, torsoBot: torsoIdx.torsoBot,
      shL: armL.shoulder, elbL: armL.elbow, handL: armL.hand,
      shR: armR.shoulder, elbR: armR.elbow, handR: armR.hand,
      hipL: legL.hip, kneeL: legL.knee, footL: legL.foot,
      hipR: legR.hip, kneeR: legR.knee, footR: legR.foot,
      line: Math.max(2, Math.round(room.h*0.006 * SCALE*1.2)),
      face
    };

    // masse/densità
    const setM = (i,m)=>{ if (this.points[i]) this.points[i].m = m; };
    setM(this.render.head, 0.10);
    setM(this.render.torsoTop, 0.50);
    setM(this.render.torsoBot, 0.60);
    setM(this.render.hipL, 0.80);
    setM(this.render.hipR, 0.80);
    const kneeM = (0.80 + 1.50) * 0.5;
    setM(this.render.kneeL, kneeM);
    setM(this.render.kneeR, kneeM);
    setM(this.render.footL, 1.50);
    setM(this.render.footR, 1.50);
    setM(this.render.shL, 0.40);
    setM(this.render.shR, 0.40);
    const elbowM = (0.40 + 1.50) * 0.5;
    setM(this.render.elbL, elbowM);
    setM(this.render.elbR, elbowM);
    setM(this.render.handL, 1.50);
    setM(this.render.handR, 1.50);
    for (const p of this.points){ p.m = Math.max(0.1, Math.min(3.0, p.m || 1)); }
  }

  _angleLimits(){
    const r=this.render;
    const torso={torsoTop:r.torsoTop, torsoBot:r.torsoBot};
    const head={head:r.head};
    const armL={shoulder:r.shL, elbow:r.elbL, hand:r.handL};
    const armR={shoulder:r.shR, elbow:r.elbR, hand:r.handR};
    const legL={hip:r.hipL, knee:r.kneeL, foot:r.footL};
    const legR={hip:r.hipR, knee:r.kneeR, foot:r.footR};
    enforceNeckLimits(this.points, head, torso);
    enforceShoulderLimits(this.points, torso, armL, armR);
    enforceElbowLimits(this.points, armL, armR);
    enforceWristLimits(this.points, armL, armR);
    enforceHipLimits(this.points, torso, legL, legR);
    enforceKneeLimits(this.points, legL, legR);
    enforceAnkleLimits(this.points, legL, legR);
  }

  _selfCollisions(room, cap){
    const r=this.render, m=this.metrics;
    const headR = m.headR, limbR = Math.max(3, Math.round(headR*0.42));
    sepPointCircle(this.points, r.shL, r.head, headR + limbR, cap, 0.2);
    sepPointCircle(this.points, r.shR, r.head, headR + limbR, cap, 0.2);
    sepPointCircle(this.points, r.handL, r.torsoTop, limbR*0.9, cap, 0.15);
    sepPointCircle(this.points, r.handR, r.torsoTop, limbR*0.9, cap, 0.15);
  }

  _isOnGroundStable(room){
    const r=this.render, floor = room.y+room.h-room.stroke-1;
    const eps = Math.max(2.0, this.metrics.headR * 0.18);
    const checkIds = [r.footL, r.footR, r.kneeL, r.kneeR, r.hipL, r.hipR, r.torsoBot];
    let contacts = 0;
    let calm = true;
    for (const id of checkIds){
      const p = this.points[id];
      if (!p) continue;
      if (floor - p.y <= eps) contacts++;
      if (Math.abs(p.y - p.py) > 1.1 || Math.abs(p.x - p.px) > 1.1) calm = false;
    }
    return contacts >= 2 && calm;
  }
  _uprightEnough(){
    const r=this.render, m=this.metrics, P=i=>this.points[i];
    const torsoLen = Math.hypot(P(r.torsoTop).x-P(r.torsoBot).x, P(r.torsoTop).y-P(r.torsoBot).y);
    const torsoOk = Math.abs(torsoLen - m.torso) < m.torso*0.06;
    const verticalOk = Math.abs(P(r.torsoTop).x - P(r.torsoBot).x) < m.headR*0.7;
    const headAbove = P(r.head).y < P(r.torsoTop).y - m.headR*0.6;
    return torsoOk && verticalOk && headAbove;
  }
  _cancelStand(){ this.stand.active=false; this.stand.alpha=0; }

  _runStandAssist(room, groundStable){
    const t=performance.now();
    if (this.dragging || this.grabbedIndex!==-1){ this._cancelStand(); return; }
    if (t - this.lastUserMs < 400) return;
    if (t - this.stand.lastEnd < this.stand.cooldownMs) return;

    const stable = groundStable !== undefined ? groundStable : this._isOnGroundStable(room);

    if (!this.stand.active){
      if (stable && !this._uprightEnough()){
        this.stand.active=true; this.stand.alpha=0; this.stand.t0=t;
        for (const p of this.points){ p.px=p.x; p.py=p.y; }
      } else return;
    }

    const k = Math.min(1, Math.max(0, (t - this.stand.t0)/this.stand.duration));
    this.stand.alpha = 1 - Math.pow(1-k,3);

    const r=this.render, m=this.metrics, P=i=>this.points[i];
    const floor = room.y+room.h-room.stroke-1;
    const cx = (P(r.hipL).x + P(r.hipR).x) * 0.5;

    const Afeet = 0.16 * this.stand.alpha;
    this._blend(r.footL, cx - m.hipW/2, floor, Afeet);
    this._blend(r.footR, cx + m.hipW/2, floor, Afeet);

    const A = 0.12 * this.stand.alpha, Adir = 0.08 * this.stand.alpha;
    const hipY = floor - (m.upperLeg + m.lowerLeg);
    this._blend(r.hipL, cx - m.hipW/2, hipY, A);
    this._blend(r.hipR, cx + m.hipW/2, hipY, A);
    this._blend(r.torsoBot, cx, hipY, A);
    this._blend(r.torsoTop, cx, hipY - m.torso, A);
    this._blend(r.shL, cx - m.shoulderW/2, P(r.torsoTop).y + m.headR*0.2, A);
    this._blend(r.shR, cx + m.shoulderW/2, P(r.torsoTop).y + m.headR*0.2, A);
    this._blend(r.elbL, P(r.shL).x - 2, P(r.shL).y + m.upperArm, Adir);
    this._blend(r.handL, P(r.elbL).x - 2, P(r.elbL).y + m.foreArm, Adir);
    this._blend(r.elbR, P(r.shR).x + 2, P(r.shR).y + m.upperArm, Adir);
    this._blend(r.handR, P(r.elbR).x + 2, P(r.elbR).y + m.foreArm, Adir);
    this._blend(r.head, cx, P(r.torsoTop).y - m.headR*1.6, A);

    const tTop=this.points[r.torsoTop], tBot=this.points[r.torsoBot];
    const midX=(tTop.x+tBot.x)/2; tTop.x += (midX-tTop.x)*0.12*this.stand.alpha; tBot.x += (midX-tBot.x)*0.12*this.stand.alpha;

    this._freezeVelocities(0.6 * this.stand.alpha);

    if (this._uprightEnough() && this.stand.alpha>=0.99){
      this.stand.active=false; this.stand.lastEnd=t;
      for (const p of this.points){ p.px=p.x; p.py=p.y; }
    }
  }

  _sleepCheck(room, groundStable){
    if (this.dragging) { this._wake(); return; }
    let v=0, angSum=0;
    for (const st of this.sticks){
      const a=this.points[st.i], b=this.points[st.j];
      const vx=b.x - a.x, vy=b.y - a.y;
      const vpx=(b.px - a.px), vpy=(b.py - a.py);
      const angNow=Math.atan2(vy, vx);
      const angPrev=Math.atan2(vpy, vpx);
      let d=angNow - angPrev;
      while(d>Math.PI) d-=2*Math.PI;
      while(d<-Math.PI) d+=2*Math.PI;
      angSum += Math.abs(d);
    }
    for (const p of this.points){ v += Math.hypot(p.x-p.px, p.y-p.py); }
    v /= this.points.length || 1;
    angSum /= this.sticks.length || 1;
    if (v < 0.065 && angSum < 0.020){ this.sleep.calmFrames++; } else { this._wake(); }
    if (this.sleep.calmFrames > 14){
      if (!this._uprightEnough() && this._hasFloorContact(room)){
        this._beginStandAssist(room, groundStable);
      }
      this.sleep.active=true;
      this._freezeVelocities(1);
    }
  }
  _wake(){ this.sleep.active=false; this.sleep.calmFrames=0; }

  _sanitize(room){
    const l=room.x+room.stroke+1, r=room.x+room.w-room.stroke-1, t=room.y+room.stroke+1, b=room.y+room.h-room.stroke-1;
    for (const p of this.points){
      if (!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.px)||!isFinite(p.py)){ this._build(room); return; }
      p.x = clamp(p.x,l,r); p.y = clamp(p.y,t,b);
      const vx=p.x-p.px, vy=p.y-p.py, spd=Math.hypot(vx,vy), maxV=room.h*0.035;
      if (spd>maxV){ const k=maxV/(spd+1e-6); p.px=p.x-vx*k; p.py=p.y-vy*k; }
    }
  }

  _line(ctx,a,b,lw){ ctx.beginPath(); ctx.lineWidth=lw; ctx.moveTo(Math.round(a.x)+0.5,Math.round(a.y)+0.5); ctx.lineTo(Math.round(b.x)+0.5,Math.round(b.y)+0.5); ctx.stroke(); }
  _circle(ctx,x,y,r,lw){ ctx.beginPath(); ctx.lineWidth=lw; ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); }
  _dot(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); }
  _blend(i,tx,ty,a){ const p=this.points[i]; p.x += (tx-p.x)*a; p.y += (ty-p.y)*a; const vx=p.x-p.px, vy=p.y-p.py; p.px=p.x - vx*0.2; p.py=p.y - vy*0.2; }

  _decayContacts(){ for (const p of this.points){ if ((p.contactT|0) > 0) p.contactT = (p.contactT|0) - 1; else p.contactT = 0; } }
  _postDamp(room, groundStable){
    const resting = !this.dragging && this.grabbedIndex === -1 && (groundStable || this.sleep.active);
    const k = this.sleep.active ? 0.82 : resting ? 0.88 : 0.97;
    for (const p of this.points){
      const vx = p.x - p.px, vy = p.y - p.py;
      const maxV = room.h*(this.sleep.active || resting ? 0.02 : 0.035);
      let spd = Math.hypot(vx, vy);
      let nx=vx, ny=vy;
      if (spd > maxV){ const c = maxV/(spd+1e-6); nx*=c; ny*=c; spd = maxV; }
      p.px = p.x - nx*k; p.py = p.y - ny*k;
    }
    if (resting && this._uprightEnough()){
      this._freezeVelocities(0.5);
    }
  }

  _freezeVelocities(strength=1){
    const k = clamp(strength, 0, 1);
    for (const p of this.points){
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      p.px = p.x - vx*(1-k);
      p.py = p.y - vy*(1-k);
    }
  }

  _hasFloorContact(room){
    const floor = room.y+room.h-room.stroke-1;
    const eps = Math.max(2.5, this.metrics.headR * 0.2);
    const ids = [this.render.footL, this.render.footR, this.render.kneeL, this.render.kneeR, this.render.hipL, this.render.hipR];
    for (const id of ids){
      const p = this.points[id];
      if (p && floor - p.y <= eps) return true;
    }
    return false;
  }

  _beginStandAssist(room, groundStable){
    if (this.stand.active) return;
    const stable = groundStable !== undefined ? groundStable : this._isOnGroundStable(room);
    if (!stable) return;
    this.stand.active = true;
    this.stand.alpha = 0;
    const t = performance.now();
    this.stand.t0 = t;
    this.stand.lastEnd = t - this.stand.cooldownMs;
    for (const p of this.points){ p.px=p.x; p.py=p.y; }
  }
}
