function keyFor(side, part) {
  return `${part}${side}`;
}

export function addUpperLeg(builder, side, { hipX, hipY, kneeX, kneeY, hipMass = 1.04, kneeMass = 0.94 }) {
  builder.addPoint(keyFor(side, 'hip'), hipX, hipY, hipMass);
  builder.addPoint(keyFor(side, 'knee'), kneeX, kneeY, kneeMass);
}
