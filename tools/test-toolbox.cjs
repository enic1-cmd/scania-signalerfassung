/* Toolbox: capture markers vs. own markers, colours and widths, undo/redo, wheel navigation, overlay and project round trip. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

/* Synthetic SDP3 capture with a cumulative marker counter (0, then 1, 2, 3 and it keeps the last value). */
function captureFile(){
  const lines=['TimeStamp\tTimeOffset\tMarker\tEMS-EngineSpeed\tEMS-AccPedal\tTMS-OutputShaftSpeed','Time\tTime\tCount\trpm\t%\trpm','TimeStamp\tTimeOffset\tMarker\tMotordrehzahl\tFahrpedal\tAbtriebswelle','Time\tTime\tCount\trpm\t%\trpm'];
  let marker=0;
  for(let i=0;i<1200;i++){
    if(i===200||i===520||i===900)marker++;
    const s=10*3600+i*.5,h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=Math.floor(s%60),ms=Math.round((s%1)*1000);
    const ts=[h,m,sec].map(v=>String(v).padStart(2,'0')).join(':')+':'+String(ms).padStart(3,'0');
    const offset=String(Math.floor(i*.5/60)).padStart(2,'0')+':'+String((i*.5%60).toFixed(3)).padStart(6,'0');
    lines.push([ts,offset,marker,800+Math.round(400*Math.sin(i/40)),i%60,Math.round(300+200*Math.cos(i/55))].join('\t'));
  }
  return Buffer.from(lines.join('\r\n'));
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);
    await page.locator('#file-input').setInputFiles({name:'2026-09-21 101010.txt',mimeType:'text/plain',buffer:captureFile()});
    await page.waitForFunction(()=>S.files.length===1);
    await page.locator('#view-chart-btn').click();await page.waitForTimeout(150);
    const result={};

    /* Capture markers are their own layer and never mark rows */
    const capture=await page.evaluate(()=>({events:markerEvents(active()).map(e=>e.value),marked:active().rawRows.filter(r=>r.marked).length,count:document.querySelector('.tool-txt .tool-count').textContent,pressed:document.querySelector('.tool-txt').getAttribute('aria-pressed')}));
    assert.deepEqual(capture.events,[1,2,3]);assert.equal(capture.marked,0);assert.equal(capture.count,'3');assert.equal(capture.pressed,'true');
    await page.locator('.tool-txt').click();
    assert.equal(await page.evaluate(()=>captureMarkersShown(active())),false,'Capture markers can be hidden');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>captureMarkersShown(active())),true,'Hiding capture markers is undoable');
    result.captureLayer='PASS';

    /* Own marker: visible immediately in colour and width, click on it removes it */
    const box=await page.locator('#signal-chart').boundingBox();
    const at=f=>({x:box.x+245+(box.width-271)*f,y:box.y+150});
    await page.locator('[data-mode="marker"]').click();
    await page.locator('.tool-swatch[data-color="#16a34a"]').click();
    await page.locator('.tool-width[data-width="5"]').click();
    let p=at(.3);await page.mouse.click(p.x,p.y);
    let marker=await page.evaluate(()=>active().rawRows.filter(r=>r.marked).map(r=>({id:r.rowId,color:r.markerColor,width:r.markerWidth})));
    assert.equal(marker.length,1);assert.equal(marker[0].color,'#16a34a');assert.equal(marker[0].width,5);
    const pixel=await page.locator('#signal-chart').evaluate((canvas,x)=>{const r=canvas.getBoundingClientRect(),s=canvas.width/r.width,c=canvas.getContext('2d');return Array.from(c.getImageData(Math.round(x*s),Math.round(120*s),1,1).data);},p.x-box.x);
    assert(pixel[1]>130&&pixel[0]<90&&pixel[2]<120,'Own marker is drawn in its colour on top: '+pixel);
    await page.mouse.click(p.x+4,p.y+40);
    assert.equal(await page.evaluate(()=>active().rawRows.filter(r=>r.marked).length),0,'Clicking near a marker removes it');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>active().rawRows.filter(r=>r.marked).length),1,'Undo restores the removed marker');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>active().rawRows.filter(r=>r.marked).length),0,'Undo removes the added marker');
    await page.keyboard.press('Control+y');
    assert.equal(await page.evaluate(()=>active().rawRows.filter(r=>r.marked).length),1,'Redo adds it again');
    result.ownMarkers='PASS';

    /* Capture toggle never touches own markers (the original bug) */
    await page.locator('.tool-txt').click();await page.locator('.tool-txt').click();
    assert.equal(await page.evaluate(()=>active().rawRows.filter(r=>r.marked).length),1,'Own marker survives capture toggles');

    /* Restyle selected marker in navigate mode, undoable */
    await page.locator('[data-mode="inspect"]').click();
    await page.evaluate(id=>{Annotations.setMode('inspect');},marker[0].id);
    await page.mouse.click(p.x,p.y);
    await page.locator('.tool-swatch[data-color="#7c3aed"]').click();
    assert.equal(await page.evaluate(id=>active().rawRows[id].markerColor,marker[0].id),'#7c3aed','Selected marker takes the new colour');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(id=>active().rawRows[id].markerColor,marker[0].id),'#16a34a','Colour change is undoable');
    result.restyle='PASS';

    /* Range and note are undoable; typing in inputs keeps native undo */
    await page.locator('[data-mode="range"]').click();
    let a=at(.55),b=at(.7);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
    assert.equal(await page.evaluate(()=>active().ranges.length),1);
    await page.locator('.annotation-note').click();
    await page.locator('.annotation-dialog textarea').fill('Lastwechsel');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>active().ranges.length),1,'Ctrl+Z inside the note field does not undo annotations');
    await page.locator('.annotation-dialog textarea').fill('Lastwechsel');
    await page.locator('.annotation-dialog button[type="submit"]').click();
    assert.equal(await page.evaluate(()=>active().ranges[0].note),'Lastwechsel');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>active().ranges[0].note),'','Undo removes the note');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>active().ranges.length),0,'Undo removes the range');
    assert.equal(await page.locator('[data-history="redo"]').isDisabled(),false,'Redo button enabled');
    await page.locator('[data-history="redo"]').click();await page.locator('[data-history="redo"]').click();
    assert.equal(await page.evaluate(()=>active().ranges[0].note),'Lastwechsel','Toolbar redo restores range and note');
    await page.locator('[data-mode="range"]').click();
    result.undoRedo='PASS';

    /* Capture marker navigation keeps the zoom and centres the marker */
    await page.evaluate(()=>{chartState.start=0;chartState.end=1;renderChart();});
    await page.locator('[data-nav="next"]').click();await page.locator('[data-nav="next"]').click();
    const nav=await page.evaluate(()=>{const A=active(),rows=A.filtered,first=rows[0].elapsedSec,total=rows[rows.length-1].elapsedSec-first,e=markerEvents(A)[1],pos=(e.row.elapsedSec-first)/total;return {start:chartState.start,end:chartState.end,pos,focus:A.chartFocusRowId===e.row.rowId};});
    assert(nav.end-nav.start<1&&nav.pos>nav.start&&nav.pos<nav.end&&nav.focus,'Next capture marker is shown: '+JSON.stringify(nav));
    result.captureNavigation='PASS';

    /* Wheel: height control (Y), Ctrl+wheel (Y), Shift+wheel pans (X), names area scrolls natively */
    const control=await page.locator('.chart-height-control').boundingBox();
    await page.mouse.move(control.x+control.width/2,control.y+control.height/2);
    await page.mouse.wheel(0,-100);await page.mouse.wheel(0,-100);await page.waitForTimeout(80);
    assert.equal(await page.locator('#chart-height-slider').inputValue(),'1.2','Wheel over height control raises lanes');
    await page.mouse.move(at(.5).x,at(.5).y);
    await page.keyboard.down('Control');await page.mouse.wheel(0,100);await page.keyboard.up('Control');await page.waitForTimeout(80);
    assert.equal(await page.locator('#chart-height-slider').inputValue(),'1.1','Ctrl+wheel lowers lanes');
    const before=await page.evaluate(()=>[chartState.start,chartState.end]);
    await page.keyboard.down('Shift');await page.mouse.wheel(0,200);await page.keyboard.up('Shift');await page.waitForTimeout(80);
    const after=await page.evaluate(()=>[chartState.start,chartState.end]);
    assert(after[0]>before[0]&&Math.abs((after[1]-after[0])-(before[1]-before[0]))<1e-9,'Shift+wheel pans without zooming');
    await page.mouse.move(box.x+100,box.y+150);await page.mouse.wheel(0,200);await page.waitForTimeout(80);
    assert.deepEqual(await page.evaluate(()=>[chartState.start,chartState.end]),after,'Wheel over signal names does not zoom');
    result.wheel='PASS';

    /* Value tooltip transparency: T + wheel (mouse) and T + many small deltas (touchpad) */
    await page.mouse.move(at(.45).x,at(.45).y);
    const zoomBefore=await page.evaluate(()=>[chartState.start,chartState.end]);
    const alpha0=await page.evaluate(()=>ChartTooltip.alpha());
    await page.keyboard.down('t');await page.mouse.wheel(0,100);await page.mouse.wheel(0,100);await page.keyboard.up('t');
    const alphaWheel=await page.evaluate(()=>ChartTooltip.alpha());
    assert.equal(Math.round((alpha0-alphaWheel)*100),20,'Two wheel notches lower the opacity by 20 %');
    await page.keyboard.down('t');for(let i=0;i<15;i++)await page.mouse.wheel(0,-8);await page.keyboard.up('t');
    assert.equal(Math.round((await page.evaluate(()=>ChartTooltip.alpha()))*100),Math.round(alphaWheel*100)+20,'Small touchpad deltas add up');
    assert.deepEqual(await page.evaluate(()=>[chartState.start,chartState.end]),zoomBefore,'T + wheel never zooms the time axis');
    const stored=await page.evaluate(()=>({value:localStorage.getItem('signalerfassung.tooltipAlpha'),css:document.getElementById('chart-tooltip').style.getPropertyValue('--tooltip-alpha')}));
    assert.equal(stored.value,stored.css,'Opacity is applied and remembered');
    await page.mouse.wheel(0,-100);await page.waitForTimeout(60);
    assert(await page.evaluate(b=>chartState.end-chartState.start<b[1]-b[0],zoomBefore),'Wheel without T still zooms');
    await page.evaluate(b=>{chartState.start=b[0];chartState.end=b[1];renderChart();},zoomBefore);
    result.tooltipOpacity='PASS';

    /* Signal picker and overlay */
    await page.locator('.chart-action[onclick="selectChartSignals()"]').click();
    assert(await page.locator('#chart-signal-panel').isVisible());
    assert.equal(await page.locator('.chart-signal-row').count(),3);
    await page.locator('[data-action="overlay-all"]').click();
    let lanes=await page.evaluate(()=>chartState.layout.lanes.map(l=>l.signals.length));
    assert.deepEqual(lanes,[3],'All curves in one overlay lane');
    await page.locator('.chart-signal-shared input').check();
    assert.equal(await page.evaluate(()=>active().chartSharedScale&&chartState.layout.lanes[0].shared),true);
    await page.locator('.chart-signal-row').nth(2).locator('input[type="checkbox"]').uncheck();
    lanes=await page.evaluate(()=>chartState.layout.lanes.map(l=>l.signals.length));
    assert.deepEqual(lanes,[2],'Unticking removes a curve and keeps the others overlaid');
    assert.deepEqual(await page.evaluate(()=>({hidden:active().signals.filter(s=>s.chartHidden).length,stars:active().signals.filter(s=>s.marked).length})),{hidden:1,stars:0},'Picker hides curves without touching stars');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#chart-signal-panel').isVisible(),false);
    await page.locator('.chart-layout-switch [data-layout="separate"]').click();
    assert.deepEqual(await page.evaluate(()=>chartState.layout.lanes.map(l=>l.signals.length)),[1,1]);
    await page.locator('.chart-layout-switch [data-layout="overlay"]').click();
    result.overlay='PASS';

    /* Lane star highlights a signal like the table star and keeps every curve in the chart */
    await page.locator('.chart-layout-switch [data-layout="separate"]').click();
    const starHit=await page.evaluate(()=>{const h=chartState.layout.starHits[1],r=document.getElementById('signal-chart').getBoundingClientRect();return {x:r.left+h.x,y:r.top+h.y,id:h.signal.id};});
    await page.mouse.click(starHit.x,starHit.y);
    const starred=await page.evaluate(id=>({marked:active().signals.find(s=>s.id===id).marked,curves:chartSignals(active()).length,head:document.querySelector('th.th-marked')!==null}),starHit.id);
    assert.deepEqual(starred,{marked:true,curves:2,head:true},'Chart star marks the signal, table header follows, no curve disappears');
    const laneTint=await page.locator('#signal-chart').evaluate(canvas=>{const lane=chartState.layout.lanes[1],r=canvas.getBoundingClientRect(),s=canvas.width/r.width;return Array.from(canvas.getContext('2d').getImageData(Math.round(30*s),Math.round((lane.y1-6)*s),1,1).data);});
    assert(laneTint[0]>245&&laneTint[1]>215&&laneTint[2]<215,'Starred lane is highlighted: '+laneTint);
    await page.mouse.click(starHit.x,starHit.y);
    assert.equal(await page.evaluate(id=>active().signals.find(s=>s.id===id).marked,starHit.id),false,'Second click removes the highlight');
    await page.locator('.chart-layout-switch [data-layout="overlay"]').click();
    result.laneStar='PASS';

    /* Overlapping ranges stay visible: the overlap mixes both colours */
    const overlap=await page.evaluate(()=>{
      const A=active();Annotations.record(A);
      A.ranges.push({id:'o1',start:300,end:600,color:'#16a34a',note:''},{id:'o2',start:450,end:750,color:'#ffe08a',note:''});
      chartState.start=0;chartState.end=1;renderChart();
      const colors=Annotations.tableColors(A),c=canvas=>canvas;
      const canvas=document.getElementById('signal-chart'),r=canvas.getBoundingClientRect(),s=canvas.width/r.width,ctx=canvas.getContext('2d');
      const xAt=id=>{const rows=A.filtered,i=rows.findIndex(row=>row.rowId===id);return chartState.layout.left+rowChartRatio(rows[i],i,chartState.layout.windowData)*chartState.layout.plotW;};
      const y=chartState.layout.lanes[0].y1-4;
      const px=id=>Array.from(ctx.getImageData(Math.round(xAt(id)*s),Math.round(y*s),1,1).data).slice(0,3);
      const result={green:px(350),both:px(520),yellow:px(700),tableGreen:colors.get(350),tableBoth:colors.get(520),tableYellow:colors.get(700)};
      A.ranges=A.ranges.filter(range=>range.id!=='o1'&&range.id!=='o2');renderChart();
      return result;
    });
    const dist=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
    assert(dist(overlap.both,overlap.green)>12&&dist(overlap.both,overlap.yellow)>12,'Overlap differs from both single ranges: '+JSON.stringify(overlap));
    assert(overlap.tableBoth!==overlap.tableGreen&&overlap.tableBoth!==overlap.tableYellow,'Table tint mixes overlapping ranges');
    result.rangeOverlap='PASS';

    /* Project round trip keeps the new state */
    await page.evaluate(()=>{const A=active();A.txtMarkerColor='#d00070';});
    const snapshot=await page.evaluate(()=>projectSnapshot());
    await page.locator('#project-input').setInputFiles({name:'Toolbox.signalprojekt',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
    await page.waitForFunction(()=>active().history&&active().history.undo.length===0&&active().ranges.length===1);
    const restored=await page.evaluate(()=>{const A=active();return {overlay:A.signals.filter(s=>s.overlay).length,shared:A.chartSharedScale,color:A.txtMarkerColor,marker:A.rawRows.filter(r=>r.marked).map(r=>[r.markerColor,r.markerWidth]),range:A.ranges[0].note};});
    assert.deepEqual(restored,{overlay:2,shared:true,color:'#d00070',marker:[['#16a34a',5]],range:'Lastwechsel'});
    result.projectRoundTrip='PASS';

    /* Legacy project: "Zeitstempel markieren" had marked every row after the first press */
    const legacy=structuredClone(snapshot);
    const file=legacy.files[0],markerRows=[];
    await page.evaluate(()=>0);
    const counter=await page.evaluate(()=>{const A=active(),sig=markerSignal(A);return A.rawRows.filter(r=>markerValue(r,sig)>=1).map(r=>r.rowId);});
    file.markedRows=Array.from(new Set(counter.concat(file.markedRows)));
    file.annotations={version:1,ranges:[],rows:file.markedRows.map(id=>({id,color:id===file.annotations.rows.find(r=>r.width===5).id?'#16a34a':'#ffe08a',note:''}))};
    await page.locator('#project-input').setInputFiles({name:'Alt.signalprojekt',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
    await page.waitForFunction(()=>active().ranges.length===0);
    const migrated=await page.evaluate(()=>({marked:active().rawRows.filter(r=>r.marked).map(r=>r.markerColor),shown:captureMarkersShown(active())}));
    assert.deepEqual(migrated,{marked:['#16a34a'],shown:true},'Legacy timestamp marks are converted to the capture layer');
    result.legacyMigration='PASS';

    /* English labels */
    await page.locator('[data-lang-set="en"]').click();
    const en=await page.evaluate(()=>({mode:document.querySelector('[data-mode="marker"] .tool-text').textContent,txt:document.querySelector('.tool-txt .tool-text').textContent,undo:document.querySelector('[data-history="undo"]').title,layout:document.querySelector('.chart-layout-switch [data-layout="overlay"] span').textContent,height:document.querySelector('.chart-height-control label').textContent}));
    assert.deepEqual(en,{mode:'Marker',txt:'Capture markers',undo:'Undo (Ctrl+Z)',layout:'Overlaid',height:'Height'});
    /* Another tab (e.g. the manual) writing the shared preference must not flip parts of the running app */
    const stable=await page.evaluate(()=>{localStorage.setItem('signalerfassung.lang','de');renderChart();Annotations.sync();WorkspaceLayout.sync();return {mode:document.querySelector('[data-mode="inspect"] .tool-text').textContent,layout:document.querySelector('.chart-layout-switch [data-layout="separate"] span').textContent,summary:document.querySelector('.workspace-summary').textContent};});
    assert.deepEqual(stable,{mode:'Navigate',layout:'Separate',summary:stable.summary.includes('measurement rows')?stable.summary:'(German summary)'},'App keeps its own language');
    await page.locator('[data-lang-set="de"]').click();
    result.language='DE/EN PASS';

    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',...result,pageErrors:errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
