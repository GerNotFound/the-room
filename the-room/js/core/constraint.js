import { clamp } from './utils.js';

export function integrate(points, dt, gravity, dampPerSec, quadDrag, maxStep, grabbedIndex){
  const damp = Math.exp(-dampPerSec * dt);
  for (let i=0;i<points.length;i++){
    if (i===grabbedIndex) continue;
    const p=points[i];
    const ax = (p.fx || 0) / (p.m || 1);
    const ay = (p.fy || 0) / (p.m || 1) + gravity;
    let vx=(p.x - p.px);
    let vy=(p.y - p.py);
    vx *= damp; vy *= damp;
    const speed = Math.hypot(vx, vy);
    if (speed > 1e-6){
      const k = 1.0 / (1.0 + quadDrag * speed * dt);
      vx *= k; vy *= k;
    }
    vx += ax * dt*dt; vy += ay * dt*dt;
    const spd = Math.hypot(vx,vy);
    if (spd>maxStep){ const c=maxStep/(spd+1e-6); vx*=c; vy*=c; }
    p.px=p.x; p.py=p.y;
    p.x += vx; p.y += vy;
    p.fx = 0; p.fy = 0;
  }
}

export function applyBounds(points, room, restitution=0.10, friction=0.93){
  const l=room.x+room.stroke+1, r=room.x+room.w-room.stroke-1, t=room.y+room.stroke+1, b=room.y+room.h-room.stroke-1;
  const eps = 0.001;
  for (let i=0;i<points.length;i++){
    const p=points[i];
    let hitX=false, hitY=false;
    if (p.x<l){ p.x=l+eps; hitX=true; }
    if (p.x>r){ p.x=r-eps; hitX=true; }
    if (p.y<t){ p.y=t+eps; hitY=true; }
    if (p.y>b){ p.y=b-eps; hitY=true; }

    if (hitX || hitY){
      let vx = p.x - p.px; let vy = p.y - p.py;
      let nx=0, ny=0;
      if (hitX) nx = (p.x <= l+1? 1 : -1);
      if (hitY) ny = (p.y <= t+1? 1 : -1);
      const vn = vx*nx + vy*ny;
      const vnx = vn*nx, vny = vn*ny;
      const vtx = vx - vnx, vty = vy - vny;
      let vx2 = (-vn * (1 - restitution)) * nx + vtx * (1 - friction);
      let vy2 = (-vn * (1 - restitution)) * ny + vty * (1 - friction);
      // anti-explosion
      const pre = Math.hypot(vx, vy);
      const post = Math.hypot(vx2, vy2);
      const maxPost = Math.min(pre, room.h*0.028);
      if (post > maxPost){ const k = maxPost / (post + 1e-6); vx2 *= k; vy2 *= k; }
      p.px = p.x - vx2; p.py = p.y - vy2;
      p.contactT = 2; p.cnx = nx; p.cny = ny;
    }

    if (Math.abs(p.y - b) < 1.5){
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      if (Math.abs(vx) < 0.35){ p.px = p.x; } else { p.px = p.x - vx * 0.5; }
      p.py = p.y - vy * 0.25;
    }
  }
}

export function solveSticks(points, sticks, iterations, stiffness, grabbedIndex, corrCap){
  for (let k=0;k<iterations;k++){
    for (let s=0;s<sticks.length;s++){
      const st=sticks[s], p1=points[st.i], p2=points[st.j];
      const dx=p2.x-p1.x, dy=p2.y-p1.y, d=Math.hypot(dx,dy)||1e-5;
      const diff=(d - st.len)/d;
      let offx=dx*diff*stiffness, offy=dy*diff*stiffness;
      const ol=Math.hypot(offx,offy);
      if (ol > corrCap){ const kk=corrCap/(ol+1e-6); offx*=kk; offy*=kk; }
      const w1 = 1/Math.max(0.1, Math.min(3.0, p1.m || 1));
      const w2 = 1/Math.max(0.1, Math.min(3.0, p2.m || 1));
      let sum = w1 + w2; if (!isFinite(sum) || sum<=1e-8) sum = 1;
      let k1 = (st.i===grabbedIndex) ? 0 : (w1/sum);
      let k2 = (st.j===grabbedIndex) ? 0 : (w2/sum);
      p1.x += offx * k1; p1.y += offy * k1;
      p2.x -= offx * k2; p2.y -= offy * k2;
    }
  }
}
