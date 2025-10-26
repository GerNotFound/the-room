export function addSpineJoint(builder, { stiffness = 0.97 } = {}) {
  builder.addDistance('torsoTop', 'torsoBottom', stiffness);
}
