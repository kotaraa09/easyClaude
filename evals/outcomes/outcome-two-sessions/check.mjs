// Run by scripts/bench.mjs on a copy of what day two left behind. Hidden from both days.
// One hidden test per change asked for on day one, so the report says which ones were lost.
export default [
  { name: '1. shipping', hidden: 'hidden-1-shipping.test.mjs' },
  { name: '2. 10% off from 5 plants', hidden: 'hidden-2-bulk.test.mjs' },
  { name: '3. the WELCOME5 code', hidden: 'hidden-3-welcome.test.mjs' },
  { name: '4. the same plant twice is one line', hidden: 'hidden-4-merge.test.mjs' },
  { name: '5. at most 10 of one plant', hidden: 'hidden-5-limit.test.mjs' },
  { name: "the project's own tests pass", ownTests: true },
];
