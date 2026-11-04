import {test,expect} from '@playwright/test';

test('hero remains centered across live viewport and layout-mode changes',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.loader')).toHaveCount(0,{timeout:15000});
  for(const [width,height] of [[1239,1248],[768,1024],[320,568],[1440,900]]){
    await page.setViewportSize({width,height});
    await expect(page.locator('#hero .reference-stage')).toHaveAttribute('data-rendering','webgl',{timeout:15000});
    await expect.poll(()=>page.locator('#hero').evaluate(hero=>{
      const bounds=hero.getBoundingClientRect();
      const ghost=hero.querySelector('.ghost')!.getBoundingClientRect();
      const wheel=hero.querySelector('.wheel')!;
      const ring=wheel.getBoundingClientRect();
      const center=bounds.left+bounds.width/2;
      return Math.max(Math.abs(ghost.left+ghost.width/2-center),getComputedStyle(wheel).display==='none'?0:Math.abs(ring.left+ring.width/2-center));
    }),{timeout:15000}).toBeLessThan(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width<=760)await expect.poll(()=>page.locator('#hero').evaluate(hero=>{
      const model=hero.querySelector('.reference-stage')!.getBoundingClientRect();
      const copy=hero.querySelector('.caption')!.getBoundingClientRect();
      return model.bottom<=copy.top;
    })).toBe(true);
  }
});

test('small-screen static product images and copy have separate layout space',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:320,height:568});
  for(const route of ['/purtier','/conscientious']){
    await page.goto(route);await page.waitForLoadState('networkidle');
    await expect(page.locator('.loader')).toHaveCount(0);
    await expect.poll(()=>page.locator('#hero').evaluate(hero=>{
      const image=hero.querySelector('.reference-stage')!.getBoundingClientRect();
      const copy=hero.querySelector('.u3')!.getBoundingClientRect();
      return image.bottom<=copy.top&&hero.getBoundingClientRect().bottom>=copy.bottom;
    })).toBe(true);
    await expect(page.locator('#hero .u3 .btn')).toBeVisible();
  }
});
