import { distance, signedAngle } from '../utils/math.js';

export class SkeletonBuilder {
  constructor() {
    this.points = [];
    this.nameToIndex = new Map();
    this.constraints = [];
    this.lines = [];
    this.hinges = [];
  }

  addPoint(name, x, y, mass = 1) {
    if (this.nameToIndex.has(name)) {
      throw new Error(`Point "${name}" already defined`);
    }
    const index = this.points.length;
    this.points.push({ x, y, px: x, py: y, mass });
    this.nameToIndex.set(name, index);
    return index;
  }

  hasPoint(name) {
    return this.nameToIndex.has(name);
  }

  indexOf(name) {
    if (!this.nameToIndex.has(name)) {
      throw new Error(`Unknown point "${name}"`);
    }
    return this.nameToIndex.get(name);
  }

  addDistance(nameA, nameB, stiffness = 1, { render = true } = {}) {
    const i = this.indexOf(nameA);
    const j = this.indexOf(nameB);
    const a = this.points[i];
    const b = this.points[j];
    const length = distance(a.x, a.y, b.x, b.y);
    this.constraints.push({ i, j, length, stiffness });
    if (render) {
      this.lines.push([i, j]);
    }
  }

  addHinge(pivotName, anchorName, limbName, { min = -Math.PI, max = Math.PI, stiffness = 0.35 } = {}) {
    const pivotIndex = this.indexOf(pivotName);
    const anchorIndex = this.indexOf(anchorName);
    const limbIndex = this.indexOf(limbName);
    const pivot = this.points[pivotIndex];
    const anchor = this.points[anchorIndex];
    const limb = this.points[limbIndex];
    const ax = anchor.x - pivot.x;
    const ay = anchor.y - pivot.y;
    const bx = limb.x - pivot.x;
    const by = limb.y - pivot.y;
    const rest = signedAngle(ax, ay, bx, by);
    this.hinges.push({ pivot: pivotIndex, anchor: anchorIndex, limb: limbIndex, rest, min, max, stiffness });
  }

  build() {
    return {
      points: this.points,
      constraints: this.constraints,
      lines: this.lines,
      hinges: this.hinges,
      names: this.nameToIndex,
    };
  }
}
