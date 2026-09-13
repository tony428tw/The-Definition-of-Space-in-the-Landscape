export type P={x:number;y:number};
export type Opening={id:number;start:number;width:number;sill:number;height:number};
export type Wall={id:number;a:P;b:P;height:number;offset:P;openings:Opening[];path?:P[];range?:[number,number];boundary?:string;locked?:boolean;hidden?:boolean;rotation?:number};
export const pathLength=(ps:P[])=>ps.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-ps[i].x,p.y-ps[i].y),0);
export function pathPoint(ps:P[],distance:number):P{let left=Math.max(0,distance);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(left<=len&&len>0)return{x:a.x+(b.x-a.x)*left/len,y:a.y+(b.y-a.y)*left/len};left-=len;}return ps[ps.length-1];}
export function pathSlice(ps:P[],from:number,to:number){let at=0;return [pathPoint(ps,from),...ps.slice(1,-1).filter((p,i)=>{at+=Math.hypot(p.x-ps[i].x,p.y-ps[i].y);return at>from+1e-8&&at<to-1e-8;}),pathPoint(ps,to)];}
export function wallVertices(w:Wall){const ps=w.path??[w.a,w.b],len=pathLength(ps),range=w.range??[0,1];return pathSlice(ps,len*range[0],len*range[1]);}
export const wallLength=(w:Wall)=>pathLength(wallVertices(w));
export const wallTransform=(w:Wall,p:P):P=>{const origin=wallVertices(w)[0],angle=w.rotation??0,c=Math.cos(angle),s=Math.sin(angle),x=p.x-origin.x,y=p.y-origin.y;return{x:origin.x+x*c-y*s+w.offset.x,y:origin.y+x*s+y*c+w.offset.y};};
export const wallPoint=(w:Wall,s:number):P=>wallTransform(w,pathPoint(wallVertices(w),s));
export const wallMoved=(w:Wall)=>Math.hypot(w.offset.x,w.offset.y)>.001||Math.abs(Math.sin((w.rotation??0)/2))>1e-7;
export function relocateWall(w:Wall,start:P,direction:P):Wall{const vertices=wallVertices(w),a=vertices[0],b=vertices[vertices.length-1];return {...w,offset:{x:start.x-a.x,y:start.y-a.y},rotation:Math.atan2(direction.y-start.y,direction.x-start.x)-Math.atan2(b.y-a.y,b.x-a.x)};}

