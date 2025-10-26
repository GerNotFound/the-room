export function addHead(builder, { centerX, neckY, radius, mass = 0.82 }) {
  const headY = neckY - radius;
  builder.addPoint('head', centerX, headY, mass);
}
