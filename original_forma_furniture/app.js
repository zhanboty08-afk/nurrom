const $ = (id) => document.getElementById(id);

const grid = $("productGrid"),
  drawer = $("cartDrawer"),
  overlay = $("cartOverlay"),
  productModal = $("productModal"),
  roomCalcModal = $("roomCalcModal"),
  compareModal = $("compareModal"),
  toastEl = $("toast");

let products = [],
  category = "Все",
  sortMode = "default",
  quickInStock = false,
  quickSale = false,
  quickFavs = false,
  roomFilter = null, // { maxLen, maxWid, roomLen, roomWid }
  activeDetailProduct = null,
  activeDetailQty = 1,
  activeSetChairId = null,
  activeSetChairQty = 4,
  toastTimer;

const cardQtySelection = new Map();

const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function safeImageURL(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    return url.protocol === "https:" ? url.href : "data:,";
  } catch {
    return "data:,";
  }
}

function formatKzPhone(digits) {
  const clean = String(digits || "").replace(/\D/g, "");
  if (clean.length === 11 && (clean[0] === "7" || clean[0] === "8")) {
    return `+7 ${clean.slice(1, 4)} ${clean.slice(4, 7)} ${clean.slice(7, 9)} ${clean.slice(9, 11)}`;
  }
  return clean ? `+${clean}` : "";
}

function maskKzPhoneInput(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits[0] === "8") digits = "7" + digits.slice(1);
  if (digits[0] !== "7") digits = "7" + digits;
  digits = digits.slice(0, 11);
  let out = "+7";
  if (digits.length > 1) out += " (" + digits.slice(1, 4);
  if (digits.length >= 4) out += ")";
  if (digits.length > 4) out += " " + digits.slice(4, 7);
  if (digits.length > 7) out += "-" + digits.slice(7, 9);
  if (digits.length > 9) out += "-" + digits.slice(9, 11);
  return out;
}

const publicWhatsApp = String(
  typeof WHATSAPP_ORDER_NUMBER !== "undefined" ? WHATSAPP_ORDER_NUMBER : "",
).replace(/\D/g, "");

function buildWhatsAppUrl(text = "") {
  if (!/^\d{10,15}$/.test(publicWhatsApp)) return "";
  return text
    ? `https://wa.me/${publicWhatsApp}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${publicWhatsApp}`;
}

document.addEventListener(
  "error",
  (event) => {
    if (
      event.target instanceof HTMLImageElement &&
      event.target.classList.contains("product-image")
    ) {
      event.target.classList.add("image-failed");
    }
  },
  true,
);

function toast(t, ms = 2600) {
  toastEl.textContent = t;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

const lockScroll = () =>
  document.body.classList.toggle(
    "scroll-locked",
    drawer.classList.contains("open") ||
      productModal.classList.contains("show") ||
      roomCalcModal.classList.contains("show") ||
      compareModal.classList.contains("show"),
  );

/* --------------------------------------------------------------------------
   Furniture Intelligence: Parse dimensions, seats, heights & compatibility
   -------------------------------------------------------------------------- */
function isChairProduct(p) {
  const txt = `${p.category || ""} ${p.name || ""}`.toLowerCase();
  return txt.includes("стул") || txt.includes("кресл") || txt.includes("табурет");
}

function isTableProduct(p) {
  const txt = `${p.category || ""} ${p.name || ""}`.toLowerCase();
  return txt.includes("стол") || txt.includes("парт");
}

function parseDimsFromText(dimensions = "") {
  const nums = (String(dimensions || "").match(/\d{2,3}/g) || [])
    .map(Number)
    .filter((n) => n >= 25 && n <= 400);
  const isRound = /ø|диаметр|круг/i.test(dimensions);
  if (isRound && nums.length >= 1) {
    return {
      length: nums[0],
      width: nums[0],
      height: nums[1] || null,
      shape: "Круглый",
    };
  }
  return {
    length: nums[0] || null,
    width: nums[1] || null,
    height: nums[2] || null,
    shape: "",
  };
}

function estimateTableSeats(lengthCm, shape = "") {
  if (!lengthCm) return null;
  if (/круг/i.test(shape)) {
    if (lengthCm <= 95) return 2;
    if (lengthCm <= 115) return 4;
    return 6;
  }
  if (lengthCm <= 95) return 2;
  if (lengthCm <= 145) return 4;
  if (lengthCm <= 185) return 6;
  return 8;
}

function enrichProduct(raw) {
  const parsed = parseDimsFromText(raw.dimensions);
  const table = isTableProduct(raw);
  const chair = isChairProduct(raw);
  const lengthCm = Number(raw.length_cm) || (table ? parsed.length : null);
  const widthCm = Number(raw.width_cm) || (table ? parsed.width : null);
  const heightCm = Number(raw.height_cm) || parsed.height || null;
  const seatHeightCm = Number(raw.seat_height_cm) || null;
  const shape = raw.shape || parsed.shape || "";
  const seats =
    Number(raw.seats) || (table ? estimateTableSeats(lengthCm, shape) : null);

  let dimsDisplay = String(raw.dimensions || "").trim();
  if (!dimsDisplay && lengthCm && widthCm) {
    dimsDisplay = heightCm
      ? `${lengthCm} × ${widthCm} × ${heightCm} см`
      : `${lengthCm} × ${widthCm} см`;
  }

  return {
    ...raw,
    id: String(raw.id),
    oldPrice: Number(raw.old_price) || 0,
    isTable: table,
    isChair: chair,
    lengthCm,
    widthCm,
    heightCm,
    seatHeightCm,
    seats,
    shape,
    extendable: Boolean(raw.extendable),
    warrantyMonths: Number(raw.warranty_months) || null,
    deliveryTime: String(raw.delivery_time || "").trim(),
    dimsDisplay,
  };
}

function checkHeightCompatibility(table, chair) {
  const th = table?.heightCm;
  const sh = chair?.seatHeightCm;
  if (!th || !sh) return null;
  const diff = th - sh;
  if (diff >= 26 && diff <= 33) {
    return {
      ok: true,
      diff,
      text: `Комфортная посадка: разница между столом (${th} см) и сиденьем (${sh} см) — ${diff} см.`,
    };
  }
  if (diff < 26) {
    return {
      ok: false,
      diff,
      text: `Обратите внимание: стул (${sh} см) может быть высоковат для стола (${th} см) — зазор ${diff} см.`,
    };
  }
  return {
    ok: false,
    diff,
    text: `Обратите внимание: стул (${sh} см) может быть низковат для стола (${th} см) — разница ${diff} см.`,
  };
}

function productUnit(p) {
  return p.isChair ? "за стул" : p.isTable ? "за стол" : "за товар";
}

function productPhotos(p) {
  return [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])]
    .map(safeImageURL)
    .filter((url) => url !== "data:,");
}

function seatLabel(seats) {
  if (!seats) return "";
  if (seats === 1) return "1 место";
  if (seats >= 2 && seats <= 4) return `${seats} места`;
  return `${seats} мест`;
}

/* --------------------------------------------------------------------------
   Load Catalog (with human-friendly fallback, zero SQL leakage)
   -------------------------------------------------------------------------- */
