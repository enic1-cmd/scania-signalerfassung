/* Creates the DE/EN screenshots for handbuch.html from a real recording in samples/ (gitignored).
   Usage: node tools/create-handbook-screenshots.cjs ["samples/<file>.txt"] ["samples/<sws-file>.txt"]
   Output: handbuch/<lang>-<name>.webp (converted with ImageMagick when available, otherwise PNG). */
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync,spawn}=require('node:child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const sample=path.resolve(root,process.argv[2]||'samples/2026-09-21 160628.txt');
const swsSample=path.resolve(root,process.argv[3]||'samples/2026-10-06 112638 2210754.txt');
const out=path.join(root,'handbuch');
if(!fs.existsSync(sample))throw new Error('Sample recording missing: '+sample);
fs.mkdirSync(out,{recursive:true});

function hasMagick(){try{execFileSync('magick',['-version'],{stdio:'ignore'});return true;}catch{return false;}}
const magick=hasMagick();
function save(buffer,name){
  const png=path.join(out,name+'.png');
  fs.writeFileSync(png,buffer);
  if(!magick)return name+'.png';
  execFileSync('magick',[png,'-quality','82','-define','webp:method=6',path.join(out,name+'.webp')]);
  fs.unlinkSync(png);
  return name+'.webp';
}

/* Pages are served over http (like production) so the PDF report can embed the wordmark logo. */
const PORT=8765,BASE='http://127.0.0.1:'+PORT+'/';
async function startServer(){
  const server=spawn(process.execPath,[path.join(__dirname,'serve-local.cjs'),String(PORT)],{stdio:'ignore',windowsHide:true});
  for(let attempt=0;attempt<50;attempt++){
    try{const response=await fetch(BASE+'site.webmanifest');if(response.ok)return server;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  server.kill();throw new Error('Local server did not start');
}

(async()=>{
  const server=await startServer();
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const written=[];
  try{
    for(const lang of ['de','en']){
      const page=await browser.newPage({viewport:{width:1440,height:860},deviceScaleFactor:1.5});
      await page.addInitScript(l=>{localStorage.setItem('signalerfassung.lang',l);localStorage.removeItem('signalerfassung.highlight');localStorage.removeItem('signalerfassung.pdfSections');},lang);
      await page.route('**/api/usage',route=>route.fulfill({status:204}));
      await page.goto(BASE+'signalerfassung-analyse-tool.html');
      await page.waitForTimeout(300);
      written.push(save(await page.screenshot(),lang+'-upload'));

      await page.locator('#file-input').setInputFiles(sample);
      await page.waitForFunction(()=>S.files.length===1);
      await page.waitForTimeout(200);
      /* Example annotations so markers, ranges and notes are visible */
      await page.evaluate(en=>{
        const A=active(),n=A.rawRows.length;
        const a=A.rawRows[Math.floor(n*.36)];a.marked=true;a.markerColor='#e4002b';a.markerWidth=3;a.note=en?'Jerk when pulling away, engine speed drops briefly.':'Ruckeln beim Anfahren, Drehzahl bricht kurz ein.';
        A.ranges=[{id:'demo-range',start:Math.floor(n*.47),end:Math.floor(n*.53),color:'#ffe08a',note:en?'Load change: pedal 0 to 60 %, gearbox shifts down.':'Lastwechsel: Pedal 0 auf 60 %, Getriebe schaltet zurück.'}];
        const c=A.rawRows[Math.floor(n*.71)];c.marked=true;c.markerColor='#7c3aed';c.markerWidth=5;
        A.dirty=false;Annotations.sync();
      },lang==='en');
      await page.addStyleTag({content:'.toast{display:none!important}'});

      /* Table with capture marker badge */
      await page.evaluate(()=>{const e=markerEvents(active())[3];scrollTableToRow(e.row.rowId,false);});
      await page.waitForTimeout(400);
      written.push(save(await page.screenshot(),lang+'-table'));

      /* Chart with toolbox */
      await page.locator('#view-chart-btn').click();await page.waitForTimeout(500);
      await page.mouse.move(10,10);
      written.push(save(await page.screenshot(),lang+'-chart'));
      written.push(save(await page.locator('.annotation-tools').screenshot(),lang+'-toolbox'));

      /* Signal picker */
      await page.locator('.chart-action[onclick="selectChartSignals()"]').click();await page.waitForTimeout(250);
      written.push(save(await page.locator('.chart-card').screenshot(),lang+'-picker'));
      await page.keyboard.press('Escape');

      /* Overlay: speed, pedal and engine speed in one lane */
      await page.evaluate(()=>{
        const A=active(),pick=['EMS-CanVehicleSpeed','EMS-AccPedalFilt','TMS-EngineSpeed'];
        A.signals.forEach(s=>{s.marked=pick.includes(s.id);s.overlay=pick.includes(s.id);});
        refreshColumns();
      });
      await page.waitForTimeout(300);
      written.push(save(await page.locator('.chart-card').screenshot(),lang+'-overlay'));
      await page.evaluate(()=>{active().signals.forEach(s=>{s.marked=false;s.overlay=false;});refreshColumns();});

      /* Highlight: six overlaid curves, mouse over engine speed */
      await page.evaluate(()=>{
        const want=['EMS-CanVehicleSpeed','EMS-AccPedalFilt','TMS-EngineSpeed','TMS-InputShaftSpeed','TMS-LayShaftSpeed','TMS-MainShaftSpeed'];
        chartSelection(active()).candidates.forEach(s=>{const on=want.includes(s.id);s.chartHidden=!on;s.overlay=on;});renderChart();
      });
      await page.locator('.chart-highlight-toggle').click();
      const hl=await page.evaluate(()=>{const hits=chartState.layout.labelHits.filter(x=>x.signal),h=hits.find(x=>x.signal.id==='TMS-EngineSpeed')||hits[0],r=document.getElementById('signal-chart').getBoundingClientRect();return {x:r.left+70,y:r.top+(h.y0+h.y1)/2};});
      await page.mouse.move(hl.x,hl.y);await page.waitForTimeout(200);
      written.push(save(await page.locator('.chart-card').screenshot(),lang+'-highlight'));
      await page.mouse.move(10,10);await page.locator('.chart-highlight-toggle').click();

      /* Measure: cursors A and B over pedal, engine speed, vehicle speed and gear */
      await page.evaluate(()=>{
        const want=['EMS-AccPedalFilt','TMS-EngineSpeed','EMS-CanVehicleSpeed','TMS-CurrentGear'];
        chartSelection(active()).candidates.forEach(s=>{s.chartHidden=!want.includes(s.id);s.overlay=false;});renderChart();
      });
      await page.locator('.tool-modes [data-mode="measure"]').click();
      const plot=await page.evaluate(()=>{const r=document.getElementById('signal-chart').getBoundingClientRect(),L=chartState.layout;return {x0:r.left+L.left,w:L.plotW,y:r.top+L.top+L.plotH*.55};});
      await page.mouse.click(plot.x0+plot.w*.3,plot.y);await page.mouse.click(plot.x0+plot.w*.38,plot.y);await page.mouse.move(10,10);await page.waitForTimeout(200);
      written.push(save(await page.locator('.chart-card').screenshot(),lang+'-measure'));
      await page.keyboard.press('Escape');

      /* Set/actual pair: requested and engaged gear with deviations */
      await page.evaluate(()=>{chartSelection(active()).candidates.forEach(s=>{s.chartHidden=false;s.overlay=false;});renderChart();});
      await page.locator('.chart-action[onclick="selectChartSignals()"]').click();
      await page.locator('.pair-box [data-act="toggle"]').click();
      await page.locator('.pair-box [data-act="list"]').click();await page.waitForTimeout(250);
      written.push(save(await page.locator('.chart-card').screenshot(),lang+'-pairs'));
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{active().chartPairs=[];active().dirty=false;renderChart();});

      /* Notes sidebar */
      await page.locator('.annotation-toggle').click();await page.waitForTimeout(300);
      written.push(save(await page.screenshot(),lang+'-notes'));
      await page.locator('.annotation-toggle').click();

      /* Export menu */
      await page.locator('#export-menu summary').click();await page.waitForTimeout(200);
      written.push(save(await page.screenshot({clip:{x:860,y:0,width:580,height:330}}),lang+'-export'));
      /* PDF chapter dialog */
      await page.locator('.export-option.btn-pdf').click();await page.waitForTimeout(250);
      written.push(save(await page.locator('dialog.pdf-options').screenshot(),lang+'-pdf-dialog'));
      await page.locator('.pdf-options-cancel').click();

      /* Help drawer */
      await page.locator('#help-trigger').click();await page.waitForTimeout(400);
      written.push(save(await page.screenshot(),lang+'-help'));
      await page.keyboard.press('Escape');

      /* PDF report pages rendered with pdf.js (dev dependency only, not deployed) */
      const pdfjs=path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.min.js');
      if(fs.existsSync(pdfjs)){
        const b64=await page.evaluate(async()=>{
          const blob=exportPDF({file:captureExportState(active()).file,download:false});
          const bytes=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(raw);
        });
        const viewer=await browser.newPage({deviceScaleFactor:1});
        await viewer.goto('about:blank');
        await viewer.addScriptTag({path:pdfjs});
        await viewer.addScriptTag({path:path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js')});
        const pages=await viewer.evaluate(async data=>{
          const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),doc=await pdfjsLib.getDocument({data:bytes}).promise,urls=[];
          for(const number of [1,2,7]){if(number>doc.numPages)continue;const page=await doc.getPage(number),vp=page.getViewport({scale:1.8}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;urls.push(c.toDataURL('image/png'));}
          return urls;
        },b64);
        ['report-summary','report-chart','report-capture'].forEach((name,i)=>{if(pages[i])written.push(save(Buffer.from(pages[i].split(',')[1],'base64'),lang+'-'+name));});
        await viewer.close();
      }else console.warn('pdfjs-dist not installed - report pages skipped (npm install --no-save pdfjs-dist@3.11.174)');
      await page.close();

      /* SWS recording (BEV, gitignored): status signals, value scale with sample dots, SWS note.
         Loaded under a neutral file name so no chassis number appears in the handbook. */
      if(fs.existsSync(swsSample)){
        const neutral=path.join(require('node:os').tmpdir(),'SWS-Beispiel 2026-10-06.txt');
        fs.copyFileSync(swsSample,neutral);
        const sws=await browser.newPage({viewport:{width:1440,height:860},deviceScaleFactor:1.5});
        await sws.addInitScript(l=>{localStorage.setItem('signalerfassung.lang',l);localStorage.removeItem('signalerfassung.samplePoints');},lang);
        await sws.route('**/api/usage',route=>route.fulfill({status:204}));
        await sws.goto(BASE+'signalerfassung-analyse-tool.html');
        await sws.locator('#file-input').setInputFiles(neutral);
        await sws.waitForFunction(()=>S.files.length===1);
        await sws.addStyleTag({content:'.toast{display:none!important}'});
        await sws.locator('#view-chart-btn').click();await sws.waitForTimeout(300);
        /* Status signals next to the shift sleeve position */
        await sws.evaluate(()=>{
          const want=['Hauptgetriebe, Gangstellung S1','Soll-Gang für Primärgetriebe','Gang 1 im Getriebe','Gang 2 im Getriebe','Antriebsstatus','Aktuelle Regelstrategie'];
          chartSelection(active()).candidates.forEach(s=>{const name=s.displayName||s.id;s.chartHidden=!want.some(w=>name===w||name.endsWith('- '+w));s.overlay=false;});renderChart();
        });
        await sws.mouse.move(10,10);await sws.waitForTimeout(200);
        written.push(save(await sws.locator('.chart-card').screenshot(),lang+'-status'));
        /* Value scale and sample dots, zoomed to the gear 2 request at 11:21:28 */
        await sws.evaluate(()=>{
          const want=['Hauptgetriebe, Gangstellung S1','Soll-Gang für Primärgetriebe','Geschätzte Drehzahl, Elektromaschine M33'];
          chartSelection(active()).candidates.forEach(s=>{const name=s.displayName||s.id;s.chartHidden=!want.some(w=>name===w||name.endsWith('- '+w));});
          chartState.start=.15;chartState.end=.31;renderChart();
        });
        await sws.locator('.chart-points-toggle').click();await sws.mouse.move(10,10);await sws.waitForTimeout(250);
        written.push(save(await sws.locator('.chart-card').screenshot(),lang+'-points'));
        /* Dots stay on for the SWS note, so the picture shows how rarely new values arrive */
        /* SWS note */
        await sws.locator('.sws-notice-button').click();await sws.waitForTimeout(250);
        written.push(save(await sws.screenshot({clip:{x:0,y:60,width:1440,height:470}}),lang+'-sws-note'));
        await sws.close();
      }else console.warn('SWS sample missing - status, points and SWS note screenshots skipped: '+swsSample);
    }
  }finally{await browser.close();server.kill();}
  console.log(JSON.stringify({written,converted:magick?'webp':'png'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
