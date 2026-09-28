const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const temp=path.join(root,'tmp',`admin-hub-test-${process.pid}`);
const port=3419;
fs.mkdirSync(temp,{recursive:true});
const htpasswd=path.join(temp,'.htpasswd');
const usage=path.join(temp,'usage.ndjson');
const requestsFile=path.join(temp,'access-requests.json');
fs.writeFileSync(htpasswd,'david:$6$test\njulian:$6$test\n');
const now=Date.now();
const record=(days,user,event)=>JSON.stringify({at:new Date(now-days*86400000).toISOString(),user,event,page:'/signalerfassung-analyse-tool.html'});
fs.writeFileSync(usage,[record(0,'david','page_view'),record(0,'david','app_open'),record(0,'david','file_upload'),record(0,'david','pdf_export'),record(2,'julian','page_view'),record(35,'david','page_view'),record(36,'david','page_view')].join('\n')+'\n');
fs.writeFileSync(requestsFile,'[]\n');
new Function(fs.readFileSync(path.join(root,'assets','admin.js'),'utf8'));

async function waitForServer(){
  for(let attempt=0;attempt<40;attempt++){
    try{const response=await fetch(`http://127.0.0.1:${port}/health`);if(response.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Admin test server did not start');
}

(async()=>{
  const server=spawn(process.execPath,[path.join(root,'server','server.js')],{env:{...process.env,PORT:String(port),HTPASSWD_FILE:htpasswd,USAGE_FILE:usage,ACCESS_REQUEST_FILE:requestsFile,ADMIN_USERS:'david',MAIL_TRANSPORT:'json'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let browser;
  try{
    await waitForServer();
    const createRequest=await fetch(`http://127.0.0.1:${port}/api/access-requests`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-access-request'},body:JSON.stringify({name:'Max Mustermann',email:'max@example.com',language:'en'})});
    assert.equal(createRequest.status,202);
    const requestResponse=await fetch(`http://127.0.0.1:${port}/admin/api/access-requests`,{headers:{'X-Remote-User':'david'}});
    assert.equal(requestResponse.status,200);
    const requestData=await requestResponse.json();
    assert.equal(requestData.requests.length,1);
    assert.equal(requestData.requests[0].mailStatus,'sent');
    assert.equal(requestData.requests[0].confirmationMailStatus,'sent');
    assert.equal(requestData.requests[0].adminMailStatus,'sent');
    assert.equal(requestData.requests[0].language,'en');
    const statsResponse=await fetch(`http://127.0.0.1:${port}/admin/api/stats?days=30`,{headers:{'X-Remote-User':'david'}});
    assert.equal(statsResponse.status,200);
    const stats=await statsResponse.json();
    assert.equal(stats.totals.users,2);
    assert.equal(stats.totals.activeUsers,2);
    assert.equal(stats.totals.pageViews,2);
    assert.equal(stats.totals.uploads,1);
    assert.equal(stats.totals.exports,1);
    assert.equal(stats.previous.pageViews,2);
    assert.equal(stats.daily[0].date.length,10);
    assert('pageViews' in stats.daily[0]&&'exports' in stats.daily[0]);
    assert.equal(stats.recent.length,5);
    assert.equal(stats.system.retentionDays,180);
    assert.equal(stats.totals.pendingRequests,1);

    browser=await chromium.launch({headless:true,channel:'chrome'});
    const page=await browser.newPage({viewport:{width:1540,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://signalerfassung.test/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/admin/'||url.pathname==='/admin/index.html')return route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(root,'admin','index.html'))});
      if(url.pathname==='/assets/admin.css')return route.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(path.join(root,'assets','admin.css'))});
      if(url.pathname==='/assets/admin.js')return route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'assets','admin.js'))});
      if(url.pathname==='/admin/api/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({username:'david'})});
      if(url.pathname==='/admin/api/stats')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(stats)});
      if(url.pathname==='/admin/api/access-requests')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(requestData)});
      return route.abort();
    });
    await page.goto('https://signalerfassung.test/admin/');
    await page.waitForFunction(()=>document.querySelectorAll('.user-row').length===2);
    assert.equal(await page.locator('#metric-users').textContent(),'2');
    assert.equal(await page.locator('#metric-active').textContent(),'2');
    assert.equal(await page.locator('#metric-requests').textContent(),'1');
    assert.equal(await page.locator('.request-card').count(),1);
    assert.match(await page.locator('.request-meta').innerText(),/Sprache: EN/);
    assert.equal(await page.locator('.recent-item').count(),5);
    assert(await page.locator('.status-pill').isVisible());
    await page.screenshot({path:path.join(root,'tmp','admin-hub-preview.png'),fullPage:true});
    await page.locator('#user-search').fill('julian');
    assert.equal(await page.locator('.user-row').count(),1);
    assert((await page.locator('.user-row').textContent()).includes('julian'));
    await page.locator('#user-search').fill('');
    await page.locator('#chart-series').selectOption('uploads');
    assert.equal(await page.locator('.bar').count(),30);
    await page.locator('[data-approve-request]').click();
    assert(await page.locator('#approve-dialog').isVisible());
    assert.equal(await page.locator('#approve-email').textContent(),'max@example.com');
    assert((await page.locator('#approve-password').inputValue()).length>=10);
    await page.locator('[data-close-approve]').last().click();

    await page.locator('#add-user').click();
    await page.locator('#generate-password').click();
    const generated=await page.locator('#password').inputValue();
    assert.equal(generated.length,20);
    assert.equal(await page.locator('#password-confirm').inputValue(),generated);
    assert.equal(await page.locator('#strength-label').textContent(),'Sehr stark');
    await page.locator('[data-close-user]').last().click();

    const downloadPromise=page.waitForEvent('download');
    await page.locator('#export-csv').click();
    const download=await downloadPromise;
    assert(download.suggestedFilename().endsWith('.csv'));

    await page.setViewportSize({width:390,height:780});
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    assert(await page.locator('#add-user').isVisible());
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',api:{users:2,activeUsers:2,trends:'PASS',dailySeries:'PASS',accessRequests:'PASS'},ui:{requestsInbox:'PASS',approvalDialog:'PASS',search:'PASS',chartFilter:'PASS',passwordGenerator:'PASS',csv:'PASS',mobile:'PASS'},pageErrors:errors},null,2));
  }finally{
    if(browser)await browser.close();
    server.kill();
    if(path.resolve(temp).startsWith(path.join(root,'tmp')+path.sep))fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
