const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=spawn(path.join(root,'.venv/bin/python'),['scripts/admin_server.py','--port','8766'],{cwd:root,env:{...process.env,PYTHONPYCACHEPREFIX:'/tmp/running-admin-pycache'}});
 let browser;
 try{
  const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Admin server startup timeout')),10000);server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:8766\/#key=[\w-]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.once('exit',code=>{clearTimeout(timer);reject(new Error('Admin server exited '+code));});});
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8766/');assert(await page.locator('#locked').isVisible());assert(await page.locator('#workspace').isHidden());
  await page.goto(url);await page.locator('#workspace').waitFor({state:'visible'});
  assert(!page.url().includes('key='),'Launch token must be removed from address bar');
  assert.equal(await page.locator('#sync').textContent(),'同步最新数据');
  await page.locator('#language').click();assert.equal(await page.locator('#sync').textContent(),'Sync latest data');
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.reload();await page.locator('#workspace').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.route('**/api/connect/garmin',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Test: invalid Garmin key'})}));
  await page.locator('#garmin-key').fill('test-only-key');await page.locator('#garmin-form button').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('invalid Garmin key'));
  assert.equal(await page.locator('#garmin-key').inputValue(),'');
  await page.locator('#language').click();await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page overflows');
  await page.screenshot({path:'/tmp/running-admin-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: local authentication, token removal, Chinese/English persistence, form errors, mobile layout.');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(error=>{console.error(error);process.exitCode=1;});
