function keyFor(side, part) {
  return `${part}${side}`;
}

export function addUpperArm(builder, side, { shoulderX, shoulderY, elbowX, elbowY, shoulderMass = 0.92, elbowMass = 0.72 }) {
  builder.addPoint(keyFor(side, 'shoulder'), shoulderX, shoulderY, shoulderMass);
  builder.addPoint(keyFor(side, 'elbow'), elbowX, elbowY, elbowMass);
}
