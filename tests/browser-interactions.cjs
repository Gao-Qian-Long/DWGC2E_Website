// Isolated interaction tests: no real accounts, mail, payments or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'content-type': ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? 'Not found' : bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: {width, height: 960}, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let feedbackCount = 0, finishFeedback;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/api/v1/feedback') {
          feedbackCount++;
          return new Promise(resolve => { finishFeedback = async data => {
            await route.fulfill({status: 200, contentType:'application/json', body:JSON.stringify(data)}); resolve();
          }; });
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({api:'operational',database:'operational',plans:[]})});
        return route.continue();
      });
      await page.goto(origin);
      const faq = page.locator('.faq-q').first();
      await faq.focus(); await page.keyboard.press('Enter');
      assert.equal(await faq.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Space');
      assert.equal(await faq.getAttribute('aria-expanded'), 'false');
      const ticker = page.locator('.ticker-toggle');
      await ticker.click(); assert.equal(await ticker.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.ticker-track').evaluate(el => getComputedStyle(el).animationName), 'none');
      const image = page.locator('.cmp-slide img').first();
      await image.scrollIntoViewIfNeeded(); await image.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'), 'false');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#lightbox button').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      assert.equal(await image.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('main').evaluate(el => el.inert), false);
      if (width === 390) {
        const menu = page.locator('.menu-btn'); await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await menu.getAttribute('aria-expanded'), 'false');
        assert.equal(await menu.evaluate(el => el === document.activeElement), true);
      }
      const opener = page.locator('.ws-support-button');
      await opener.click();
      assert.equal(await page.locator('#wsSupport input[name=email]').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      assert.equal(await opener.evaluate(el => el === document.activeElement), true);
      await opener.click();
      await page.locator('#wsSupport input[name=email]').fill('isolated@example.test');
      const message = page.locator('#wsSupport textarea');
      await message.fill('隔离测试：只提交给本地模拟服务。');
      await page.locator('#wsSupport button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#wsSupport button[type=submit]').disabled);
      await page.locator('#wsSupport form').evaluate(form => form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})));
      await message.fill('提交过程中新增的内容不能被迟到响应清空。');
      while (!finishFeedback) await new Promise(resolve => setTimeout(resolve, 10));
      await finishFeedback({id:'local-only',message:'本地模拟成功'});
      await page.waitForFunction(() => !document.querySelector('#wsSupport button[type=submit]').disabled);
      assert.equal(feedbackCount, 1);
      assert.equal(await message.inputValue(), '提交过程中新增的内容不能被迟到响应清空。');
      finishFeedback = null;
      await page.locator('#wsSupport button[type=submit]').click();
      while (!finishFeedback) await new Promise(resolve => setTimeout(resolve, 10));
      await finishFeedback({message:'invalid success response'});
      await page.waitForFunction(() => !document.querySelector('#wsSupport button[type=submit]').disabled);
      assert.match(await page.locator('.ws-feedback-message').textContent(), /暂未确认/);
      assert.notEqual(await message.inputValue(), '');
      assert.deepEqual(errors, []);
      console.log(`PASS interactions at ${width}px: FAQ, ticker, lightbox, focus, feedback duplicate/late/invalid response${width===390?', mobile menu':''}`);
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

