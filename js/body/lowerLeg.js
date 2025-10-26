function footKey(side) {
  return `foot${side}`;
}

export function addLowerLeg(builder, side, { footX, footY, footMass = 1.12 }) {
  builder.addPoint(footKey(side), footX, footY, footMass);
}