export function wallPath(w:Wall,from=0,to=wallLength(w)){return pathSlice(wallVertices(w),from,to).map(p=>wallTransform(w,p)).map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');}
export function wallPart(w:Wall,from:number,to:number):Wall{const path=pathSlice(wallVertices(w),from,to);const start=wallPoint(w,from);return{...w,a:path[0],b:path[path.length-1],path,range:undefined,offset:{x:start.x-path[0].x,y:start.y-path[0].y}};}
// Clip each guide segment to the field; retain separate connected arc portions.
export function clipGuide(ps:P[],width:number,height:number){const pieces:P[][]=[];let current:P[]=[];for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1;for(const [p,q] of [[-dx,a.x],[dx,width-a.x],[-dy,a.y],[dy,height-a.y]]){if(Math.abs(p)<1e-12){if(q<0){hi=-1;break;}}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}if(lo>hi){if(current.length>1)pieces.push(current);current=[];continue;}const start={x:a.x+lo*dx,y:a.y+lo*dy},end={x:a.x+hi*dx,y:a.y+hi*dy};if(current.length&&Math.hypot(current[current.length-1].x-start.x,current[current.length-1].y-start.y)>.001){pieces.push(current);current=[];}if(!current.length)current.push(start);current.push(end);}if(current.length>1)pieces.push(current);return pieces.filter(ps=>pathLength(ps)>=.2);}
export const wallStats=(walls:Wall[])=>({total:walls.reduce((s,w)=>s+wallLength(w),0),moved:walls.reduce((s,w)=>s+(wallMoved(w)?wallLength(w):0),0),area:walls.reduce((s,w)=>s+w.openings.reduce((a,o)=>a+o.width*o.height,0),0)});
export const WALL_MOVE_FRACTION = .25;
export const WALL_OPENING_LIMIT = 12;
export function wallExperience(w:Wall){
 const full=w.openings.filter(o=>o.sill<=1e-7&&o.sill+o.height>=w.height-1e-7);
 if(full.length>=2)return{kind:'透空邊界',description:'重複的全高間隙讓視線、光線與部分行為穿透；仍能讀出邊界節奏，空間感較輕、流動性較高。'};
 if(full.length===1)return{kind:'邊界開口',description:'單一全高缺口集中入口與視線，建立內外轉換及方向焦點；開口愈少，空間架構愈清楚。'};
 if(w.openings.length)return{kind:'穿鑿牆面',description:'門洞或景窗在保留牆體圍合感的同時框取視線、導引穿越；屬非完整牆面，開口位置會直接改變停留與行走方式。'};
 if(!w.boundary)return{kind:'開放／指示性邊界',description:'獨立片牆不追求完整圍合，而以遮擋、背靠、轉折與錯位關係提示空間；可引導動線並保留兩側連通。'};
 return{kind:'封閉／實體邊界',description:'連續實牆形成明確包覆、阻隔視線與行為穿越，帶來安定與私密感；使用過多則可能削弱空間流動。'};
}
export function validateWalls(walls:Wall[],width:number,height:number,originalTotal?:number){
 const s=wallStats(walls),baseline=originalTotal??s.total;
 if(originalTotal!==undefined&&(!Number.isFinite(originalTotal)||originalTotal<=0||Math.abs(s.total-originalTotal)>1e-6))return '固定原始配置後，配置總長必須保持不變；等分牆段不會改變總長。';
 if(s.moved>baseline*WALL_MOVE_FRACTION+1e-7)return `移動牆段總長 ${s.moved.toFixed(2)} m，超過原始總長的 1/4（25%，${(baseline*WALL_MOVE_FRACTION).toFixed(2)} m）。請先等分較短牆段，或還原其他已移動牆段。`;
 if(s.area>WALL_OPENING_LIMIT+1e-7)return `全部開口總面積 ${s.area.toFixed(2)} m²，超過 12 m² 上限。請縮小或刪除開口。`;
 for(const w of walls){const len=wallLength(w);if(!Number.isFinite(len)||len<.2||![w.height,w.rotation??0,w.offset.x,w.offset.y,w.a.x,w.a.y,w.b.x,w.b.y].every(Number.isFinite)||w.height<.1||w.height>2.4)return '牆長至少 0.2 m，牆高須介於 0.1–2.4 m。';
 if(w.range&&(!w.range.every(Number.isFinite)||w.range[0]<0||w.range[1]>1||w.range[0]>=w.range[1]))return "請保留有效的牆段範圍。";
 for(const p of wallVertices(w).map(p=>wallTransform(w,p)))if(p.x< -1e-7||p.y< -1e-7||p.x>width+1e-7||p.y>height+1e-7)return '牆體中心線須位於基地內。';
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

export const boundaryNames=['上邊界','右邊界','下邊界','左邊界'];
export function boundaryWalls(width:number,height:number,firstId=1):Wall[]{const points=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];return points.map((a,i)=>({id:firstId+i,a,b:points[(i+1)%4],height:2.4,offset:{x:0,y:0},openings:[],boundary:boundaryNames[i]}));}
export function perforatedOpenings(w:Wall,count:number,gap:number,firstId:number):Opening[]{const len=wallLength(w);return Array.from({length:count},(_,i)=>({id:firstId+i,start:len*(i+1)/(count+1)-gap/2,width:gap,height:w.height,sill:0}));}
export function findOpeningStart(w:Wall,width:number,height:number,sill:number):number|null{const len=wallLength(w),blocking=w.openings.filter(o=>sill<o.sill+o.height-1e-7&&sill+height>o.sill+1e-7).sort((a,b)=>a.start-b.start);let from=0;const spaces:[number,number][]=[];for(const o of blocking){if(o.start>from)spaces.push([from,o.start]);from=Math.max(from,o.start+o.width);}if(from<len)spaces.push([from,len]);const space=spaces.filter(([a,b])=>b-a>=width-1e-7).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];return space?(space[0]+space[1]-width)/2:null;}
