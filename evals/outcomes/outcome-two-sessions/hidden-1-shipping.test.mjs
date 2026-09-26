import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

// An empty code, not a missing one: the sample project has a bug when there is no code at
// all, and this task is not about that bug.
const cart = (...lines) => lines.reduce((c, [price, qty = 1], i) => addItem(c, { id: `p${i}`, price, qty }), createCart());
const pay = (c, code = '') => amountToPay(c, { code });

test('under 50 dollars, shipping is 6', () => assert.equal(pay(cart([35])), 41));
test('at exactly 50 dollars, shipping is free', () => assert.equal(pay(cart([25, 2])), 50));
