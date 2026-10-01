/* Local Admin Hub demo with invented data: no real users, no real e-mails (MAIL_TRANSPORT=json).
   Usage: node tools/admin-demo.cjs [port]   ->   http://localhost:8090/admin/
   Data lives in tmp/admin-demo-<port>/ and is recreated on every start. */
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createLocalServer}=require('./serve-local.cjs');

const root=path.resolve(__dirname,'..');
const port=Number(process.argv[2]||process.env.PORT||8090);
const apiPort=port+1;
const dir=path.join(root,'tmp','admin-demo-'+port);
const secret='admin-demo-secret';
fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});

/* Deterministic pseudo random numbers so the demo looks the same on every start. */
let seed=20261001;
function random(){seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;}
const DAY=86400000,now=Date.now();

const users=[
  {name:'david',weight:1.6},{name:'julian.koch',weight:1.2},{name:'werkstatt.nord',weight:1},{name:'m.schmidt',weight:.7},
  {name:'s.herrmann',weight:.9},{name:'t.weber',weight:.35},{name:'a.yilmaz',weight:.2},{name:'service.sued',weight:0}
];
/* m.schmidt is blocked and service.sued has expired: both live in accounts.json instead of .htpasswd, like on the server. */
const disabled=new Set(['m.schmidt','service.sued']);
fs.writeFileSync(path.join(dir,'.htpasswd'),users.filter(user=>!disabled.has(user.name)).map(user=>user.name+':$6$demo$notarealhash').join('\n')+'\n');

const usage=[];
for(let day=120;day>=0;day--){
  users.forEach(user=>{
    if(!user.weight||random()>.42*user.weight)return;
    const sessions=1+Math.floor(random()*2*user.weight);
    for(let s=0;s<sessions;s++){
      const base=now-day*DAY-Math.floor(random()*9*3600000)-3600000*7;
      const push=(offsetMin,event)=>usage.push({at:new Date(base+offsetMin*60000).toISOString(),user:user.name,event,page:'/signalerfassung-analyse-tool.html'});
      push(0,'page_view');push(0.2,'app_open');
      const files=Math.floor(random()*3);for(let f=0;f<files;f++)push(1+f*7,'file_upload');
      if(files&&random()>.45)push(12,random()>.5?'pdf_export':'excel_export');
    }
  });
}
usage.sort((a,b)=>a.at.localeCompare(b.at));
fs.writeFileSync(path.join(dir,'usage.ndjson'),usage.map(entry=>JSON.stringify(entry)).join('\n')+'\n');

const iso=days=>new Date(now-days*DAY).toISOString();
const requests=[
  {name:'Lukas Brandt',email:'l.brandt@example.com',language:'de',status:'pending',days:.2},
  {name:'Emma Johansson',email:'emma.johansson@example.com',language:'en',status:'pending',days:1.4},
  {name:'Kevin Lorenz',email:'k.lorenz@example.com',language:'de',status:'pending',days:3,confirmationMailStatus:'failed',lastError:'Zustellung fehlgeschlagen (Demo)'},
  {name:'Stefan Herrmann',email:'s.herrmann@example.com',language:'de',status:'approved',days:20,username:'s.herrmann'},
  {name:'Tobias Weber',email:'t.weber@example.com',language:'de',status:'approved',days:41,username:'t.weber'},
  {name:'Ayse Yilmaz',email:'a.yilmaz@example.com',language:'en',status:'approved',days:63,username:'a.yilmaz'},
  {name:'Test Bot',email:'bot@example.com',language:'de',status:'rejected',days:12}
].map((item,index)=>({
  id:'demo-request-'+(index+1),name:item.name,email:item.email,language:item.language,status:item.status,createdAt:iso(item.days),updatedAt:iso(Math.max(0,item.days-.5)),
  username:item.username||undefined,mailStatus:'sent',adminMailStatus:'sent',confirmationMailStatus:item.confirmationMailStatus||'sent',lastError:item.lastError||null
}));
fs.writeFileSync(path.join(dir,'access-requests.json'),JSON.stringify(requests,null,2));
const future=days=>new Date(now+days*DAY).toISOString();
const accounts={
  'david':{name:'David Breuer',email:'david.breuer@example.com',language:'de',source:'manual',createdAt:iso(140)},
  'julian.koch':{name:'Julian Koch',email:'julian.koch@example.com',language:'de',source:'manual',createdAt:iso(110)},
  'm.schmidt':{name:'Markus Schmidt',email:'m.schmidt@example.com',language:'de',source:'manual',createdAt:iso(95),status:'blocked',disabledHash:'$6$demo$notarealhash',blockedAt:iso(4),blockedBy:'david',blockReason:'Werkstattwechsel'},
  's.herrmann':{name:'Stefan Herrmann',email:'s.herrmann@example.com',language:'de',source:'request',requestId:'demo-request-4',createdAt:iso(20),expiresAt:future(45)},
  't.weber':{name:'Tobias Weber',email:'t.weber@example.com',language:'de',source:'request',requestId:'demo-request-5',createdAt:iso(41)},
  'a.yilmaz':{name:'Ayse Yilmaz',email:'a.yilmaz@example.com',language:'en',source:'request',requestId:'demo-request-6',createdAt:iso(63),expiresAt:future(9)},
  'service.sued':{name:'Service S\u00fcd',email:'service.sued@example.com',language:'de',source:'manual',createdAt:iso(80),expiresAt:iso(6),status:'expired',disabledHash:'$6$demo$notarealhash',blockedAt:iso(6),blockedBy:'system'}
};
fs.writeFileSync(path.join(dir,'accounts.json'),JSON.stringify(accounts,null,2));
const report=(name,points)=>['MONTEUR-FEEDBACK SIGNALERFASSUNG','','Gesamteindruck',...points.map(point=>'- '+point),'','Bewertung: '+name].join('\n');
const feedback=[
  {name:'Stefan Herrmann',email:'s.herrmann@example.com',workshop:'Werkstatt Musterstadt',role:'Kfz-Mechatroniker, 12 Jahre Diagnose',days:.6,status:'new',attachments:[{filename:'Screenshot-Diagramm.png',size:184220}],points:['Kurven \u00fcbereinanderlegen fehlt mir f\u00fcr Vergleiche von Drehzahlen.','Die Erfassungsmarker sind super, aber im Diagramm schwer zu finden.','Export als PDF w\u00fcrde ich so an den Support schicken.']},
  {name:'Ayse Yilmaz',email:'a.yilmaz@example.com',workshop:'Service Center Nord',role:'Service technician',days:2.3,status:'read',language:'en',attachments:[],points:['Easy to load the files, the table is fast.','I would like a darker marker colour.']},
  {name:'',email:'',workshop:'',role:'',anonymous:true,days:5,status:'new',attachments:[{filename:'messung.txt',size:91230}],points:['Auf dem Laptop ist die Werkzeugleiste etwas eng.','Sonst sehr hilfreich im Alltag.']},
  {name:'Tobias Weber',email:'t.weber@example.com',workshop:'Nutzfahrzeuge S\u00fcd',role:'Meister',days:18,status:'done',attachments:[],points:['Bitte Zeitraum-Markierungen farbig im Excel kennzeichnen.'],replies:[{at:iso(17),subject:'Danke f\u00fcr dein Feedback'}]}
].map((item,index)=>({id:'demo-feedback-'+(index+1),receivedAt:iso(item.days),language:item.language||'de',anonymous:!!item.anonymous,name:item.name,email:item.email,workshop:item.workshop,role:item.role,
  testDate:iso(item.days+1).slice(0,10),report:report(item.name||'anonym',item.points),attachments:item.attachments,mailOk:true,status:item.status,replies:item.replies||[]}));
