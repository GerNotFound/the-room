function hipKey(side) {
  return `hip${side}`;
}

function kneeKey(side) {
  return `knee${side}`;
}

export function addKneeJoint(builder, side, { stiffness = 0.94 } = {}) {
  builder.addDistance(hipKey(side), kneeKey(side), stiffness);
}
