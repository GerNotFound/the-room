export function addSoftTissueJoints(builder, { stiffness = 0.45 } = {}) {
  builder.addDistance('torsoTop', 'hipL', stiffness, { render: false });
  builder.addDistance('torsoTop', 'hipR', stiffness, { render: false });
  builder.addDistance('shoulderL', 'torsoBottom', stiffness, { render: false });
  builder.addDistance('shoulderR', 'torsoBottom', stiffness, { render: false });
  builder.addDistance('shoulderL', 'hipR', stiffness, { render: false });
  builder.addDistance('shoulderR', 'hipL', stiffness, { render: false });
}
