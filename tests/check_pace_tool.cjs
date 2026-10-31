// Run with Playwright on NODE_PATH and a dashboard server on port 8765.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const url=(process.env.DASHBOARD_URL || 'http://127.0.0.1:8765/')+'?tab=pace-tool';
    await page.goto(url);
    await page.locator('[data-pace-language="en"]').click();
    const input = (d,field) => page.locator(`[id="${field}-input-${d}"]`);
    const row = d => page.locator(`.pace-tool-row[data-distance="${d}"]`);
    const edit = async (d,field,value) => { await input(d,field).fill(value); await input(d,field).press('Enter'); };
    const elapsed = async (d,value) => {
      assert.equal(await input(d,'time').inputValue(), value);
      assert.equal(await page.locator(`svg text[data-elapsed-distance="${d}"]`).textContent(), value);
    };
    assert(await page.locator('#pace-tool-view').isVisible());
    assert.equal(await page.locator('.pace-tool-row').count(),7);
    assert.equal(await page.locator('[data-remove]').count(),7);
    assert.equal(await page.locator('#pace-add, #pace-add-by-pace').count(),0);
    assert.equal(await input(21.0975,'pace').inputValue(),'3:46');
    await elapsed(5,'17:05'); await elapsed(10,'35:50');
    await elapsed(21.0975,'1:19:23'); await elapsed(42.195,'2:45:48');
    for (const d of [21.0975,42.195]) {
      assert(await input(d,'distance').getAttribute('readonly') !== null);
      assert(await row(d).locator('[data-field="distance"][data-step="1"]').isDisabled());
    }
    // Pace edits shift the curve; time edits derive pace, including hours.
    await edit(10,'pace','4:00');
    assert.equal(await input(5,'pace').inputValue(),'3:50'); await elapsed(10,'40:00');
    await edit(10,'time','30:00');
    assert.equal(await input(10,'pace').inputValue(),'3:00');
    await edit(42.195,'time','3:00:00'); await elapsed(42.195,'3:00:00');
    assert.equal(await input(42.195,'distance').inputValue(),'42.195');
    // Distance edit keeps that row's unrounded pace and moves the reference.
    await edit(5,'pace','3:25');
    await edit(5,'distance','6');
    assert.equal(await input(6,'pace').inputValue(),'3:25'); await elapsed(6,'20:30');
    assert.equal(await input(5,'distance').count(),0);
    // Fine tuning uses one second or 100 metres, and supports keyboard controls.
    await row(6).locator('[data-field="pace"][data-step="1"]').click();
    assert.equal(await input(6,'pace').inputValue(),'3:26');
    await row(6).locator('[data-field="pace"][data-step="-1"]').click();
    await row(6).locator('[data-field="time"][data-step="1"]').click();
    await elapsed(6,'20:31');
    await row(6).locator('[data-field="time"][data-step="-1"]').click();
    await row(6).locator('[data-field="distance"][data-step="1"]').click();
    assert.equal(await input(6.1,'distance').inputValue(),'6.1');
    await input(6.1,'distance').press('ArrowDown');
    assert.equal(await input(6,'distance').inputValue(),'6');
    await input(6,'pace').press('ArrowUp'); assert.equal(await input(6,'pace').inputValue(),'3:26');
    await input(6,'pace').press('ArrowDown');
    // Invalid edits and duplicate distances preserve the model.
    const saved=await page.evaluate(()=>localStorage.getItem('running-pace-tool-v1'));
    await edit(6,'distance','10');
    assert((await page.locator('#pace-tool-status').textContent()).includes('already exists'));
    await edit(6,'distance','0');
    assert.equal(await page.evaluate(()=>localStorage.getItem('running-pace-tool-v1')),saved);
    await page.reload();
    await edit(6,'time','3:99');
    assert.equal(await input(6,'time').getAttribute('aria-invalid'),'true');
    await page.reload();
    // Remove presets and the anchor, preserving the existing curve and persistence.
    await page.locator('[data-remove="6"]').click();
    assert.equal(await page.locator('.pace-tool-row').count(),6);
    const retained=await input(10,'pace').inputValue();
    await page.reload(); assert.equal(await page.locator('.pace-tool-row').count(),6);
    assert.equal(await input(10,'pace').inputValue(),retained);
    await page.locator('#pace-add-entry').click();
    assert.equal(await page.locator('.pace-tool-row').count(),7);
    await edit(2,'distance','0.8');
    await page.locator('circle[data-distance="0.8"]').focus(); await page.keyboard.press('Enter');
    assert(await input(0.8,'pace').evaluate(el=>el===document.activeElement));
    await page.locator('[data-pace-language="zh-CN"]').click();
    assert.equal(await page.locator('#pace-tool-content h1').textContent(),'配速工具');
    assert((await page.locator('#pace-add-entry').textContent()).includes('添加'));
    await page.locator('[data-pace-language="en"]').click();
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
    // All rows are removable, including the marathon presets; empty/single charts work.
    while(await page.locator('[data-remove]').count()) await page.locator('[data-remove]').first().click();
    assert.equal(await page.locator('.pace-tool-row').count(),0);
    await page.reload(); assert.equal(await page.locator('.pace-tool-row').count(),0);
    await page.locator('#pace-add-entry').click();
    assert.equal(await page.locator('.pace-tool-row').count(),1);
    assert.equal(await page.locator('svg').first().getAttribute('viewBox') !== null,true);
    assert(!(await page.locator('.pace-tool-chart').innerHTML()).includes('NaN'));
    await page.locator('[data-tab="data"]').click(); assert(await page.locator('#data-view').isVisible());
    await page.goBack(); assert(await page.locator('#pace-tool-view').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS: editable distance/pace/time, fixed marathon distances, fine tuning, validation, removal, persistence, empty/single charts, languages, mobile and navigation');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
