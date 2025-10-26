import { distance } from '../utils/math.js';

export class SkeletonBuilder {
  constructor() {
    this.points = [];
    this.nameToIndex = new Map();
    this.constraints = [];
    this.lines = [];
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

  build() {
    return {
      points: this.points,
      constraints: this.constraints,
      lines: this.lines,
      names: this.nameToIndex,
    };
  }
}
