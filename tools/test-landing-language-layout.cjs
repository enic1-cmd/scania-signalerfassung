const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const viewports=[
  {width:1816,height:900},
  {width:1210,height:760},
  {width:1024,height:900},
  {width:980,height:900},
  {width:768,height:900},
  {width:640,height:844},
  {width:390,height:844}
];

function near(a,b,label){
  assert(Math.abs(a-b)<.1,`${label}: ${a} !== ${b}`);
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const results=[];
  try{
    for(const viewport of viewports){
      const page=await browser.newPage({viewport});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto(pathToFileURL(path.join(root,'index.html')).href);
      const states={};
      for(const lang of ['de','en']){
        await page.evaluate(value=>applyPageLanguage(value),lang);
        states[lang]=await page.evaluate(()=>{
          const box=selector=>{
            const rect=document.querySelector(selector).getBoundingClientRect();
            return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom};
          };
          const heroStyle=getComputedStyle(document.querySelector('.hero'));
          return {
            hero:box('.hero'),grid:box('.hero-grid'),copy:box('.hero-grid>.reveal'),card:box('.app-card'),
            heading:box('.hero h1'),lead:box('.hero .lead'),actions:box('.hero-actions'),proof:box('.hero-proof'),
            backgroundSize:heroStyle.backgroundSize,backgroundPosition:heroStyle.backgroundPosition,
            overflow:document.documentElement.scrollWidth-window.innerWidth
          };
        });
      }
      for(const section of ['hero','grid','copy','card','heading','lead','actions','proof']){
        for(const value of ['x','y','width','height','bottom'])near(states.de[section][value],states.en[section][value],`${viewport.width}px ${section}.${value}`);
      }
      assert.equal(states.de.backgroundSize,states.en.backgroundSize);
      assert.equal(states.de.backgroundPosition,states.en.backgroundPosition);
      assert(states.de.overflow<=0&&states.en.overflow<=0,`${viewport.width}px must not overflow horizontally`);
      assert.deepEqual(errors,[],`${viewport.width}px page errors`);
      results.push({width:viewport.width,heroHeight:states.de.hero.height,card:states.de.card});
      await page.close();
    }
    console.log(JSON.stringify({result:'PASS',viewports:results},null,2));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
