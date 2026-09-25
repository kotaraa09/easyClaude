import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';

test('the total adds every plant times its quantity', () => {
  const cart = createCart();
  addItem(cart, { id: 'fern', price: 18, qty: 2 });
  addItem(cart, { id: 'pothos', price: 12 });
  assert.equal(cartTotal(cart), 48);
});
test('one plant with no quantity counts once', () => {
  assert.equal(cartTotal(addItem(createCart(), { id: 'fern', price: 18 })), 18);
});
