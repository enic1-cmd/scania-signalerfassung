/* One-step release for signalerfassung.com.
   node tools/release.cjs                 -> run tests, build tmp/release/signalerfassung-release-<stamp>.zip (no upload)
   node tools/release.cjs --deploy        -> additionally upload to the server, switch the release and verify it
   Options: --skip-tests  --allow-dirty  --host=root@strato-vps
   The server keeps the previous release; deploy-release.sh rolls back automatically if the service or health check fails. */
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const JSZip=require('../assets/vendor/jszip.min.js');

const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2);
const flag=name=>args.includes('--'+name);
const option=(name,fallback)=>{const hit=args.find(arg=>arg.startsWith('--'+name+'='));return hit?hit.slice(name.length+3):fallback;};
const host=option('host',process.env.DEPLOY_HOST||'root@strato-vps');
const now=new Date();
const stamp=now.toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);

function git(...params){return execFileSync('git',params,{cwd:root,encoding:'utf8'}).trim();}
function step(text){console.log('\n== '+text);}
function run(cmd,params,options){
  const result=spawnSync(cmd,params,Object.assign({cwd:root,stdio:'inherit',shell:false},options));
  if(result.status!==0)throw new Error(cmd+' '+params.join(' ')+' failed with exit code '+result.status);
}

/* Files that belong on the web server: pages, assets, manual images, admin UI and the admin service. */
const INCLUDE=[/^[^/]+\.html$/,/^site\.webmanifest$/,/^assets\//,/^handbuch\//,/^admin\//,/^server\/(server|mailer)\.js$/,/^server\/package(-lock)?\.json$/];
const EXCLUDE=[/^server\/test\//,/^assets\/upload-logo-original-extracted\.png$/];

(async()=>{
  const commit=git('rev-parse','--short','HEAD');
  const dirty=git('status','--porcelain');
  step('Release '+stamp+' from commit '+commit);
  if(dirty&&!flag('allow-dirty')){
    console.error('Working tree has uncommitted changes. Commit first or use --allow-dirty for a test package.\n'+dirty);
    process.exit(2);
  }
  if(!flag('skip-tests')){step('Tests');run(process.execPath,[path.join(__dirname,'run-tests.cjs')]);}

  step('Package');
  const tracked=git('ls-files','-z','--cached','--others','--exclude-standard').split('\0').filter(Boolean);
  const files=tracked.filter(file=>INCLUDE.some(re=>re.test(file))&&!EXCLUDE.some(re=>re.test(file))&&fs.existsSync(path.join(root,file)));
  const zip=new JSZip();
  let stamped=0;
  for(const file of files){
    let content=fs.readFileSync(path.join(root,file));
    if(file.endsWith('.html')){
      /* Bind every local CSS/JS reference and manual image to this release so browsers never mix old and new files. */
      const text=content.toString('utf8').replace(/((?:\.\.\/)?(?:assets|handbuch)\/[^"'?\s]+\.(?:css|js|webp))\?v=[^"'\s]+/g,(match,url)=>{stamped++;return url+'?v='+stamp;});
      content=Buffer.from(text,'utf8');
    }
    zip.file(file,content);
  }
  const modules=path.join(root,'server','node_modules');
  if(!fs.existsSync(path.join(modules,'nodemailer','package.json')))throw new Error('server/node_modules missing - run: npm --prefix server ci --omit=dev');
  (function addDir(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name),rel=path.relative(root,full).split(path.sep).join('/');
      if(entry.isDirectory())addDir(full);else zip.file(rel,fs.readFileSync(full));
    }
  })(modules);
  zip.file('RELEASE.txt','release='+stamp+'\ncommit='+commit+'\ncreated='+now.toISOString()+'\n');
  const outDir=path.join(root,'tmp','release');fs.mkdirSync(outDir,{recursive:true});
  const archive=path.join(outDir,'signalerfassung-release-'+stamp+'.zip');
  fs.writeFileSync(archive,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9}}));
  console.log(files.length+' files, '+stamped+' asset references stamped, '+(fs.statSync(archive).size/1048576).toFixed(1)+' MB');
  console.log(archive);

  if(!flag('deploy')){console.log('\nPackage only. Deploy with: node tools/release.cjs --deploy');return;}

  step('Upload to '+host);
  const extras=['deploy/signalerfassung.com.nginx','deploy/signalerfassung-log-format.conf','deploy/signalerfassung-admin.service','deploy/deploy-release.sh','deploy/verify-release.sh'];
  /* Windows checkouts may contain CRLF; the server needs LF for bash, nginx and systemd files. */
  const staged=extras.map(file=>{const target=path.join(outDir,path.basename(file));fs.writeFileSync(target,fs.readFileSync(path.join(root,file),'utf8').split(String.fromCharCode(13)).join(''));return target;});
  run('scp',['-q',archive,host+':/tmp/signalerfassung-release-'+stamp+'.zip']);
  run('scp',['-q',...staged,host+':/tmp/']);
  step('Switch release and verify');
  run('ssh',[host,'bash /tmp/deploy-release.sh '+stamp+' && bash /tmp/verify-release.sh && rm -f /tmp/signalerfassung-release-'+stamp+'.zip']);
  console.log('\nLive: release '+stamp+' (commit '+commit+'). Log it in Projekt-Master (log_deployment).');
})().catch(error=>{console.error('\nRelease failed: '+error.message);process.exit(1);});
