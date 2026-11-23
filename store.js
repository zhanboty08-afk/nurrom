// Local browser persistence for cart, favorites, comparison and recently viewed items.
const DB_KEYS = {
  products: "forma_products_v1",
  orders: "forma_orders_v1",
  cart: "forma_cart_v2",
  favorites: "nurroom_favorites_v1",
  compare: "nurroom_compare_v1",
  recent: "nurroom_recent_v1",
};

const DEFAULT_PRODUCTS = [];

function readDB(k, d) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
}

function writeDB(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (error) {
    console.warn("Не удалось сохранить данные браузера:", error);
  }
}

function getProducts() {
  return readDB(DB_KEYS.products, DEFAULT_PRODUCTS);
}
function saveProducts(v) {
  writeDB(DB_KEYS.products, v);
}
function getOrders() {
  return readDB(DB_KEYS.orders, []);
}
function saveOrders(v) {
  writeDB(DB_KEYS.orders, v);
}

function getCart() {
  const value = readDB(DB_KEYS.cart, []);
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: String(item?.id ?? ""),
      qty: Math.min(20, Math.max(1, Math.trunc(Number(item?.qty) || 1))),
    }))
    .filter((item) => item.id);
}

function saveCart(v) {
  writeDB(DB_KEYS.cart, v);
}

function getIdList(key, maxLen = 50) {
  const list = readDB(key, []);
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((id) => String(id || "")).filter(Boolean))].slice(0, maxLen);
}

function getFavorites() {
  return getIdList(DB_KEYS.favorites, 60);
}
function saveFavorites(ids) {
  writeDB(DB_KEYS.favorites, [...new Set(ids.map(String))].slice(0, 60));
}

function getCompare() {
  return getIdList(DB_KEYS.compare, 3);
}
function saveCompare(ids) {
  writeDB(DB_KEYS.compare, [...new Set(ids.map(String))].slice(0, 3));
}

function getRecentlyViewed() {
  return getIdList(DB_KEYS.recent, 8);
}
function pushRecentlyViewed(id) {
  const next = [String(id), ...getRecentlyViewed().filter((x) => x !== String(id))].slice(0, 8);
  writeDB(DB_KEYS.recent, next);
  return next;
}

function money(v) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(Number(v) || 0)) + " ₸";
}
