const TAU = Math.PI * 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) {
    return Math.hypot(apx, apy);
  }
  let t = (apx * abx + apy * aby) / abLenSq;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

export class Stickman {
  constructor() {
    this.points = [];
    this.constraints = [];
    this.lines = [];
    this.render = {
      headIndex: -1,
      headRadius: 18,
      face: null,
    };
    this.bindPose = [];
    this.drag = {
      index: -1,
    };
    this.gravity = 2200;
    this.lastAction = performance.now();
    this.stand = {
      active: false,
      progress: 0,
      started: 0,
      duration: 600,
    };
  }

  init(room) {
    this._build(room);
  }

  resize(room) {
    this._build(room);
  }

  notifyUserAction() {
    this.lastAction = performance.now();
    this._cancelStand();
  }

  startGrab(index) {
    this.drag.index = index;
    this.notifyUserAction();
  }

  dragTo(x, y, room) {
    if (this.drag.index === -1) {
      return;
    }
    const p = this.points[this.drag.index];
    const bounds = this._dragBounds(room);
    const cx = clamp(x, bounds.l, bounds.r);
    const cy = clamp(y, bounds.t, bounds.b);
    p.x = cx;
    p.y = cy;
    p.px = cx;
    p.py = cy;
  }

  release(vx, vy) {
    if (this.drag.index === -1) {
      return;
    }
    const dt = 1 / 60;
    const p = this.points[this.drag.index];
    p.px = p.x - vx * dt;
    p.py = p.y - vy * dt;
    this.drag.index = -1;
    this.notifyUserAction();
  }

  nearestGrab(x, y) {
    let bestIndex = -1;
    let bestDistance = Infinity;

    const headIdx = this.render.headIndex;
    if (headIdx !== -1) {
      const head = this.points[headIdx];
      const dist = distance(x, y, head.x, head.y) - this.render.headRadius;
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = headIdx;
      }
    }

