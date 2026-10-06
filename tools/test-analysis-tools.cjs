/* Highlight, measure (A/B cursors), set/actual pairs and the PDF chapter dialog, in German and English. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const sample=path.join(root,'samples','2026-09-21 160628.txt');
if(!fs.existsSync(sample)){console.log(JSON.stringify({result:'SKIPPED',reason:'real recording missing in samples/'}));process.exit(0);}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{try{localStorage.removeItem('signalerfassung.highlight');localStorage.removeItem('signalerfassung.pdfSections');}catch(e){}});
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);
    await page.locator('#file-input').setInputFiles(sample);
    await page.waitForFunction(()=>S.files.length===1);
    await page.locator('#view-chart-btn').click();await page.waitForTimeout(200);
    const result={};

    /* Highlight: off by default, hover over a name emphasises it, click keeps it, display only */
    const toggle=page.locator('.chart-highlight-toggle');
    assert.equal(await toggle.textContent(),'Hervorheben');assert.equal(await toggle.getAttribute('aria-pressed'),'false');
    const labelPoint=async index=>page.evaluate(i=>{const h=chartState.layout.labelHits.filter(x=>x.signal)[i],r=document.getElementById('signal-chart').getBoundingClientRect();return {x:r.left+60,y:r.top+(h.y0+h.y1)/2,id:h.signal.id};},index);
    let p=await labelPoint(2);
    await page.mouse.move(p.x,p.y);
    assert.equal(await page.evaluate(()=>ChartHighlight.current(active())),null,'Nothing is highlighted while the button is off');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'),'true');
    await page.mouse.move(p.x+2,p.y);
    assert.equal(await page.evaluate(()=>ChartHighlight.current(active()).id),p.id,'Hover over a name highlights that curve');
    await page.mouse.click(p.x,p.y);await page.mouse.move(5,5);
    assert.equal(await page.evaluate(()=>ChartHighlight.current(active()).id),p.id,'Click keeps the curve highlighted after the mouse leaves');
    assert.equal(await page.evaluate(()=>active().dirty||false),false,'Highlight does not change the work state');
    const exportUntouched=await page.evaluate(()=>{const ws=captureExportState(active());return !('_highlight' in ws.file);});
    assert(exportUntouched,'Exports never carry the highlight');
    await page.mouse.click(p.x,p.y);await page.mouse.move(5,5);
    assert.equal(await page.evaluate(()=>ChartHighlight.current(active())),null,'Second click releases it');
    await toggle.click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('signalerfassung.highlight')),'0');
    result.highlight='PASS';

    /* Measure: tool in the toolbar, A and B by click, Δt and differences, drag, save as note, undo, Esc */
    assert.equal(await page.locator('.tool-modes [data-mode="measure"] .tool-text').textContent(),'Messen');
    await page.locator('.tool-modes [data-mode="measure"]').click();
    const plot=await page.evaluate(()=>{const r=document.getElementById('signal-chart').getBoundingClientRect(),L=chartState.layout;return {x0:r.left+L.left,w:L.plotW,y:r.top+L.top+L.plotH*.5};});
    await page.mouse.click(plot.x0+plot.w*.30,plot.y);
    assert.equal(await page.locator('.measure-panel').isVisible(),true,'Panel opens with cursor A');
    assert.equal(await page.evaluate(()=>ChartMeasure.measurement().b),null);
    await page.mouse.click(plot.x0+plot.w*.40,plot.y);
    let m=await page.evaluate(()=>{const x=ChartMeasure.measurement();return {dt:x.dt,rows:x.list.length,curves:chartSelection(active()).signals.length,a:x.a.rowId,b:x.b.rowId,d:x.list.map(i=>i.d)};});
    assert(m.dt>0,'Δt is positive from A to B');assert.equal(m.rows,m.curves,'One row per curve');
    assert(m.d.every(v=>v===null||Number.isFinite(v)),'Differences are numbers');
    assert.equal(await page.locator('.measure-table tbody tr').count(),m.curves);
    const ax=plot.x0+plot.w*.30;
    await page.mouse.move(ax,plot.y);await page.mouse.down();await page.mouse.move(ax-plot.w*.05,plot.y,{steps:4});await page.mouse.up();
    const moved=await page.evaluate(()=>ChartMeasure.measurement().a.rowId);
    assert(moved<m.a,'Dragging cursor A moves it');
    assert.equal(await page.evaluate(()=>ChartMeasure.measurement().b.rowId),m.b,'Cursor B stays');
    await page.locator('.measure-save').click();
    const note=await page.evaluate(()=>Annotations.entries(active()).find(e=>e.type==='range'));
    assert(note&&/Messung A → B/.test(note.note)&&/Δt/.test(note.note),'Measurement saved as range with note');
    assert.equal(await page.locator('.measure-panel').isVisible(),false,'Cursors are cleared after saving');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>Annotations.entries(active()).length),0,'Saving can be undone');
    await page.mouse.click(plot.x0+plot.w*.5,plot.y);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.measure-panel').isVisible(),false,'Esc removes the cursors');
    assert.equal(await page.evaluate(()=>Annotations.mode()),'inspect');
    result.measure='PASS';

    /* Toolbar never overlaps: every tool group keeps its own space */
    for(const width of [1920,1440,1366,1280]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(120);
      const overlap=await page.evaluate(()=>{const items=[...document.querySelectorAll('.annotation-tools > *')].filter(e=>e.offsetParent).map(e=>e.getBoundingClientRect());
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)return true;}return false;});
      assert.equal(overlap,false,'Toolbar items do not overlap at '+width+' px');
    }
    await page.setViewportSize({width:1500,height:950});await page.waitForTimeout(150);
    result.toolbar='PASS';

    /* Set/actual pairs: detection, own lane, deviations, jump, tolerance, project */
    const detected=await page.evaluate(()=>ChartPairs.detect(active()).map(p=>[p.set.displayName,p.act.displayName]));
    assert.deepEqual(detected,[['TMS - Angeforderter Gang','TMS - Eingelegter Gang']],'Requested gear pairs with engaged gear');
    const synthetic=await page.evaluate(()=>{
      const sig=(i,name,unit)=>({id:'EMS-'+i,index:i,displayName:name,unit,chartNumeric:true});
      const file={signals:[sig(1,'EMS - Requested fuel pressure','bar'),sig(2,'EMS - Fuel pressure','bar'),sig(3,'EMS - Requested torque','Nm'),sig(4,'EMS - Flywheel torque','Nm'),sig(5,'EMS - Torque','Nm'),sig(6,'EMS - Torque request from the engine','Nm'),sig(7,'TMS - Requested gear','-'),sig(8,'EMS - Requested engine speed','rpm'),sig(9,'EMS - Engine speed','%')],rawRows:[]};
      return ChartPairs.detect(file).map(p=>p.set.displayName+' = '+p.act.displayName);
    });
    assert.deepEqual(synthetic,['EMS - Requested fuel pressure = EMS - Fuel pressure','EMS - Requested torque = EMS - Torque'],'English names pair by name and unit only');
    await page.locator('.chart-action[onclick="selectChartSignals()"]').click();
    await page.locator('.pair-box [data-act="toggle"]').click();
    const lane=await page.evaluate(()=>{const l=chartState.layout.lanes.find(x=>x.pair);return l?{n:l.signals.length,shared:l.shared}:null;});
    assert.deepEqual(lane,{n:2,shared:true},'Active pair gets its own lane with a shared scale');
    const devCount=await page.evaluate(()=>{const p=ChartPairs.lanePairs(active(),chartSelection(active()).signals)[0];return ChartPairs.deviations(active(),p).length;});
    assert(devCount>0,'Gear changes show deviations');
    assert.match(await page.locator('.pair-box .pair-stats').textContent(),new RegExp('Abweichungen: '+devCount));
    await page.locator('.pair-box [data-act="list"]').click();
    await page.locator('.pair-list button').first().click();
    assert(await page.evaluate(()=>chartState.end-chartState.start<.5),'Clicking a deviation zooms to it');
    await page.locator('.pair-settings input[data-field="dur"]').fill('5');await page.locator('.pair-settings input[data-field="dur"]').dispatchEvent('change');
    const fewer=await page.evaluate(()=>{const p=ChartPairs.lanePairs(active(),chartSelection(active()).signals)[0];return ChartPairs.deviations(active(),p).length;});
    assert(fewer<devCount,'A longer minimum duration reduces the deviations');
    const saved=await page.evaluate(()=>projectSnapshot().files[0].chart.pairs);
    assert.equal(saved.length,1);assert.equal(saved[0].dur,5);
    const restored=await page.evaluate(snapshot=>{const f={};ChartPairs.restore(f,snapshot);return f.chartPairs;},saved);
    assert.deepEqual(restored,saved,'Pairs survive project save and open');
    await page.locator('.pair-settings input[data-field="dur"]').fill('0.5');await page.locator('.pair-settings input[data-field="dur"]').dispatchEvent('change');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>resetChartZoom());
    result.pairs='PASS';

    /* PDF dialog: chapters, page estimate, remembered choice, fewer pages, pairs chapter */
    await page.locator('#export-menu summary').click();
    await page.locator('.export-option.btn-pdf').click();
    assert.equal(await page.locator('dialog.pdf-options').evaluate(d=>d.open),true,'PDF opens the chapter dialog');
    assert.equal(await page.locator('.pdf-options [data-section="summary"]').isDisabled(),true,'Summary is always included');
    assert.equal(await page.locator('.pdf-options [data-section="pairs"]').isChecked(),true,'Pairs chapter offered when a pair is active');
    const before=await page.locator('.pdf-options-pages strong').textContent();
    await page.locator('.pdf-options [data-section="details"]').uncheck();
    await page.locator('.pdf-options [data-section="excerpt"]').uncheck();
    const after=await page.locator('.pdf-options-pages strong').textContent();
    assert(parseInt(after)<parseInt(before),'Page estimate follows the choice: '+before+' → '+after);
    await page.evaluate(()=>{window.__pdfCall=null;window.saveExport=(kind,options)=>{window.__pdfCall={kind,options};};});
    await page.locator('.pdf-options-create').click();
    const call=await page.evaluate(()=>window.__pdfCall);
    assert.equal(call.kind,'pdf');assert.equal(call.options.sections.details,false);assert.equal(call.options.sections.chart,true);
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('signalerfassung.pdfSections'))).excerpt,false,'Choice is remembered');
    const pages=await page.evaluate(async()=>{
      const count=async blob=>{const b=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<b.length;i+=0x8000)raw+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return (raw.match(/\/Type \/Page[^s]/g)||[]).length;};
      const file=captureExportState(active()).file;
      return {full:await count(exportPDF({file,download:false})),reduced:await count(exportPDF({file,download:false,sections:{details:false,excerpt:false,overview:false}})),noPairs:await count(exportPDF({file,download:false,sections:{pairs:false}})),onlyChart:await count(exportPDF({file,download:false,sections:{zoom:false,details:false,capture:false,pairs:false,notes:false,stats:false,overview:false,excerpt:false}}))};
    });
    assert(pages.reduced<pages.full,'Unticked chapters are left out: '+JSON.stringify(pages));
    assert(pages.noPairs<pages.full,'The pairs chapter is part of the full report');
    assert(pages.onlyChart>=2&&pages.onlyChart<pages.reduced,'Summary plus chart only');
    await page.locator('#export-menu summary').click();await page.locator('.export-option.btn-pdf').click();
    assert.equal(await page.locator('.pdf-options [data-section="excerpt"]').isChecked(),false,'Dialog opens with the remembered choice');
    await page.locator('.pdf-options-cancel').click();
    result.pdf='PASS';

    /* English */
    await page.locator('[data-lang-set="en"]').click();await page.waitForTimeout(150);
    assert.equal(await page.locator('.chart-highlight-toggle span').textContent(),'Highlight');
    assert.equal(await page.locator('.tool-modes [data-mode="measure"] .tool-text').textContent(),'Measure');
    await page.locator('.chart-action[onclick="selectChartSignals()"]').click();
    assert.match(await page.locator('.pair-box h3').textContent(),/Setpoint\/actual pairs found/);
    assert.match(await page.locator('.pair-box [data-act="toggle"]').textContent(),/Remove pair/);
    await page.keyboard.press('Escape');
    await page.locator('#export-menu summary').click();await page.locator('.export-option.btn-pdf').click();
    assert.equal(await page.locator('.pdf-options h2').textContent(),'Customize PDF report');
    assert.match(await page.locator('.pdf-options').textContent(),/Setpoint\/actual deviations/);
    await page.locator('.pdf-options-cancel').click();
    await page.locator('.tool-modes [data-mode="measure"]').click();
    await page.mouse.click(plot.x0+plot.w*.3,plot.y);await page.mouse.click(plot.x0+plot.w*.35,plot.y);
    await page.waitForFunction(()=>/Measurement/.test(document.querySelector('.measure-head strong').textContent));
    assert.match(await page.locator('.measure-head strong').textContent(),/Measurement A → B/);
    assert.equal(await page.locator('.measure-save').textContent(),'Save as note');
    await page.keyboard.press('Escape');
    result.language='DE/EN PASS';

    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',...result,pageErrors:errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
