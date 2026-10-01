/* Export report: PDF contains chart images with correct aspect ratio, Excel has chart/capture/notes sheets, ZIP has wide PNGs. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const sample=path.join(root,'samples','Test_signalerfassung.txt');
if(!fs.existsSync(sample)){console.log(JSON.stringify({result:'SKIPPED',reason:'samples/Test_signalerfassung.txt missing'}));process.exit(0);}

function withCaptureMarkers(text){
  /* Inject a cumulative marker counter (button pressed three times) into the real SDP3 recording. */
  const lines=text.split(/\r?\n/),ids=lines[0].split('\t'),index=ids.indexOf('Marker');
  let row=0;
  return lines.map((line,i)=>{
    if(i<4||!/^\d{2}:\d{2}/.test(line))return line;
    const parts=line.split('\t');row++;
    parts[index]=String(row>4800?3:row>3000?2:row>1200?1:0);
    return parts.join('\t');
  }).join('\r\n');
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);
    await page.locator('#file-input').setInputFiles({name:'Test_signalerfassung.txt',mimeType:'text/plain',buffer:Buffer.from(withCaptureMarkers(fs.readFileSync(sample,'utf8')))});
    await page.waitForFunction(()=>S.files.length===1);
    await page.locator('#view-chart-btn').click();await page.waitForTimeout(150);
    const result=await page.evaluate(async()=>{
      const A=active(),n=A.rawRows.length;
      A.rawRows[1500].marked=true;A.rawRows[1500].markerColor='#e4002b';A.rawRows[1500].markerWidth=3;A.rawRows[1500].note='Spannungseinbruch';
      A.ranges=[{id:'x',start:3500,end:3700,color:'#ffe08a',note:'Lastwechsel'}];
      chartState.start=.2;chartState.end=.5;renderChart();
      const ws=captureExportState(A),file=ws.file;
      const pdf=exportPDF({file,download:false});
      const bytes=new Uint8Array(await pdf.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
      const images=[...raw.matchAll(/\/Subtype \/Image[\s\S]{0,200}?\/Width (\d+)[\s\S]{0,80}?\/Height (\d+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
      const pages=(raw.match(/\/Type \/Page[^s]/g)||[]).length;
      const xlsx=await exportStyledXLSX(file,file.rawRows,file.filtered,visibleSignals(file),'16:55:59','17:07:47',{download:false});
      const wb=new ExcelJS.Workbook();await wb.xlsx.load(await xlsx.arrayBuffer());
      const sheets=wb.worksheets.map(w=>w.name);
      const chartSheet=wb.getWorksheet('Diagramm'),captureSheet=wb.getWorksheet('Erfassungsmarker'),dataSheet=wb.getWorksheet('Messdaten'),signalSheet=wb.getWorksheet('Signale');
      const dataHeader=dataSheet.getRow(4).values,lastHeader=dataHeader[dataHeader.length-1];
      const markerRow=file.filtered.findIndex(r=>r.rowId===1500)+5;
      const zip=await exportSupportZip({file,workspace:ws,download:false});
      const z=await JSZip.loadAsync(zip),pngs=Object.keys(z.files).filter(name=>name.endsWith('.png'));
      const pngSizes=[];
      for(const name of pngs){const b=await z.file(name).async('uint8array');const dv=new DataView(b.buffer);pngSizes.push([dv.getUint32(16),dv.getUint32(20)]);}
      const chartPages=Math.ceil(chartLanes(file,chartSelection(file).signals).length/10);
      const brandHits=[];wb.worksheets.forEach(ws=>ws.eachRow(row=>row.eachCell(cell=>{if(/scania|breuer/i.test(String(cell.value||'')))brandHits.push(ws.name+'!'+cell.address);})));
      const overview=wb.getWorksheet('Übersicht'),alignments=['B11','E9','E11'].map(a=>overview.getCell(a).alignment&&overview.getCell(a).alignment.horizontal);
      const creator=wb.creator;
      return {brandHits,alignments,creator,pdfSize:pdf.size,images,pages,chartPages,sheets,chartImages:chartSheet.getImages().length,captureRows:captureSheet.rowCount,
        captureFirst:captureSheet.getRow(5).getCell(1).value,signalStatsHeader:signalSheet.getRow(4).getCell(9).value,
        lastHeader,markerRef:dataSheet.getRow(markerRow).getCell(dataHeader.length-1).value,pngs,pngSizes};
    });
    assert(result.pdfSize>50000,'PDF has content');
    assert(result.images.length>=5,'PDF contains chart images (overview, zoom, details, capture markers): '+result.images.length);
    const ratio=result.images[0][0]/result.images[0][1],expected=(297-24)/(210-35-21);
    assert(Math.abs(ratio-expected)<.02,'Overview chart keeps the page aspect ratio (not squeezed): '+ratio.toFixed(3)+' vs '+expected.toFixed(3));
    assert(result.pages>=8&&result.pages<=30,'Reasonable page count: '+result.pages);
    for(const name of ['Übersicht','Signale','Messdaten','Markierungen','Diagramm','Erfassungsmarker','Notizen und Zeitbereiche'])assert(result.sheets.includes(name),'Excel sheet '+name);
    assert.equal(result.chartImages,1,'Excel chart sheet has the chart image');
    assert.equal(result.captureRows,7,'Capture marker sheet: 4 header rows + 3 presses');
    assert.equal(result.captureFirst,1);
    assert.equal(result.signalStatsHeader,'Mittelwert');
    assert.equal(result.lastHeader,'Markierung / Notiz');
    assert.match(String(result.markerRef),/^A: Spannungseinbruch/);
    assert.equal(result.pngs.length,2,'ZIP contains full chart and zoomed view');
    assert(result.pngSizes.every(([w,h])=>w===3840&&h>=2160),'ZIP charts are full HD width and grow with the number of lanes: '+JSON.stringify(result.pngSizes));
    assert(result.chartPages>=2,'Many curves are split over several chart pages: '+result.chartPages);
    assert.deepEqual(result.brandHits,[],'No third-party brand names in the Excel export');
    assert(!/scania|breuer/i.test(result.creator),'Workbook creator is neutral');
    assert.deepEqual(result.alignments,['left','left','left'],'Overview values are left aligned');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',pdf:{bytes:result.pdfSize,pages:result.pages,images:result.images.length},excel:result.sheets,zipCharts:result.pngSizes,pageErrors:errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
