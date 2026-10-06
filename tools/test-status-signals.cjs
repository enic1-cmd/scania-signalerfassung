/* Status signals (text values such as "Aktiv" / "Nicht aktiv") appear in the chart as step curves, in German and English.
   Uses a small synthetic SWS recording, so the test runs without the real recordings in samples/. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

function recording(){
  const head=['TimeStamp','TimeOffset','Marker','Gang 1 im Getriebe','Hauptgetriebe, Gangstellung S1','Antriebsstatus','Aktuelle Regelstrategie','Luftdruck'];
  const units=['Time','Time','Count','-','mm','-','-','mbar'];
  const lines=[head.join('\t'),units.join('\t')];
  for(let i=0;i<60;i++){
    const sec=String(i%60).padStart(2,'0'),g1=i>=20&&i<30?'Aktiv':'Nicht aktiv',pos=i>=20&&i<30?'30.4':'21.5';
    const drive=i<10?'Nicht bereit':'Bereit',strategy=i<25?'Status des Hybridsystems':(i<40?'Elektroantrieb':'Geänderte Gangposition');
    lines.push(['11:20:'+sec+':000','00:00:'+sec+'.000','0',g1,pos,drive,strategy,'10150'].join('\t'));
  }
  const file=path.join(os.tmpdir(),'2026-10-06 112000 status.txt');
  fs.writeFileSync(file,lines.join('\r\n'));
  return file;
}

(async()=>{
  const sample=recording();
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);
    await page.locator('#file-input').setInputFiles(sample);
    await page.waitForFunction(()=>S.files.length===1);
    await page.locator('#view-chart-btn').click();await page.waitForTimeout(200);

    const info=await page.evaluate(()=>{
      const A=active(),by=name=>A.signals.find(s=>(s.displayName||s.id)===name);
      return {
        curves:chartSelection(A).signals.map(s=>s.displayName||s.id),
        gang:by('Gang 1 im Getriebe').chartStates,
        drive:by('Antriebsstatus').chartStates,
        strategy:by('Aktuelle Regelstrategie').chartStates,
        numericStats:ReportExport.numericSignals(A).map(s=>s.displayName||s.id),
        pairs:ChartPairs.detect?ChartPairs.detect(A).length:0
      };
    });
    for(const name of ['Gang 1 im Getriebe','Hauptgetriebe, Gangstellung S1','Antriebsstatus','Aktuelle Regelstrategie','Luftdruck'])
      assert(info.curves.includes(name),'Chart shows '+name);
    assert(!info.curves.includes('Marker'),'Marker column is no curve');
    assert.deepEqual(info.gang,['Aktiv','Nicht aktiv','Nicht definiert'],'Known SWS scale is used completely, bottom to top');
    assert.deepEqual(info.drive,['Fehler','Nicht verfügbar','Nicht bereit','Bereit','Start','Schaltet ab','Nicht definiert']);
    assert.deepEqual(info.strategy,['Elektroantrieb','Status des Hybridsystems','Geänderte Gangposition'],'Long SWS scale only keeps the states that occur, in SWS order');
    assert(!info.numericStats.includes('Antriebsstatus'),'Statistics keep numeric signals only');

    /* Tooltip shows the text of a status signal */
    const plot=await page.evaluate(()=>{const r=document.getElementById('signal-chart').getBoundingClientRect(),L=chartState.layout;return {x:r.left+L.left+L.plotW*.42,y:r.top+L.top+20};});
    await page.mouse.move(plot.x,plot.y);
    const tip=await page.locator('#chart-tooltip').innerText();
    assert(/Gang 1 im Getriebe\s*Aktiv/.test(tip),'Tooltip shows the state text: '+tip);

    /* Measure A/B lists the state change */
    await page.locator('.tool-modes [data-mode="measure"]').click();
    const plotArea=await page.evaluate(()=>{const r=document.getElementById('signal-chart').getBoundingClientRect(),L=chartState.layout;return {x0:r.left+L.left,w:L.plotW,y:r.top+L.top+L.plotH*.5};});
    await page.mouse.click(plotArea.x0+plotArea.w*.1,plotArea.y);
    await page.mouse.click(plotArea.x0+plotArea.w*.42,plotArea.y);
    const row=await page.locator('.measure-table tbody tr',{hasText:'Gang 1 im Getriebe'}).innerText();
    assert(/Nicht aktiv\s+Aktiv\s+geändert/.test(row),'Measure shows both states and "geändert": '+row);
    await page.keyboard.press('Escape');

    /* English */
    await page.locator('[data-lang-set="en"]').first().click();await page.waitForTimeout(150);
    await page.locator('#view-chart-btn').click();await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>t('stateUnit')),'State');
    assert.equal(await page.evaluate(()=>chartState.layout.labelHits.filter(h=>h.signal).length),5,'All five signals have a lane in English too');

    await page.screenshot({path:path.join(os.tmpdir(),'status-signals.png')});
    assert.deepEqual(errors,[],'No page errors');
    console.log(JSON.stringify({result:'PASS',curves:info.curves.length,screenshot:path.join(os.tmpdir(),'status-signals.png')}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
