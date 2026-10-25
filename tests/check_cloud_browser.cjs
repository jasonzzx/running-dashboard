const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:3100/admin');await page.getByRole('button',{name:'发送登录验证码'}).waitFor();
  assert(await page.getByText('jasonzzx@gmail.com',{exact:false}).isVisible());
  await page.getByRole('button',{name:'English',exact:true}).click();assert(await page.getByRole('button',{name:'Send sign-in code'}).isVisible());
  await page.reload();await page.getByRole('button',{name:'Send sign-in code'}).waitFor();
  assert.equal((await page.request.get('http://localhost:3100/api/admin')).status(),401);
  assert.equal((await page.request.post('http://localhost:3100/api/admin',{headers:{origin:'https://attacker.test'},data:{action:'sync'}})).status(),403);
  assert.equal((await page.request.post('http://localhost:3100/api/auth/email-otp/send-verification-otp',{data:{email:'someone@example.com',type:'sign-in'}})).status(),403);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/running-cloud-login.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS: bilingual login, preference persistence, owner restriction, unauthorized API denial, mobile layout. No emails sent.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
