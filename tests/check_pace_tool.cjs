// Run with Playwright available on NODE_PATH and CHROME_PATH if needed.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.DASHBOARD_URL || 'http://127.0.0.1:8765/')+'?tab=pace-tool');
    await page.locator('[data-pace-language="en"]').click();
    assert.equal(await page.locator('#pace-tool-view').isVisible(),true);
    assert.equal(await page.locator('.pace-tool-row').count(),7);
    assert.equal(await page.locator('[id="pace-input-21.0975"]').inputValue(),'3:46');
    assert.equal(await page.locator('[id="pace-input-42.195"]').inputValue(),'3:56');
    const values=await page.evaluate(()=>{
      const {paceAt,format,parse}=window.PaceToolModel;
      const a={distance:5,pace:205};
      return {double:paceAt(10,a),half:paceAt(2.5,a),round:format(239.8),bad:Number.isNaN(parse('3:99')),reverse:paceAt(5,{distance:21.0975,pace:paceAt(21.0975,a)})};
    });
    assert.deepEqual(values,{double:215,half:195,round:'4:00',bad:true,reverse:205});
    const row=page.locator('form[data-distance="10"]');
    await row.locator('input').fill('4:00'); await row.getByRole('button',{name:'Apply',exact:true}).click();
    assert.equal(await page.locator('[id="pace-input-5"]').inputValue(),'3:50');
    await page.locator('#pace-add [name="distance"]').fill('800');
    await page.locator('#pace-add [name="unit"]').selectOption('0.001');
    await page.getByRole('button',{name:'Add point',exact:true}).click();
    assert.equal(await page.locator('.pace-tool-row').count(),8);
    const xs=await page.evaluate(()=>[0.4,0.8,5,10].map(d=>Number(document.querySelector(`circle[data-distance="${d}"]`).getAttribute('cx'))));
    assert(Math.abs((xs[1]-xs[0])-(xs[3]-xs[2]))<1e-8,'Equal doubling spacing');
    await page.reload();
    assert.equal(await page.locator('.pace-tool-row').count(),8);
    assert.equal(await page.locator('[id="pace-input-5"]').inputValue(),'3:50');
    await page.locator('circle[data-distance="0.8"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[id="pace-input-0.8"]').evaluate(el=>el===document.activeElement),true);
    await page.locator('[data-pace-language="zh-CN"]').click();
    assert.equal(await page.locator('#pace-tool-content h1').textContent(),'配速工具');
    await page.locator('[data-pace-language="en"]').click();
    await page.locator('[data-remove="0.8"]').click();
    assert.equal(await page.locator('.pace-tool-row').count(),7);
    await page.locator('#pace-add [name="distance"]').fill('0'); await page.getByRole('button',{name:'Add point',exact:true}).click();
    assert.equal(await page.locator('.pace-tool-row').count(),7);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page should not overflow');
    await page.locator('[data-tab="data"]').click(); assert(await page.locator('#data-view').isVisible());
    await page.goBack(); assert(await page.locator('#pace-tool-view').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS: pace model, rounding, scaled chart, editing, custom distances, persistence, keyboard, languages, mobile and tab navigation');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
