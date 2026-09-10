"use client";
import {useState} from 'react';
export type Bounds={x:number;y:number;width:number;height:number};
export function zoomBounds(base:Bounds,zoom:number,pan:{x:number;y:number}):Bounds{return{x:base.x+base.width*(.5+pan.x)-base.width/zoom/2,y:base.y+base.height*(.5+pan.y)-base.height/zoom/2,width:base.width/zoom,height:base.height/zoom};}
export function useDrawingViewport(base:Bounds){
 const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});const bounds=zoomBounds(base,zoom,pan);
 const reset=()=>{setZoom(1);setPan({x:0,y:0});};
 return {zoom,bounds,viewBox:`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,reset,
 controls:<div className="drawing-zoom" aria-label="圖面縮放與移動"><button disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,z/1.25))} aria-label="縮小圖面">−</button><span>{Math.round(zoom*100)}%</span><button disabled={zoom>=4} onClick={()=>setZoom(z=>Math.min(4,z*1.25))} aria-label="放大圖面">＋</button><button onClick={reset}>全圖</button>{[{t:'←',x:-1,y:0},{t:'→',x:1,y:0},{t:'↑',x:0,y:-1},{t:'↓',x:0,y:1}].map(p=><button key={p.t} aria-label={`移動視窗 ${p.t}`} onClick={()=>setPan(v=>({x:v.x+p.x*.15/zoom,y:v.y+p.y*.15/zoom}))}>{p.t}</button>)}<small>縮放不改變實際尺寸；PNG 匯出目前視窗。</small></div>};
}
export function scaleLength(target:number){const magnitude=10**Math.floor(Math.log10(target));return [5,2,1].map(n=>n*magnitude).find(n=>n<=target)??magnitude/2;}
export function DrawingScale({bounds,unitsPerSvg,unit='m',label='圖示比例尺'}:{bounds:Bounds;unitsPerSvg:number;unit?:string;label?:string}){
 const length=scaleLength(bounds.width*.18*unitsPerSvg),size=length/unitsPerSvg,k=bounds.width/1000,x=bounds.x+bounds.width*.035,y=bounds.y+bounds.height*.92;
 const format=(n:number)=>Number(n.toPrecision(4)).toString();
 return <g pointerEvents="none" fontFamily="sans-serif" fontSize={13*k} fill="#233d30"><text x={x} y={y-12*k}>{label}</text>{[0,1,2,3].map(i=><rect key={i} x={x+size*i/4} y={y} width={size/4} height={6*k} fill={i%2?'white':'#233d30'} stroke="#233d30" strokeWidth={k}/>)}<text x={x} y={y+23*k}>0</text><text x={x+size/2} y={y+23*k} textAnchor="middle">{format(length/2)}</text><text x={x+size} y={y+23*k} textAnchor="middle">{format(length)} {unit}</text></g>;
}
export function ViewportExportBounds({bounds}:{bounds:Bounds}){return <rect data-export-viewport="true" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="none" pointerEvents="none"/>;}
