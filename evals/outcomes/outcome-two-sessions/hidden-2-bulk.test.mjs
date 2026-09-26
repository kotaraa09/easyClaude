import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

// An empty code, not a missing one: the sample project has a bug when there is no code at
// all, and this task is not about that bug.
const cart = (...lines) => lines.reduce((c, [price, qty = 1], i) => addItem(c, { id: `p${i}`, price, qty }), createCart());
const pay = (c, code = '') => amountToPay(c, { code });

// 5 x 12 = 60: shipping is free before or after the discount, so only the 10% is tested.
test('5 plants get 10% off', () => assert.equal(pay(cart([12, 5])), 54));
test('5 plants across lines count too', () => assert.equal(pay(cart([12, 3], [12, 2])), 54));
test('4 plants do not', () => assert.equal(pay(cart([12, 4])), 54));