async function loadProducts() {
  grid.innerHTML = '<div class="empty">Загружаем каталог…</div>';
  try {
    const { data, error } = await db.from("products").select("*").order("id");
    if (error) throw error;
    products = (data || []).map(enrichProduct);
    const orderableIds = new Set(
      products
        .filter((p) => p.availability !== "Нет в наличии")
        .map((p) => p.id),
    );
    saveCart(getCart().filter((item) => orderableIds.has(String(item.id))));
    updateHeroCategoryCounts();
    renderFilters();
    renderProducts();
    renderCart();
    updateFavoritesBadge();
    renderCompareBar();
    renderRecentlyViewed();
    openProductFromHash();
  } catch (error) {
    console.error("Не удалось загрузить каталог:", error);
    const waUrl = buildWhatsAppUrl(
      "Здравствуйте! Подскажите, пожалуйста, актуальный каталог столов и стульев NURROOM.",
    );
    grid.innerHTML = `<div class="empty">
      Не получилось загрузить каталог. Проверьте интернет-соединение и попробуйте ещё раз.
      <div class="empty-actions">
        <button class="outline-btn btn" id="retry" type="button">Повторить</button>
        ${waUrl ? `<a class="primary-btn btn btn-dark whatsapp-order-link" href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp me-2" aria-hidden="true"></i>Написать в WhatsApp</a>` : ""}
      </div>
    </div>`;
    $("retry").onclick = loadProducts;
    $("resultsCount").textContent = "Каталог временно недоступен";
  }
}

function updateHeroCategoryCounts() {
  const tablesCount = products.filter((p) => p.isTable).length;
  const chairsCount = products.filter((p) => p.isChair).length;
  if ($("heroTableCount") && tablesCount) {
    $("heroTableCount").textContent = `${tablesCount} ${pluralize(tablesCount, "модель", "модели", "моделей")}`;
  }
  if ($("heroChairCount") && chairsCount) {
    $("heroChairCount").textContent = `${chairsCount} ${pluralize(chairsCount, "модель", "модели", "моделей")}`;
  }
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/* --------------------------------------------------------------------------
   Accessible Custom Dropdowns
   -------------------------------------------------------------------------- */
function populateFacet(id, values, label) {
  const select = $(id);
  if (!select) return;
  const current = select.value;
  const unique = [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  select.innerHTML =
    `<option value="">${label}</option>` +
    unique
      .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`)
      .join("");
  if (unique.includes(current)) select.value = current;
  renderDropdown(select);
}

function renderDropdown(select) {
  const wrapper = select.closest(".dropdown-control");
  if (!wrapper) return;
  const current = select.selectedOptions[0];
  wrapper.querySelector(".dropdown-current").textContent =
    current?.textContent || "";
  wrapper.querySelector(".dropdown-menu").innerHTML = [...select.options]
    .map(
      (option) =>
        `<button type="button" class="dropdown-option${option.selected ? " selected" : ""}" role="option" aria-selected="${option.selected}" data-dropdown-value="${esc(option.value)}" ${option.disabled ? "disabled" : ""}>${esc(option.textContent)}</button>`,
    )
    .join("");
}

function enhanceDropdown(id, labelId = "") {
  const select = $(id);
  if (!select) return;
  const wrapper = document.createElement("div");
  wrapper.className = `dropdown-control${id === "sortSelect" ? " sort-dropdown" : ""}`;
  wrapper.dataset.dropdownFor = id;
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dropdown-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") || "Выбрать значение",
  );

  const label = document.createElement("span");
  label.className = "dropdown-current";
  label.id = `${id}Current`;
  const arrow = document.createElement("span");
  arrow.className = "dropdown-arrow";
  arrow.setAttribute("aria-hidden", "true");
  trigger.setAttribute("aria-controls", `${id}Menu`);
  if (labelId)
    trigger.setAttribute("aria-labelledby", `${labelId} ${label.id}`);
  trigger.append(label, arrow);

  const menu = document.createElement("div");
  menu.id = `${id}Menu`;
  menu.className = "dropdown-menu";
  menu.setAttribute("role", "listbox");
  if (labelId) menu.setAttribute("aria-labelledby", labelId);

  wrapper.append(trigger, menu);
  select.addEventListener("change", () => renderDropdown(select));
  renderDropdown(select);
}

function closeDropdowns(except = null) {
  document.querySelectorAll(".dropdown-control.open").forEach((wrapper) => {
    if (wrapper === except) return;
    wrapper.classList.remove("open");
    wrapper
      .querySelector(".dropdown-trigger")
      .setAttribute("aria-expanded", "false");
  });
}

/* --------------------------------------------------------------------------
   Filters & Catalog Rendering
   -------------------------------------------------------------------------- */
function renderFilters() {
  const cats = [
    "Все",
    ...new Set(products.map((p) => p.category).filter(Boolean)),
  ];
  if (!cats.includes(category)) category = "Все";

  $("filters").innerHTML = cats
    .map((c) => {
      const count =
        c === "Все"
          ? products.length
          : products.filter((p) => p.category === c).length;
      return `<button type="button" class="filter btn btn-sm${c === category ? " active" : ""}" data-category="${esc(c)}">${c === "Все" ? "Все товары" : esc(c)}<span class="filter-count">${count}</span></button>`;
    })
    .join("");

  populateFacet(
    "materialFilter",
    products.map((p) => p.material),
    "Любой материал",
  );
  populateFacet(
    "colorFilter",
    products.map((p) => p.color),
    "Любой оттенок",
  );
  populateFacet(
    "availabilityFilter",
    products
      .map((p) => p.availability)
      .filter((v) => v && v !== "Уточнить"),
    "Любое наличие",
  );
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\w\s\u0400-\u04ff]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesSeatsRange(seats, filterVal) {
  if (!filterVal) return true;
  if (!seats) return false;
  if (filterVal === "2-4") return seats >= 2 && seats <= 4;
  if (filterVal === "4-6") return seats >= 4 && seats <= 6;
  if (filterVal === "6-8") return seats >= 6 && seats <= 8;
  if (filterVal === "8+") return seats >= 8;
  return true;
}

function matchesLengthRange(lengthCm, filterVal) {
  if (!filterVal) return true;
  if (!lengthCm) return false;
  if (filterVal === "0-100") return lengthCm <= 100;
  if (filterVal === "100-140") return lengthCm >= 100 && lengthCm <= 140;
  if (filterVal === "140-180") return lengthCm >= 140 && lengthCm <= 180;
  if (filterVal === "180+") return lengthCm >= 180;
  return true;
}

function matchesRoomFilter(p) {
  if (!roomFilter) return true;
  if (!p.isTable) return false;
  if (!p.lengthCm) return false;
  const w = p.widthCm || p.lengthCm;
  const fitsNormal = p.lengthCm <= roomFilter.maxLen && w <= roomFilter.maxWid;
  const fitsRotated = p.lengthCm <= roomFilter.maxWid && w <= roomFilter.maxLen;
  return fitsNormal || fitsRotated;
}

function getActiveFilterCount() {
  let count = 0;
  if ($("seatsFilter").value) count++;
  if ($("lengthFilter").value) count++;
  if ($("materialFilter").value) count++;
  if ($("colorFilter").value) count++;
  if ($("availabilityFilter").value) count++;
  return count;
}

function hasAnyActiveFilter() {
  return Boolean(
    category !== "Все" ||
      $("searchInput").value.trim() ||
      quickInStock ||
      quickSale ||
      quickFavs ||
      roomFilter ||
      getActiveFilterCount() > 0,
  );
}

