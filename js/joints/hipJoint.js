function hipKey(side) {
  return `hip${side}`;
}

export function addHipJoint(builder, side, { stiffness = 0.95 } = {}) {
  builder.addDistance('torsoBottom', hipKey(side), stiffness);
}
