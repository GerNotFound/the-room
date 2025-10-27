function shoulderKey(side) {
  return `shoulder${side}`;
}

function elbowKey(side) {
  return `elbow${side}`;
}

export function addElbowJoint(builder, side, { stiffness = 0.93 } = {}) {
  builder.addDistance(shoulderKey(side), elbowKey(side), stiffness);
}
