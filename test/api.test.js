const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/analyze-listing');

const valid = {
  title: 'Playful Husky Bag Charm',
  description: 'A cheerful husky brings playful character to your favorite bag.\n\nBlack and white leather panels and visible stitching define its friendly face.\n\nA sweet birthday gift for dog lovers.\n\nProduct type: Leather bag charm\nMaterial: Genuine leather\nPrimary color: Black\nSecondary color: White\nSuitable for: Dog lovers',
  primaryColor: 'Black', secondaryColor: 'White',
  tags: ['husky bag charm', 'dog leather charm', 'purse dog charm', 'gift for dog mom', 'dog lover gift', 'birthday dog gift', 'playful bag charm', 'cute purse accent', 'leather dog charm', 'handbag accessory', 'husky purse charm', 'animal bag charm', 'everyday bag decor'],
  detectedProduct: 'Husky dog', warnings: []
};

test('accepts a complete valid listing', () => assert.equal(handler.validateResult(valid), true));
test('rejects anything other than exactly 13 unique tags', () => {
  assert.equal(handler.validateResult({ ...valid, tags: valid.tags.slice(0, 12) }), false);
  assert.equal(handler.validateResult({ ...valid, tags: [...valid.tags.slice(0, 12), valid.tags[0]] }), false);
});
test('rejects long or Chinese tags and non-standard colors', () => {
  assert.equal(handler.validateResult({ ...valid, tags: [...valid.tags.slice(0, 12), 'this tag is much too long'] }), false);
  assert.equal(handler.validateResult({ ...valid, tags: [...valid.tags.slice(0, 12), '狗狗 charm'] }), false);
  assert.equal(handler.validateResult({ ...valid, primaryColor: 'Cream' }), false);
});
test('extracts Responses API output text', () => {
  assert.equal(handler.extractOutput({ output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }] }), '{"ok":true}');
});
