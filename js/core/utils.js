export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export function segDist(px, py, x1, y1, x2, y2){
  const vx=x2-x1, vy=y2-y1; const wx=px-x1, wy=py-y1;
  const c1=vx*wx + vy*wy; if (c1<=0) return Math.hypot(px-x1, py-y1);
  const c2=vx*vx + vy*vy; if (c2<=c1) return Math.hypot(px-x2, py-y2);
  const b=c1/c2; const bx=x1 + b*vx, by=y1 + b*vy; return Math.hypot(px-bx, py-by);
}
export function dot(ax,ay,bx,by){ return ax*bx + ay*by; }
export function len(ax,ay){ return Math.hypot(ax,ay) || 1e-9; }
export function angle(ax,ay,bx,by){ const d = dot(ax,ay,bx,by)/(len(ax,ay)*len(bx,by)); return Math.acos(Math.max(-1, Math.min(1, d))); }
export function rad(deg){ return deg * Math.PI / 180; }
