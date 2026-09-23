import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderRestaurantIcon, renderAdaptiveRestaurantIcon, adaptiveIconXml } from './restaurant-icon.mjs';

for (const [width, height] of [[320, 160], [160, 320], [200, 200]]) {
  test(`full-bleed logo ${width}x${height} adds no white or transparent border`, async () => {
    const source = await sharp({ create: { width, height, channels: 4, background: '#aa1645' } }).png().toBuffer();
    const icon = await renderRestaurantIcon(source, 64);
    const { data, info } = await sharp(icon).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 64); assert.equal(info.height, 64);
    assert.equal(info.channels, 3);
    for (let i = 0; i < data.length; i += 3) assert.deepEqual([...data.subarray(i, i + 3)], [170, 22, 69]);
  });
}
test('transparent logo is flattened and the Android mask adds no inset or white plate', async () => {
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#aa164580' } }).png().toBuffer();
  assert.equal((await sharp(await renderRestaurantIcon(source)).metadata()).hasAlpha, false);
  assert.doesNotMatch(adaptiveIconXml, /inset|color\/white/);
  assert.match(adaptiveIconXml, /background android:drawable="@drawable\/restaurant_icon"/);
});

test('adaptive viewport preserves the whole square artwork with opaque edge bleed', async () => {
  const icon = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#aa1645' } })
    .composite([{ input: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer(), left: 0, top: 0 }]).removeAlpha().png().toBuffer();
  const adaptive = await renderAdaptiveRestaurantIcon(icon);
  assert.equal((await sharp(adaptive).metadata()).width, 96);
  const visible = await sharp(adaptive).extract({ left: 16, top: 16, width: 64, height: 64 }).raw().toBuffer();
  assert.deepEqual(visible, await sharp(icon).raw().toBuffer());
  assert.equal((await sharp(adaptive).metadata()).hasAlpha, false);
});
