import { SkeletonBuilder } from './skeleton/builder.js';
import {
  TAU,
  clamp,
  distance,
  segmentDistance,
  lerp,
  easeOutCubic,
  normalizeAngle,
} from './utils/math.js';
import { addTorso } from './body/torso.js';
import { addNeck } from './body/neck.js';
import { addHead } from './body/head.js';
import { addUpperArm } from './body/upperArm.js';
import { addForearm } from './body/forearm.js';
import { addUpperLeg } from './body/upperLeg.js';
import { addLowerLeg } from './body/lowerLeg.js';
import { addSpineJoint } from './joints/spineJoint.js';
import { addNeckJoint } from './joints/neckJoint.js';
import { addShoulderJoint } from './joints/shoulderJoint.js';
import { addClavicleJoint } from './joints/clavicleJoint.js';
import { addElbowJoint } from './joints/elbowJoint.js';
import { addWristJoint } from './joints/wristJoint.js';
import { addHipJoint } from './joints/hipJoint.js';
import { addPelvisJoint } from './joints/pelvisJoint.js';
import { addKneeJoint } from './joints/kneeJoint.js';
import { addAnkleJoint } from './joints/ankleJoint.js';
import { addSoftTissueJoints } from './joints/softTissueJoint.js';
import { addTrapeziusJoint } from './joints/trapeziusJoint.js';

const SIDES = ['L', 'R'];

export class Stickman {
  constructor() {
    this.points = [];
    this.constraints = [];
    this.hinges = [];
    this.lines = [];
    this.render = {
      headIndex: -1,
      headRadius: 18,
      lineWidth: 2,
      torsoTop: -1,
      torsoBottom: -1,
      hipL: -1,
      hipR: -1,
      kneeL: -1,
      kneeR: -1,
      footL: -1,
      footR: -1,
    };
    this.bindPose = [];
    this.drag = {
      index: -1,
      targetX: 0,
      targetY: 0,
      pointerVX: 0,
      pointerVY: 0,
      lastX: 0,
      lastY: 0,
      lastT: 0,
      stiffness: 0.62,
      damping: 0.55,
      sampleDt: 1 / 60,
    };
    this.gravity = 9.81;
    this.airDrag = 0.992;
    this.scale = 1;
    this.totalMass = 0;
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
    if (index < 0 || index >= this.points.length) {
      return;
    }
    const p = this.points[index];
    this.drag.index = index;
    this.drag.targetX = p.x;
    this.drag.targetY = p.y;
    this.drag.pointerVX = 0;
    this.drag.pointerVY = 0;
    this.drag.lastX = p.x;
    this.drag.lastY = p.y;
    this.drag.lastT = performance.now();
    this.drag.sampleDt = 1 / 60;
    this.notifyUserAction();
  }

  dragTo(x, y, room) {
    if (this.drag.index === -1) {
      return;
    }
    const bounds = this._dragBounds(room);
    const cx = clamp(x, bounds.l, bounds.r);
    const cy = clamp(y, bounds.t, bounds.b);
    const now = performance.now();
    const dt = Math.max(1e-3, (now - this.drag.lastT) / 1000);
    this.drag.pointerVX = (cx - this.drag.lastX) / dt;
    this.drag.pointerVY = (cy - this.drag.lastY) / dt;
    this.drag.sampleDt = dt;
    this.drag.targetX = cx;
    this.drag.targetY = cy;
    this.drag.lastX = cx;
    this.drag.lastY = cy;
    this.drag.lastT = now;
  }

