export function sepPointCircle(points, i, jCenter, minDist, cap=3.2, weightOther=0.15){
  const p=points[i], c=points[jCenter];
  let dx=p.x-c.x, dy=p.y-c.y;
  let d=Math.hypot(dx,dy) || 1e-6;
  if (d >= minDist) return;
  const diff=(minDist - d)/d;
  let offx=dx*diff, offy=dy*diff;
  const ol=Math.hypot(offx,offy);
  if (ol>cap){ const kk=cap/(ol+1e-6); offx*=kk; offy*=kk; }
  p.x += offx; p.y += offy;
  c.x -= offx*weightOther; c.y -= offy*weightOther;
}
export function sepPointCapsule(points, iP, iA, iB, radius, cap=3.2, weightOther=0.15){
  const P=points[iP], A=points[iA], B=points[iB];
  const abx=B.x-A.x, aby=B.y-A.y;
  const apx=P.x-A.x, apy=P.y-A.y;
  const ab2=abx*abx+aby*aby || 1e-6;
  let t=(apx*abx + apy*aby)/ab2; t=Math.max(0,Math.min(1,t));
  const cx=A.x + abx*t, cy=A.y + aby*t;
  let dx=P.x-cx, dy=P.y-cy;
  let d=Math.hypot(dx,dy) || 1e-6;
  if (d >= radius) return;
  const diff=(radius - d)/d;
  let offx=dx*diff, offy=dy*diff;
  const ol=Math.hypot(offx,offy);
  if (ol>cap){ const kk=cap/(ol+1e-6); offx*=kk; offy*=kk; }
  P.x += offx; P.y += offy;
  const k=weightOther*0.5;
  A.x -= offx*(1-t)*k; A.y -= offy*(1-t)*k;
  B.x -= offx*(t)*k;   B.y -= offy*(t)*k;
}
