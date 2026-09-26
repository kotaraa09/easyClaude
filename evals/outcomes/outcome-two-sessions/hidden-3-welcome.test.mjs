import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

// An empty code, not a missing one: the sample project has a bug when there is no code at
// all, and this task is not about that bug.
const cart = (...lines) => lines.reduce((c, [price, qty = 1], i) => addItem(c, { id: `p${i}`, price, qty }), createCart());
const pay = (c, code = '') => amountToPay(c, { code });

// 35 - 5 = 30: under 50 either way, so shipping is 6 whichever the shop counts.
test('WELCOME5 takes 5 dollars off', () => assert.equal(pay(cart([35]), 'WELCOME5'), 36));
test('in any letter case', () => assert.equal(pay(cart([35]), 'welcome5'), 36));
test('SPRING10 still works', () => assert.equal(pay(cart([35]), 'spring10'), 37.5));
