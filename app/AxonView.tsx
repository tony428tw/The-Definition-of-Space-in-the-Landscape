"use client";
import {useDrawingViewport,DrawingScale,ViewportExportBounds} from "./DrawingViewport";
import {useRef,useState} from "react";
import {wallSolids,AxonWall} from "./WallViews";
import {wallLength,wallPoint,type Wall} from "./walls";
type Point={x:number;y:number};
type Face={d:string;color:number};
export default function AxonView({walls=[],stage=3,width,height,trees,crownHeight,trunkHeight,faces,colors,planBounds,download}:{walls?:Wall[];stage?:number;width:number;height:number;trees:Point[];crownHeight:number;trunkHeight:number;faces:Face[];colors:string[];planBounds:{x:number;y:number;width:number;height:number};download:(svg:SVGSVGElement|null,filename:string)=>void}) {
 const ref=useRef<SVGSVGElement>(null),[view,setView]=useState("30"),[dimensions,setDimensions]=useState(true);
 const viewport=useDrawingViewport({x:0,y:0,width:1000,height:700});
 const angle=view==="iso"?45:Number(view),otherAngle=view==="iso"?45:90-angle;
 const viewLabel=view==="iso"?"對稱軸測（45°／45°）":`${angle}°／${otherAngle}°`;
 const a=angle*Math.PI/180,b=otherAngle*Math.PI/180;
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
 const project=(x:number,y:number,z=0)=>({x:ca*x-cb*y,y:sa*x+sb*y-z});
 const totalHeight=crownHeight+trunkHeight;
 const minX=-cb*(height+5)-3,maxX=ca*(width+5)+3,minY=-totalHeight-3,maxY=sa*(width+5)+sb*(height+5)+3;
 const scale=Math.min(740/(maxX-minX),500/(maxY-minY));
 const ox=(1000-(maxX-minX)*scale)/2-minX*scale,oy=75-minY*scale;
 const point=(x:number,y:number,z=0)=>{const p=project(x,y,z);return{x:ox+p.x*scale,y:oy+p.y*scale};};
 const path=(ps:Point[])=>ps.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z';
 const dim=(p:Point,q:Point,label:string,offset=0)=>{
   const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
   let rotation=Math.atan2(dy,dx)*180/Math.PI;if(rotation>90)rotation-=180;if(rotation< -90)rotation+=180;
   return <g stroke="#304b3d" strokeWidth="1.2" fill="none"><path d={`M${p.x} ${p.y}L${q.x} ${q.y}M${p.x-nx*5} ${p.y-ny*5}l${nx*10} ${ny*10}M${q.x-nx*5} ${q.y-ny*5}l${nx*10} ${ny*10}`}/><text transform={`translate(${(p.x+q.x)/2+nx*offset} ${(p.y+q.y)/2+ny*offset}) rotate(${rotation})`} textAnchor="middle" dy="-7" fill="#263b30" stroke="white" strokeWidth="4" paintOrder="stroke" fontFamily="sans-serif" fontSize="16">{label}</text></g>;
 };
 const cylinder=(tree:Point,r:number,z0:number,z1:number,fill:string,topFill:string)=>{
   const ring=(z:number)=>Array.from({length:64},(_,i)=>{const t=i*Math.PI/32;return point(tree.x+r*Math.cos(t),tree.y+r*Math.sin(t),z);});
   const bottom=ring(z0),top=ring(z1);
   const left=bottom.reduce((best,p,i)=>p.x<bottom[best].x?i:best,0),right=bottom.reduce((best,p,i)=>p.x>bottom[best].x?i:best,0);
   const forward=Array.from({length:(right-left+64)%64+1},(_,i)=>(left+i)%64),backward=Array.from({length:(left-right+64)%64+1},(_,i)=>(left-i+64)%64);
   const avg=(ids:number[])=>ids.reduce((sum,i)=>sum+bottom[i].y,0)/ids.length;
   const front=avg(forward)>avg(backward)?forward:backward;
   return <g stroke="#284d37" strokeWidth="1"><path d={path([...front.map(i=>bottom[i]),...front.slice().reverse().map(i=>top[i])])} fill={fill}/><path d={path(top)} fill={topFill}/></g>;
 };
 return <div className="section-result" style={{marginTop:24}}>
 <div className="canvas-meta"><div><span>基地軸測圖</span><b>圓柱體植栽・{trees.length} 棵</b></div><label>投影方向 <select value={view} onChange={e=>setView(e.target.value)}><option value="30">30°／60°</option><option value="60">60°／30°</option><option value="iso">對稱軸測 45°／45°</option></select></label><label><input type="checkbox" checked={dimensions} onChange={e=>setDimensions(e.target.checked)}/> 尺寸標註</label><button className="export" onClick={()=>download(ref.current,`STEP0${stage}_${view==="iso"?"45度對稱軸測":"軸測圖"}_${angle}-${otherAngle}.png`)}>匯出軸測 PNG</button></div>
 {viewport.controls}<svg ref={ref} viewBox={viewport.viewBox} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${viewLabel}基地軸測圖`} style={{width:'100%',background:'white'}}>
 <rect data-paper-bounds="true" x="0" y="0" width="1000" height="700" fill="white"/>
 <text x="40" y="32" fontFamily="sans-serif" fontSize="18" fill="#263b30">{viewLabel}｜基地 {width.toFixed(1)} × {height.toFixed(1)} m</text>
 <g transform={`matrix(${ca*scale} ${sa*scale} ${-cb*scale} ${sb*scale} ${ox} ${oy})`}>
 <g transform={`scale(${width/planBounds.width} ${height/planBounds.height}) translate(${-planBounds.x} ${-planBounds.y})`}>{faces.map((face,i)=><path key={i} d={face.d} fill={colors[face.color]} stroke={colors[face.color]} strokeWidth=".15" fillRule="evenodd"/>)}</g>
 </g>
 {[...trees.map((tree,i)=>({key:`t${i}`,depth:project(tree.x,tree.y).y,node:<g>{cylinder(tree,.125,0,trunkHeight,'#7c7155','#ac9c79')}{cylinder(tree,2,trunkHeight,totalHeight,'#618c68','#b5d4b1')}</g>})),...walls.flatMap(w=>wallSolids(w).map((solid,i)=>({key:`w${w.id}-${i}`,depth:solid.floor.reduce((sum,p)=>sum+project(p.x,p.y).y,0)/4,node:<AxonWall solid={solid} point={point}/>})))].sort((a,b)=>a.depth-b.depth).map(item=><g key={item.key}>{item.node}</g>)}
 {dimensions&&walls.map(w=>{const p=wallPoint(w,wallLength(w)/2),base=point(p.x,p.y),top=point(p.x,p.y,w.height);return <g key={w.id}>{dim(base,top,`W${w.id} 高 ${w.height.toFixed(1)} m`,-10)}</g>;})}
 {dimensions && <g>
 {dim(point(0,height+3),point(width,height+3),`基地寬 ${width.toFixed(1)} m`)}
 {dim(point(width+3,0),point(width+3,height),`基地深 ${height.toFixed(1)} m`)}
 <g stroke="#63796a" strokeWidth="1" strokeDasharray="4 4">{[[0,height,0,height+4],[width,height,width,height+4],[width,0,width+4,0],[width,height,width+4,height]].map(([x,y,x1,y1],i)=>{const p=point(x,y),q=point(x1,y1);return <path key={i} d={`M${p.x} ${p.y}L${q.x} ${q.y}`}/>;})}</g>
 {(()=>{if(!trees.length)return null;const target=[...trees].sort((a,b)=>point(b.x,b.y).x-point(a.x,a.y).x)[0];const base=point(target.x,target.y),top=point(target.x,target.y,totalHeight),branch=point(target.x,target.y,trunkHeight),x=base.x+2*scale+12;return <g fontFamily="sans-serif" fontSize="15" fill="#263b30" stroke="white" strokeWidth="3" paintOrder="stroke"><path d={`M${base.x} ${base.y}H${x}M${top.x} ${top.y}H${x}M${branch.x} ${branch.y}H${x}`} stroke="#304b3d" strokeWidth="1" strokeDasharray="3 3"/><path d={`M${x} ${base.y}V${top.y}M${x-5} ${base.y}h10M${x-5} ${branch.y}h10M${x-5} ${top.y}h10`} fill="none" stroke="#304b3d"/><text x={x+9} y={(base.y+branch.y)/2+5}>枝下高 {trunkHeight} m</text><text x={x+9} y={(branch.y+top.y)/2+5}>冠高 {crownHeight} m</text><text x={x} y={top.y-12} textAnchor="middle">總高 {totalHeight} m</text></g>;})()}
 </g>}

 <ViewportExportBounds bounds={viewport.bounds}/><DrawingScale bounds={viewport.bounds} unitsPerSvg={1/scale} label="軸向比例尺（X／Y／Z）"/>
 </svg><p style={{fontSize:14,padding:'12px 18px'}}>沿用基地色塊、弧線及實際植栽位置；X、Y 軸分別與水平呈 {angle}°、{otherAngle}°，Z 軸垂直。{view==="iso"?"三軸採相同繪圖尺度。":""}尺寸均以實際公尺標註，匯出 PNG 同步保留。</p></div>;
}
