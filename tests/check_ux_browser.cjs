const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 fs.mkdirSync('/tmp/running-ux-review',{recursive:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://review.local/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/training-plan')return route.fulfill({status:401,json:{error:'Sign in as owner to save and sync across devices.'}});
  if(url.pathname==='/api/training-source')return route.fulfill({body:fs.readFileSync(path.join(__dirname,'../dashboard/training-source.md')),contentType:'text/markdown',headers:{'X-Training-Source':'published'}});
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=path.join(path.join(__dirname,'../dashboard'),name);
  if(!fs.existsSync(file)) return route.fulfill({status:404,body:'Not found'});
  const ext=path.extname(file);return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[ext]||'text/plain'});
 });
 await page.setViewportSize({width:390,height:844});
 page.setDefaultTimeout(8000);
 assert.deepEqual(errors,[]);
 await page.goto('http://review.local/?tab=plan',{waitUntil:'networkidle'});
 assert(await page.locator('#plan-today-panel').isVisible());
 assert.match(await page.locator('#plan-today-panel').innerText(),/activity data not current|活动数据尚未更新/);
 assert.equal(await page.locator('#plan-today-panel progress').count(),0);
 console.log('Checking month');await page.locator('#plan-month-view').click();
 await page.locator('.month-pick[aria-label="2026-10-31"]').click();
 assert(await page.locator('#plan-today-panel .plan-day').isVisible());
 await page.locator('#plan-today-panel .workout-card').first().click();
 assert(await page.locator('#plan-destination-date').isVisible());
 console.log('Checking editor');await page.locator('#plan-cancel').click();
 await page.locator('.app-global [data-language="en"]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await page.goto('http://review.local/?tab=data',{waitUntil:'networkidle'});
 await page.locator('#filter-toggle').click();
 console.log('Checking treadmill');await page.locator('#setting').selectOption('treadmill');
 assert.match(await page.locator('#volume').innerText(),/Treadmill duration/);
 assert.equal(await page.locator('#scatter circle').count(),0);
 assert(await page.locator('.app-global [data-language="en"]').isVisible());
 console.log('PASS: phone day selection, stale progress, date picker, shared language controls and reliable treadmill summaries');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
