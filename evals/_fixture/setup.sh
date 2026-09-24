#!/usr/bin/env bash
# Builds the sample project every eval case runs in: a small shop that easyClaude already
# set up, with saved state, a verify contract, a known bug and a git history.
#
# Without it each case ran in an empty folder. The SessionStart hook correctly sends an
# empty folder to kickoff, so every case measured kickoff and none measured the skill it
# names. The first real run, on 2026-09-24, showed exactly that: no case fired its skill.
#
# The runner calls a case's own setup.sh (a scaffold_script must sit inside the case), and
# that one-line file calls this. It runs in the run's empty working directory.
#
#   bash setup.sh            the shop as it stands: clean tree, two commits
#   bash setup.sh ship       plus finished, uncommitted work on a feature branch
#   bash setup.sh rescue     plus a commit from today and uncommitted edits that break it
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../.." && pwd)"
variant="${1:-base}"

cp -R "$here/project/." .
# kickoff copies the plugin's rules into every project it sets up. Copying the live ones
# keeps the sample in step with them instead of freezing a copy here.
mkdir -p .claude/rules
cp "$plugin"/rules/*.md .claude/rules/

# Minutes, not hours: a "today" commit made hours back crosses midnight in a late run, and
# then "yesterday's version" names a different commit. That happened in a real run.
commit() { # <minutes ago> <message> - git takes only exact dates here, so count back from now
  local when="$(( $(date +%s) - $1 * 60 )) +0000"
  GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" git commit -q -m "$2"
}

git init -q -b main
# The runner gives each run a home with a git identity. Anywhere else, supply one.
git config core.autocrlf false
git config user.email >/dev/null || git config user.email eval@example.invalid
git config user.name >/dev/null || git config user.name "Plugin Eval"
git add -A
git reset -q -- src/checkout.js tests/checkout.test.mjs
commit 2880 "Plant list and cart"
git add -A
commit 1440 "Checkout page with discount codes"

case "$variant" in
  base) ;;
  ship)
    git checkout -q -b shipping-cost
    cat > src/checkout.js <<'JS'
import { cartTotal } from './cart.js';

const CODES = { SPRING10: 0.1 };
const SHIPPING = 6;
const FREE_SHIPPING_FROM = 50;

export function shippingCost(cart) {
  return cartTotal(cart) >= FREE_SHIPPING_FROM ? 0 : SHIPPING;
}

// The amount the shopper pays, after an optional discount code, shipping included.
export function amountToPay(cart, discount) {
  const total = cartTotal(cart);
  const rate = CODES[discount.code.toUpperCase()] ?? 0;
  return Math.round((total * (1 - rate) + shippingCost(cart)) * 100) / 100;
}
JS
    cat > tests/checkout.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem } from '../src/cart.js';
import { amountToPay, shippingCost } from '../src/checkout.js';

test('a discount code takes its share off the total, shipping on top', () => {
  const cart = addItem(createCart(), { id: 'monstera', price: 35 });
  assert.equal(amountToPay(cart, { code: 'spring10' }), 37.5);
});

test('shipping is free from 50 dollars', () => {
  assert.equal(shippingCost(addItem(createCart(), { id: 'fern', price: 18, qty: 3 })), 0);
  assert.equal(shippingCost(addItem(createCart(), { id: 'fern', price: 18 })), 6);
});
JS
    node -e '
      const fs = require("fs");
      const s = fs.readFileSync("docs/STATE.md", "utf8");
      const task = "Shoppers see the shipping cost on the checkout page before they pay - src/checkout.js";
      fs.writeFileSync("docs/STATE.md", s
        .replace(`- [ ] ${task}\n`, "")
        .replace("## Done\n", "## Done\n")
        .replace(/(## Done\n(?:<!--[\s\S]*?-->\n)?)/, `$1- [x] ${task}\n`));
    '
    ;;
  rescue)
    sed -i.bak 's#<li data-id="monstera">Monstera - \$35</li>#<li data-id="monstera" class="featured">Monstera - $35 <b>NEW LOOK</b></li>#' index.html
    rm -f index.html.bak
    git add -A
    commit 5 "Try a new layout for the plant list"
    # Today's unfinished edits: the plant list and the cart are both broken.
    sed -i.bak '/<ul id="plants">/,/<\/ul>/d' index.html
    sed -i.bak 's/item.price \* item.qty/item.price * item.quantity/' src/cart.js
    rm -f index.html.bak src/cart.js.bak
    ;;
  *) echo "unknown variant: $variant" >&2; exit 2 ;;
esac
