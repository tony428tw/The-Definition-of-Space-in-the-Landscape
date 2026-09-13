import {wallPanels,wallPoint,wallLength,type Wall,type P} from './walls';
export function wallSolids(w:Wall){return wallPanels(w).map(panel=>{const a=wallPoint(w,panel.s0),b=wallPoint(w,panel.s1),len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len*.1,ny=(b.x-a.x)/len*.1;return{...panel,wall:w,floor:[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]};});}
export function AxonWall({solid,point}:{solid:ReturnType<typeof wallSolids>[number];point:(x:number,y:number,z:number)=>P}){
 const {floor,z0,z1}=solid;const path=(ps:P[])=>ps.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z';
 const faces=[
  {key:'bottom',fill:'#8e8679',points:floor.map(p=>point(p.x,p.y,z0))},
  ...floor.map((p,i)=>{const q=floor[(i+1)%4];return{key:`side-${i}`,fill:i%2?'#978e80':'#c1b9ab',points:[point(p.x,p.y,z0),point(q.x,q.y,z0),point(q.x,q.y,z1),point(p.x,p.y,z1)]};}),
  {key:'top',fill:'#e7e0d3',points:floor.map(p=>point(p.x,p.y,z1))},
 ].sort((a,b)=>a.points.reduce((s,p)=>s+p.y,0)/a.points.length-b.points.reduce((s,p)=>s+p.y,0)/b.points.length);
 return <g data-wall-solid="closed" stroke="#4f493f" strokeWidth=".75" strokeLinejoin="round">{faces.map(face=><path key={face.key} fill={face.fill} d={path(face.points)}/>)}</g>;
}
function clip(poly:P[],axis:'x'|'y',bound:number,greater:boolean){const result:P[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ina=greater?a[axis]>=bound:a[axis]<=bound,inb=greater?b[axis]>=bound:b[axis]<=bound;if(ina)result.push(a);if(ina!==inb){const t=(bound-a[axis])/(b[axis]-a[axis]);result.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}}return result;}
export function sectionWalls(walls:Wall[],a:P,b:P,direction:number,depth:number){const length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-8)return [];const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;return walls.flatMap(w=>wallSolids(w).flatMap(s=>{const p=s.floor.map(p=>({x:(p.x-a.x)*ux+(p.y-a.y)*uy,y:((p.x-a.x)*-uy+(p.y-a.y)*ux)*direction}));const cut=Math.min(...p.map(p=>p.y))<=0&&Math.max(...p.map(p=>p.y))>=0;
 let poly=clip(clip(clip(clip(p,'x',0,true),'x',length,false),'y',0,true),'y',depth,false);if(!poly.length)return [];const distance=poly.reduce((sum,p)=>sum+p.y,0)/poly.length;
 // A cut wall is the exact intersection with the section plane, not its full projected length.
 if(cut){poly=clip(poly,'y',.00001,false);if(!poly.length)return [];}
 return [{x0:Math.min(...poly.map(p=>p.x)),x1:Math.max(...poly.map(p=>p.x)),z0:s.z0,z1:s.z1,height:w.height,id:w.id,cut,distance}];})).sort((a,b)=>b.distance-a.distance);}
