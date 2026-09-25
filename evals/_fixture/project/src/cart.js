export function createCart() {
  return { items: [] };
}

export function addItem(cart, item) {
  cart.items.push({ ...item, qty: item.qty ?? 1 });
  return cart;
}

export function cartTotal(cart) {
  return cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}
