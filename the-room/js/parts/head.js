export function buildHead(points, x, y){const iHead=points.push({x,y,px:x,py:y,m:1,fx:0,fy:0})-1;return { head:iHead };}
