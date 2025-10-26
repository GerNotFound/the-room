import { rad, angle } from './utils.js';
export function limitAngle(points, iA, iB, iC, minDeg, maxDeg, stiffness=0.25, cap=2.0){
  const A=points[iA], B=points[iB], C=points[iC];
  const abx=A.x-B.x, aby=A.y-B.y;
  const cbx=C.x-B.x, cby=C.y-B.y;
  const ang = angle(abx,aby,cbx,cby);
  const min = rad(minDeg), max = rad(maxDeg);
  let corr = 0;
  if (ang < min) corr = min - ang;
  else if (ang > max) corr = max - ang;
  else return;
  const s = Math.max(-cap, Math.min(cap, corr * stiffness));
  const sin = Math.sin(s), cos = Math.cos(s);
  const abx2 = abx*cos - aby*sin, aby2 = abx*sin + aby*cos;
  const cbx2 = cbx*cos - cby*sin, cby2 = cbx*sin + cby*cos;
  const kA = 0.5, kC = 0.5;
  A.x = B.x + abx2 * kA + abx * (1-kA);
  A.y = B.y + aby2 * kA + aby * (1-kA);
  C.x = B.x + cbx2 * kC + cbx * (1-kC);
  C.y = B.y + cby2 * kC + cby * (1-kC);
}
