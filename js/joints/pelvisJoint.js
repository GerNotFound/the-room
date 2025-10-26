export function addPelvisJoint(builder, { stiffness = 0.9 } = {}) {
  builder.addDistance('hipL', 'hipR', stiffness, { render: false });
}
