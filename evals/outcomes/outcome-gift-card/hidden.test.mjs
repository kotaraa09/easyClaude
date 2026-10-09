import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';
import { amountToPay } from '../src/checkout.js';

const cart40 = () => addItem(createCart(), { id: 'fern', price: 20, qty: 2 });
// A code that is refused may throw, or may leave the price as it was. Either is fine; a
// price that is not a number, or one above the order, is not.
const payOrRefuse = (code) => { try { return amountToPay(cart40(), { code }); } catch { return 'refused'; } };

test('GIFT-25 takes 25 dollars off', () => assert.equal(amountToPay(cart40(), { code: 'GIFT-25' }), 15));
test('a gift card worth more than the order means paying nothing', () =>
  assert.equal(amountToPay(cart40(), { code: 'GIFT-100' }), 0));
test('SPRING10 still works', () => assert.equal(amountToPay(cart40(), { code: 'SPRING10' }), 36));

// What the request does not say: codes that are not well formed.
for (const code of ['GIFT-', 'GIFT-abc', 'GIFT--5', 'GIFT-5x']) {
  test(`${JSON.stringify(code)} neither breaks the price nor raises it`, () => {
    const r = payOrRefuse(code);
    assert.ok(r === 'refused' || (Number.isFinite(r) && r <= 40 && r >= 0), `the shopper would pay ${r}`);
  });
}
