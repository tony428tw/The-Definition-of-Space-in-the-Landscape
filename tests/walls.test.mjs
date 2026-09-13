import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(source,{exports,require:(name)=>name.startsWith('.')?load(path.resolve(path.dirname(file),name)+(fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?'.ts':'.tsx')):require(name)});return exports;}
const {wallStats,validateWalls,wallPanels,suggestWalls}=load('app/walls.ts');
const {sectionWalls}=load('app/WallViews.tsx');
const wall=(id=1,y=5)=>({id,a:{x:0,y},b:{x:10,y},height:2.4,offset:{x:0,y:0},openings:[]});
test('movement quota measures moved segment length and includes exact 25%',()=>{const walls=[wall(1),wall(2,10),wall(3,15),wall(4,20)];walls[0].offset.x=1;assert.equal(wallStats(walls).moved,10);assert.equal(validateWalls(walls,40,40),'');walls[1].offset.x=.1;assert.match(validateWalls(walls,40,40),/1\/4/);walls[0].offset.x=0;assert.equal(validateWalls(walls,40,40),'');});
test('splitting preserves denominator and returning to origin frees quota',()=>{const w=wall();const split=[{...w,b:{x:2.5,y:5}},{...w,id:2,a:{x:2.5,y:5}}];assert.equal(wallStats(split).total,10);split[0].offset={x:0,y:1};assert.equal(validateWalls(split,20,20),'');split[0].offset={x:0,y:0};assert.equal(wallStats(split).moved,0);});
test('height, opening area, overlap and face boundaries are enforced',()=>{const w=wall();w.height=2.5;assert.notEqual(validateWalls([w],20,20),'');w.height=2.4;w.openings=[{id:1,start:0,width:5,sill:0,height:2.4}];assert.equal(validateWalls([w],20,20),'');w.openings[0].width=5.1;assert.match(validateWalls([w],20,20),/12/);w.openings=[{id:1,start:0,width:2,sill:0,height:2},{id:2,start:1,width:2,sill:0,height:2}];assert.match(validateWalls([w],20,20),/重疊/);w.openings=[{id:1,start:9,width:2,sill:0,height:1}];assert.match(validateWalls([w],20,20),/牆面/);});
test('wall panels subtract doors/windows as real empty area',()=>{const w=wall();w.openings=[{id:1,start:2,width:2,sill:0,height:2.1},{id:2,start:6,width:2,sill:1,height:1}];const area=wallPanels(w).reduce((s,p)=>s+(p.s1-p.s0)*(p.z1-p.z0),0);assert.ok(Math.abs(area-(24-6.2))<1e-8);});
test('a section through a door cuts its lintel but leaves passage empty',()=>{const w=wall();w.openings=[{id:1,start:4,width:2,sill:0,height:2.1}];const cut=sectionWalls([w],{x:5,y:0},{x:5,y:10},1,10).filter(w=>w.cut);assert.ok(cut.length>0);assert.ok(cut.every(w=>w.z0>=2.1));assert.equal(sectionWalls([w],{x:5,y:0},{x:5,y:0},1,10).length,0);});
test('suggested walls preserve clearance around existing trees',()=>{const trees=[{x:10,y:5}],walls=suggestWalls([{a:{x:0,y:5},b:{x:20,y:5}}],trees);assert.ok(walls.length);for(const w of walls)assert.ok(w.b.x<=7.5||w.a.x>=12.5);assert.equal(validateWalls(walls,20,20),'');});
test('external arc centres stay beyond every paper edge even below the old viewport',()=>{const source=fs.readFileSync('app/page.tsx','utf8');const fn=source.slice(source.indexOf('function makeArcCenterChoices'),source.indexOf('function makeDivisionLines'));const js=ts.transpileModule(fn+'\nexports.choices=makeArcCenterChoices;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const exports={};vm.runInNewContext(js,{exports});const regions=[{x:0,y:0,w:500,h:350},{x:500,y:0,w:500,h:350},{x:0,y:350,w:500,h:350},{x:500,y:350,w:500,h:350}];const result=exports.choices(regions,180,58,640,640);assert.ok(result.extension.some(c=>c.point.y>698));assert.ok(result.extension.every(c=>c.point.x<180||c.point.x>820||c.point.y<58||c.point.y>698));});
test('zoom changes viewport and graphic scale without altering model dimensions',()=>{const {zoomBounds,scaleLength}=load('app/DrawingViewport.tsx');const base={x:0,y:0,width:1000,height:700},view=zoomBounds(base,2,{x:0,y:0});assert.equal(view.width,500);assert.equal(view.x,250);assert.equal(view.height,350);assert.equal(scaleLength(base.width*.18*.05),5);assert.equal(scaleLength(view.width*.18*.05),2);const pan=zoomBounds(base,2,{x:.1,y:0});assert.equal(pan.x,350);assert.equal(pan.width,500);});
test('section and axon exports include walls and true tree dimensions',()=>{const {renderToStaticMarkup}=require('react-dom/server'),React=require('react'),Section=load('app/SectionView.tsx').default,Axon=load('app/AxonView.tsx').default;const common={walls:[wall()],stage:4,trees:[{x:5,y:5}],treeHeight:8,trunkHeight:3,dbhCm:25,download:()=>{}};const section=renderToStaticMarkup(React.createElement(Section,{...common,label:'A',a:{x:5,y:0},b:{x:5,y:10},direction:1,depth:15,dimensions:true}));assert.match(section,/W1 高 2.4 m/);assert.match(section,/樹高 8(?:\.0)? m/);assert.match(section,/DBH 25 cm/);const axon=renderToStaticMarkup(React.createElement(Axon,{...common,width:20,height:20,faces:[],colors:[],planBounds:{x:0,y:0,width:1000,height:700}}));assert.match(axon,/W1 高 2.4 m/);assert.match(axon,/冠高 5\.0 m/);assert.match(axon,/樹高 8 m/);assert.ok(axon.indexOf('data-wall-solid="closed"')<axon.indexOf('#7c7155'),'walls must render behind planting');assert.ok(!section.includes('NaN')&&!axon.includes('NaN'));});

test('axon wall solid includes top, bottom, side and end faces',()=>{const {renderToStaticMarkup}=require('react-dom/server'),React=require('react'),AxonWall=load('app/WallViews.tsx').AxonWall;const solid={wall:wall(),s0:0,s1:10,z0:0,z1:2.4,floor:[{x:0,y:-.1},{x:10,y:-.1},{x:10,y:.1},{x:0,y:.1}]};const html=renderToStaticMarkup(React.createElement(AxonWall,{solid,point:(x,y,z)=>({x:x+z*.2,y:y-z})}));assert.equal((html.match(/<path/g)||[]).length,6);assert.match(html,/data-wall-solid="closed"/);});

test('wall experience classifies complete and incomplete boundaries',()=>{const {wallExperience}=load('app/walls.ts');assert.equal(wallExperience({...wall(),boundary:'上邊界'}).kind,'封閉／實體邊界');assert.equal(wallExperience({...wall(),openings:[{id:2,start:2,width:1,sill:0,height:2.4}]}).kind,'邊界開口');assert.equal(wallExperience({...wall(),openings:[{id:2,start:2,width:1,sill:1,height:1}]}).kind,'穿鑿牆面');assert.equal(wallExperience({...wall(),openings:[{id:2,start:2,width:.2,sill:0,height:2.4},{id:3,start:4,width:.2,sill:0,height:2.4}]}).kind,'透空邊界');});
test('curved walls retain arc length when split and trim along the curve',()=>{const {wallLength,wallPart,wallPoint,nearestPathRatio}=load('app/walls.ts');const path=Array.from({length:181},(_,i)=>({x:10+5*Math.cos(i*Math.PI/180),y:10+5*Math.sin(i*Math.PI/180)}));const w={...wall(),a:path[0],b:path.at(-1),path};const length=wallLength(w);assert.ok(Math.abs(length-5*Math.PI)<.001);assert.ok(Math.abs(wallLength(wallPart(w,0,length/2))+wallLength(wallPart(w,length/2,length))-length)<1e-8);const trim={...w,range:[.25,.75]};assert.ok(Math.abs(wallLength(trim)-length/2)<1e-8);assert.ok(Math.abs(nearestPathRatio(path,wallPoint(w,length/2))-.5)<1e-8);w.openings=[{id:1,start:2,width:2,sill:0,height:2}];assert.ok(Math.abs(wallPanels(w).reduce((a,p)=>a+(p.s1-p.s0)*(p.z1-p.z0),0)-(length*2.4-4))<1e-6);});
test('curve clipping keeps only in-field connected pieces and checks the entire curve',()=>{const {clipGuide}=load('app/walls.ts');const pieces=clipGuide([{x:-2,y:5},{x:5,y:5},{x:12,y:5},{x:5,y:7}],10,10);assert.equal(pieces.length,2);assert.ok(pieces.flat().every(p=>p.x>=0&&p.x<=10&&p.y>=0&&p.y<=10));const w={...wall(),a:{x:1,y:1},b:{x:9,y:1},path:[{x:1,y:1},{x:5,y:12},{x:9,y:1}]};assert.match(validateWalls([w],10,10),/基地內/);});
test('graphic scale has no background panel',()=>{const {renderToStaticMarkup}=require('react-dom/server'),React=require('react'),{DrawingScale}=load('app/DrawingViewport.tsx');const html=renderToStaticMarkup(React.createElement(DrawingScale,{bounds:{x:0,y:0,width:1000,height:700},unitsPerSvg:.05}));assert.equal((html.match(/<rect /g)||[]).length,4);assert.ok(!html.includes('fill-opacity'));});

test('frozen baseline cannot grow or shrink to change the movement allowance',()=>{
 const original=[wall()], changed=[wall(),wall(2,10)];
 assert.match(validateWalls(changed,40,40,10),/總長必須保持不變/);
 assert.match(validateWalls([],40,40,10),/總長必須保持不變/);
 assert.equal(validateWalls(original,40,40,10),'');
 const low={...wall(),height:.05};assert.notEqual(validateWalls([low],40,40),'');
});
test('opening allowance sums all walls and accepts exactly 12 square metres',()=>{
 const walls=[wall(),wall(2,10)];walls.forEach(w=>w.openings=[{id:w.id,start:1,width:3,height:2,sill:0}]);
 assert.equal(validateWalls(walls,40,40,20),'');walls[1].openings[0].width=3.01;
 assert.match(validateWalls(walls,40,40,20),/超過 12/);
});

// Exercise the same hook mutations used by pointer dragging and numeric controls.
function wallEditorHarness(){
 const React=require('react'),slots=[];let cursor=0;
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
 const exports={};const source=ts.transpileModule(fs.readFileSync('app/WallEditor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>name==='react'?hooks:name==='./walls'?load('app/walls.ts'):require(name)});
 const render=()=>{cursor=0;return exports.useWallEditor(40,40);};
 const button=(node,label)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const item of node){const result=button(item,label);if(result)return result;}return null;}if(node.type==='button'&&node.props.children===label)return node;return button(node.props?.children,label);};
 const click=(editor,label)=>{const match=button(editor.controls([],[]),label);assert.ok(match,label);match.props.onClick();};
 const html=editor=>require('react-dom/server').renderToStaticMarkup(editor.controls([],[]));
 return {render,click,html};
}
test('editor rejects quota violations, retains valid state and releases quota on restore',()=>{
 const h=wallEditorHarness();let e=h.render();
 for(let i=0;i<4;i++){e.add({a:{x:0,y:5+i*5},b:{x:10,y:5+i*5},label:'test'});e=h.render();}
 assert.match(h.html(e),/尚未固定基準/);h.click(e,'固定原始配置，開始空間調整');e=h.render();
 assert.match(h.html(e),/限制已啟用/);e.move(1,{x:1,y:0});e=h.render();assert.equal(wallStats(e.walls).moved,10);
 e.move(2,{x:1,y:0});e=h.render();assert.equal(wallStats(e.walls).moved,10);assert.equal(e.walls[1].offset.x,0);assert.match(h.html(e),/本次修改未套用/);
 e.move(1,{x:2,y:0});e=h.render();assert.equal(wallStats(e.walls).moved,10);
 e.move(1,{x:0,y:0});e=h.render();assert.equal(wallStats(e.walls).moved,0);
 e.patch({...e.walls[0],openings:[{id:50,start:0,width:5,height:2.4,sill:0}]});e=h.render();assert.equal(wallStats(e.walls).area,12);
 e.patch({...e.walls[1],openings:[{id:51,start:0,width:1,height:1,sill:0}]});e=h.render();assert.equal(wallStats(e.walls).area,12);assert.match(h.html(e),/超過 12/);
 h.click(e,'清除牆體，重新配置');e=h.render();assert.equal(e.walls.length,0);assert.equal(e.frozen,false);assert.match(h.html(e),/尚未固定基準/);
});

test('active limits explain and recover an initially unmovable long wall',()=>{
 const h=wallEditorHarness();let e=h.render();e.add({a:{x:1,y:5},b:{x:31,y:5},label:'long'});e=h.render();for(const y of [10,15,20]){e.add({a:{x:1,y},b:{x:11,y},label:'short'});e=h.render();}
 h.click(e,'固定原始配置，開始空間調整');e=h.render();assert.match(h.html(e),/限制已啟用（執行中）/);e.setSelected(1);e=h.render();assert.match(h.html(e),/暫不可移動/);e.move(1,{x:0,y:1});e=h.render();assert.equal(wallStats(e.walls).moved,0);assert.match(h.html(e),/超過剩餘可移動牆長/);
 h.click(e,'等分此牆段');e=h.render();assert.equal(wallStats(e.walls).total,60);assert.equal(wallStats(e.walls).moved,0);e.move(1,{x:0,y:1});e=h.render();assert.equal(wallStats(e.walls).moved,15);assert.match(h.html(e),/15\.00 \/ 15\.00 m/);
});

test('all paper formats map directly to site metres and only enlarge explicitly',()=>{
 const {siteDimensions,scaleFromSide}=load('app/site-dimensions.ts');
 for(let n=1;n<=6;n++){
  const width=Math.min(21,29.7/Math.sqrt(n)),paper={width,height:width*Math.sqrt(n)};
  const site=siteDimensions(paper);assert.equal(site.width,paper.width);assert.equal(site.height,paper.height);
  for(const scale of [1,Math.sqrt(2),scaleFromSide(paper,'width',32),scaleFromSide(paper,'height',50)]){
   const dims=siteDimensions(paper,scale);assert.ok(Math.abs(dims.height/dims.width-Math.sqrt(n))<1e-12);
   // The same scale in both axes keeps circular arcs aligned with filled faces.
   assert.ok(Math.abs(dims.width/paper.width-dims.height/paper.height)<1e-12);
  }
 }
 assert.equal(siteDimensions({width:21,height:21}).width,21);
 assert.equal(siteDimensions({width:21,height:21},NaN).width,21);
});

test('first entry creates dimension-matched perimeter only once and preserves later work',()=>{
 const h=wallEditorHarness();let e=h.render();e.begin();e=h.render();assert.equal(e.walls.length,4);assert.equal(wallStats(e.walls).total,160);assert.ok(e.walls.every(w=>w.height===2.4));
 e.begin();e=h.render();assert.equal(e.walls.length,4);
 e.boundary(1,false);e=h.render();assert.equal(e.walls.length,3);assert.equal(wallStats(e.walls).total,120);
 h.click(e,'固定原始配置，開始空間調整');e=h.render();e.boundary(0,false);e=h.render();assert.equal(e.walls.length,3);
 h.click(e,'清除牆體，重新配置');e=h.render();e.begin();e=h.render();assert.equal(e.walls.length,0);
});
test('perforated boundaries use real full-height voids and accumulate with other openings',()=>{
 const {boundaryWalls,perforatedOpenings}=load('app/walls.ts');const walls=boundaryWalls(21,29.7);walls[0].openings=perforatedOpenings(walls[0],4,.2,10);
 assert.ok(Math.abs(wallStats(walls).area-1.92)<1e-8);assert.equal(validateWalls(walls,21,29.7),'');
 const solidArea=wallPanels(walls[0]).reduce((s,p)=>s+(p.s1-p.s0)*(p.z1-p.z0),0);assert.ok(Math.abs(solidArea-(21*2.4-1.92))<1e-7);
 walls[1].openings=perforatedOpenings(walls[1],10,.5,20);assert.match(validateWalls(walls,21,29.7),/12/);
 const h=wallEditorHarness();let e=h.render();e.begin();e=h.render();h.click(e,'套用等距透空間隙');e=h.render();assert.equal(e.walls[0].openings.length,4);h.click(e,'＋ 全高缺口');e=h.render();assert.equal(e.walls[0].openings.length,5);assert.equal(validateWalls(e.walls,40,40),'');
});
test('two-point relocation preserves length, includes rotation in movement, and splits rigidly',()=>{
 const {relocateWall,wallMoved,wallLength,wallPoint,wallPart}=load('app/walls.ts');const w=wall();const placed=relocateWall(w,{x:5,y:5},{x:5,y:8});assert.equal(wallLength(placed),10);assert.equal(wallMoved(placed),true);assert.ok(Math.abs(wallPoint(placed,10).y-15)<1e-8);
 const first=wallPart(placed,0,5),second=wallPart(placed,5,10);assert.ok(Math.abs(wallPoint(first,5).y-wallPoint(second,0).y)<1e-8);assert.equal(wallLength(first)+wallLength(second),10);
 const others=[wall(2,10),wall(3,15),wall(4,20)];assert.equal(validateWalls([placed,...others],40,40,40),'');assert.match(validateWalls([placed,relocateWall(others[0],{x:1,y:10},{x:2,y:10}),...others.slice(1)],40,40,40),/25%/);
 const h=wallEditorHarness();let e=h.render();e.begin();e=h.render();h.click(e,'固定原始配置，開始空間調整');e=h.render();e.place({x:0,y:0},{x:0,y:10});e=h.render();assert.equal(wallStats(e.walls).moved,40);assert.equal(wallStats(e.walls).total,160);h.click(e,'還原此段位置');e=h.render();assert.equal(wallStats(e.walls).moved,0);
});
test('locked walls reject edits and hidden walls still consume allowances',()=>{
 const h=wallEditorHarness();let e=h.render();e.add({a:{x:1,y:1},b:{x:11,y:1},label:'wall'});e=h.render();e.patch({...e.walls[0],locked:true,openings:[{id:100,start:2,width:1,height:2,sill:0}]});e=h.render();
 e.move(e.walls[0].id,{x:1,y:1});e=h.render();assert.equal(e.walls[0].a.x,1);
 e.patch({...e.walls[0],height:1});e=h.render();assert.equal(e.walls[0].height,2.4);assert.match(h.html(e),/先解鎖/);
 const walls=[{...wall(),hidden:true,offset:{x:1,y:0}},wall(2,10),wall(3,15),wall(4,20)];assert.equal(wallStats(walls).moved,10);
});
