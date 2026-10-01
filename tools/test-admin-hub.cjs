/* Admin Hub end to end: real admin service with temporary data behind the local proxy (like nginx). */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const {createLocalServer}=require('./serve-local.cjs');

const root=path.resolve(__dirname,'..');
const temp=path.join(root,'tmp',`admin-hub-test-${process.pid}`);
const apiPort=3419,webPort=3418,secret='admin-hub-test-secret';
fs.mkdirSync(temp,{recursive:true});
const file=name=>path.join(temp,name);
fs.writeFileSync(file('.htpasswd'),'david:$6$test\njulian:$6$test\n');
const now=Date.now();
const record=(days,user,event)=>JSON.stringify({at:new Date(now-days*86400000).toISOString(),user,event,page:'/signalerfassung-analyse-tool.html'});
fs.writeFileSync(file('usage.ndjson'),[record(0,'david','page_view'),record(0,'david','app_open'),record(0,'david','file_upload'),record(0,'david','pdf_export'),record(2,'julian','page_view'),record(35,'david','page_view'),record(36,'david','page_view')].join('\n')+'\n');
fs.writeFileSync(file('access-requests.json'),'[]\n');
const opensslWin=['C:/Program Files/Git/usr/bin/openssl.exe','C:/Program Files/Git/mingw64/bin/openssl.exe'].find(f=>process.platform==='win32'&&fs.existsSync(f));
const adminHeaders={'X-Remote-User':'david','X-Admin-Proxy':secret,'X-Requested-With':'signalerfassung-admin','Content-Type':'application/json'};
const api=(p,options={})=>fetch(`http://127.0.0.1:${apiPort}${p}`,{...options,headers:{...adminHeaders,...(options.headers||{})}}).then(async r=>({status:r.status,body:await r.json().catch(()=>({}))}));

