const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'signalerfassung-analyse-tool.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new Function(match[1]);
for(const file of ['annotations.js','export-save.js'])new Function(fs.readFileSync(path.join(root,'assets',file),'utf8'));
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[],downloads=[],alerts=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));
    page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss();});
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);
    await page.locator('#file-input').setInputFiles(path.join(root,'samples/Test_signalerfassung.txt'));
    await page.locator('#view-chart-btn').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#signal-chart').evaluate(el=>getComputedStyle(el).cursor),'crosshair');
    assert.equal(await page.locator('.annotation-color input').inputValue(),'#ffe08a','Default marker color should be the lighter yellow');
    const zoomSlider=page.locator('#chart-time-zoom');
    assert(await zoomSlider.isVisible(),'Timeline zoom slider should be visible');
    await zoomSlider.evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}));});
    const sliderZoom=await page.evaluate(()=>({span:chartState.end-chartState.start,value:document.getElementById('chart-time-zoom-value').textContent}));
    assert(sliderZoom.span<.25&&sliderZoom.value!=='1×','Timeline slider should zoom the horizontal time range');
    await page.locator('.chart-action[onclick="resetChartZoom()"]') .click();
    assert.deepEqual(await page.evaluate(()=>[chartState.start,chartState.end,document.getElementById('chart-time-zoom').value]),[0,1,'0'],'Full range should reset slider and timeline');
    await page.evaluate(()=>{
      const rows=active().rawRows,start=Math.floor(rows.length*.3),end=Math.floor(rows.length*.5);
      rows.forEach((row,index)=>{row.marked=index>=start&&index<=end;row.markerColor='#ffe08a';});
      chartState.start=.35;chartState.end=.37;renderChart();
    });
    const markerFill=await page.locator('#signal-chart').evaluate(canvas=>{
      const ctx=canvas.getContext('2d'),box=canvas.getBoundingClientRect(),sx=canvas.width/box.width,sy=canvas.height/box.height;
      const y=Math.round(23*sy),from=Math.round(250*sx),to=Math.round((canvas.getBoundingClientRect().width-32)*sx);let yellow=0,total=0;
      for(let x=from;x<=to;x+=Math.max(1,Math.round(2*sx))){const p=ctx.getImageData(x,y,1,1).data;total++;if(p[0]>240&&p[1]>205&&p[2]<235)yellow++;}
      const grid=[];
      for(let gx=1;gx<6;gx++){const x=Math.round((245+(box.width-271)*gx/6)*sx),p=ctx.getImageData(x,y,1,1).data;grid.push(Array.from(p));}
      const laneY=Math.round((18+(box.height-56)/8)*sy),laneX=Math.round((245+(box.width-271)*.73)*sx),lane=Array.from(ctx.getImageData(laneX,laneY,1,1).data);
      const divider=Array.from(ctx.getImageData(Math.round(245*sx),y,1,1).data);
      return {coverage:yellow/total,yellow,total,grid,lane,divider};
    });
    const isYellow=p=>p[0]>240&&p[1]>205&&p[2]<235;
    const colorDistance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
    assert(markerFill.coverage>.99,'Zoomed marker range should remain a continuous yellow area: '+JSON.stringify(markerFill));
    assert(markerFill.grid.every(isYellow),'Vertical time grid must not cut through the marker area: '+JSON.stringify(markerFill.grid));
    assert(colorDistance(markerFill.lane,markerFill.grid[0])>6,'Horizontal lane dividers should remain visible: '+JSON.stringify(markerFill.lane));
    assert(!isYellow(markerFill.divider),'Label and plot areas should have a visible vertical divider: '+JSON.stringify(markerFill.divider));
    await page.evaluate(()=>{active().rawRows.forEach(row=>{row.marked=false;row.markerColor='';});chartState.start=0;chartState.end=1;renderChart();});
    const fullSignalName='EMS - Vollstaendiger besonders langer Signalname fuer den Hover-Test';
    await page.evaluate(name=>{const A=active(),signal=chartSignals(A,A.rawRows)[0];window.originalChartSignalName=signal.displayName;signal.displayName=name;renderChart();},fullSignalName);
    const labelRect=await page.locator('#signal-chart').boundingBox();
    await page.mouse.move(labelRect.x+100,labelRect.y+36);
    await page.waitForTimeout(40);
    assert.equal(await page.locator('#chart-tooltip').textContent(),fullSignalName,'Truncated signal name should be shown completely on hover');
    await page.evaluate(()=>{const A=active(),signal=chartSignals(A,A.rawRows)[0];signal.displayName=window.originalChartSignalName;renderChart();});
    await page.evaluate(()=>{chartState.start=.3;chartState.end=.6;renderChart();});
    const rect=await page.locator('#signal-chart').boundingBox();
    const x=rect.x+245+(rect.width-271)*.5,y=rect.y+90;
    async function drag(from,to){await page.mouse.move(from,y);await page.mouse.down();await page.mouse.move(to,y,{steps:8});await page.mouse.up();await page.waitForTimeout(60);}
    await drag(x,x+140);
    const right=await page.evaluate(()=>[chartState.start,chartState.end]);
    assert(right[0]<.3&&Math.abs(right[1]-right[0]-.3)<1e-9,'Dragging right shows earlier time without changing zoom');
    await drag(x,x-140);
    assert(Math.abs((await page.evaluate(()=>chartState.start))-.3)<1e-9,'Dragging left restores time window');
    assert.equal(await page.evaluate(()=>active().rawRows.filter(r=>r.marked).length),0,'Panning does not add markers');
    assert.equal(await page.evaluate(()=>active().ranges.length),0,'Panning does not add ranges');
    await drag(x,x+5000);
    assert.equal(await page.evaluate(()=>chartState.start),0,'Clamp to beginning even with pointer outside canvas');
    assert.equal(await page.evaluate(()=>Annotations.isDragging()),false,'Pointer released outside canvas');
    await page.mouse.click(x,y);
    assert.equal(await page.locator('.annotation-note').isDisabled(),false,'Single click still selects a note target');
    await page.locator('[data-mode="range"]').click();
    const timeBefore=await page.evaluate(()=>[chartState.start,chartState.end]);
    await drag(x-100,x+100);
    assert.equal(await page.evaluate(()=>active().ranges.length),1);
    assert.deepEqual(await page.evaluate(()=>[chartState.start,chartState.end]),timeBefore,'Range gesture never pans');
    await page.locator('[data-mode="range"]').click();
    await page.evaluate(()=>{
      window.saved=[];window.picks=[];
      window.showSaveFilePicker=async options=>{
        picks.push({options,activation:navigator.userActivation.isActive});
        return {createWritable:async()=>({write:async blob=>{saved.push({name:options.suggestedName,size:blob.size,type:blob.type,head:Array.from(new Uint8Array(await blob.slice(0,4).arrayBuffer()))});},close:async()=>{saved[saved.length-1].closed=true;},abort:async()=>{}})};
      };
    });
    for(const kind of ['pdf','xlsx','support']){
      await page.locator('#export-menu summary').click();
      await page.locator('.btn-'+kind).click();
      await page.waitForFunction(()=>!exportSaveBusy,{},{timeout:120000});
    }
    const exports=await page.evaluate(()=>({saved,picks}));
    assert.equal(exports.saved.length,3);
    assert(exports.picks.every(p=>p.activation),'Picker opens during button activation');
    assert(exports.saved.every(f=>f.size>1000&&f.closed));
    assert.deepEqual(exports.saved[0].head,[37,80,68,70]);
    assert.deepEqual(exports.saved[1].head,[80,75,3,4]);
    assert.deepEqual(exports.saved[2].head,[80,75,3,4]);
    assert(exports.saved.map(f=>f.name).join('|').includes('.zip'));
    assert.deepEqual(downloads,[],'Native saves must not trigger browser downloads');
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('Cancelled','AbortError');};});
    await page.locator('#export-menu summary').click();await page.locator('.btn-pdf').click();
    await page.waitForFunction(()=>!exportSaveBusy);
    assert.equal(await page.evaluate(()=>saved.length),3,'Cancelling does not write a file');
    assert.deepEqual(alerts,[],'No error on cancellation');
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>{throw new Error('Test: disk unavailable');}});});
    await page.locator('#export-menu summary').click();await page.locator('.btn-pdf').click();
    await page.waitForFunction(()=>!exportSaveBusy);
    assert(alerts.pop().includes('disk unavailable'),'Write errors are reported');
    assert.deepEqual(downloads,[],'Write errors never silently download elsewhere');
    await page.evaluate(()=>{window.showSaveFilePicker=undefined;});
    await page.locator('#export-menu summary').click();await page.locator('.btn-pdf').click();
    await page.waitForFunction(()=>!exportSaveBusy);
    assert(alerts.pop().includes('Browser-Download'),'Unsupported browsers explicitly ask before fallback');
    assert.deepEqual(downloads,[],'Declined fallback does not download');
    assert(await page.locator('.export-icon img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),'All local SVG icons load');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',pan:'both directions, limits, note click and range isolation',exports:exports.saved,cancel:'PASS',errorHandling:'PASS',svg:'PASS',pageErrors:errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
