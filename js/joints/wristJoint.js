function elbowKey(side) {
  return `elbow${side}`;
}

function handKey(side) {
  return `hand${side}`;
}

export function addWristJoint(builder, side, { stiffness = 0.9 } = {}) {
  builder.addDistance(elbowKey(side), handKey(side), stiffness);
}
