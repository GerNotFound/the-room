function handKey(side) {
  return `hand${side}`;
}

export function addForearm(builder, side, { handX, handY, handMass = 0.68 }) {
  builder.addPoint(handKey(side), handX, handY, handMass);
}