  release(vx, vy) {
    if (this.drag.index === -1) {
      return;
    }
    const dt = clamp(this.drag.sampleDt || 1 / 120, 1 / 240, 1 / 15);
    const safeVX = Number.isFinite(vx) ? vx : 0;
    const safeVY = Number.isFinite(vy) ? vy : 0;
    let stepX = safeVX * dt;
    let stepY = safeVY * dt;
    const maxStep = this.render.headRadius * 10;
    const magnitude = Math.hypot(stepX, stepY);
    if (magnitude > maxStep) {
      const scale = maxStep / (magnitude + 1e-6);
      stepX *= scale;
      stepY *= scale;
    }

    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];
      const prevVX = point.x - point.px;
      const prevVY = point.y - point.py;
      const newVX = prevVX + stepX;
      const newVY = prevVY + stepY;
      point.px = point.x - newVX;
      point.py = point.y - newVY;
    }

    this.drag.index = -1;
    this.drag.pointerVX = 0;
    this.drag.pointerVY = 0;
    this.drag.sampleDt = 1 / 60;
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

    const grabRange = this.render.headRadius * 1.15;
    return bestDistance <= grabRange ? bestIndex : -1;
  }

  simulate(dt, room) {
    if (!this.points.length) {
      return;
    }

    const targetStep = 1 / 120;
    const steps = Math.max(1, Math.ceil(dt / targetStep));
    const subDt = dt / steps;
    const accelTerm = this.gravity * dt * dt / steps;

    for (let s = 0; s < steps; s++) {
      this._integrate(subDt, accelTerm);
      this._applyDrag(subDt);
      this._solveConstraints();
      this._applyBounds(room);
      this._applyFriction(room);
      this._applyAirDrag();
      this._limitVelocity(room);
      this._stabilizeVelocities(room);
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
    }
  }

  _build(room) {
    const cx = room.x + room.w / 2;
    const floor = room.y + room.h - room.stroke - 6;
    const topLimit = room.y + room.stroke + 6;
    const totalHeight = room.h / 6;

    const headRadius = Math.max(10, totalHeight * 0.11);
    const neckLength = totalHeight * 0.05;
    const torsoLength = totalHeight * 0.32;
    const legLength = Math.max(totalHeight - (torsoLength + neckLength + headRadius * 2), totalHeight * 0.2);
    const upperLeg = legLength * 0.52;
    const lowerLeg = legLength - upperLeg;
    const upperArm = totalHeight * 0.18;
    const forearm = totalHeight * 0.17;
    const shoulderWidth = totalHeight * 0.22;
    const hipWidth = totalHeight * 0.16;
    const elbowSwingX = shoulderWidth * 0.4;
    const handSwingX = shoulderWidth * 0.85;
    const kneeOffsetX = hipWidth * 0.28;
    const footOffsetX = hipWidth * 0.32;

    const footY = Math.min(floor, topLimit + totalHeight);
    const kneeY = footY - lowerLeg;
    const hipY = kneeY - upperLeg;
    const torsoBottomY = hipY;
    const torsoTopY = torsoBottomY - torsoLength;

    const builder = new SkeletonBuilder();

    addTorso(builder, { centerX: cx, topY: torsoTopY, bottomY: torsoBottomY });
    const neckY = addNeck(builder, { centerX: cx, torsoTopY, length: neckLength });
    addHead(builder, { centerX: cx, neckY, radius: headRadius });

    const leftBound = room.x + room.stroke + headRadius * 0.8;
    const rightBound = room.x + room.w - room.stroke - headRadius * 0.8;
    const handMinY = topLimit + headRadius * 0.6;
    const shoulderY = torsoTopY + neckLength * 0.25;

    SIDES.forEach((side) => {
      const sign = side === 'L' ? -1 : 1;
      const shoulderX = cx + sign * (shoulderWidth / 2);
      const reach = Math.max((upperArm + forearm) * 0.92, headRadius * 2);
      const targetHandY = Math.min(shoulderY - reach, neckY - headRadius * 0.25);
      const handY = Math.max(targetHandY, handMinY);
      const elbowSpan = Math.max(headRadius * 0.8, (shoulderY - handY) * 0.55);
      const elbowY = Math.min(handY + elbowSpan, shoulderY - headRadius * 0.15);
      const elbowX = clamp(shoulderX + sign * elbowSwingX, leftBound, rightBound);
      const handX = clamp(shoulderX + sign * handSwingX, leftBound, rightBound);

      addUpperArm(builder, side, {
        shoulderX,
        shoulderY,
        elbowX,
        elbowY,
      });
      addForearm(builder, side, {
        handX,
        handY,
      });
    });

    SIDES.forEach((side) => {
      const sign = side === 'L' ? -1 : 1;
      const hipX = cx + sign * (hipWidth / 2);
      const kneeX = clamp(hipX + sign * kneeOffsetX, leftBound, rightBound);
      const footX = clamp(hipX + sign * footOffsetX, leftBound, rightBound);

      addUpperLeg(builder, side, {
        hipX,
        hipY,
        kneeX,
        kneeY,
      });
      addLowerLeg(builder, side, {
        footX,
        footY,
      });
    });

    addSpineJoint(builder);
    addNeckJoint(builder);
    addClavicleJoint(builder);
    addTrapeziusJoint(builder);
    addPelvisJoint(builder);
    addSoftTissueJoints(builder);

    SIDES.forEach((side) => {
      addShoulderJoint(builder, side);
      addElbowJoint(builder, side);
      addWristJoint(builder, side);
      addHipJoint(builder, side);
      addKneeJoint(builder, side);
      addAnkleJoint(builder, side);
    });

    const { points, constraints, lines, hinges, names } = builder.build();

    this.points = points;
    this.constraints = constraints;
    this.hinges = hinges;
    this.lines = lines;

    this.render = {
      headIndex: names.get('head') ?? -1,
      headRadius,
      lineWidth: Math.max(2, Math.round(Math.max(room.w, room.h) * 0.0045)),
      torsoTop: names.get('torsoTop'),
      torsoBottom: names.get('torsoBottom'),
      hipL: names.get('hipL'),
      hipR: names.get('hipR'),
      kneeL: names.get('kneeL'),
      kneeR: names.get('kneeR'),
      footL: names.get('footL'),
      footR: names.get('footR'),
    };

    this.bindPose = this.points.map((p) => ({ x: p.x, y: p.y }));
    this.totalMass = this.points.reduce((sum, p) => sum + (p.mass || 0), 0);

    const pixelsPerMeter = totalHeight / 1.8;
    this.scale = pixelsPerMeter;
    this.gravity = 9.81 * pixelsPerMeter;
    this.airDrag = 0.992;
    this.drag.stiffness = 0.62;
    this.drag.damping = 0.55;
    this.drag.index = -1;
    this.drag.targetX = cx;
    this.drag.targetY = torsoBottomY;
    this.drag.pointerVX = 0;
    this.drag.pointerVY = 0;
    this.drag.lastX = cx;
    this.drag.lastY = torsoBottomY;
    this.drag.lastT = performance.now();
    this.drag.sampleDt = 1 / 60;
    this._cancelStand();
  }

  _integrate(dt, accelTerm) {
    const dragIndex = this.drag.index;
    const damping = 0.998;

    for (let i = 0; i < this.points.length; i++) {
      if (i === dragIndex) {
        continue;
      }
      const p = this.points[i];
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      const nx = p.x + vx;
      const ny = p.y + vy + accelTerm;
      p.px = p.x;
      p.py = p.y;
      p.x = nx;
      p.y = ny;
    }
  }

  _applyDrag(dt) {
    const index = this.drag.index;
    if (index === -1 || index >= this.points.length) {
      return;
    }
    const p = this.points[index];
    const stiffness = clamp(this.drag.stiffness, 0, 0.95);
    const damping = clamp(this.drag.damping, 0, 1);
    const prevVX = p.x - p.px;
    const prevVY = p.y - p.py;
    const nx = p.x + (this.drag.targetX - p.x) * stiffness;
    const ny = p.y + (this.drag.targetY - p.y) * stiffness;
    const desiredVX = this.drag.pointerVX * dt;
    const desiredVY = this.drag.pointerVY * dt;
    const newVX = lerp(prevVX, desiredVX, damping);
    const newVY = lerp(prevVY, desiredVY, damping);
    p.x = nx;
    p.y = ny;
    p.px = p.x - newVX;
    p.py = p.y - newVY;
  }

  _solveConstraints() {
    const iterations = 9;
    for (let iter = 0; iter < iterations; iter++) {
      this._solveDistanceConstraints();
      this._solveHingeConstraints();
    }
  }

  _solveDistanceConstraints() {
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

  _solveHingeConstraints() {
    if (!this.hinges.length) {
      return;
    }
    for (const hinge of this.hinges) {
      const pivot = this.points[hinge.pivot];
      const anchor = this.points[hinge.anchor];
      const limb = this.points[hinge.limb];
      const ax = anchor.x - pivot.x;
      const ay = anchor.y - pivot.y;
      const bx = limb.x - pivot.x;
      const by = limb.y - pivot.y;
      const lenA = Math.hypot(ax, ay);
      const lenB = Math.hypot(bx, by);
      if (lenA < 1e-6 || lenB < 1e-6) {
        continue;
      }
      const angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
      const relative = normalizeAngle(angle - hinge.rest);
      let targetRelative = relative;
      if (relative < hinge.min) {
        targetRelative = hinge.min;
      } else if (relative > hinge.max) {
        targetRelative = hinge.max;
      } else {
        continue;
      }

      if (Math.abs(targetRelative - relative) < 1e-3) {
        continue;
      }

      const baseAngle = Math.atan2(ay, ax);
      const targetAngle = hinge.rest + targetRelative;
      const desiredTheta = baseAngle + targetAngle;
      const desiredX = pivot.x + Math.cos(desiredTheta) * lenB;
      const desiredY = pivot.y + Math.sin(desiredTheta) * lenB;
      const corrX = (desiredX - limb.x) * hinge.stiffness;
      const corrY = (desiredY - limb.y) * hinge.stiffness;
      const invPivot = 1 / pivot.mass;
      const invLimb = 1 / limb.mass;
      const invSum = invPivot + invLimb;
      if (invSum === 0) {
        continue;
      }
      const pivotFactor = invPivot / invSum;
      const limbFactor = invLimb / invSum;
      if (this.drag.index !== hinge.limb) {
        limb.x += corrX * limbFactor;
        limb.y += corrY * limbFactor;
      }
      if (this.drag.index !== hinge.pivot) {
        pivot.x -= corrX * pivotFactor;
        pivot.y -= corrY * pivotFactor;
      }
    }
  }

  _applyBounds(room) {
    const bounds = this._dragBounds(room);
    const restitution = 0.26;

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

  _applyFriction(room) {
    const floor = room.y + room.h - room.stroke - 6;
    const friction = 0.78;
    for (let i = 0; i < this.points.length; i++) {
      if (i === this.drag.index) {
        continue;
      }
      const p = this.points[i];
      if (Math.abs(p.y - floor) <= this.render.headRadius * 0.4) {
        const vx = p.x - p.px;
        p.px = p.x - vx * friction;
      }
    }
  }

  _applyAirDrag() {
    const drag = this.airDrag;
    for (let i = 0; i < this.points.length; i++) {
      if (i === this.drag.index) {
        continue;
      }
      const p = this.points[i];
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      p.px = p.x - vx * drag;
      p.py = p.y - vy * drag;
    }
  }

  _limitVelocity(room) {
    const maxSpeed = Math.max(room.w, room.h) * 0.06;
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

  _stabilizeVelocities(room) {
    const tolerance = Math.max(0.08, Math.max(room.w, room.h) * 0.00045);
    const toleranceSq = tolerance * tolerance;
    for (let i = 0; i < this.points.length; i++) {
      if (i === this.drag.index) {
        continue;
      }
      const p = this.points[i];
      const dx = p.x - p.px;
      const dy = p.y - p.py;
      if (dx * dx + dy * dy <= toleranceSq) {
        p.px = p.x;
        p.py = p.y;
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
