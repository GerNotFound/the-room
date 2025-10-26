export function addNeck(builder, { centerX, torsoTopY, length, mass = 0.65 }) {
  const neckY = torsoTopY - length;
  builder.addPoint('neck', centerX, neckY, mass);
  return neckY;
}