    for (const [i, j] of this.lines) {
      const a = this.points[i];
      const b = this.points[j];
      const dist = segmentDistance(x, y, a.x, a.y, b.x, b.y);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = distance(x, y, a.x, a.y) < distance(x, y, b.x, b.y) ? i : j;
      }
    }

    return bestDistance <= this.render.headRadius ? bestIndex : -1;
  }

  simulate(dt, room) {
    if (!this.points.length) {
      return;
    }

    const targetStep = 1 / 90;
    const steps = Math.max(1, Math.ceil(dt / targetStep));
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this._integrate(subDt);
      this._solveConstraints(room);
      this._applyBounds(room);
      this._limitVelocity(room);
      this._standAssist(room, subDt);
    }
  }

  draw(ctx) {
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [i, j] of this.lines) {
      const a = this.points[i];
      const b = this.points[j];
      ctx.beginPath();
      ctx.lineWidth = this.render.lineWidth;
      ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5);
      ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
      ctx.stroke();
    }

    const headIndex = this.render.headIndex;
    if (headIndex !== -1) {
      const head = this.points[headIndex];
      ctx.beginPath();
      ctx.lineWidth = this.render.lineWidth;
      ctx.arc(head.x, head.y, this.render.headRadius, 0, TAU);
      ctx.stroke();

      const face = this.render.face;
      if (face) {
        const eyeY = head.y - face.eyeOffsetY;
        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.arc(head.x - face.eyeOffsetX, eyeY, face.eyeRadius, 0, TAU);
        ctx.arc(head.x + face.eyeOffsetX, eyeY, face.eyeRadius, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.lineWidth = face.noseThickness;
        ctx.moveTo(head.x - face.noseLength * 0.5, head.y);
        ctx.lineTo(head.x + face.noseLength * 0.5, head.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = face.mouthThickness;
        ctx.arc(head.x + face.mouthOffsetX, head.y + face.mouthOffsetY, face.mouthRadius, -0.6 * Math.PI, 0.6 * Math.PI);
        ctx.stroke();
      }
    }
  }

  _build(room) {
    const cx = room.x + room.w / 2;
    const floor = room.y + room.h - room.stroke - 6;
    const height = room.h * 0.55;

    const headRadius = Math.max(14, Math.round(height * 0.08));
    const neckLength = headRadius * 0.8;
    const torsoLength = height * 0.33;
    const shoulderWidth = headRadius * 2.4;
    const hipWidth = headRadius * 1.8;
    const upperArm = torsoLength * 0.55;
    const forearm = torsoLength * 0.55;
    const upperLeg = torsoLength * 0.75;
    const lowerLeg = torsoLength * 0.8;

    const points = [];

    const torsoTopY = floor - (upperLeg + lowerLeg + torsoLength);
    const torsoBotY = floor - (upperLeg + lowerLeg);

    const addPoint = (x, y, mass = 1) => {
      points.push({ x, y, px: x, py: y, mass });
      return points.length - 1;
    };

    const torsoTop = addPoint(cx, torsoTopY, 1.1);
    const torsoBot = addPoint(cx, torsoBotY, 1.2);

    const neck = addPoint(cx, torsoTopY - neckLength, 0.6);
    const head = addPoint(cx, neck.y - headRadius * 1.5, 0.8);

    const shoulderY = torsoTopY + headRadius * 0.25;
    const hipY = torsoBotY;

    const shoulderL = addPoint(cx - shoulderWidth / 2, shoulderY, 0.9);
    const shoulderR = addPoint(cx + shoulderWidth / 2, shoulderY, 0.9);

    const elbowL = addPoint(shoulderL.x - headRadius * 0.2, shoulderY + upperArm, 0.7);
    const elbowR = addPoint(shoulderR.x + headRadius * 0.2, shoulderY + upperArm, 0.7);

    const handL = addPoint(elbowL.x - headRadius * 0.2, elbowL.y + forearm, 0.7);
    const handR = addPoint(elbowR.x + headRadius * 0.2, elbowR.y + forearm, 0.7);

    const hipL = addPoint(cx - hipWidth / 2, hipY, 1.0);
    const hipR = addPoint(cx + hipWidth / 2, hipY, 1.0);

    const kneeL = addPoint(hipL.x - headRadius * 0.1, hipY + upperLeg, 0.9);
    const kneeR = addPoint(hipR.x + headRadius * 0.1, hipY + upperLeg, 0.9);

    const footL = addPoint(kneeL.x - headRadius * 0.1, floor, 1.1);
    const footR = addPoint(kneeR.x + headRadius * 0.1, floor, 1.1);

    this.points = points;
    this.constraints = [];
    this.lines = [];

    const addConstraint = (i, j, stiffness = 1) => {
      const a = this.points[i];
      const b = this.points[j];
      const length = distance(a.x, a.y, b.x, b.y);
      this.constraints.push({ i, j, length, stiffness });
      this.lines.push([i, j]);
    };

    const addRigid = (i, j) => addConstraint(i, j, 0.95);

    addRigid(torsoTop, torsoBot);
    addRigid(torsoTop, neck);
    addRigid(neck, head);

    addRigid(torsoTop, shoulderL);
    addRigid(torsoTop, shoulderR);
    addRigid(shoulderL, shoulderR);

    addRigid(shoulderL, elbowL);
    addRigid(elbowL, handL);
    addRigid(shoulderR, elbowR);
    addRigid(elbowR, handR);

    addRigid(torsoBot, hipL);
    addRigid(torsoBot, hipR);
    addRigid(hipL, hipR);

    addRigid(hipL, kneeL);
    addRigid(kneeL, footL);
    addRigid(hipR, kneeR);
    addRigid(kneeR, footR);

    const addSoft = (i, j) => {
      const a = this.points[i];
      const b = this.points[j];
      const length = distance(a.x, a.y, b.x, b.y);
      this.constraints.push({ i, j, length, stiffness: 0.4 });
    };

    addSoft(torsoTop, hipL);
    addSoft(torsoTop, hipR);
    addSoft(shoulderL, torsoBot);
    addSoft(shoulderR, torsoBot);
    addSoft(shoulderL, hipR);
    addSoft(shoulderR, hipL);

    this.render = {
      headIndex: head,
      headRadius,
      lineWidth: Math.max(2, Math.round(room.h * 0.006)),
      torsoTop,
      torsoBot,
      hipL,
      hipR,
      kneeL,
      kneeR,
      footL,
      footR,
      face: {
        eyeOffsetX: headRadius * 0.4,
        eyeOffsetY: headRadius * 0.25,
        eyeRadius: Math.max(1.5, headRadius * 0.12),
        noseLength: Math.max(4, headRadius * 0.5),
        noseThickness: Math.max(1, headRadius * 0.08),
        mouthOffsetX: headRadius * 0.35,
        mouthOffsetY: headRadius * 0.25,
        mouthRadius: Math.max(4, headRadius * 0.75),
        mouthThickness: Math.max(1, headRadius * 0.08),
      },
    };

    this.bindPose = this.points.map((p) => ({ x: p.x, y: p.y }));
    this._cancelStand();
  }

  _integrate(dt) {
    const dragIndex = this.drag.index;
    const damping = 0.995;
    const accelY = this.gravity;
    const dtSq = dt * dt;

    for (let i = 0; i < this.points.length; i++) {
      if (i === dragIndex) {
        continue;
      }
      const p = this.points[i];
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      const nx = p.x + vx;
      const ny = p.y + vy + accelY * dtSq;
      p.px = p.x;
      p.py = p.y;
      p.x = nx;
      p.y = ny;
    }
  }

  _solveConstraints(room) {
    const iterations = 8;
    for (let iter = 0; iter < iterations; iter++) {
      for (const constraint of this.constraints) {
        const a = this.points[constraint.i];
        const b = this.points[constraint.j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const diff = (dist - constraint.length) / dist;
        const stiffness = constraint.stiffness;
        const invMassA = 1 / a.mass;
        const invMassB = 1 / b.mass;
        const sumInv = invMassA + invMassB;
        if (sumInv === 0) {
          continue;
        }
        const factor = diff * stiffness;
        const offsetX = dx * factor;
        const offsetY = dy * factor;

        if (this.drag.index !== constraint.i) {
          a.x += offsetX * (invMassA / sumInv);
          a.y += offsetY * (invMassA / sumInv);
        }
        if (this.drag.index !== constraint.j) {
          b.x -= offsetX * (invMassB / sumInv);
          b.y -= offsetY * (invMassB / sumInv);
        }
      }
    }
  }

  _applyBounds(room) {
    const bounds = this._dragBounds(room);
    const restitution = 0.3;

    for (let i = 0; i < this.points.length; i++) {
      if (i === this.drag.index) {
        continue;
      }
      const p = this.points[i];
      const prevX = p.px;
      const prevY = p.py;

      if (p.x < bounds.l) {
        p.x = bounds.l;
      }
      if (p.x > bounds.r) {
        p.x = bounds.r;
      }
      if (p.y < bounds.t) {
        p.y = bounds.t;
      }
      if (p.y > bounds.b) {
        p.y = bounds.b;
      }

      if (p.x !== prevX) {
        p.px = p.x + (p.x - prevX) * restitution;
      }
      if (p.y !== prevY) {
        p.py = p.y + (p.y - prevY) * restitution;
      }
    }
  }

  _limitVelocity(room) {
    const maxSpeed = room.h * 0.035;
    for (const p of this.points) {
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      const speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / (speed + 1e-6);
        p.px = p.x - vx * scale;
        p.py = p.y - vy * scale;
      }
    }
  }

  _standAssist(room, dt) {
    const dragActive = this.drag.index !== -1;
    if (dragActive) {
      this._cancelStand();
      return;
    }

    const now = performance.now();
    if (!this.stand.active) {
      if (now - this.lastAction < 600) {
        return;
      }
      if (!this._isSleeping(room)) {
        return;
      }
      this.stand.active = true;
      this.stand.started = now;
      this.stand.progress = 0;
    }

    const elapsed = now - this.stand.started;
    const t = clamp(elapsed / this.stand.duration, 0, 1);
    this.stand.progress = easeOutCubic(t);
    this._blendToBind(room, this.stand.progress * 0.55);

    if (t >= 1) {
      this._cancelStand();
    }
  }

  _blendToBind(room, amount) {
    const floor = room.y + room.h - room.stroke - 6;
    const left = room.x + room.stroke + 6;
    const right = room.x + room.w - room.stroke - 6;

    const render = this.render;
    const bind = this.bindPose;
    const footL = this.points[render.footL];
    const footR = this.points[render.footR];

    const baseFootL = bind[render.footL];
    const baseFootR = bind[render.footR];
    const baseCenterX = (baseFootL.x + baseFootR.x) * 0.5;
    const currentCenter = (footL.x + footR.x) * 0.5;
    const targetCenter = clamp(currentCenter, left + 20, right - 20);
    const offsetX = targetCenter - baseCenterX;

    const baseFootY = Math.max(baseFootL.y, baseFootR.y);
    const offsetY = floor - baseFootY;

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const base = bind[i];
      const tx = clamp(base.x + offsetX, left, right);
      const ty = clamp(base.y + offsetY, room.y + room.stroke + 6, floor);
      p.x = lerp(p.x, tx, amount);
      p.y = lerp(p.y, ty, amount);
      p.px = p.x;
      p.py = p.y;
    }
  }

  _cancelStand() {
    this.stand.active = false;
    this.stand.progress = 0;
  }

  _isSleeping(room) {
    const floor = room.y + room.h - room.stroke - 6;
    let velocitySum = 0;
    let contact = 0;
    for (const p of this.points) {
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      velocitySum += Math.hypot(vx, vy);
      if (floor - p.y <= this.render.headRadius * 0.6) {
        contact++;
      }
    }
    const avgSpeed = velocitySum / this.points.length;
    return avgSpeed < 0.45 && contact >= 2;
  }

  _dragBounds(room) {
    return {
      l: room.x + room.stroke + this.render.headRadius,
      r: room.x + room.w - room.stroke - this.render.headRadius,
      t: room.y + room.stroke + this.render.headRadius,
      b: room.y + room.h - room.stroke - this.render.headRadius,
    };
  }
}
