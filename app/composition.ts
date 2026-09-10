import polygonClipping from 'polygon-clipping';
type P=[number,number];type Poly=P[][];
type Region={x:number;y:number;w:number;h:number;color:number};
type Arc={center:{x:number;y:number};radius:number;start:number;sweep:number;clockwise:boolean};
export type ColorFace={polygon:Poly;color:number;d:string};
export function colorGraph(neighbours:number[][],preferred:number[]) {
 const n=neighbours.length;let best=preferred.map(c=>c%3);
 const score=(colors:number[])=>neighbours.reduce((sum,edges,i)=>sum+edges.filter(j=>j>i&&colors[i]===colors[j]).length,0);
 let bestScore=score(best);
 for(let attempt=0;attempt<12&&bestScore;attempt++){
  const colors=Array(n).fill(-1);
  for(let k=0;k<n;k++){
   const order=Array.from({length:n},(_,i)=>i).filter(i=>colors[i]<0).sort((a,b)=>new Set(neighbours[b].map(j=>colors[j]).filter(c=>c>=0)).size-new Set(neighbours[a].map(j=>colors[j]).filter(c=>c>=0)).size||neighbours[b].length-neighbours[a].length||((a+attempt)%n)-((b+attempt)%n));
   const i=order[0];colors[i]=[0,1,2].sort((a,b)=>neighbours[i].filter(j=>colors[j]===a).length-neighbours[i].filter(j=>colors[j]===b).length||((a-preferred[i]-attempt+99)%3)-((b-preferred[i]-attempt+99)%3))[0];
  }
  for(let pass=0;pass<20;pass++){let changed=false;for(let i=0;i<n;i++){const old=neighbours[i].filter(j=>colors[j]===colors[i]).length;const c=[0,1,2].sort((a,b)=>neighbours[i].filter(j=>colors[j]===a).length-neighbours[i].filter(j=>colors[j]===b).length)[0];if(neighbours[i].filter(j=>colors[j]===c).length<old){colors[i]=c;changed=true;}}if(!changed)break;}
  const value=score(colors);if(value<bestScore){best=colors;bestScore=value;}
 }
 return best;
}
function area(p:Poly){return Math.abs(p.reduce((s,ring)=>s+ring.reduce((a,v,i)=>{const q=ring[(i+1)%ring.length];return a+v[0]*q[1]-q[0]*v[1];},0)/2,0));}
function edges(p:Poly){return p.flatMap(r=>r.slice(1).map((q,i)=>[r[i],q] as [P,P]));}
function contact(a:[P,P],b:[P,P]){
 const [p,q]=a,[r,s]=b,dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);if(len<1e-8)return false;
 const cross=(t:P)=>Math.abs(dx*(t[1]-p[1])-dy*(t[0]-p[0]))/len;
 if(cross(r)>1e-5||cross(s)>1e-5)return false;
 const dot=(t:P)=>((t[0]-p[0])*dx+(t[1]-p[1])*dy)/len;
 return Math.min(len,Math.max(dot(r),dot(s)))-Math.max(0,Math.min(dot(r),dot(s)))>1e-5;
}
export function composeFaces(regions:Region[],arcs:Arc[],bounds:{x:number;y:number;width:number;height:number}):ColorFace[]{
 let cells=regions.map(r=>({polygon:[[[bounds.x+r.x/1000*bounds.width,bounds.y+r.y/700*bounds.height],[bounds.x+(r.x+r.w)/1000*bounds.width,bounds.y+r.y/700*bounds.height],[bounds.x+(r.x+r.w)/1000*bounds.width,bounds.y+(r.y+r.h)/700*bounds.height],[bounds.x+r.x/1000*bounds.width,bounds.y+(r.y+r.h)/700*bounds.height],[bounds.x+r.x/1000*bounds.width,bounds.y+r.y/700*bounds.height]]] as Poly,color:r.color}));
 for(const arc of arcs){
  const steps=Math.max(2,Math.ceil(arc.sweep));
  const ring:P[]=Array.from({length:steps+1},(_,i)=>{const t=(arc.start+(arc.clockwise?1:-1)*arc.sweep*i/steps)*Math.PI/180;return[arc.center.x+arc.radius*Math.cos(t),arc.center.y+arc.radius*Math.sin(t)];});
  if(arc.sweep<360)ring.unshift([arc.center.x,arc.center.y]);ring.push(ring[0]);const sector:Poly=[ring];
  cells=cells.flatMap(cell=>[...polygonClipping.difference(cell.polygon,sector).map(polygon=>({polygon,color:cell.color})),...polygonClipping.intersection(cell.polygon,sector).map(polygon=>({polygon,color:(cell.color+1)%3}))].filter(cell=>area(cell.polygon)>1e-8));
 }
 const segments=cells.map(c=>edges(c.polygon));
 const boxes=cells.map(c=>{const pts=c.polygon.flat();return[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];});
 const neighbours:number[][]=cells.map(()=>[]);
 for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
  const a=boxes[i],b=boxes[j];if(a[2]<b[0]-1e-5||b[2]<a[0]-1e-5||a[3]<b[1]-1e-5||b[3]<a[1]-1e-5)continue;
  if(segments[i].some(e=>segments[j].some(f=>contact(e,f)))){neighbours[i].push(j);neighbours[j].push(i);}
 }
 const colors=colorGraph(neighbours,cells.map(c=>c.color));
 return cells.map((c,i)=>({...c,color:colors[i],d:c.polygon.map(r=>r.map((p,j)=>`${j?'L':'M'}${p[0]} ${p[1]}`).join(' ')+'Z').join(' ')}));
}
