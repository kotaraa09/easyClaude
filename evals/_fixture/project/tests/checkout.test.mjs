import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

test('a discount code takes its share off the total', () => {
  const cart = addItem(createCart(), { id: 'monstera', price: 35 });
  assert.equal(amountToPay(cart, { code: 'spring10' }), 31.5);
});
