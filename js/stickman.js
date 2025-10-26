import { SkeletonBuilder } from './skeleton/builder.js';
import {
  TAU,
  clamp,
  distance,
  segmentDistance,
  lerp,
  easeOutCubic,
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

    for (let s = 0; s < steps; s++) {
      this._integrate(subDt);
      this._solveConstraints(room);
      this._applyBounds(room);
      this._applyFriction(room);
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
    const maxRoomSide = Math.max(room.w, room.h);
    const maxHeight = maxRoomSide * 0.2;
    const topLimit = room.y + room.stroke + 6;
    const availableHeight = floor - topLimit;
    const height = Math.min(maxHeight, availableHeight * 0.94);

    const headDiameter = height * 0.18;
    const headRadius = Math.max(12, headDiameter / 2);
    const neckLength = Math.max(headRadius * 0.55, height * 0.035);
    const torsoLength = height * 0.32;
    const legLength = height - (headDiameter + neckLength + torsoLength);
    const upperLeg = legLength * 0.48;
    const lowerLeg = legLength * 0.52;
    const upperArm = torsoLength * 0.55;
    const forearm = torsoLength * 0.62;
    const shoulderWidth = headRadius * 2.15;
    const hipWidth = headRadius * 1.45;

    const torsoBottomY = floor - lowerLeg - upperLeg;
    const torsoTopY = torsoBottomY - torsoLength;
    const shoulderY = torsoTopY + headRadius * 0.1;
    const hipY = torsoBottomY;
    const elbowSwingX = headRadius * 0.85;
    const handSwingX = headRadius * 1.6;
    const kneeOffsetX = headRadius * 0.28;
    const footOffsetX = headRadius * 0.45;

    const builder = new SkeletonBuilder();

    addTorso(builder, { centerX: cx, topY: torsoTopY, bottomY: torsoBottomY });
    const neckY = addNeck(builder, { centerX: cx, torsoTopY, length: neckLength });
    addHead(builder, { centerX: cx, neckY, radius: headRadius });

    const leftBound = room.x + room.stroke + headRadius * 0.8;
    const rightBound = room.x + room.w - room.stroke - headRadius * 0.8;
    const handMinY = topLimit + headRadius * 0.6;

    SIDES.forEach((side) => {
      const sign = side === 'L' ? -1 : 1;
      const shoulderX = cx + sign * (shoulderWidth / 2);
      const reach = Math.max((upperArm + forearm) * 0.85, headRadius * 1.9);
      const targetHandY = Math.min(shoulderY - reach, neckY - headRadius * 0.2);
      const handY = Math.max(targetHandY, handMinY);
      const elbowSpan = Math.max(headRadius * 0.7, (shoulderY - handY) * 0.55);
      const elbowY = Math.min(handY + elbowSpan, shoulderY - headRadius * 0.2);
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
      const kneeY = hipY + upperLeg;
      const footY = floor;

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

    const { points, constraints, lines, names } = builder.build();

    this.points = points;
    this.constraints = constraints;
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
    this.gravity = Math.max(1100, height * 55);
    this._cancelStand();
  }

  _integrate(dt) {
    const dragIndex = this.drag.index;
    const damping = 0.993;
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

  _solveConstraints() {
    const iterations = 9;
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

  _limitVelocity(room) {
    const maxSpeed = Math.max(room.w, room.h) * 0.03;
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
