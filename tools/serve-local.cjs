/* Local preview server: serves the repository like nginx would, without login.
   Usage: node tools/serve-local.cjs [port]   ->   http://localhost:8080/signalerfassung-analyse-tool.html
   With an admin demo backend (see tools/admin-demo.cjs) /api/ and /admin/api/ are forwarded to it,
   including the proxy headers nginx would add after Basic Auth. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const types={
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf','.woff2':'font/woff2'
};
// Never serve repository internals, server code or local measurement data.
const blocked=/^\/(?:\.git|node_modules|server|deploy|tools|tmp|output|samples|Ideen und fixes)(?:\/|$)/i;

function forward(req,res,backend){
  const headers=Object.assign({},req.headers,{host:'127.0.0.1:'+backend.port});
  if(req.url.startsWith('/admin/api/')){headers['x-remote-user']=backend.user;headers['x-admin-proxy']=backend.secret;}
  const upstream=http.request({host:'127.0.0.1',port:backend.port,method:req.method,path:req.url,headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"Admin-Demo-Server nicht erreichbar"}');});
  req.pipe(upstream);
}

function createLocalServer(options){
  options=options||{};
  return http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    let pathname=decodeURIComponent(url.pathname);
    if(pathname.startsWith('/api/')||pathname.startsWith('/admin/api/')){
      if(options.backend){forward(req,res,options.backend);return;}
      // Usage tracking and other APIs are not available locally; answer quietly.
      res.writeHead(pathname==='/api/usage'?204:503,{'Cache-Control':'no-store'});res.end();return;
    }
    if(!pathname.endsWith('/')&&!path.extname(pathname)&&fs.existsSync(path.join(root,pathname,'index.html'))){
      res.writeHead(301,{Location:pathname+'/'+url.search});res.end();return;
    }
    if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.join(root,pathname);
    if(blocked.test(pathname)||!file.startsWith(root+path.sep)){res.writeHead(404);res.end('Not found');return;}
    fs.readFile(file,(error,data)=>{
      if(error){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    });
  });
}

if(require.main===module){
  const port=Number(process.argv[2]||process.env.PORT||8080);
  createLocalServer().listen(port,'127.0.0.1',()=>{
    console.log(`Signalerfassung lokal: http://localhost:${port}/signalerfassung-analyse-tool.html`);
  });
}
module.exports={createLocalServer};
