const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const output=path.join(root,'output','email-previews');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:1});
    for(const [html,png] of [['01-anfrage-bestaetigt.html','01-anfrage-bestaetigt.png'],['02-neue-zugangsanfrage-admin.html','02-neue-zugangsanfrage-admin.png'],['03-zugang-freigeschaltet.html','03-zugang-freigeschaltet.png'],['04-request-confirmed-en.html','04-request-confirmed-en.png'],['05-neue-zugangsanfrage-admin-en-kunde.html','05-neue-zugangsanfrage-admin-en-kunde.png'],['06-access-approved-en.html','06-access-approved-en.png']]){
      await page.goto(pathToFileURL(path.join(output,html)).href);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(output,png),fullPage:true});
    }
  }finally{await browser.close();}
  console.log('E-Mail-Vorschauen gerendert.');
})().catch(error=>{console.error(error);process.exitCode=1;});
