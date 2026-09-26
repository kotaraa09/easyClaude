import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

// An empty code, not a missing one: the sample project still has its no-code bug, and
// this case is about shipping, not about whether that bug was fixed along the way.
const pay = (price, qty = 1) => amountToPay(addItem(createCart(), { id: 'x', price, qty }), { code: '' });

test('under 50 dollars, shipping is 6', () => assert.equal(pay(35), 41));
test('at exactly 50 dollars, shipping is free', () => assert.equal(pay(25, 2), 50));
test('over 50 dollars, shipping is free', () => assert.equal(pay(18, 3), 54));
