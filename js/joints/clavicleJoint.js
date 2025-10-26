export function addClavicleJoint(builder, { stiffness = 0.9 } = {}) {
  builder.addDistance('shoulderL', 'shoulderR', stiffness, { render: false });
}
