/* Export with several recordings: scope switch, combined PDF report, one workbook with numbered sheets, complete support ZIP. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const files=['2026-07-16 162040.txt','2026-09-21 160628.txt'].map(name=>path.join(root,'samples',name));
if(!files.every(file=>fs.existsSync(file))){console.log(JSON.stringify({result:'SKIPPED',reason:'real recordings missing in samples/'}));process.exit(0);}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);
    await page.locator('#file-input').setInputFiles(files[0]);
    await page.waitForFunction(()=>S.files.length===1);
    await page.locator('#export-menu summary').click();
    assert.equal(await page.locator('.export-scope').isVisible(),false,'No scope switch for a single file');
    await page.locator('#export-menu summary').click();
    await page.locator('#file-add-input').setInputFiles(files[1]).catch(async()=>{await page.locator('#file-input').setInputFiles(files[1]);});
    await page.waitForFunction(()=>S.files.length===2);
    await page.locator('#export-menu summary').click();
    assert(await page.locator('.export-scope').isVisible(),'Scope switch appears with two files');
    assert.equal(await page.locator('[data-export-scope="all"]').getAttribute('aria-pressed'),'true','All files is the default');
    assert.match(await page.locator('[data-export-scope="all"]').textContent(),/\(2\)/);
    await page.locator('[data-export-scope="active"]').click();
    assert(await page.locator('#export-menu').evaluate(menu=>menu.open),'Switching scope keeps the menu open');
    assert.equal(await page.locator('[data-export-scope="active"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-export-scope="all"]').click();
    await page.locator('#export-menu summary').click();

    const result=await page.evaluate(async()=>{
      const ws=captureExportState(active());
      const single=exportPDF({file:ws.file,download:false}),combined=exportPDF({files:ws.files,download:false});
      async function pages(blob){const b=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<b.length;i+=0x8000)raw+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return (raw.match(/\/Type \/Page[^s]/g)||[]).length;}
      const xlsx=await exportAllXLSX(ws.files),wb=new ExcelJS.Workbook();await wb.xlsx.load(await xlsx.arrayBuffer());
      const zip=await exportSupportZip({file:ws.file,workspace:ws,download:false}),z=await JSZip.loadAsync(zip);
      return {singlePages:await pages(single),combinedPages:await pages(combined),sheets:wb.worksheets.map(w=>w.name),firstRows:wb.getWorksheet('Messungen').rowCount,
        zip:Object.keys(z.files).filter(name=>!name.endsWith('/')),readme:await z.file('README_Supportpaket.txt').async('string')};
    });
    assert(result.combinedPages>result.singlePages+3,'Combined report covers both recordings: '+result.combinedPages+' vs '+result.singlePages);
    assert.equal(result.sheets[0],'Messungen','Workbook starts with the recordings overview');
    assert.equal(result.firstRows,6,'Overview lists both recordings');
    for(const name of ['1 Übersicht','1 Messdaten','1 Diagramm','2 Übersicht','2 Messdaten','2 Erfassungsmarker'])assert(result.sheets.includes(name),'Sheet '+name+' in '+result.sheets.join(', '));
    assert(result.sheets.every(name=>name.length<=31),'Excel sheet names stay within 31 characters');
    assert(result.zip.some(name=>/^02_Auswertung\/00_Gesamtbericht_alle_Messungen\.pdf$/.test(name)),'ZIP has the combined report');
    assert.equal(result.zip.filter(name=>/^02_Auswertung\/0[12]_.*\.xlsx$/.test(name)).length,2,'ZIP has one workbook per recording');
    assert.equal(result.zip.filter(name=>/^03_Diagramm\/0[12]_.*\.png$/.test(name)).length>=2,true,'ZIP has a chart per recording');
    assert.equal(result.zip.filter(name=>name.startsWith('01_Originaldateien/')).length,2,'ZIP has both originals');
    assert.match(result.readme,/ALLE MESSUNGEN IM PAKET/);
    /* Closing a tab left of the active one keeps the active recording on screen */
    const closing=await page.evaluate(()=>{
      S.files.push(S.files[0]);setActive(1);const shown=active().filename;closeFile(0);
      const keep={same:active().filename===shown,idx:S.activeIdx};closeFile(S.activeIdx);
      return {...keep,left:S.files.length,idxAfter:S.activeIdx};
    });
    assert.deepEqual(closing,{same:true,idx:0,left:1,idxAfter:0},'Closing tabs keeps a sensible active file');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',pdfPages:{single:result.singlePages,combined:result.combinedPages},sheets:result.sheets.length,zip:result.zip.length,pageErrors:errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
