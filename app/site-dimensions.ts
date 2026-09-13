// One shared scale preserves paper proportions in every site view.
export function siteDimensions(paper: {width:number;height:number}, enlargement=1) {
  const scale=Number.isFinite(enlargement)?Math.max(1,enlargement):1;
  return {width:paper.width*scale,height:paper.height*scale,scale};
}
export function scaleFromSide(paper: {width:number;height:number},axis:'width'|'height',value:number) {
  return Number.isFinite(value)?Math.max(1,value/paper[axis]):1;
}
