const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../ops-core');

test('classifies only explicit filename signals and leaves ambiguity unknown', () => {
  assert.equal(core.classifyFilename('etsy-ads-roas.png').type, 'ads');
  assert.equal(core.classifyFilename('order-123.webp').type, 'order');
  assert.equal(core.classifyFilename('IMG_0021.jpg').type, 'unknown');
});

test('calculates all Etsy Ads metrics safely', () => {
  assert.deepEqual(core.adMetrics({ views:1000,clicks:25,spend:10,orders:2,revenue:50 }), { ctr:2.5,cpc:.4,cvr:8,roas:5,cpa:5,acos:20 });
  assert.deepEqual(core.adMetrics({}), { ctr:0,cpc:0,cvr:0,roas:0,cpa:0,acos:0 });
});

test('sanitizes order customer PII and exports quoted CSV', () => {
  const safe=core.sanitizeOrder({id:'1',orderNumber:'A1',product:'Fox, Charm',quantity:1,name:'Private',address:'Secret',phone:'555'});
  assert.equal(safe.name, undefined); assert.equal(safe.address, undefined); assert.equal(safe.phone, undefined);
  assert.match(core.recordsToCSV([safe]), /"Fox, Charm"/);
});
