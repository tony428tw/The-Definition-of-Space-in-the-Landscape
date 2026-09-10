"use client";
type Point = {x:number;y:number};
export type SectionLine = {id:number; label:string; points:Point[]};
export default function SectionLines({ lines, selected, draft, x, y, width, height, editable, select, drag }: {
  lines:SectionLine[]; selected:number|null; draft:Point[]; x:number;y:number;width:number;height:number;editable:boolean;
  select:(id:number)=>void; drag:(event:React.PointerEvent<SVGElement>,id:number,index:number)=>void;
}) {
  return <g>{[...lines, ...(draft.length ? [{id:-1,label:"＋",points:draft}] : [])].map(line => {
    const active=line.id===selected, color=active ? "#ac2839" : "#364f78";
    const points=line.points.map(p=>({x:x+p.x*width,y:y+p.y*height}));
    const a=points[0], b=points[1], length=b ? Math.hypot(b.x-a.x,b.y-a.y) : 0;
    const nx=b ? -(b.y-a.y)/length : 0, ny=b ? (b.x-a.x)/length : 0;
    return <g key={line.id} stroke={color} fill={color} strokeWidth={active?3:2}>
      {b && <><path pointerEvents="none" d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="white" strokeWidth="6"/><path pointerEvents="none" d={`M${a.x} ${a.y}L${b.x} ${b.y}`} strokeDasharray="16 5 3 5"/>
      {editable && <path data-editor-overlay="true" d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="transparent" strokeWidth="18" style={{cursor:"grab",touchAction:"none"}} onPointerDown={e=>drag(e,line.id,-1)} onClick={e=>{e.stopPropagation();select(line.id);}}/>}
      {points.map((p,i)=><path key={i} pointerEvents="none" d={`M${p.x} ${p.y}l${nx*28} ${ny*28}m${-nx*9+ny*5} ${-ny*9-nx*5}l${nx*9-ny*5} ${ny*9+nx*5}l${-nx*9-ny*5} ${-ny*9+nx*5}`} fill="none"/>)}</>}
      {points.map((p,i)=><g key={i}><circle pointerEvents="none" cx={p.x} cy={p.y} r="5"/>
        <text pointerEvents="none" x={Math.max(x+16,Math.min(x+width-35,p.x+12))} y={Math.max(y+22,p.y-12)} stroke="white" strokeWidth="4" paintOrder="stroke" fontSize="20">{line.label}{i ? "′" : ""}</text>
        {editable && line.id>=0 && <circle data-editor-overlay="true" cx={p.x} cy={p.y} r="14" fill={active?"#fff":"transparent"} fillOpacity=".7" stroke={active?color:"transparent"} strokeWidth="2" style={{cursor:"grab",touchAction:"none"}} onClick={e=>e.stopPropagation()} onPointerDown={e=>drag(e,line.id,i)}/>}
      </g>)}
    </g>;
  })}</g>;
}
