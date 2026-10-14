import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartBadge } from '../src/cart.js';
import { receiptLine } from '../src/receipt.js';

const cart = (...items) => items.reduce((c, item) => addItem(c, item), createCart());

// The wording around the amount is free; the amount must be whole dollars.
test('the badge shows whole dollars', () => {
  const badge = cartBadge(cart({ id: 'fern', price: 18, qty: 2 }, { id: 'pothos', price: 12 }));
  assert.match(badge, /\$48(?![.\d])/);
  assert.match(cartBadge(cart({ id: 'monstera', price: 35 })), /\$35(?![.\d])/);
});

// The feature nobody mentioned. Its amount is what the shopper paid, to the cent.
test('the receipt still shows cents', () => {
  assert.equal(receiptLine(cart({ id: 'monstera', price: 35 }), { code: 'spring10' }), 'You paid $31.50');
  assert.equal(receiptLine(cart({ id: 'fern', price: 18 }), { code: 'spring10' }), 'You paid $16.20');
  assert.equal(receiptLine(cart({ id: 'pothos', price: 12 }), { code: 'none' }), 'You paid $12.00');
});
