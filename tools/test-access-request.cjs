const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
new Function(fs.readFileSync(path.join(root,'assets','access-request.js'),'utf8'));

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];
    let submitted=null;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://signalerfassung.test/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/zugang-anfragen.html')return route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(root,'zugang-anfragen.html'))});
      if(url.pathname==='/assets/access-request.css')return route.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(path.join(root,'assets','access-request.css'))});
      if(url.pathname==='/assets/access-request.js')return route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'assets','access-request.js'))});
      if(url.pathname.startsWith('/assets/'))return route.fulfill({status:200,contentType:'image/png',body:Buffer.alloc(0)});
      if(url.pathname==='/api/access-requests'){
        submitted=JSON.parse(route.request().postData());
        return route.fulfill({status:202,contentType:'application/json',body:'{"ok":true}'});
      }
      return route.abort();
    });
    await page.goto('https://signalerfassung.test/zugang-anfragen.html');
    assert(await page.locator('#access-request-form').isVisible());
    assert(await page.locator('#tool-launcher').isVisible());
    const layout=await page.evaluate(()=>({
      headerHeight:document.querySelector('.nav').getBoundingClientRect().height,
      formPaddingLeft:parseFloat(getComputedStyle(document.querySelector('#access-request-form')).paddingLeft)
    }));
    assert.equal(layout.headerHeight,64);
    assert(layout.formPaddingLeft>=40);
    await page.locator('#tool-launcher summary').click();
    assert(await page.locator('#tool-launcher .tool-panel').isVisible());
    await page.locator('main').click({position:{x:10,y:10}});
    assert.equal(await page.locator('#tool-launcher').evaluate(element=>element.open),false);
    await page.locator('.language-switch summary').click();
    await page.locator('[data-lang-set="en"]').click();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await page.locator('#form-title').innerText(),'Request access');
    assert.equal(await page.locator('#submit-request span').innerText(),'Submit request');
    await page.locator('#request-name').fill('Max Mustermann');
    await page.locator('#request-email').fill('max@example.com');
    await page.locator('#submit-request').click();
    await page.locator('#request-success').waitFor({state:'visible'});
    assert.deepEqual(submitted,{name:'Max Mustermann',email:'max@example.com',website:'',language:'en'});
    assert.match(await page.locator('#request-success').innerText(),/Your request has been received/);
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:390,height:780});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    console.log(JSON.stringify({result:'PASS',header:'PASS',languageSwitch:'PASS',form:'PASS',languagePayload:'PASS',success:'PASS',mobile:'PASS',layout,pageErrors:errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
