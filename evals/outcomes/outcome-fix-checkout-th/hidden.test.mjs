import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

const cart = () => addItem(createCart(), { id: 'monstera', price: 35 });

test('no discount at all', () => assert.equal(amountToPay(cart()), 35));
test('an empty discount', () => assert.equal(amountToPay(cart(), {}), 35));
test('an empty code', () => assert.equal(amountToPay(cart(), { code: '' }), 35));
test('an unknown code changes nothing', () => assert.equal(amountToPay(cart(), { code: 'NOPE' }), 35));
test('a real code still works', () => assert.equal(amountToPay(cart(), { code: 'spring10' }), 31.5));
