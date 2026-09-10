export type P={x:number;y:number};
export type Opening={id:number;start:number;width:number;sill:number;height:number};
export type Wall={id:number;a:P;b:P;height:number;offset:P;openings:Opening[];path?:P[];range?:[number,number]};
export const pathLength=(ps:P[])=>ps.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-ps[i].x,p.y-ps[i].y),0);
export function pathPoint(ps:P[],distance:number):P{let left=Math.max(0,distance);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(left<=len&&len>0)return{x:a.x+(b.x-a.x)*left/len,y:a.y+(b.y-a.y)*left/len};left-=len;}return ps[ps.length-1];}
export function pathSlice(ps:P[],from:number,to:number){let at=0;return [pathPoint(ps,from),...ps.slice(1,-1).filter((p,i)=>{at+=Math.hypot(p.x-ps[i].x,p.y-ps[i].y);return at>from+1e-8&&at<to-1e-8;}),pathPoint(ps,to)];}
export function wallVertices(w:Wall){const ps=w.path??[w.a,w.b],len=pathLength(ps),range=w.range??[0,1];return pathSlice(ps,len*range[0],len*range[1]);}
export const wallLength=(w:Wall)=>pathLength(wallVertices(w));
export const wallPoint=(w:Wall,s:number):P=>{const p=pathPoint(wallVertices(w),s);return{x:p.x+w.offset.x,y:p.y+w.offset.y};};
export function wallPath(w:Wall,from=0,to=wallLength(w)){return pathSlice(wallVertices(w),from,to).map((p,i)=>`${i?'L':'M'}${p.x+w.offset.x} ${p.y+w.offset.y}`).join(' ');}
export function wallPart(w:Wall,from:number,to:number):Wall{const path=pathSlice(wallVertices(w),from,to);return{...w,a:path[0],b:path[path.length-1],path,range:undefined};}
// Clip each guide segment to the field; retain separate connected arc portions.
export function clipGuide(ps:P[],width:number,height:number){const pieces:P[][]=[];let current:P[]=[];for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1;for(const [p,q] of [[-dx,a.x],[dx,width-a.x],[-dy,a.y],[dy,height-a.y]]){if(Math.abs(p)<1e-12){if(q<0){hi=-1;break;}}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}if(lo>hi){if(current.length>1)pieces.push(current);current=[];continue;}const start={x:a.x+lo*dx,y:a.y+lo*dy},end={x:a.x+hi*dx,y:a.y+hi*dy};if(current.length&&Math.hypot(current[current.length-1].x-start.x,current[current.length-1].y-start.y)>.001){pieces.push(current);current=[];}if(!current.length)current.push(start);current.push(end);}if(current.length>1)pieces.push(current);return pieces.filter(ps=>pathLength(ps)>=.2);}
export const wallStats=(walls:Wall[])=>({total:walls.reduce((s,w)=>s+wallLength(w),0),moved:walls.reduce((s,w)=>s+(Math.hypot(w.offset.x,w.offset.y)>.001?wallLength(w):0),0),area:walls.reduce((s,w)=>s+w.openings.reduce((a,o)=>a+o.width*o.height,0),0)});
export function validateWalls(walls:Wall[],width:number,height:number){
 const s=wallStats(walls);if(s.moved>s.total/4+1e-7)return '移動牆段總長不得超過原始總長的 1/4。請先拆分較短牆段。';
 if(s.area>12+1e-7)return '全部開口總面積不得超過 12 m²。';
 for(const w of walls){const len=wallLength(w);if(!Number.isFinite(len)||len<.2||![w.height,w.offset.x,w.offset.y,w.a.x,w.a.y,w.b.x,w.b.y].every(Number.isFinite)||w.height<=0||w.height>2.4)return '牆長至少 0.2 m，牆高須介於 0.1–2.4 m。';
 if(w.range&&(!w.range.every(Number.isFinite)||w.range[0]<0||w.range[1]>1||w.range[0]>=w.range[1]))return "請保留有效的牆段範圍。";
 for(const p of wallVertices(w).map(p=>({x:p.x+w.offset.x,y:p.y+w.offset.y})))if(p.x< -1e-7||p.y< -1e-7||p.x>width+1e-7||p.y>height+1e-7)return '牆體中心線須位於基地內。';
 for(const o of w.openings){if(![o.start,o.width,o.sill,o.height].every(Number.isFinite)||o.start<0||o.width<=0||o.start+o.width>len+1e-7||o.sill<0||o.height<=0||o.sill+o.height>w.height+1e-7)return '開口必須完整位於牆面內。';
 if(w.openings.some(p=>p.id!==o.id&&o.start<p.start+p.width-1e-7&&o.start+o.width>p.start+1e-7&&o.sill<p.sill+p.height-1e-7&&o.sill+o.height>p.sill+1e-7))return '開口不可互相重疊。';}
 }return '';
}
// Rectangular solid portions of a wall face, with real voids at openings.
export function wallPanels(w:Wall){let distance=0;const vertices=wallVertices(w),breaks=vertices.slice(1).map((p,i)=>{distance+=Math.hypot(p.x-vertices[i].x,p.y-vertices[i].y);return distance;});const xs=[...new Set([0,wallLength(w),...breaks,...w.openings.flatMap(o=>[o.start,o.start+o.width])])].sort((a,b)=>a-b),zs=[...new Set([0,w.height,...w.openings.flatMap(o=>[o.sill,o.sill+o.height])])].sort((a,b)=>a-b);const panels:{s0:number;s1:number;z0:number;z1:number}[]=[];
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;if(!w.openings.some(o=>x>o.start&&x<o.start+o.width&&z>o.sill&&z<o.sill+o.height))panels.push({s0:xs[i],s1:xs[i+1],z0:zs[j],z1:zs[j+1]});}return panels;
}
export function suggestWalls(guides:{a:P;b:P}[],trees:P[]){
 const candidates=guides.flatMap(g=>{const length=Math.hypot(g.b.x-g.a.x,g.b.y-g.a.y);if(length<4)return [];const ux=(g.b.x-g.a.x)/length,uy=(g.b.y-g.a.y)/length;let spans=[[length*.15,length*.85]];
 for(const tree of trees){const along=(tree.x-g.a.x)*ux+(tree.y-g.a.y)*uy,distance=Math.abs((tree.x-g.a.x)*-uy+(tree.y-g.a.y)*ux);if(distance>=2.5)continue;const reach=Math.sqrt(2.5**2-distance**2);spans=spans.flatMap(([a,b])=>along+reach<=a||along-reach>=b?[[a,b]]:[[a,Math.max(a,along-reach)],[Math.min(b,along+reach),b]]);}
 return spans.filter(([a,b])=>b-a>=3).map(([a,b])=>({a:{x:g.a.x+ux*a,y:g.a.y+uy*a},b:{x:g.a.x+ux*b,y:g.a.y+uy*b},length:b-a}));
 }).sort((a,b)=>b.length-a.length);
 const selected:typeof candidates=[];
 for(const g of candidates){if(selected.length>=3)break;const middle={x:(g.a.x+g.b.x)/2,y:(g.a.y+g.b.y)/2};if(selected.some(w=>Math.hypot(middle.x-(w.a.x+w.b.x)/2,middle.y-(w.a.y+w.b.y)/2)<4))continue;selected.push(g);}
 return selected.map((g,i):Wall=>({id:i+1,a:g.a,b:g.b,height:2.4,offset:{x:0,y:0},openings:[]}));
}
export function nearestPathRatio(ps:P[],p:P){let best=Infinity,result=0,along=0;const total=pathLength(ps);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len))),distance=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);if(distance<best){best=distance;result=(along+t*len)/total;}along+=len;}return result;}
