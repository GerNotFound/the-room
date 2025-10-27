function hipKey(side) {
  return `hip${side}`;
}

function kneeKey(side) {
  return `knee${side}`;
}

export function addKneeJoint(builder, side, { stiffness = 0.94 } = {}) {
  builder.addDistance(hipKey(side), kneeKey(side), stiffness);
  builder.addHinge(kneeKey(side), hipKey(side), `foot${side}`, {
    min: -Math.PI * 0.12,
    max: Math.PI * 0.92,
    stiffness: 0.52,
  });
}
