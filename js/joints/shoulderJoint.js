function shoulderKey(side) {
  return `shoulder${side}`;
}

export function addShoulderJoint(builder, side, { stiffness = 0.94 } = {}) {
  builder.addDistance('torsoTop', shoulderKey(side), stiffness);
}
