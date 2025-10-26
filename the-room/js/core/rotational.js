export function dampRotationsAngle(points, sticks, k=0.35, cap=0.4){
  for (const st of sticks){
    const a=points[st.i], b=points[st.j];
    const vx=b.x - a.x, vy=b.y - a.y;
    const vpx=(b.px - a.px), vpy=(b.py - a.py);
    const angNow=Math.atan2(vy, vx);
    const angPrev=Math.atan2(vpy, vpx);
    let d=angNow - angPrev;
    while(d>Math.PI) d-=2*Math.PI;
    while(d<-Math.PI) d+=2*Math.PI;
    const s = Math.max(-cap, Math.min(cap, -k * d));
    if (Math.abs(s) < 1e-4) continue;
    const cx=(a.x+b.x)*0.5, cy=(a.y+b.y)*0.5;
    const sin=Math.sin(s), cos=Math.cos(s);
    const ax=a.x-cx, ay=a.y-cy;
    const bx=b.x-cx, by=b.y-cy;
    const ax2=ax*cos - ay*sin, ay2=ax*sin + ay*cos;
    const bx2=bx*cos - by*sin, by2=bx*sin + by*cos;
    a.x=cx+ax2; a.y=cy+ay2;
    b.x=cx+bx2; b.y=cy+by2;
  }
}
export function dampRotationsContacts(points, sticks, kBase=0.5, cap=0.6){
  for (const st of sticks){
    const a=points[st.i], b=points[st.j];
    const ac = (a.contactT|0) > 0, bc = (b.contactT|0) > 0;
    if (!ac && !bc) continue;
    const vx=b.x - a.x, vy=b.y - a.y;
    const vpx=(b.px - a.px), vpy=(b.py - a.py);
    const angNow=Math.atan2(vy, vx);
    const angPrev=Math.atan2(vpy, vpx);
    let d=angNow - angPrev;
    while(d>Math.PI) d-=2*Math.PI;
    while(d<-Math.PI) d+=2*Math.PI;
    const mult = (ac && bc) ? 1.6 : 1.0;
    const s = Math.max(-cap, Math.min(cap, -kBase * mult * d));
    if (Math.abs(s) < 1e-4) continue;
    const cx=(a.x+b.x)*0.5, cy=(a.y+b.y)*0.5;
    const sin=Math.sin(s), cos=Math.cos(s);
    const ax=a.x-cx, ay=a.y-cy;
    const bx=b.x-cx, by=b.y-cy;
    const ax2=ax*cos - ay*sin, ay2=ax*sin + ay*cos;
    const bx2=bx*cos - by*sin, by2=bx*sin + by*cos;
    if (ac && !bc){ a.x=cx+ax2*0.3 + ax*0.7; a.y=cy+ay2*0.3 + ay*0.7; b.x=cx+bx2; b.y=cy+by2; }
    else if (!ac && bc){ a.x=cx+ax2; a.y=cy+ay2; b.x=cx+bx2*0.3 + bx*0.7; b.y=cy+by2*0.3 + by*0.7; }
    else { a.x=cx+ax2; a.y=cy+ay2; b.x=cx+bx2; b.y=cy+by2; }
  }
}
