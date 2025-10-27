function shoulderKey(side) {
  return `shoulder${side}`;
}

function elbowKey(side) {
  return `elbow${side}`;
}

export function addShoulderJoint(builder, side, { stiffness = 0.94 } = {}) {
  builder.addDistance('torsoTop', shoulderKey(side), stiffness);
  builder.addHinge(shoulderKey(side), 'torsoTop', elbowKey(side), {
    min: -Math.PI * 0.7,
    max: Math.PI * 0.55,
    stiffness: 0.45,
  });
}