async function waitForServer(){
  for(let attempt=0;attempt<50;attempt++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw new Error('Admin test server did not start');
}

(async()=>{
  const server=spawn(process.execPath,[path.join(root,'server','server.js')],{env:{...process.env,PORT:String(apiPort),HTPASSWD_FILE:file('.htpasswd'),USAGE_FILE:file('usage.ndjson'),ACCESS_REQUEST_FILE:file('access-requests.json'),FEEDBACK_STATS_FILE:file('feedback-stats.ndjson'),ADMIN_USERS:'david',ADMIN_PROXY_SECRET:secret,MAIL_TRANSPORT:'json',...(opensslWin?{OPENSSL_BIN:opensslWin}:{})},stdio:['ignore','pipe','pipe'],windowsHide:true});
  const web=createLocalServer({backend:{port:apiPort,user:'david',secret}}).listen(webPort,'127.0.0.1');
  let browser;
  try{
    await waitForServer();
    /* Public endpoints: access request and feedback form with e-mail */
    const created=await fetch(`http://127.0.0.1:${apiPort}/api/access-requests`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-access-request'},body:JSON.stringify({name:'Max Mustermann',email:'max@example.com',language:'en'})});
    assert.equal(created.status,202);
    const fb=await fetch(`http://127.0.0.1:${apiPort}/api/feedback`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-feedback'},body:JSON.stringify({language:'de',name:'Stefan Herrmann',workshop:'Musterstadt',email:'stefan@example.com',testDate:'2026-09-30',report:'Kurven übereinanderlegen wäre toll.',attachments:[]})});
    assert.equal(fb.status,202);
    await fetch(`http://127.0.0.1:${apiPort}/api/feedback`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-feedback'},body:JSON.stringify({language:'de',anonymous:true,name:'Geheim',email:'geheim@example.com',report:'Anonymer Hinweis.',attachments:[]})});
    const feedback=(await api('/admin/api/feedback')).body.feedback;
    assert.equal(feedback.length,2);
    const anon=feedback.find(f=>f.anonymous);
    assert.equal(anon.email,'','Anonymous feedback never keeps an e-mail address');assert.equal(anon.name,'');
    assert.equal((await api('/admin/api/session',{headers:{'X-Admin-Proxy':'wrong'}})).status,403,'Admin API requires the proxy secret');
    const stats=(await api('/admin/api/stats?days=30')).body;
    assert.equal(stats.totals.users,2);assert.equal(stats.totals.pageViews,2);assert.equal(stats.totals.uploads,1);assert.equal(stats.totals.pendingRequests,1);
    assert.equal(stats.totals.newFeedback,2);assert.equal(stats.heatmap.length,7);assert.deepEqual(stats.exportsByType,{pdf:1,excel:0});
    const result={api:'PASS'};

    browser=await chromium.launch({headless:true,channel:'chrome'});
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${webPort}/admin/`);
    await page.waitForFunction(()=>document.getElementById('kpi-requests').textContent==='1');
    assert.equal(await page.locator('#tab-count-feedback').textContent(),'2');

    /* Approve with expiry */
    await page.locator('[data-tab="requests"]').click();
    await page.locator('[data-approve]').click();
    await page.locator('#approve-username').fill('max.mustermann');
    await page.locator('#approve-expiry').fill('2030-12-31');
    await page.locator('#approve-submit').click();
    await page.waitForFunction(()=>document.getElementById('kpi-requests').textContent==='0');
    assert.match(fs.readFileSync(file('.htpasswd'),'utf8'),/^max\.mustermann:\$6\$/m);
    const account=JSON.parse(fs.readFileSync(file('accounts.json'),'utf8'))['max.mustermann'];
    assert.equal(account.email,'max@example.com');assert.equal(account.expiresAt.slice(0,10),'2030-12-31');
    result.approve='PASS';

    /* Users list shows name and e-mail; drawer blocks, unblocks and expires */
    await page.locator('[data-tab="users"]').click();
    const row=page.locator('#user-table [data-user="max.mustermann"]');
    assert.match(await row.textContent(),/Max Mustermann[\s\S]*max@example\.com[\s\S]*bis 31\.12\.2030/);
    await row.click();await page.waitForSelector('[data-drawer-block]');
    await page.locator('[data-drawer-block]').click();await page.locator('#confirm-reason').fill('Test');await page.locator('#confirm-ok').click();
    await page.waitForSelector('[data-drawer-unblock]');
    assert.doesNotMatch(fs.readFileSync(file('.htpasswd'),'utf8'),/^max\.mustermann:/m,'Blocked accounts leave .htpasswd');
    await page.locator('[data-drawer-unblock]').click();await page.waitForSelector('[data-drawer-block]');
    assert.match(fs.readFileSync(file('.htpasswd'),'utf8'),/^max\.mustermann:/m,'Unblocking restores the login');
    await page.locator('#profile-expiry').fill('2020-01-01');await page.locator('[data-profile-save]').click();
    await page.waitForFunction(()=>document.querySelector('.drawer-actions .badge')?.textContent==='Abgelaufen');
    assert.doesNotMatch(fs.readFileSync(file('.htpasswd'),'utf8'),/^max\.mustermann:/m,'Past expiry disables the login');
    await page.locator('#profile-expiry').fill('');await page.locator('[data-profile-save]').click();
    await page.waitForFunction(()=>document.querySelector('.drawer-actions .badge')?.textContent==='Aktiv');
    await page.locator('#profile-name').fill('Max M. Mustermann');await page.locator('[data-profile-save]').click();
    await page.waitForFunction(()=>document.getElementById('drawer-title')?.textContent==='Max M. Mustermann');
    /* Password change with mail */
    await page.locator('[data-drawer-password]').click();
    await page.locator('#generate-password').click();
    assert.equal(await page.locator('#send-mail').isDisabled(),false,'Mail option available when an e-mail is known');
    await page.locator('#send-mail').check();await page.locator('#save-user').click();
    await page.waitForFunction(()=>!document.getElementById('user-dialog').open);
    await page.locator('[data-drawer-close]').click();
    result.accounts='PASS';

    /* Admin account cannot be blocked */
    await page.locator('#user-table [data-user="david"]').click();await page.waitForSelector('[data-drawer-password]');
    assert.equal(await page.locator('[data-drawer-block]').count(),0);assert.equal(await page.locator('[data-drawer-delete]').count(),0);
    await page.locator('[data-drawer-close]').click();

    /* Create user with welcome mail */
    await page.locator('#add-user').click();
    await page.locator('#username').fill('werkstatt.sued');await page.locator('#create-name').fill('Werkstatt Süd');await page.locator('#create-email').fill('sued@example.com');
    await page.locator('#generate-password').click();await page.locator('#send-mail').check();await page.locator('#save-user').click();
    await page.waitForSelector('#user-table [data-user="werkstatt.sued"]');
    result.createUser='PASS';

    /* Feedback: read, reply with preview, anonymous cannot be answered */
    await page.locator('[data-tab="feedback"]').click();
    await page.locator('.feedback-item',{hasText:'Stefan Herrmann'}).click();
    await page.locator('[data-reply]').click();
    await page.waitForFunction(()=>document.getElementById('reply-preview').srcdoc.includes('Danke'));
    assert.match(await page.locator('#reply-preview').getAttribute('srcdoc'),/assets\/signalerfassung-wordmark\.png/,'Preview shows the mail design with logo');
    await page.locator('#reply-subject').fill('Danke für dein Feedback, Stefan');
    await page.locator('#reply-send').click();
    await page.waitForFunction(()=>!document.getElementById('reply-dialog').open);
    const replied=(await api('/admin/api/feedback')).body.feedback.find(f=>f.email==='stefan@example.com');
    assert.equal(replied.status,'done');assert.equal(replied.replies[0].subject,'Danke für dein Feedback, Stefan');
    await page.locator('[data-feedback-filter="all"]').click();
    await page.locator('.feedback-item',{hasText:'Anonymes Feedback'}).click();
    assert.equal(await page.locator('[data-reply]').isDisabled(),true,'Anonymous feedback cannot be answered');
    assert.equal((await api(`/admin/api/feedback/${anon.id}/reply`,{method:'POST',body:JSON.stringify({subject:'Hallo',message:'Test'})})).status,400);
    result.feedbackReply='PASS';

    /* Log lists the admin actions */
    await page.locator('[data-tab="log"]').click();
    const log=await page.locator('#audit-list').textContent();
    for(const label of ['Zugang freigegeben','Zugang gesperrt','Zugang entsperrt','Passwort geändert','Benutzer angelegt','Feedback beantwortet'])assert(log.includes(label),'Audit shows '+label);
    result.audit='PASS';

    /* CSV */
    await page.locator('[data-tab="users"]').click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-csv').click()]);
    const csv=fs.readFileSync(await download.path(),'utf8');
    assert.match(csv,/"max\.mustermann";"Max M\. Mustermann";"max@example\.com";"aktiv"/);
    result.csv='PASS';
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',...result,pageErrors:errors},null,2));
  }finally{
    if(browser)await browser.close();
    web.close();server.kill();
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