fs.writeFileSync(path.join(dir,'feedback.json'),JSON.stringify(feedback,null,2));
fs.writeFileSync(path.join(dir,'messages.ndjson'),[
  {id:'demo-mail-1',at:iso(17),by:'david',to:'t.weber@example.com',name:'Tobias Weber',subject:'Danke f\u00fcr dein Feedback',context:{type:'feedback',id:'demo-feedback-4'}},
  {id:'demo-mail-2',at:iso(9),by:'david',to:'s.herrmann@example.com',name:'Stefan Herrmann',subject:'Neue Funktionen im Analyse-Tool',context:{type:'user',id:'s.herrmann'}}
].map(entry=>JSON.stringify(entry)).join('\n')+'\n');
fs.writeFileSync(path.join(dir,'admin-log.ndjson'),[
  {at:iso(63),admin:'david',action:'request_approved',target:'a.yilmaz',detail:'Ayse Yilmaz <a.yilmaz@example.com>'},
  {at:iso(41),admin:'david',action:'request_approved',target:'t.weber',detail:'Tobias Weber <t.weber@example.com>'},
  {at:iso(20),admin:'david',action:'request_approved',target:'s.herrmann',detail:'Stefan Herrmann <s.herrmann@example.com>, befristet'},
  {at:iso(17),admin:'david',action:'mail_sent',target:'t.weber@example.com',detail:'Danke f\u00fcr dein Feedback'},
  {at:iso(12),admin:'david',action:'request_rejected',target:'bot@example.com',detail:'Test Bot'},
  {at:iso(9),admin:'david',action:'mail_sent',target:'s.herrmann@example.com',detail:'Neue Funktionen im Analyse-Tool'},
  {at:iso(6),admin:'system',action:'account_expired',target:'service.sued',detail:''},
  {at:iso(4),admin:'david',action:'user_blocked',target:'m.schmidt',detail:'Werkstattwechsel'}
].map(entry=>JSON.stringify(entry)).join('\n')+'\n');
fs.writeFileSync(path.join(dir,'feedback-stats.ndjson'),[3,9,15,22].map((d,i)=>JSON.stringify({at:iso(d),language:i%2?'en':'de',anonymous:i===2,attachments:i,mailOk:true})).join('\n')+'\n');

/* Password hashing needs openssl; on Windows the copy shipped with Git is used. */
function opensslEnv(){
  const candidates=['C:/Program Files/Git/usr/bin/openssl.exe','C:/Program Files/Git/mingw64/bin/openssl.exe'];
  const found=process.platform==='win32'?candidates.find(file=>fs.existsSync(file)):null;
  return found?{OPENSSL_BIN:found}:{};
}
const api=spawn(process.execPath,[path.join(root,'server','server.js')],{
  env:Object.assign({},process.env,{PORT:String(apiPort),HTPASSWD_FILE:path.join(dir,'.htpasswd'),USAGE_FILE:path.join(dir,'usage.ndjson'),
    ACCESS_REQUEST_FILE:path.join(dir,'access-requests.json'),FEEDBACK_STATS_FILE:path.join(dir,'feedback-stats.ndjson'),
    ADMIN_USERS:'david',ADMIN_PROXY_SECRET:secret,MAIL_TRANSPORT:'json'},opensslEnv()),
  stdio:['ignore','inherit','inherit'],windowsHide:true
});
process.on('exit',()=>api.kill());
['SIGINT','SIGTERM'].forEach(signal=>process.on(signal,()=>{api.kill();process.exit(0);}));
createLocalServer({backend:{port:apiPort,user:'david',secret}}).listen(port,'127.0.0.1',()=>{
  console.log(`Admin-Demo: http://localhost:${port}/admin/  (Demo-Daten in tmp/admin-demo, keine echten Mails)`);
});
