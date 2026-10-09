import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';

// How many of one plant the cart holds, over every line it has. A refused addition may
// throw, return the cart unchanged or cap the quantity: any of those keeps the limit.
const held = (cart, id) => cart.items.filter((i) => i.id === id).reduce((n, i) => n + (i.qty ?? 1), 0);
const tryAdd = (cart, item) => { try { addItem(cart, item); } catch { /* refused */ } };

test('five of one plant is allowed', () => {
  const cart = createCart();
  tryAdd(cart, { id: 'fern', price: 18, qty: 5 });
  assert.equal(held(cart, 'fern'), 5);
});

test('six in one go is not', () => {
  const cart = createCart();
  tryAdd(cart, { id: 'fern', price: 18, qty: 6 });
  assert.ok(held(cart, 'fern') <= 5, `the cart holds ${held(cart, 'fern')} ferns`);
});

// The case this was built for: the limit is per order, not per click.
test('adding the same plant twice cannot pass five', () => {
  const cart = createCart();
  tryAdd(cart, { id: 'fern', price: 18, qty: 3 });
  tryAdd(cart, { id: 'fern', price: 18, qty: 3 });
  assert.ok(held(cart, 'fern') <= 5, `the cart holds ${held(cart, 'fern')} ferns`);
});

test('one at a time cannot pass five either', () => {
  const cart = createCart();
  for (let i = 0; i < 7; i++) tryAdd(cart, { id: 'fern', price: 18 });
  assert.ok(held(cart, 'fern') <= 5, `the cart holds ${held(cart, 'fern')} ferns`);
});

test('the limit is for each plant, not for the whole order', () => {
  const cart = createCart();
  tryAdd(cart, { id: 'fern', price: 18, qty: 5 });
  tryAdd(cart, { id: 'pothos', price: 12, qty: 5 });
  assert.equal(held(cart, 'fern') + held(cart, 'pothos'), 10);
});
