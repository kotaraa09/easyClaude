import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

// An empty code, not a missing one: the sample project has a bug when there is no code at
// all, and this task is not about that bug.
const cart = (...lines) => lines.reduce((c, [price, qty = 1], i) => addItem(c, { id: `p${i}`, price, qty }), createCart());
const pay = (c, code = '') => amountToPay(c, { code });

test('the same plant twice is one line of 2', () => {
  const c = createCart();
  addItem(c, { id: 'fern', price: 18 });
  addItem(c, { id: 'fern', price: 18 });
  assert.equal(c.items.length, 1);
  assert.equal(cartTotal(c), 36);
});
test('different plants stay separate', () => {
  const c = createCart();
  addItem(c, { id: 'fern', price: 18 });
  addItem(c, { id: 'pothos', price: 12 });
  assert.equal(c.items.length, 2);
});
