function hipKey(side) {
  return `hip${side}`;
}

export function addHipJoint(builder, side, { stiffness = 0.95 } = {}) {
  builder.addDistance('torsoBottom', hipKey(side), stiffness);
  builder.addHinge(hipKey(side), 'torsoBottom', `knee${side}`, {
    min: -Math.PI * 0.55,
    max: Math.PI * 0.95,
    stiffness: 0.5,
  });
}
