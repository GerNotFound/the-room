function shoulderKey(side) {
  return `shoulder${side}`;
}

function elbowKey(side) {
  return `elbow${side}`;
}

function handKey(side) {
  return `hand${side}`;
}

export function addElbowJoint(builder, side, { stiffness = 0.93 } = {}) {
  builder.addDistance(shoulderKey(side), elbowKey(side), stiffness);
  builder.addHinge(elbowKey(side), shoulderKey(side), handKey(side), {
    min: -Math.PI * 0.1,
    max: Math.PI * 0.85,
    stiffness: 0.48,
  });
}
