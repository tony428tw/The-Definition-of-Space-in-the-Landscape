"use client";
import {useDrawingViewport,DrawingScale,ViewportExportBounds} from "./DrawingViewport";
import {sectionWalls} from "./WallViews";
import {type Wall} from "./walls";
import { useRef } from "react";
import { projectSection, type SectionPoint } from "./section-geometry";
export default function SectionView({ walls=[], stage=3, label, a, b, trees, direction, depth, crownHeight, trunkHeight, dimensions, download }: {
  walls?:Wall[];stage?:number;label: string; a: SectionPoint; b: SectionPoint; trees: SectionPoint[]; direction: number; depth: number; crownHeight: number; trunkHeight: number; dimensions: boolean;
  download: (svg: SVGSVGElement | null, filename: string) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const viewport=useDrawingViewport({x:0,y:0,width:1000,height:570});
  const model = projectSection(a, b, trees, direction, depth);
  const scale = Math.min(660 / model.length, 300 / (crownHeight + trunkHeight));
  const width = model.length * scale, left = (1000 - width) / 2, ground = 380;
  const projectedWalls=sectionWalls(walls,a,b,direction,depth);
  const wallDrawing=(cut:boolean)=><g>{projectedWalls.filter(w=>w.cut===cut).map((w,i)=><rect key={i} x={left+w.x0*scale} y={ground-w.z1*scale} width={Math.max(.6,(w.x1-w.x0)*scale)} height={(w.z1-w.z0)*scale} fill={cut?"#665e51":"#c7c0b4"} stroke={cut?"#39352f":"#9a9183"} strokeWidth={cut?1.4:.5}/> )}</g>;
  const cutCount = model.trees.filter(t => t.cut).length;
  return <div className="section-result">
    <div className="canvas-meta"><div><span>即時剖立面圖</span><b>{label}–{label}′・剖切樹冠 {cutCount} 棵・背景 {model.trees.length - cutCount} 棵</b></div><button className="export" onClick={() => download(ref.current, `STEP0${stage}_${label}-${label}剖立面.png`)}>匯出剖立面 PNG</button></div>
    {viewport.controls}<svg ref={ref} viewBox={viewport.viewBox} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${label}–${label}′ 基地剖立面圖`} style={{width:"100%",background:"white"}}>
      <defs><clipPath id="section-extent"><rect x={left} y="50" width={width} height="330"/></clipPath><pattern id="section-hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#9ca3af" strokeWidth="1"/></pattern></defs>
      <rect data-paper-bounds="true" x="0" y="0" width="1000" height="570" fill="white"/>
      <g fontFamily="sans-serif" fill="#263b30" fontSize="16">
        <text x="40" y="32">{label}–{label}′ 剖立面｜水平、垂直同尺度｜單位 m</text>
        <g clipPath="url(#section-extent)">{wallDrawing(false)}{model.trees.map(t => {
          const x = left + t.along * scale;
          const top=ground-(trunkHeight+crownHeight)*scale, bottom=ground-trunkHeight*scale;
          const rx=t.radius*scale, cap=Math.min(rx*.22,crownHeight*scale*.1);
          return <g key={t.id} fill={t.cut ? "#dae6dc" : "#f0f4f0"} stroke={t.cut ? "#264c34" : "#94a79a"} strokeWidth={t.cut ? 2.5 : 1}>
            {(Math.abs(t.distance) < .125 || !t.cut) && <rect x={x-.125*scale} y={ground-trunkHeight*scale-crownHeight*scale/2} width={.25*scale} height={(trunkHeight+crownHeight/2)*scale} fill={t.cut ? "#52644e" : "#d5ddd5"}/>}
            {t.cut ? <rect x={x-rx} y={top} width={rx*2} height={crownHeight*scale}/> : <>
              <path d={`M${x-rx} ${top+cap} H${x+rx} V${bottom-cap} A${rx} ${cap} 0 0 1 ${x-rx} ${bottom-cap} Z`}/>
              <ellipse cx={x} cy={top+cap} rx={rx} ry={cap} fill="#e2ebe2"/>
            </>}
          </g>;
        })}{wallDrawing(true)}</g>
        {dimensions&&Array.from(new Set(projectedWalls.map(w=>w.id))).map(id=>{const w=projectedWalls.find(w=>w.id===id)!;const x=left+(w.x0+w.x1)/2*scale,y=ground-w.height*scale;return <g key={id} stroke="#514a40" strokeWidth="1"><path d={`M${x} ${ground}V${y}M${x-4} ${ground}h8M${x-4} ${y}h8`}/><text x={x+5} y={y-6} fontSize="12" stroke="white" strokeWidth="3" paintOrder="stroke">W{id} 高 {w.height.toFixed(1)} m</text></g>;})}
        <rect x={left} y={ground} width={width} height="18" fill="url(#section-hatch)"/>
        <path d={`M${left} ${ground}h${width}`} stroke="#263b30" strokeWidth="3"/>
        <text x={left} y="420">{label}</text><text x={left+width} y="420" textAnchor="end">{label}′</text>
        {dimensions && <g stroke="#435b4b" strokeWidth="1" fill="#263b30">
          {[{x:left+width+32,z0:0,z1:trunkHeight,label:`枝下高 ${trunkHeight.toFixed(1)} m`},{x:left+width+32,z0:trunkHeight,z1:trunkHeight+crownHeight,label:`冠高 ${crownHeight.toFixed(1)} m`},{x:left-48,z0:0,z1:trunkHeight+crownHeight,label:`總高 ${(trunkHeight+crownHeight).toFixed(1)} m`}].map((d,i)=>{
            const y0=ground-d.z0*scale,y1=ground-d.z1*scale;
            return <g key={i}><path d={`M${d.x} ${y0}V${y1}M${d.x-6} ${y0}h12M${d.x-6} ${y1}h12`} fill="none"/><text stroke="none" fontSize="15" textAnchor={i===2?"middle":"start"} transform={i===2?`translate(${d.x-10} ${(y0+y1)/2}) rotate(-90)`:`translate(${d.x+10} ${(y0+y1)/2+5})`}>{d.label}</text></g>;
          })}
          {[0,trunkHeight,trunkHeight+crownHeight].map(z=><path key={z} d={`M${left} ${ground-z*scale}H${left+width+40}`} strokeDasharray="4 5" strokeOpacity=".3"/>)}
        </g>}
        {dimensions && <><path d={`M${left} 432v12m0 -6h${width}m0 -6v12`} fill="none" stroke="#263b30"/><text x="500" y="460" textAnchor="middle">剖面長度 {model.length.toFixed(2)} m</text><text x="960" y="55" textAnchor="end">冠高 {crownHeight} m＋枝下高 {trunkHeight} m</text></>}
      </g>
      <ViewportExportBounds bounds={viewport.bounds}/><DrawingScale bounds={viewport.bounds} unitsPerSvg={1/scale}/>
    </svg>
    <p style={{padding:"12px 18px",fontSize:14}}>牆體開口依實際高度與位置呈現；深色牆為剖切、淡色牆為背景。深色為剖切樹冠，淡色為箭頭方向 {depth} m 內的背景樹木；地面以 ±0.00 水平面示意。樹冠採直徑 4 m 的圓柱體，剖切面為等高矩形，寬度依剖切位置計算；背景樹冠以橢圓頂面提示圓柱量體。幹徑 0.25 m，圖面隨植栽與尺寸設定同步更新。</p>
  </div>;
}
