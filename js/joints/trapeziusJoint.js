export function addTrapeziusJoint(builder, { stiffness = 0.7 } = {}) {
  builder.addDistance('neck', 'shoulderL', stiffness, { render: false });
  builder.addDistance('neck', 'shoulderR', stiffness, { render: false });
}
