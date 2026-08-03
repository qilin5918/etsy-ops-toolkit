(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EtsyOpsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TYPES = ['product', 'listing', 'ads', 'order', 'fees', 'unknown'];
  function classifyFilename(name) {
    const value = String(name || '').toLowerCase();
    if (/\b(ad|ads|campaign|roas)\b/.test(value)) return { type: 'ads', confidence: .76 };
    if (/\b(order|receipt|ship)\b/.test(value)) return { type: 'order', confidence: .76 };
    if (/\b(fee|price|shipping|cost|payment)\b/.test(value)) return { type: 'fees', confidence: .72 };
    if (/\b(listing|etsy-page|before|after)\b/.test(value)) return { type: 'listing', confidence: .7 };
    if (/\b(product|mockup|white|scene)\b/.test(value)) return { type: 'product', confidence: .68 };
    return { type: 'unknown', confidence: 0 };
  }
  function adMetrics(a) {
    const n = key => Number(a[key]) || 0, views=n('views'), clicks=n('clicks'), spend=n('spend'), orders=n('orders'), revenue=n('revenue');
    return { ctr: views ? clicks / views * 100 : 0, cpc: clicks ? spend / clicks : 0, cvr: clicks ? orders / clicks * 100 : 0, roas: spend ? revenue / spend : 0, cpa: orders ? spend / orders : 0, acos: revenue ? spend / revenue * 100 : 0 };
  }
  function csvEscape(value) { const text=String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  function recordsToCSV(records) { if (!records.length) return ''; const keys=[...new Set(records.flatMap(Object.keys))]; return [keys, ...records.map(row=>keys.map(key=>row[key]))].map(row=>row.map(csvEscape).join(',')).join('\n'); }
  function sanitizeOrder(input) { const allowed=['id','orderNumber','product','quantity','personalization','country','shipBy','status','createdAt','confirmed']; return Object.fromEntries(allowed.filter(key=>input[key] !== undefined).map(key=>[key,input[key]])); }
  return { TYPES, classifyFilename, adMetrics, recordsToCSV, sanitizeOrder };
});
