export function addNeckJoint(builder, { stiffness = 0.96 } = {}) {
  builder.addDistance('torsoTop', 'neck', stiffness);
  builder.addDistance('neck', 'head', stiffness, { render: false });
  builder.addHinge('neck', 'torsoTop', 'head', {
    min: -Math.PI * 0.25,
    max: Math.PI * 0.25,
    stiffness: 0.42,
  });
}
