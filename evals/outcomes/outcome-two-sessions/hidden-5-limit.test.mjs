import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

// An empty code, not a missing one: the sample project has a bug when there is no code at
// all, and this task is not about that bug.
const cart = (...lines) => lines.reduce((c, [price, qty = 1], i) => addItem(c, { id: `p${i}`, price, qty }), createCart());
const pay = (c, code = '') => amountToPay(c, { code });

test('12 of one plant counts as 10', () => {
  const c = addItem(createCart(), { id: 'fern', price: 18, qty: 12 });
  assert.equal(cartTotal(c), 180);
});
test('adding more once at 10 changes nothing', () => {
  const c = addItem(createCart(), { id: 'fern', price: 18, qty: 10 });
  addItem(c, { id: 'fern', price: 18 });
  assert.equal(cartTotal(c), 180);
});
