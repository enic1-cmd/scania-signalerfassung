/* Runs the server tests and every browser test in sequence. Real recordings are read from samples/ (gitignored). */
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const samples=path.join(root,'samples');
const browserTests=[
  'test-pan-export','test-annotations','test-toolbox','test-chart-height','test-workspace-layout','test-help',
  'test-export-report','test-export-multi','test-access-request','test-admin-hub','test-public-legal','test-landing-language-layout','test-email-localization'
];
const runs=[{name:'server',cmd:process.execPath,args:['--test'],cwd:path.join(root,'server')}];
browserTests.forEach(name=>{
  const file=path.join(__dirname,name+'.cjs');
  if(fs.existsSync(file))runs.push({name,cmd:process.execPath,args:[file],cwd:root});
});
if(fs.existsSync(path.join(samples,'Test_signalerfassung.txt'))){
  runs.push({name:'test-real-recordings',cmd:process.execPath,args:[path.join(__dirname,'test-real-recordings.cjs'),samples],cwd:root});
}else{
  console.warn('samples/Test_signalerfassung.txt fehlt - Tests mit echten Messdateien werden uebersprungen.');
}

const only=process.argv.slice(2);
let failed=0;
for(const run of runs){
  if(only.length&&!only.some(name=>run.name.includes(name)))continue;
  const started=Date.now();
  const result=spawnSync(run.cmd,run.args,{cwd:run.cwd,encoding:'utf8',timeout:600000});
  const ok=result.status===0;
  if(!ok)failed++;
  console.log(`${ok?'PASS':'FAIL'}  ${run.name}  (${((Date.now()-started)/1000).toFixed(1)} s)`);
  if(!ok)console.log(((result.stdout||'')+(result.stderr||'')).split('\n').slice(-40).join('\n'));
}
console.log(failed?`${failed} Test(s) fehlgeschlagen.`:'Alle Tests bestanden.');
process.exit(failed?1:0);
