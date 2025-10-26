export function addTorso(builder, { centerX, topY, bottomY, upperMass = 1.1, lowerMass = 1.3 }) {
  builder.addPoint('torsoTop', centerX, topY, upperMass);
  builder.addPoint('torsoBottom', centerX, bottomY, lowerMass);
}
