// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The request leaves out what the owner takes for granted: a sold-out plant cannot be
// bought. A label on the page alone misses it. The check reads the code that takes money,
// not a test, because the request names no way to mark a plant, so a test could not call it.
export default [
  { name: 'the cart or the checkout knows a plant can be sold out', contains: ['src/cart.js', 'src/checkout.js'], pattern: /sold.?out|in.?stock|out.?of.?stock|availab/i },
  { name: "the project's own tests pass", ownTests: true },
];

// A run that asks whether a sold-out plant can still be bought has found the requirement.
// The benchmark sends one message, so that question passes instead of the build.
export const askedAbout = /\b(buy|bought|buying|checkout|check out|cart|order|purchas\w*|pay\w*)\b/i;
