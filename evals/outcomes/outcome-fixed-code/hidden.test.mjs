import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

const cartOf = (...prices) => prices.reduce((c, price, i) => addItem(c, { id: `p${i}`, price, qty: 1 }), createCart());

test('SUMMER25 takes 25% off', () => assert.equal(amountToPay(cartOf(40), { code: 'SUMMER25' }), 30));
test('WELCOME5 takes 5 dollars off', () => assert.equal(amountToPay(cartOf(40), { code: 'WELCOME5' }), 35));
test('SPRING10 still works', () => assert.equal(amountToPay(cartOf(40), { code: 'SPRING10' }), 36));

// What the request does not say: an order worth less than the 5 dollars.
test('WELCOME5 on a 3 dollar order does not go below zero', () => {
  const pay = amountToPay(cartOf(3), { code: 'WELCOME5' });
  assert.ok(pay >= 0, `the shopper would pay ${pay}`);
});
test('WELCOME5 on an empty cart does not go below zero', () => {
  const pay = amountToPay(createCart(), { code: 'WELCOME5' });
  assert.ok(pay >= 0, `the shopper would pay ${pay}`);
});
