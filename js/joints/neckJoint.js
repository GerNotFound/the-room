export function addNeckJoint(builder, { stiffness = 0.96 } = {}) {
  builder.addDistance('torsoTop', 'neck', stiffness);
  builder.addDistance('neck', 'head', stiffness);
}
