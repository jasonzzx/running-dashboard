// Run with NODE_PATH pointing to a Playwright installation; no production dependency.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const url=process.env.DASHBOARD_URL || 'file://'+path.join(root,'dashboard/index.html');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#analysis-plan').textContent.includes('三个问题'));
  await page.waitForFunction(()=>document.querySelector('#detail-chart svg'));
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  assert.equal(await page.locator('#pace-time .pace-row').count(),12);
  await page.locator('details').evaluateAll(nodes=>nodes.forEach(el=>el.open=true));
  const audit=()=>page.evaluate(()=>{
    const names=new Set(window.RUNNING_DATA.activities.map(r=>r.name));
    const out=new Set();
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    function consider(s){
      if(!s || [...names].some(name=>s.includes(name)))return;
      const remaining=s.replace(/\b(?:STRAVA|GARMIN|Strava|Garmin|JASON|Jason|EN|UTC|HRV|GPS|FIT|ID|UCLA|Health|AIS|VO|CSV|km|bpm|spm|ms|mm|mL|kg|min|h|m|W)\b/g,'').replace(/(?:activities\/)?[\w-]+\.fit(?:\.gz)?/gi,'').replace(/\b[0-9a-f]{16}\b/g,'');
      if(/[A-Za-z]{3}/.test(remaining))out.add(s);
    }
    while(walker.nextNode()){
      const node=walker.currentNode,el=node.parentElement,s=node.nodeValue.trim();
      if(!s || el.closest('script,style,#notes') || names.has(s) || names.has(s.replace(/ ↗$/,'')) || [...names].some(name=>s.includes(name)))continue;
      consider(s);
    }
    document.querySelectorAll('[aria-label],[data-tip],[title],[placeholder]').forEach(el=>['aria-label','data-tip','title','placeholder'].forEach(a=>consider(el.getAttribute(a))));
    return [...out];
  });
  let untranslated=await audit();
  await page.selectOption('#setting','treadmill');
  await page.waitForFunction(()=>document.querySelector('#analysis-summary').textContent.includes('当前选择“跑步机”'));
  await page.locator('[data-language="en"]').click();
  await page.waitForFunction(()=>document.querySelector('#analysis-summary').textContent.includes('Your selected setting, Treadmill'));
  assert(!(await page.locator('#analysis-plan').innerText()).match(/[\u3400-\u9fff]/));
  await page.selectOption('#setting','road');
  await page.locator('[data-language="zh-CN"]').click();
  await page.waitForFunction(()=>document.querySelector('#analysis-summary').textContent.includes('当前选择“公路 / 户外”'));
  await page.selectOption('#bucket','year');
  assert((await page.locator('#volume title').textContent()).includes('年'));
  await page.locator('#analysis-follow').uncheck();
  for(const setting of ['treadmill','track','trail','other','road']){
    await page.selectOption('#analysis-setting',setting);
    await page.waitForTimeout(50);
    assert((await page.locator('#analysis-methods').innerText()).includes('计算口径'));
    untranslated.push(...await audit());
  }
  await page.locator('#garmin-follow').uncheck();
  for(const setting of ['treadmill','track','trail','generic']){
    await page.selectOption('#garmin-setting',setting);
    await page.waitForTimeout(50);
    untranslated.push(...await audit());
  }
  for(const id of ['garmin-metric','pace-mechanics-metric','wellness-metric','metric']){
    const values=await page.locator('#'+id+' option').evaluateAll(nodes=>nodes.map(n=>n.value));
    for(const value of values){await page.selectOption('#'+id,value);await page.waitForTimeout(25);untranslated.push(...await audit());}
  }
  await page.locator('#search').fill('NO_MATCH_7a01');
  await page.waitForFunction(()=>document.querySelector('#activities').textContent.includes('没有匹配'));
  await page.locator('#search').fill('');
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='zh-CN' && document.querySelector('#pace-time .pace-row'));
  assert.deepEqual(errors,[],'Browser runtime errors');
  fs.writeFileSync('/tmp/dashboard-untranslated.json',JSON.stringify([...new Set(untranslated)],null,2));
  console.log('Browser flow passed: Chinese default, all five analysis settings, English/Chinese round-trip, dynamic filters, empty search, persisted language, pace and detail charts.');
  console.log('Untranslated candidates:',JSON.stringify([...new Set(untranslated)].slice(0,30)));
  assert.deepEqual([...new Set(untranslated)],[],'Untranslated interface content');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#analysis').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/dashboard-analysis-zh.png'});
  for(const [lang,phrase] of [['zh','先看结论'],['en','What the evidence supports']]){
    const reportUrl=new URL('reports/analysis-'+lang+'.html',url).href;
    const response=await page.goto(reportUrl);
    assert(response.status()<400);
    assert((await page.locator('main').innerText()).includes(phrase));
    assert.equal(await page.locator('script').count(),0);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#analysis-plan').textContent.includes('三个问题'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Mobile horizontal overflow');
  console.log('PASS: both standalone reports and mobile layout');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