function resetAllFilters() {
  category = "Все";
  quickInStock = false;
  quickSale = false;
  quickFavs = false;
  roomFilter = null;
  $("searchInput").value = "";
  for (const id of [
    "seatsFilter",
    "lengthFilter",
    "materialFilter",
    "colorFilter",
    "availabilityFilter",
  ]) {
    $(id).value = "";
    renderDropdown($(id));
  }
  syncQuickChipsUI();
  renderFilters();
  renderProducts();
}

function syncQuickChipsUI() {
  $("chipInStock").classList.toggle("active", quickInStock);
  $("chipSale").classList.toggle("active", quickSale);
  $("chipFavs").classList.toggle("active", quickFavs);
  $("openFavorites").classList.toggle("active", quickFavs);

  const chip = $("roomFilterChip");
  if (roomFilter) {
    $("roomFilterLabel").textContent =
      `До ${roomFilter.maxLen}×${roomFilter.maxWid} см`;
    chip.hidden = false;
  } else {
    chip.hidden = true;
  }

  $("resetFilters").hidden = !hasAnyActiveFilter();

  const facetCount = getActiveFilterCount();
  const badge = $("activeFilterBadge");
  badge.textContent = String(facetCount);
  badge.hidden = facetCount === 0;
}

function renderProducts() {
  syncQuickChipsUI();
  const queryTokens = normalizeSearchText($("searchInput").value)
    .split(" ")
    .filter(Boolean);
  const seatsVal = $("seatsFilter").value;
  const lengthVal = $("lengthFilter").value;
  const material = $("materialFilter").value;
  const color = $("colorFilter").value;
  const availability = $("availabilityFilter").value;
  const favSet = new Set(getFavorites());
  const compareSet = new Set(getCompare());

  let list = products.filter((p) => {
    const searchable = normalizeSearchText(
      [
        p.name,
        p.category,
        p.description,
        p.material,
        p.color,
        p.dimsDisplay,
        p.shape,
        p.availability,
        p.badge,
        money(p.price),
        p.price,
      ]
        .filter((v) => v !== null && v !== undefined)
        .join(" "),
    );
    const matchesQuery = queryTokens.every((token) =>
      searchable.includes(token),
    );
    return (
      (category === "Все" || p.category === category) &&
      (!material || p.material === material) &&
      (!color || p.color === color) &&
      (!availability || p.availability === availability) &&
      (!quickInStock || p.availability === "В наличии") &&
      (!quickSale || p.oldPrice > p.price) &&
      (!quickFavs || favSet.has(p.id)) &&
      matchesSeatsRange(p.seats, seatsVal) &&
      matchesLengthRange(p.lengthCm, lengthVal) &&
      matchesRoomFilter(p) &&
      matchesQuery
    );
  });

  if (sortMode === "asc") list.sort((a, b) => a.price - b.price);
  if (sortMode === "desc") list.sort((a, b) => b.price - a.price);

  $("resultsCount").textContent =
    list.length === products.length
      ? `Всего в каталоге: ${products.length} ${pluralize(products.length, "товар", "товара", "товаров")}`
      : `Найдено: ${list.length} из ${products.length}`;

  if (!list.length) {
    grid.innerHTML = `<div class="empty">
      По выбранным параметрам модели не найдены.
      <div class="empty-actions">
        <button type="button" class="primary-btn btn btn-dark" data-reset-filters>Сбросить все фильтры</button>
      </div>
    </div>`;
    return;
  }

  grid.innerHTML = list
    .map((p) => {
      const photos = productPhotos(p);
      const mainImg = photos[0] || "data:,";
      const altImg = photos[1] || "";
      const discountPct =
        p.oldPrice > p.price
          ? Math.round(100 - (p.price / p.oldPrice) * 100)
          : 0;
      const unavailable = p.availability === "Нет в наличии";
      const isFav = favSet.has(p.id);
      const isCmp = compareSet.has(p.id);
      const chosenQty = cardQtySelection.get(p.id) || 1;

      const leftBadges = [
        p.badge ? `<span class="product-badge">${esc(p.badge)}</span>` : "",
        discountPct
          ? `<span class="product-badge sale-badge">−${discountPct}%</span>`
          : "",
        p.isTable && p.seats
          ? `<span class="product-badge seats-badge">${esc(seatLabel(p.seats))}</span>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      const specChips = [
        p.dimsDisplay
          ? `<span class="spec-chip"><i class="bi bi-rulers" aria-hidden="true"></i>${esc(p.dimsDisplay)}</span>`
          : "",
        p.material
          ? `<span class="spec-chip"><i class="bi bi-layers" aria-hidden="true"></i>${esc(p.material)}</span>`
          : "",
        p.color
          ? `<span class="spec-chip"><i class="bi bi-palette2" aria-hidden="true"></i>${esc(p.color)}</span>`
          : "",
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join("");

      const availBadge =
        p.availability && p.availability !== "Уточнить"
          ? `<p class="product-availability${unavailable ? " unavailable" : p.availability === "Под заказ" ? " on-order" : ""}">${esc(p.availability)}${p.deliveryTime ? ` · ${esc(p.deliveryTime)}` : ""}</p>`
          : "";

      const chairQtyBar =
        p.isChair && !unavailable
          ? `<div class="card-qty-row" aria-label="Выбор количества стульев">
              <span class="card-qty-label">Кол-во:</span>
              <div class="qty-preset-group">
                ${[1, 2, 4, 6]
                  .map(
                    (n) =>
                      `<button type="button" class="qty-preset${chosenQty === n ? " active" : ""}" data-card-qty="${esc(p.id)}" data-qty-val="${n}">${n}</button>`,
                  )
                  .join("")}
              </div>
            </div>`
          : "";

      const addLabel = unavailable
        ? `<i class="bi bi-x-circle me-1" aria-hidden="true"></i>Нет в наличии`
        : chosenQty > 1
          ? `<i class="bi bi-bag-plus me-1" aria-hidden="true"></i>В корзину (${chosenQty} шт.)`
          : `<i class="bi bi-bag-plus me-1" aria-hidden="true"></i>В корзину`;

      return `
        <article class="product-card card h-100">
          <div class="product-photo-wrap">
            <button type="button" class="product-photo" data-detail="${esc(p.id)}" aria-label="Подробнее: ${esc(p.name)}">
              <img class="product-image" src="${esc(mainImg)}" alt="${esc(p.name)}" width="800" height="900" loading="lazy">
              ${altImg ? `<img class="product-image product-image-alt" src="${esc(altImg)}" alt="" width="800" height="900" loading="lazy">` : ""}
              ${leftBadges ? `<div class="card-badges-left">${leftBadges}</div>` : ""}
            </button>
            <div class="card-float-tools">
              <button type="button" class="card-tool-btn${isFav ? " is-fav" : ""}" data-fav="${esc(p.id)}" aria-label="${isFav ? "Убрать из избранного" : "В избранное"}" title="Избранное">
                <i class="bi ${isFav ? "bi-heart-fill" : "bi-heart"}" aria-hidden="true"></i>
              </button>
              <button type="button" class="card-tool-btn${isCmp ? " is-compare" : ""}" data-compare="${esc(p.id)}" aria-label="${isCmp ? "Убрать из сравнения" : "Сравнить модель"}" title="Сравнить">
                <i class="bi bi-layout-split" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="product-meta card-body">
            <div class="product-title-row">
              <div class="product-heading">
                <span class="product-category">${esc(p.category || "Мебель")}</span>
                <button type="button" class="product-name-btn" data-detail="${esc(p.id)}">
                  <h3>${esc(p.name)}</h3>
                </button>
              </div>
              <div class="product-pricing">
                ${p.oldPrice > p.price ? `<span class="old-price">${money(p.oldPrice)}</span>` : ""}
                <span class="price">${money(p.price)}</span>
              </div>
            </div>
            <p class="price-unit">${productUnit(p)}</p>
            ${specChips ? `<div class="spec-chips">${specChips}</div>` : ""}
            ${availBadge}
            ${chairQtyBar}
            <div class="product-card-actions">
              <button type="button" class="primary-btn btn btn-dark" data-add="${esc(p.id)}" data-add-qty="${chosenQty}" ${unavailable ? "disabled" : ""}>${addLabel}</button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

/* --------------------------------------------------------------------------
   Product Detail Modal, Deep Linking (#product-ID) & Set Builder
   -------------------------------------------------------------------------- */
function openProduct(id, updateHash = true) {
  const p = products.find((item) => item.id === String(id));
  if (!p) return;

  activeDetailProduct = p;
  activeDetailQty = cardQtySelection.get(p.id) || (p.isChair ? 4 : 1);

  pushRecentlyViewed(p.id);
  renderRecentlyViewed();

  if (updateHash && location.hash !== `#product-${p.id}`) {
    history.replaceState(null, "", `#product-${encodeURIComponent(p.id)}`);
  }

  const photos = productPhotos(p);
  const image = $("productDetailImage");
  image.src = photos[0] || "data:,";
  image.alt = p.name;

  $("productDetailCategory").textContent = p.category || "Мебель";
  $("productDetailName").textContent = p.name;

  const savings = p.oldPrice > p.price ? p.oldPrice - p.price : 0;
  $("productDetailPrice").innerHTML = savings
    ? `${money(p.price)} <small class="old-price d-inline ms-2">${money(p.oldPrice)}</small> <span class="badge bg-success-subtle text-success ms-1" style="font-size:12px">−${money(savings)}</span>`
    : `${money(p.price)} <small style="font-size:13px;color:var(--muted);font-weight:500">${productUnit(p)}</small>`;

  $("productDetailDescription").textContent =
    p.description || "Подробные параметры указаны в таблице ниже.";

  const specs = [
    ["Габариты", p.dimsDisplay],
    ["Вместимость", p.seats ? seatLabel(p.seats) : ""],
    ["Форма", p.shape ? `${p.shape}${p.extendable ? " (раздвижной)" : ""}` : ""],
    ["Высота сиденья", p.seatHeightCm ? `${p.seatHeightCm} см` : ""],
    ["Материал", p.material],
    ["Оттенок", p.color],
    ["Наличие", p.availability && p.availability !== "Уточнить" ? p.availability : ""],
    ["Срок доставки", p.deliveryTime],
    ["Гарантия", p.warrantyMonths ? `${p.warrantyMonths} мес.` : ""],
  ].filter(([, value]) => value);

  $("productDetailSpecs").innerHTML = specs
    .map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`)
    .join("");

  $("productThumbnails").innerHTML =
    photos.length > 1
      ? photos
          .map(
            (src, index) =>
              `<button type="button" class="product-thumbnail${index === 0 ? " active" : ""}" data-photo-index="${index}" aria-label="Фото ${index + 1}"><img src="${esc(src)}" alt=""></button>`,
          )
          .join("")
      : "";

  const isFav = getFavorites().includes(p.id);
  const favBtn = $("detailFavBtn");
  favBtn.classList.toggle("is-fav", isFav);
  favBtn.innerHTML = `<i class="bi ${isFav ? "bi-heart-fill" : "bi-heart"}" aria-hidden="true"></i>`;

  const unavailable = p.availability === "Нет в наличии";
  $("detailQtyBar").hidden = unavailable;
  updateDetailQtyUI();
  renderSetBuilder(p);

  productModal.classList.add("show");
  lockScroll();
  $("closeProduct").focus();
}

function updateDetailQtyUI() {
  if (!activeDetailProduct) return;
  const p = activeDetailProduct;
  const unavailable = p.availability === "Нет в наличии";
  document.querySelectorAll("[data-detail-qty]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.detailQty) === activeDetailQty);
  });
  const addButton = $("productDetailAdd");
  addButton.dataset.add = p.id;
  addButton.dataset.addQty = String(activeDetailQty);
  addButton.disabled = unavailable;
  addButton.innerHTML = unavailable
    ? `<i class="bi bi-x-circle me-2" aria-hidden="true"></i><span>Нет в наличии</span>`
    : `<i class="bi bi-bag-plus me-2" aria-hidden="true"></i><span>В корзину (${activeDetailQty} шт.) · ${money(p.price * activeDetailQty)}</span>`;
}

function renderSetBuilder(tableProduct) {
  const box = $("setBuilder");
  const chairs = products.filter(
    (item) => item.isChair && item.availability !== "Нет в наличии",
  );
  if (!tableProduct.isTable || tableProduct.availability === "Нет в наличии" || !chairs.length) {
    box.hidden = true;
    return;
  }

  box.hidden = false;
  if (!chairs.some((c) => c.id === activeSetChairId)) {
    activeSetChairId = chairs[0].id;
  }
  activeSetChairQty =
    tableProduct.seats && [2, 4, 6, 8].includes(tableProduct.seats)
      ? tableProduct.seats
      : 4;

  $("setChairList").innerHTML = chairs
    .map(
      (c) => `
      <button type="button" class="set-chair-option${c.id === activeSetChairId ? " active" : ""}" data-set-chair="${esc(c.id)}">
        <img src="${esc(safeImageURL(c.image))}" alt="${esc(c.name)}" loading="lazy">
        <strong>${esc(c.name)}</strong>
        <span>${money(c.price)}</span>
      </button>`,
    )
    .join("");

  updateSetBuilderSummary();
}

function updateSetBuilderSummary() {
  if (!activeDetailProduct || !activeSetChairId) return;
  const chair = products.find((c) => c.id === activeSetChairId);
  if (!chair) return;

  document.querySelectorAll("[data-set-chair]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.setChair === activeSetChairId);
  });
  document.querySelectorAll("[data-set-qty]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.setQty) === activeSetChairQty);
  });

  const compat = checkHeightCompatibility(activeDetailProduct, chair);
  const compatEl = $("setCompatibility");
  if (compat) {
    compatEl.hidden = false;
    compatEl.className = `set-compat ${compat.ok ? "ok" : "warn"}`;
    compatEl.innerHTML = `<i class="bi ${compat.ok ? "bi-check-circle" : "bi-exclamation-triangle"} me-1" aria-hidden="true"></i>${esc(compat.text)}`;
  } else {
    compatEl.hidden = true;
  }

  const total = activeDetailProduct.price + chair.price * activeSetChairQty;
  $("setTotalPrice").textContent = money(total);
}

function closeProduct() {
  productModal.classList.remove("show");
  lockScroll();
  if (location.hash.startsWith("#product-")) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function openProductFromHash() {
  const match = location.hash.match(/^#product-(.+)$/);
  if (!match) return;
  const id = decodeURIComponent(match[1]);
  if (products.some((p) => p.id === id)) openProduct(id, false);
}

/* --------------------------------------------------------------------------
   Recently Viewed, Favorites & Comparison
   -------------------------------------------------------------------------- */
function renderRecentlyViewed() {
  const section = $("recentlyViewedSection");
  const container = $("recentlyViewedGrid");
  const list = getRecentlyViewed()
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);
  if (!list.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  container.innerHTML = list
    .map(
      (p) => `
      <button type="button" class="recent-card" data-detail="${esc(p.id)}">
        <img src="${esc(safeImageURL(p.image))}" alt="${esc(p.name)}" loading="lazy">
        <div class="recent-card-body">
          <strong>${esc(p.name)}</strong>
          <span>${money(p.price)}</span>
        </div>
      </button>`,
    )
    .join("");
}

function updateFavoritesBadge() {
  const count = getFavorites().filter((id) =>
    products.some((p) => p.id === id),
  ).length;
  const badge = $("favoritesCount");
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const exists = favs.includes(id);
  const next = exists ? favs.filter((x) => x !== id) : [...favs, id];
  saveFavorites(next);
  updateFavoritesBadge();
  renderProducts();
  if (activeDetailProduct && activeDetailProduct.id === id) {
    const favBtn = $("detailFavBtn");
    favBtn.classList.toggle("is-fav", !exists);
    favBtn.innerHTML = `<i class="bi ${!exists ? "bi-heart-fill" : "bi-heart"}" aria-hidden="true"></i>`;
  }
  toast(exists ? "Убрано из избранного" : "Добавлено в избранное");
}

function renderCompareBar() {
  const valid = getCompare().filter((id) => products.some((p) => p.id === id));
  const bar = $("compareBar");
  $("compareCount").textContent = String(valid.length);
  bar.hidden = valid.length === 0;
}

function toggleCompare(id) {
  const list = getCompare().filter((x) => products.some((p) => p.id === x));
  const exists = list.includes(id);
  if (!exists && list.length >= 3) {
    toast("Можно сравнить максимум 3 модели одновременно");
    return;
  }
  const next = exists ? list.filter((x) => x !== id) : [...list, id];
  saveCompare(next);
  renderCompareBar();
  renderProducts();
  toast(exists ? "Убрано из сравнения" : "Добавлено к сравнению");
}

function openCompareModal() {
  const items = getCompare()
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);
  if (!items.length) return;

  const rows = [
    ["Цена", (p) => `<strong>${money(p.price)}</strong>`],
    ["Категория", (p) => esc(p.category || "—")],
    ["Габариты", (p) => esc(p.dimsDisplay || "—")],
    ["Мест", (p) => esc(p.seats ? seatLabel(p.seats) : "—")],
    ["Высота сиденья", (p) => esc(p.seatHeightCm ? `${p.seatHeightCm} см` : "—")],
    ["Материал", (p) => esc(p.material || "—")],
    ["Оттенок", (p) => esc(p.color || "—")],
    ["Наличие", (p) => esc(p.availability && p.availability !== "Уточнить" ? p.availability : "—")],
    ["Срок доставки", (p) => esc(p.deliveryTime || "—")],
    ["Гарантия", (p) => esc(p.warrantyMonths ? `${p.warrantyMonths} мес.` : "—")],
  ];

  $("compareTableWrap").innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Модель</th>
          ${items
            .map(
              (p) => `
              <td>
                <div class="compare-prod-head">
                  <img src="${esc(safeImageURL(p.image))}" alt="${esc(p.name)}">
                  <div class="fw-bold mb-1">${esc(p.name)}</div>
                  <div class="d-flex gap-2">
                    <button type="button" class="primary-btn btn btn-dark btn-sm" style="min-height:34px;padding:0 12px;font-size:12px" data-add="${esc(p.id)}" ${p.availability === "Нет в наличии" ? "disabled" : ""}>В корзину</button>
                    <button type="button" class="outline-btn btn btn-sm" style="min-height:34px;padding:0 10px;font-size:12px" data-compare-remove="${esc(p.id)}">Убрать</button>
                  </div>
                </div>
              </td>`,
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            ([label, renderCell]) =>
              `<tr><th>${label}</th>${items.map((p) => `<td>${renderCell(p)}</td>`).join("")}</tr>`,
          )
          .join("")}
      </tbody>
    </table>`;

  compareModal.classList.add("show");
  lockScroll();
}

function closeCompareModal() {
  compareModal.classList.remove("show");
  lockScroll();
}

/* --------------------------------------------------------------------------
   Room Fit Calculator
   -------------------------------------------------------------------------- */
function computeRoomFit() {
  const roomLen = Math.max(150, Number($("roomLengthInput").value) || 300);
  const roomWid = Math.max(150, Number($("roomWidthInput").value) || 240);
  const clearance = Number($("roomClearanceSelect").value) || 85;
  const maxLen = Math.max(0, roomLen - clearance * 2);
  const maxWid = Math.max(0, roomWid - clearance * 2);

  const matchingTables = products.filter((p) => {
    if (!p.isTable || !p.lengthCm) return false;
    const w = p.widthCm || p.lengthCm;
    return (
      (p.lengthCm <= maxLen && w <= maxWid) ||
      (p.lengthCm <= maxWid && w <= maxLen)
    );
  });

  const resultEl = $("roomCalcResult");
  if (maxLen < 60 || maxWid < 60) {
    resultEl.innerHTML =
      "<strong>Зона слишком тесная для выбранного прохода</strong>Попробуйте уменьшить запас на проход до 75 см или проверьте размеры комнаты.";
    $("applyRoomCalc").disabled = true;
    return { maxLen, maxWid, roomLen, roomWid, count: 0 };
  }

  resultEl.innerHTML = `
    <strong>Максимальный стол: до ${maxLen} × ${maxWid} см</strong>
    Подходит моделей столов в каталоге: <b>${matchingTables.length}</b> (с учётом прохода ${clearance} см с каждой стороны).
  `;
  $("applyRoomCalc").disabled = matchingTables.length === 0;
  return { maxLen, maxWid, roomLen, roomWid, count: matchingTables.length };
}

function openRoomCalc() {
  computeRoomFit();
  roomCalcModal.classList.add("show");
  lockScroll();
}

function closeRoomCalc() {
  roomCalcModal.classList.remove("show");
  lockScroll();
}

/* --------------------------------------------------------------------------
   Unified Cart + Checkout Drawer (Steps 1, 2, 3 in one panel)
   -------------------------------------------------------------------------- */
function cartItems() {
  return getCart()
    .map((c) => ({
      ...products.find((p) => p.id === String(c.id)),
      qty: Math.min(20, Math.max(1, c.qty)),
    }))
    .filter((p) => p.id);
}

function setDrawerStep(step) {
  const isItems = step === "items";
  const isCheckout = step === "checkout";
  const isSuccess = step === "success";

  $("cartStepItems").hidden = !isItems;
  $("cartStepCheckout").hidden = isItems;
  $("checkoutFields").hidden = !isCheckout;
  $("checkoutSuccess").hidden = !isSuccess;
  $("backToCart").hidden = !isCheckout;

  document.querySelectorAll("[data-step-indicator]").forEach((el) => {
    const key = el.dataset.stepIndicator;
    el.classList.toggle("active", (isItems && key === "items") || (!isItems && key === "checkout"));
  });

  if (isItems) {
    $("drawerKicker").textContent = "ВАШ ВЫБОР";
    $("drawerTitle").textContent = "Корзина";
  } else if (isCheckout) {
    $("drawerKicker").textContent = "ПОСЛЕДНИЙ ШАГ";
    $("drawerTitle").textContent = "Оформление";
  } else {
    $("drawerKicker").textContent = "ГОТОВО";
    $("drawerTitle").textContent = "Заявка принята";
  }
}

function renderCart() {
  const items = cartItems();
  const totalQty = items.reduce((s, p) => s + p.qty, 0);
  const total = items.reduce((s, p) => s + p.price * p.qty, 0);
  const savings = items.reduce(
    (s, p) => s + (p.oldPrice > p.price ? (p.oldPrice - p.price) * p.qty : 0),
    0,
  );

  $("cartCount").textContent = String(totalQty);
  if ($("drawerItemsMeta")) {
    $("drawerItemsMeta").textContent = totalQty
      ? `${totalQty} ${pluralize(totalQty, "товар", "товара", "товаров")}`
      : "";
  }
  $("cartTotal").textContent = $("checkoutTotal").textContent = money(total);
  $("checkoutBtn").disabled = !items.length;

  $("cartSavingsRow").hidden = savings <= 0;
  $("cartSavings").textContent = `−${money(savings)}`;

  // Height compatibility check inside cart
  const tablesInCart = items.filter((p) => p.isTable && p.heightCm);
  const chairsInCart = items.filter((p) => p.isChair && p.seatHeightCm);
  const heightEl = $("cartHeightCheck");
  if (tablesInCart.length && chairsInCart.length) {
    const check = checkHeightCompatibility(tablesInCart[0], chairsInCart[0]);
    if (check) {
      heightEl.hidden = false;
      heightEl.className = `cart-height-alert ${check.ok ? "ok" : "warn"}`;
      heightEl.innerHTML = `<i class="bi ${check.ok ? "bi-check-circle" : "bi-exclamation-triangle"}" aria-hidden="true"></i><span>${esc(check.text)}</span>`;
    } else {
      heightEl.hidden = true;
    }
  } else {
    heightEl.hidden = true;
  }

  // Cart items or refined empty state
  $("cartItems").innerHTML = items.length
    ? items
        .map(
          (p) => `
          <article class="cart-row">
            <img src="${esc(safeImageURL(p.image))}" alt="${esc(p.name)}" loading="lazy">
            <div class="cart-row-main">
              <div class="cart-row-top">
                <div class="min-width-0">
                  <span class="cart-item-category">${esc(p.category || "Мебель")}</span>
                  <h4>${esc(p.name)}</h4>
                  <p class="cart-unit-price">${money(p.price)} / шт.</p>
                </div>
                <button type="button" class="cart-remove-icon" data-remove="${esc(p.id)}" aria-label="Удалить ${esc(p.name)}" title="Убрать">
                  <i class="bi bi-x-lg" aria-hidden="true"></i>
                </button>
              </div>
              <div class="cart-row-bottom">
                <div class="quantity" aria-label="Количество товара">
                  <button type="button" data-qty="${esc(p.id)}" data-delta="-1" aria-label="Уменьшить количество">−</button>
                  <span>${p.qty}</span>
                  <button type="button" data-qty="${esc(p.id)}" data-delta="1" aria-label="Увеличить количество">+</button>
                </div>
                <strong class="cart-line-total">${money(p.price * p.qty)}</strong>
              </div>
            </div>
          </article>`,
        )
        .join("")
    : `<div class="cart-empty-card">
        <span class="cart-empty-icon"><i class="bi bi-bag" aria-hidden="true"></i></span>
        <h3>Корзина пока пуста</h3>
        <p>Выберите стол или комплект стульев в каталоге — мы поможем с подбором и доставкой.</p>
        <div class="empty-actions">
          <button type="button" class="outline-btn btn" data-empty-jump="Столы">Столы</button>
          <button type="button" class="outline-btn btn" data-empty-jump="Стулья">Стулья</button>
        </div>
      </div>`;

  // Smart cross-sell: if user added a table but no chairs
  const hasTable = items.some((p) => p.isTable);
  const hasChair = items.some((p) => p.isChair);
  const crossSellBox = $("cartCrossSell");
  if (hasTable && !hasChair) {
    const suggestedChairs = products
      .filter((p) => p.isChair && p.availability !== "Нет в наличии")
      .slice(0, 2);
    if (suggestedChairs.length) {
      const tableSeats =
        items.find((p) => p.isTable)?.seats || 4;
      crossSellBox.hidden = false;
      crossSellBox.innerHTML = `
        <div class="cross-sell-title">Добавьте стулья к столу</div>
        <div class="cross-sell-list">
          ${suggestedChairs
            .map(
              (c) => `
              <div class="cross-sell-item">
                <img src="${esc(safeImageURL(c.image))}" alt="${esc(c.name)}" loading="lazy">
                <div class="min-width-0">
                  <strong>${esc(c.name)}</strong>
                  <span>${money(c.price)} / шт.</span>
                </div>
                <button type="button" class="cross-sell-add" data-add="${esc(c.id)}" data-add-qty="${tableSeats}">+${tableSeats} шт.</button>
              </div>`,
            )
            .join("")}
        </div>`;
    } else {
      crossSellBox.hidden = true;
    }
  } else {
    crossSellBox.hidden = true;
  }
}

function setQty(id, delta) {
  const c = getCart();
  const i = c.find((x) => String(x.id) === id);
  if (i) i.qty = Math.min(20, i.qty + delta);
  saveCart(c.filter((x) => x.qty > 0));
  renderCart();
}

function addToCart(id, qty = 1, silent = false) {
  const product = products.find((item) => item.id === String(id));
  if (!product || product.availability === "Нет в наличии") return;
  const addQty = Math.min(20, Math.max(1, Number(qty) || 1));
  const c = getCart();
  const existing = c.find((x) => String(x.id) === String(id));
  if (existing) {
    existing.qty = Math.min(20, existing.qty + addQty);
  } else {
    c.push({ id: String(id), qty: addQty });
  }
  saveCart(c);
  renderCart();
  if (!silent) {
    toast(
      addQty > 1
        ? `Добавлено в корзину: ${product.name} (${addQty} шт.)`
        : `Добавлено в корзину: ${product.name}`,
    );
  }
}

function openCart(step = "items") {
  setDrawerStep(step);
  drawer.classList.add("open");
  overlay.classList.add("show");
  lockScroll();
}

function closeCart() {
  drawer.classList.remove("open");
  overlay.classList.remove("show");
  lockScroll();
}

/* --------------------------------------------------------------------------
   Checkout Submit (100% compatible with create_order RPC + friendly errors)
   -------------------------------------------------------------------------- */
function buildWhatsAppOrderLines({ orderNumber, items, name, phone, city, contactPref, paymentPref, comment }) {
  const now = new Date();
  const orderDate = `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(now)}, ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)}`;
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return [
    "Здравствуйте! Хочу оформить заказ в магазине NURROOM.",
    "",
    orderNumber ? `Номер заявки: *${orderNumber}*` : null,
    `Дата: ${orderDate}`,
    "",
    "*Состав заказа:*",
    ...items.map(
      (item, idx) =>
        `${idx + 1}. ${item.name} — ${item.qty} шт. (${money(item.price * item.qty)})`,
    ),
    "",
    `*Итого:* ${money(total)}`,
    "",
    "*Контакты:*",
    `• Имя: ${name}`,
    `• Телефон: ${phone}`,
    `• Город: ${city}`,
    `• Связь: ${contactPref} · Оплата: ${paymentPref}`,
    comment ? `• Комментарий: ${comment}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

$("checkoutPhone").addEventListener("input", (e) => {
  e.target.value = maskKzPhoneInput(e.target.value);
});

$("checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = $("formError");
  const btn = form.querySelector("[type=submit]");
  const d = Object.fromEntries(new FormData(form));
  const items = cartItems();

  err.innerHTML = "";
  if (!items.length) return;

  const phoneDigits = String(d.phone || "").replace(/\D/g, "").length;
  if (phoneDigits < 10 || phoneDigits > 15) {
    err.textContent = "Укажите полный номер телефона, например +7 (700) 123-45-67.";
    return;
  }

  const contactPref = d.contact_pref || "WhatsApp";
  const paymentPref = d.payment_pref || "Kaspi";
  const rawComment = (d.comment || "").trim();
  const combinedComment = [
    `Связь: ${contactPref}, оплата: ${paymentPref}`,
    rawComment,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 1000);

  btn.disabled = true;
  try {
    const { data, error } = await db.rpc("create_order", {
      p_customer: {
        name: d.name.trim(),
        phone: d.phone.trim(),
        address: d.address.trim(),
        comment: combinedComment,
      },
      p_items: items.map((p) => ({ id: p.id, qty: p.qty })),
    });
    if (error) throw error;

    const orderNumber = String(data || "").trim();
    saveCart([]);
    renderCart();
    form.reset();

    setDrawerStep("success");
    $("successOrderNumber").textContent = orderNumber
      ? `Номер заявки: ${orderNumber}`
      : "Заявка сохранена";

    const waText = buildWhatsAppOrderLines({
      orderNumber,
      items,
      name: d.name.trim(),
      phone: d.phone.trim(),
      city: d.address.trim(),
      contactPref,
      paymentPref,
      comment: rawComment,
    });
    const waHref = buildWhatsAppUrl(waText);
    const waLink = $("whatsAppOrderLink");
    const waHint = $("whatsAppHint");

    if (waHref) {
      waLink.href = waHref;
      waLink.hidden = false;
      waHint.textContent =
        "Для самого быстрого подтверждения нажмите кнопку ниже — откроется WhatsApp с готовым текстом заказа.";
      waHint.hidden = false;
    } else {
      waLink.hidden = true;
      waHint.hidden = true;
    }
  } catch (error) {
    console.error("Ошибка отправки заказа:", error);
    const waFallback = buildWhatsAppUrl(
      buildWhatsAppOrderLines({
        orderNumber: "",
        items,
        name: d.name.trim(),
        phone: d.phone.trim(),
        city: d.address.trim(),
        contactPref,
        paymentPref,
        comment: rawComment,
      }),
    );
    err.innerHTML = `<div class="error-fallback-box">
      <span>Не получилось отправить заявку через сайт. Корзина сохранена — вы можете сразу отправить заказ в WhatsApp, и мы оформим его вручную.</span>
      ${waFallback ? `<a class="primary-btn btn btn-dark whatsapp-order-link" href="${esc(waFallback)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp me-2" aria-hidden="true"></i>Оформить в WhatsApp</a>` : ""}
    </div>`;
  } finally {
    btn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Global Event Delegation
   -------------------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  // Custom dropdowns
  const option = e.target.closest("[data-dropdown-value]");
  if (option) {
    const wrapper = option.closest(".dropdown-control");
    const select = $(wrapper.dataset.dropdownFor);
    select.value = option.dataset.dropdownValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeDropdowns();
    wrapper.querySelector(".dropdown-trigger").focus();
    return;
  }
  const trigger = e.target.closest(".dropdown-trigger");
  if (trigger) {
    const wrapper = trigger.closest(".dropdown-control");
    const open = !wrapper.classList.contains("open");
    closeDropdowns(wrapper);
    wrapper.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      (
        wrapper.querySelector(".dropdown-option.selected") ||
        wrapper.querySelector(".dropdown-option")
      )?.focus();
    }
    return;
  }
  if (!e.target.closest(".dropdown-control")) closeDropdowns();

  // Chair quick quantity preset on card
  const cardQtyBtn = e.target.closest("[data-card-qty]");
  if (cardQtyBtn) {
    const pid = cardQtyBtn.dataset.cardQty;
    const val = Number(cardQtyBtn.dataset.qtyVal) || 1;
    cardQtySelection.set(pid, val);
    renderProducts();
    return;
  }

  // Detail modal quantity preset
  const detailQtyBtn = e.target.closest("[data-detail-qty]");
  if (detailQtyBtn) {
    activeDetailQty = Number(detailQtyBtn.dataset.detailQty) || 1;
    updateDetailQtyUI();
    return;
  }

  // Set builder chair select / qty
  const setChairBtn = e.target.closest("[data-set-chair]");
  if (setChairBtn) {
    activeSetChairId = setChairBtn.dataset.setChair;
    updateSetBuilderSummary();
    return;
  }
  const setQtyBtn = e.target.closest("[data-set-qty]");
  if (setQtyBtn) {
    activeSetChairQty = Number(setQtyBtn.dataset.setQty) || 4;
    updateSetBuilderSummary();
    return;
  }

  // Favorite & Compare toggles
  const favBtn = e.target.closest("[data-fav]");
  if (favBtn) {
    toggleFavorite(favBtn.dataset.fav);
    return;
  }
  const cmpBtn = e.target.closest("[data-compare]");
  if (cmpBtn) {
    toggleCompare(cmpBtn.dataset.compare);
    return;
  }
  const cmpRem = e.target.closest("[data-compare-remove]");
  if (cmpRem) {
    toggleCompare(cmpRem.dataset.compareRemove);
    if (getCompare().length) openCompareModal();
    else closeCompareModal();
    return;
  }

  // Hero / Empty cart category jumps
  const jumpCat = e.target.closest("[data-jump-category], [data-empty-jump]");
  if (jumpCat) {
    const target = jumpCat.dataset.jumpCategory || jumpCat.dataset.emptyJump;
    const match = products.find((p) =>
      String(p.category || "").toLowerCase().includes(target.toLowerCase().slice(0, 4)),
    );
    category = match ? match.category : "Все";
    closeCart();
    renderFilters();
    renderProducts();
    $("catalog").scrollIntoView({ behavior: "smooth" });
    return;
  }

  // Quick chips
  const quickBtn = e.target.closest("[data-quick]");
  if (quickBtn) {
    const mode = quickBtn.dataset.quick;
    if (mode === "inStock") quickInStock = !quickInStock;
    if (mode === "sale") quickSale = !quickSale;
    if (mode === "favorites") quickFavs = !quickFavs;
    renderProducts();
    return;
  }

  if (e.target.closest("[data-reset-filters]")) {
    resetAllFilters();
    return;
  }

  // Add to cart / qty / remove / category / detail / thumbnail
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    addToCart(addBtn.dataset.add, Number(addBtn.dataset.addQty) || 1);
    return;
  }
  const qtyBtn = e.target.closest("[data-qty]");
  if (qtyBtn) {
    setQty(qtyBtn.dataset.qty, +qtyBtn.dataset.delta);
    return;
  }
  const remBtn = e.target.closest("[data-remove]");
  if (remBtn) {
    saveCart(getCart().filter((x) => String(x.id) !== remBtn.dataset.remove));
    renderCart();
    return;
  }
  const catBtn = e.target.closest("[data-category]");
  if (catBtn) {
    category = catBtn.dataset.category;
    renderFilters();
    renderProducts();
    return;
  }
  const detailBtn = e.target.closest("[data-detail]");
  if (detailBtn) {
    openProduct(detailBtn.dataset.detail);
    return;
  }
  const photoBtn = e.target.closest("[data-photo-index]");
  if (photoBtn) {
    $("productDetailImage").src = photoBtn.querySelector("img").src;
    document
      .querySelectorAll(".product-thumbnail")
      .forEach((button) => button.classList.toggle("active", button === photoBtn));
  }
});

// Keyboard support for custom dropdowns + Escape closes modals/drawers
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCart();
    closeProduct();
    closeRoomCalc();
    closeCompareModal();
    closeMobileMenu();
    closeDropdowns();
    return;
  }
  const wrapper = event.target.closest(".dropdown-control");
  if (!wrapper) return;
  const trigger = event.target.closest(".dropdown-trigger");
  const options = [...wrapper.querySelectorAll(".dropdown-option")];
  const index = options.indexOf(event.target);

  if (trigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    closeDropdowns(wrapper);
    wrapper.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    (wrapper.querySelector(".dropdown-option.selected") || options[0])?.focus();
    return;
  }
  if (index < 0) return;
  let next = index;
  if (event.key === "ArrowDown") next = Math.min(options.length - 1, index + 1);
  else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = options.length - 1;
  else return;
  event.preventDefault();
  options[next]?.focus();
});

// Filter bindings
$("searchInput").addEventListener("input", renderProducts);
$("seatsFilter").addEventListener("change", renderProducts);
$("lengthFilter").addEventListener("change", renderProducts);
$("materialFilter").addEventListener("change", renderProducts);
$("colorFilter").addEventListener("change", renderProducts);
$("availabilityFilter").addEventListener("change", renderProducts);
$("sortSelect").addEventListener("change", (e) => {
  sortMode = e.target.value;
  renderProducts();
});
$("resetFilters").addEventListener("click", resetAllFilters);
$("roomFilterChip").addEventListener("click", () => {
  roomFilter = null;
  renderProducts();
});

$("toggleMobileFilters").addEventListener("click", () => {
  const wrap = $("catalogFacetsWrap");
  const open = !wrap.classList.contains("is-open");
  wrap.classList.toggle("is-open", open);
  $("toggleMobileFilters").setAttribute("aria-expanded", String(open));
});

// Cart & Checkout step transitions
$("openCart").onclick = () => openCart("items");
$("closeCart").onclick = closeCart;
overlay.onclick = closeCart;
$("checkoutBtn").onclick = () => {
  if (!cartItems().length) return;
  $("formError").innerHTML = "";
  setDrawerStep("checkout");
};
$("backToCart").onclick = () => setDrawerStep("items");
$("successClose").onclick = () => {
  closeCart();
  setDrawerStep("items");
};

// Header Favorites quick button
$("openFavorites").onclick = () => {
  quickFavs = !quickFavs;
  renderProducts();
  $("catalog").scrollIntoView({ behavior: "smooth" });
};

// Product Detail actions (Favorite, Share, Add Set)
$("closeProduct").onclick = closeProduct;
productModal.addEventListener("click", (e) => {
  if (e.target === productModal) closeProduct();
});
$("detailFavBtn").onclick = () => {
  if (activeDetailProduct) toggleFavorite(activeDetailProduct.id);
};
$("shareProductBtn").onclick = async () => {
  if (!activeDetailProduct) return;
  const shareUrl = `${location.origin}${location.pathname}#product-${encodeURIComponent(activeDetailProduct.id)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: activeDetailProduct.name, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    toast("Ссылка на товар скопирована");
  } catch {
    toast("Скопируйте ссылку из адресной строки");
  }
};
$("addSetBtn").onclick = () => {
  if (!activeDetailProduct || !activeSetChairId) return;
  addToCart(activeDetailProduct.id, 1, true);
  addToCart(activeSetChairId, activeSetChairQty, true);
  closeProduct();
  toast(`Комплект добавлен: стол + ${activeSetChairQty} стула`);
  openCart("items");
};

// Room Calculator bindings
$("heroRoomCalc").onclick = openRoomCalc;
$("openRoomCalc").onclick = openRoomCalc;
$("navRoomCalc").onclick = () => {
  closeMobileMenu();
  openRoomCalc();
};
$("closeRoomCalc").onclick = closeRoomCalc;
roomCalcModal.addEventListener("click", (e) => {
  if (e.target === roomCalcModal) closeRoomCalc();
});
$("roomLengthInput").addEventListener("input", computeRoomFit);
$("roomWidthInput").addEventListener("input", computeRoomFit);
$("roomClearanceSelect").addEventListener("change", computeRoomFit);
$("resetRoomCalc").onclick = () => {
  roomFilter = null;
  closeRoomCalc();
  renderProducts();
};
$("applyRoomCalc").onclick = () => {
  const res = computeRoomFit();
  if (res.count <= 0) return;
  roomFilter = res;
  category = "Все";
  closeRoomCalc();
  renderFilters();
  renderProducts();
  $("catalog").scrollIntoView({ behavior: "smooth" });
};

// Compare bindings
$("openCompare").onclick = openCompareModal;
$("closeCompare").onclick = closeCompareModal;
$("clearCompare").onclick = () => {
  saveCompare([]);
  renderCompareBar();
  renderProducts();
};
compareModal.addEventListener("click", (e) => {
  if (e.target === compareModal) closeCompareModal();
});

// Mobile menu (clean Bootstrap Icons — no raw ☰/× text overwrite!)
function closeMobileMenu() {
  $("siteNav").classList.remove("is-open");
  $("mobileMenu").setAttribute("aria-expanded", "false");
  $("mobileMenu").setAttribute("aria-label", "Открыть меню");
  $("mobileMenu").innerHTML = '<i class="bi bi-list" aria-hidden="true"></i>';
}

$("mobileMenu").addEventListener("click", () => {
  const open = $("mobileMenu").getAttribute("aria-expanded") !== "true";
  $("mobileMenu").setAttribute("aria-expanded", String(open));
  $("mobileMenu").setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  $("mobileMenu").innerHTML = open
    ? '<i class="bi bi-x-lg" aria-hidden="true"></i>'
    : '<i class="bi bi-list" aria-hidden="true"></i>';
  $("siteNav").classList.toggle("is-open", open);
});

$("siteNav").addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMobileMenu();
});

// Wire Phone + WhatsApp links cleanly from publicWhatsApp
if (/^\d{10,15}$/.test(publicWhatsApp)) {
  const formattedPhone = formatKzPhone(publicWhatsApp);
  for (const id of ["headerWhatsapp", "footerWhatsapp", "menuWhatsapp"]) {
    const el = $(id);
    if (el) {
      el.href = buildWhatsAppUrl();
      el.hidden = false;
    }
  }
  for (const id of ["headerPhone", "footerPhone", "menuPhone"]) {
    const el = $(id);
    if (el) {
      el.href = `tel:+${publicWhatsApp}`;
      const span = el.querySelector("span");
      if (span) span.textContent = formattedPhone;
      el.hidden = false;
    }
  }
}

window.addEventListener("hashchange", openProductFromHash);

// Enhance dropdowns and boot
enhanceDropdown("seatsFilter", "seatsFilterLabel");
enhanceDropdown("lengthFilter", "lengthFilterLabel");
enhanceDropdown("materialFilter", "materialFilterLabel");
enhanceDropdown("colorFilter", "colorFilterLabel");
enhanceDropdown("availabilityFilter", "availabilityFilterLabel");
enhanceDropdown("sortSelect");

loadProducts();
