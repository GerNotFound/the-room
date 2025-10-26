function kneeKey(side) {
  return `knee${side}`;
}

function footKey(side) {
  return `foot${side}`;
}

export function addAnkleJoint(builder, side, { stiffness = 0.92 } = {}) {
  builder.addDistance(kneeKey(side), footKey(side), stiffness);
}
