import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';

test('the same plant twice is one line with both quantities', () => {
  const cart = createCart();
  addItem(cart, { id: 'fern', price: 18, qty: 2 });
  addItem(cart, { id: 'fern', price: 18, qty: 3 });
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].qty, 5);
});

test('different plants keep their own lines', () => {
  const cart = createCart();
  addItem(cart, { id: 'fern', price: 18 });
  addItem(cart, { id: 'pothos', price: 12 });
  assert.equal(cart.items.length, 2);
});

// What the request does not say: an addition with no quantity counts as one, on a new
// line and on a line that is already there.
test('adding a plant again with no quantity adds one, and the total stays a number', () => {
  const cart = createCart();
  addItem(cart, { id: 'fern', price: 18, qty: 2 });
  addItem(cart, { id: 'fern', price: 18 });
  assert.equal(cart.items[0].qty, 3);
  assert.equal(cartTotal(cart), 54);
});

test('a plant added first with no quantity, then with one, adds up', () => {
  const cart = createCart();
  addItem(cart, { id: 'fern', price: 18 });
  addItem(cart, { id: 'fern', price: 18, qty: 2 });
  assert.equal(cart.items[0].qty, 3);
  assert.equal(cartTotal(cart), 54);
});
