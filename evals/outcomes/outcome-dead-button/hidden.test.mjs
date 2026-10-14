import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// No browser here. This stands in for one: an element for every id in the real index.html,
// with the page's own script run against it. A fix in either the page or its code passes,
// as long as the page still starts through setupPage(document).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function fakeDocument() {
  const elements = {};
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
    const listeners = {};
    elements[id] = {
      id, value: '', textContent: '',
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
      click() { for (const fn of listeners.click ?? []) fn({ preventDefault() {}, target: this }); },
    };
  }
  return {
    elements,
    getElementById: (id) => elements[id] ?? null,
    querySelector: (sel) => (sel.startsWith('#') ? elements[sel.slice(1)] ?? null : null),
  };
}

async function pagePay(code) {
  assert.match(html, /setupPage\(document\)/, 'the page no longer starts through setupPage(document)');
  const payId = html.match(/<button[^>]*\sid="([^"]+)"[^>]*>\s*Pay\s*<\/button>/i)?.[1];
  assert.ok(payId, 'the page has no Pay button');
  const doc = fakeDocument();
  const { setupPage } = await import(`../src/page.js?${Math.random()}`);
  setupPage(doc);
  if (doc.elements.code) doc.elements.code.value = code;
  doc.elements[payId].click();
  return Object.values(doc.elements).map((e) => e.textContent).join(' ');
}

test('clicking Pay with no code shows $18', async () => {
  assert.match(await pagePay(''), /\$18(?![\d.])|\$18\.00/);
});

test('clicking Pay with SPRING10 shows $16.20', async () => {
  assert.match(await pagePay('spring10'), /\$16\.2(?!\d)|\$16\.20/);
});
