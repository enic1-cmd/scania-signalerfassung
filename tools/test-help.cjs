const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
new Function(fs.readFileSync(path.join(root,'assets/help.js'),'utf8'));

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:850}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/^https?:/,route=>route.abort());
    await page.goto(pathToFileURL(path.join(root,'signalerfassung-analyse-tool.html')).href);

    const dragHint=page.locator('.file-picker-hint');
    assert.equal((await dragHint.textContent()).trim(),'( oder Drag & Drop )');
    assert.doesNotMatch(await dragHint.textContent(),/&amp;/);
    await page.locator('[data-lang-set="en"]').click();
    assert.equal((await dragHint.textContent()).trim(),'( or drag & drop )');
    assert.doesNotMatch(await dragHint.textContent(),/&amp;/);
    assert.match(await page.locator('[data-help-section="files"] summary').textContent(),/Files and formats/);
    assert.match(await page.locator('[data-help-section="files"] .help-section-content').textContent(),/Load TXT/);
    assert.match(await page.locator('.help-foot').textContent(),/Help does not change measurement data/);
    await page.locator('[data-lang-set="de"]').click();
    assert.match(await page.locator('[data-help-section="files"] summary').textContent(),/Dateien und Formate/);
    assert.match(await page.locator('[data-help-section="files"] .help-section-content').textContent(),/TXT laden/);
    assert.doesNotMatch(await page.locator('[data-help-section="files"] .help-section-content').textContent(),/Load TXT/);
    assert.match(await page.locator('.help-foot').textContent(),/Die Hilfe verändert keine Messdaten/);

    const trigger=page.locator('#help-trigger');
    assert(await trigger.isVisible(),'Help trigger must be visible on upload screen');
    await trigger.click();
    assert(await page.locator('#app-help').isVisible(),'Help drawer must open');
    assert(await page.locator('[data-help-section="files"]').evaluate(node=>node.open),'Upload context must open file help');
    assert.equal(await trigger.getAttribute('aria-expanded'),'true');

    await page.locator('.help-search').fill('Excel');
    assert(await page.locator('[data-help-section="exports"]').isVisible(),'Export help must match Excel search');
    assert(await page.locator('[data-help-section="exports"]').evaluate(node=>node.open),'Search result must be expanded');
    assert.equal(await page.locator('[data-help-section="chart"]').isVisible(),false,'Unrelated help sections must be filtered');
    await page.locator('.help-search-clear').click();
    assert(await page.locator('[data-help-section="chart"]').isVisible(),'Clearing search must restore topics');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.getElementById('app-help').hidden);
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');

    await page.locator('#file-input').setInputFiles(path.join(root,'samples/Test_signalerfassung.txt'));
    await page.waitForFunction(()=>document.body.classList.contains('analysis-workspace'));
    await page.locator('#view-chart-btn').click();
    await page.waitForTimeout(200);
    await trigger.click();
    /* The section opens on the next animation frame after the drawer appears. */
    await page.waitForFunction(()=>document.querySelector('[data-help-section="chart"]').open,{},{timeout:3000}).catch(()=>{});
    assert(await page.locator('[data-help-section="chart"]').evaluate(node=>node.open),'Chart context must open chart help');

    await page.setViewportSize({width:390,height:740});
    await page.waitForTimeout(300);
    const drawer=await page.locator('.help-drawer').boundingBox();
    assert(drawer.width<=390&&drawer.x>=0,'Help drawer must fit the mobile viewport: '+JSON.stringify(drawer));
    await page.locator('.help-close').click();
    await page.waitForFunction(()=>document.getElementById('app-help').hidden);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',dragDrop:'DE/EN PASS',helpLanguageRoundTrip:'DE/EN/DE PASS',contexts:['upload','chart'],search:'PASS',keyboard:'PASS',mobile:'PASS',pageErrors:errors},null,2));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
