import { cartTotal } from './cart.js';

const CODES = { SPRING10: 0.1 };

// The amount the shopper pays, after an optional discount code.
export function amountToPay(cart, discount) {
  const total = cartTotal(cart);
  const rate = CODES[discount.code.toUpperCase()] ?? 0;
  return Math.round(total * (1 - rate) * 100) / 100;
}
