/**
 * Stolyor — Byudjetli bayram stoli rejalashtiruvchisi
 * Plain Vanilla JavaScript (ES6+)
 */

// ============================================================================
// SOZLAMALAR (CONFIG) — FOIZLAR VA ME'YORLAR
// ============================================================================
const CONFIG = {
  // Tadbir turlari bo'yicha byudjet taqsimoti (foizlarda). Jami 100% bo'lishi lozim.
  budgetSplits: {
    "Tug'ilgan kun (katta odamlar)": { food: 50, sweets: 30, drinks: 20, hasCake: true },
    "Tug'ilgan kun (bolalar)": { food: 40, sweets: 35, drinks: 25, hasCake: true },
    "Oilaviy ziyofat": { food: 55, sweets: 25, drinks: 20, hasCake: false },
    "Iftor": { food: 55, sweets: 25, drinks: 20, hasCake: false },
    "Navro'z": { food: 55, sweets: 25, drinks: 20, hasCake: false },
    "Boshqa": { food: 50, sweets: 25, drinks: 25, hasCake: false }
  },

  // 1 nafar mehmon uchun me'yorlar
  perGuest: {
    drinkLiters: 0.5,   // Ichimlik: kishi boshiga 0.5 litr (gazli + sharbat + suv aralashmasi)
    fruitGrams: 200,    // Meva: kishi boshiga 200 gramm
    cakeGrams: 150,     // Tort: kishi boshiga 150 gramm (faqat tug'ilgan kunlarda)
    sweetsGrams: 100    // Sharq shirinliklari: kishi boshiga 100 gramm
  },

  // Minimal tavsiya etiladigan xarajat (mehmon boshiga so'mda)
  minComfortBudgetPerGuest: 25000,

  // LocalStorage kalitlari
  storageKeys: {
    people: "stolyor_people_v1",
    lastEventType: "stolyor_last_event_type",
    lastCustomName: "stolyor_last_custom_name",
    lastDistrict: "stolyor_last_district",
    lastGuests: "stolyor_last_guests",
    feedback: "stolyor_feedback_v1",
    pwaDismissed: "stolyor_pwa_dismissed"
  }
};

// ============================================================================
// O'ZBEKCHA OYLAR VA HAFTA KUNLARI NOMLARI
// ============================================================================
const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"
];

const UZ_WEEKDAYS = [
  "yakshanba", "dushanba", "seshanba", "chorshanba",
  "payshanba", "juma", "shanba"
];

// ============================================================================
// DASTUR HOLATI (STATE)
// ============================================================================
const state = {
  foodsData: null,
  drinksData: null,
  shopsData: null,
  currentPlan: null,
  initialPlan: null,
  undoStack: [],
  activePersonContext: null, // Agar Tab 2 dan reja tuzishga o'tilsa
  deferredPrompt: null,
  isDebouncing: false
};

// Xotiradagi xavfsiz zaxira saqlagich (LocalStorage ishlamasa)
const memoryStore = {};

// ============================================================================
// YORDAMCHI FUNKSIYALAR (HELPERS)
// ============================================================================

/**
 * Xavfsiz LocalStorage o'qish (try/catch + fallback xotira)
 */
function storageGet(key, fallback = null) {
  try {
    if (typeof localStorage !== "undefined") {
      const val = localStorage.getItem(key);
      if (val !== null) return JSON.parse(val);
    }
  } catch (e) {
    console.warn("LocalStorage o'qishda xatolik:", e);
  }
  return memoryStore[key] !== undefined ? memoryStore[key] : fallback;
}

/**
 * Xavfsiz LocalStorage yozish
 */
function storageSet(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }
  } catch (e) {
    console.warn("LocalStorage yozishda xatolik:", e);
  }
  memoryStore[key] = value;
  return true;
}

/**
 * Raqamni chiroyli so'm formatiga o'tkazish (masalan: 500 000 so'm)
 */
function formatMoney(amount) {
  const num = Math.round(Number(amount) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
}

/**
 * Sanani O'zbekcha formatga o'tkazish: "12-dekabr, shanba"
 */
function formatDateUzbek(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) return "";
  const day = dateObj.getDate();
  const month = UZ_MONTHS[dateObj.getMonth()];
  const weekday = UZ_WEEKDAYS[dateObj.getDay()];
  return `${day}-${month}, ${weekday}`;
}

/**
 * YYYY-MM-DD qatoridan mahalliy sana obyektini olish
 */
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

/**
 * Bugungi mahalliy sanani YYYY-MM-DD formatida olish
 */
function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Ikki sana orasidagi kunlar farqini hisoblash
 */
function getDaysDifference(targetDate, baseDate = new Date()) {
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const diffTime = target.getTime() - base.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * O'zbekcha ortga hisoblash matnini hosil qilish
 */
function getCountdownText(days) {
  if (days < 0) return "O'tgan sana";
  if (days === 0) return "Tadbir bugun";
  if (days === 1) return "Tadbir ertaga";
  return `Tadbirga ${days} kun qoldi`;
}

/**
 * Do'konning hozir ochiq yoki yopiqligini aniqlash
 */
function getShopOpeningStatus(hoursStr) {
  if (!hoursStr || typeof hoursStr !== "string") {
    return null;
  }

  const match = hoursStr.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const openHour = parseInt(match[1], 10);
  const openMin = parseInt(match[2], 10);
  const closeHour = parseInt(match[3], 10);
  const closeMin = parseInt(match[4], 10);

  const now = new Date();
  const curMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  const openTimeFormatted = `${String(openHour).padStart(2, "0")}:${String(openMin).padStart(2, "0")}`;

  if (curMinutes >= openMinutes && curMinutes < closeMinutes) {
    return {
      isOpen: true,
      text: "Hozir ochiq",
      badgeClass: "badge-open"
    };
  } else if (curMinutes < openMinutes) {
    return {
      isOpen: false,
      text: `Hozir yopiq, bugun soat ${openTimeFormatted} da ochiladi`,
      badgeClass: "badge-closed"
    };
  } else {
    return {
      isOpen: false,
      text: `Hozir yopiq, ertaga soat ${openTimeFormatted} da ochiladi`,
      badgeClass: "badge-closed"
    };
  }
}

/**
 * Toast xabarnomasini ko'rsatish
 */
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}

/**
 * Toifa uchun mos emoji belgisini olish (Rasm yuklanmasa fallback uchun)
 */
function getCategoryEmoji(category) {
  const map = {
    palov: '🍚',
    shorva: '🍲',
    ikkinchi: '🥘',
    kabob: '🍢',
    xamiri: '🥟',
    xamir: '🥟',
    salat: '🥗',
    shirinlik: '🍬',
    tort: '🎂',
    meva: '🍇',
    mavsumiy: '🌱',
    gazli: '🥤',
    sharbat: '🧃',
    suv: '💧',
    energetik: '⚡',
    choy: '🧋',
    sut: '🥛',
    kompot: '🍷',
    'choy-qahva': '☕',
    food: '🍲',
    cake: '🍬',
    drinks: '🥤'
  };
  return map[category] || '🍽️';
}

// ============================================================================
// MA'LUMOTLAR BAZASINI YUKLASH (FOODS, DRINKS, SHOPS)
// ============================================================================
async function loadAllDatasets() {
  try {
    // 1. Foods ma'lumotlari
    if (typeof window !== "undefined" && window.STOLYOR_FOODS_DATA && window.STOLYOR_FOODS_DATA.foods) {
      state.foodsData = window.STOLYOR_FOODS_DATA;
    }
    if (!state.foodsData && typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
      try {
        const res = await fetch("./data/foods.json");
        if (res.ok) state.foodsData = await res.json();
      } catch (e) {
        console.warn("foods.json yuklashda ogohlantirish:", e);
      }
    }

    // 2. Drinks ma'lumotlari
    if (typeof window !== "undefined" && window.STOLYOR_DRINKS_DATA && window.STOLYOR_DRINKS_DATA.drinks) {
      state.drinksData = window.STOLYOR_DRINKS_DATA;
    }
    if (!state.drinksData && typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
      try {
        const res = await fetch("./data/drinks.json");
        if (res.ok) state.drinksData = await res.json();
      } catch (e) {
        console.warn("drinks.json yuklashda ogohlantirish:", e);
      }
    }

    // 3. Shops ma'lumotlari
    if (typeof window !== "undefined" && window.STOLYOR_SHOPS_DATA && window.STOLYOR_SHOPS_DATA.shops) {
      state.shopsData = window.STOLYOR_SHOPS_DATA;
    }
    if (!state.shopsData && typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
      try {
        const res = await fetch("./data/shops.json");
        if (res.ok) state.shopsData = await res.json();
      } catch (e) {
        console.warn("shops.json yuklashda ogohlantirish:", e);
      }
    }
  } catch (err) {
    console.error("Ma'lumotlar bazasini yuklashda xatolik:", err);
  }

  return {
    foods: state.foodsData,
    drinks: state.drinksData,
    shops: state.shopsData
  };
}

/**
 * Mahsulot uchun eng mos do'konni topish (tanlangan tuman va toifa bo'yicha)
 */
function getBestShopForItem(item, district) {
  const shops = (state.shopsData && state.shopsData.shops) ? state.shopsData.shops : [];
  if (shops.length === 0) {
    return {
      id: "shop-default",
      name: "Toshkent savdo markazi",
      category: "supermarket",
      districts: [district],
      telegram: "https://t.me/stolyor_aloqa_bot",
      phone: "+998712000000",
      partner: true,
      hours: "08:00-22:00"
    };
  }

  let targetCats = ['taomxona'];
  const kat = item.kategoriya || '';
  if (item.type === 'drink' || ['gazli', 'sharbat', 'suv', 'energetik', 'choy', 'sut', 'kompot', 'qahva', 'choy-qahva'].includes(kat)) {
    targetCats = ['supermarket'];
  } else if (kat === 'shirinlik' || (item.id && item.id.includes('tort'))) {
    targetCats = ['qandolat'];
  } else if (kat === 'meva') {
    targetCats = ['mevafurush', 'supermarket'];
  } else if (kat === 'xamiri' || kat === 'xamir' || (item.id && item.id.includes('somsa'))) {
    targetCats = ['somsa', 'taomxona'];
  } else if (kat === 'kabob') {
    targetCats = ['taomxona'];
  }

  let candidates = shops.filter(s => targetCats.includes(s.category));
  if (candidates.length === 0) candidates = shops;

  const districtMatches = candidates.filter(s => Array.isArray(s.districts) && s.districts.includes(district));
  if (districtMatches.length > 0) {
    const partner = districtMatches.find(s => s.partner);
    return partner || districtMatches[0];
  }

  const fallbackMatches = shops.filter(s => Array.isArray(s.districts) && s.districts.includes(district));
  if (fallbackMatches.length > 0) return fallbackMatches[0];

  return candidates[0] || shops[0];
}

// ============================================================================
// STOL TUZISH / PLAN HISOBLASH MANTIG'I
// ============================================================================

/**
 * Mehmonlar soni va mahsulot parametriga ko'ra miqdor va narxni hisoblash
 */
function calculateItemQuantityAndCost(item, guestCount) {
  const gCount = Math.max(2, Math.min(50, guestCount));
  let quantity = 1;
  let quantityText = "";
  let subtotal = item.narx_porsiya || item.narx || item.price || 0;
  const price = subtotal;

  const kat = item.kategoriya || '';
  const birlik = item.birlik || item.unit || '';

  if (birlik === "porsiya" || ['shorva', 'palov', 'ikkinchi', 'salat'].includes(kat)) {
    if (item.homeCooked) {
      const pots = Math.max(1, Math.ceil(gCount / 8));
      quantity = pots;
      quantityText = `${pots} qozon (~${gCount} kishilik)`;
      subtotal = (item.ingredientCost || price) * pots;
    } else {
      quantity = gCount;
      quantityText = `${gCount} porsiya`;
      subtotal = price * gCount;
    }
  } else if (birlik === "six" || kat === "kabob") {
    // Shashlik: kishi boshiga 2 six
    const skewers = gCount * 2;
    quantity = skewers;
    quantityText = `${skewers} six (${gCount} kishi × 2 six)`;
    subtotal = price * skewers;
  } else if (birlik === "dona") {
    if (item.perPersonQty) {
      const pieces = gCount * item.perPersonQty;
      quantity = pieces;
      quantityText = `${pieces} dona (${gCount} kishi × ${item.perPersonQty} ta)`;
      subtotal = price * pieces;
    } else if (item.id && (item.id.includes("non") || item.id.includes("patir") || item.id.includes("kulcha") || item.id.includes("lochira"))) {
      // Non: har 2 kishiga 1 dona
      const loaves = Math.max(1, Math.ceil(gCount / 2));
      quantity = loaves;
      quantityText = `${loaves} dona (${gCount} kishi uchun)`;
      subtotal = price * loaves;
    } else if (item.fixedGuestMax) {
      const cakesCount = Math.max(1, Math.ceil(gCount / item.fixedGuestMax));
      quantity = cakesCount;
      quantityText = `${cakesCount} dona`;
      subtotal = price * cakesCount;
    } else {
      quantity = gCount;
      quantityText = `${gCount} dona`;
      subtotal = price * gCount;
    }
  } else if (birlik === "kg") {
    if (item.id && item.id.includes("tort")) {
      // Tort: 150g/kishi, minimum 1 kg, yaxlitlash 0.5 kg qadamda
      const rawKg = (gCount * CONFIG.perGuest.cakeGrams) / 1000;
      const cakeKg = Math.max(1, Math.ceil(rawKg * 2) / 2);
      quantity = cakeKg;
      quantityText = `${cakeKg} kg (${gCount} kishi uchun)`;
      subtotal = Math.round(price * cakeKg);
    } else if (kat === "meva") {
      // Meva: 200g/kishi
      const rawKg = (gCount * CONFIG.perGuest.fruitGrams) / 1000;
      const fruitKg = Math.max(1, Math.ceil(rawKg * 2) / 2);
      quantity = fruitKg;
      quantityText = `${fruitKg} kg`;
      subtotal = Math.round(price * fruitKg);
    } else {
      // Sharq shirinliklari: 80-100g/kishi
      const rawKg = (gCount * CONFIG.perGuest.sweetsGrams) / 1000;
      const sweetsKg = Math.max(0.5, Math.ceil(rawKg * 2) / 2);
      quantity = sweetsKg;
      quantityText = `${sweetsKg} kg`;
      subtotal = Math.round(price * sweetsKg);
    }
  } else if (birlik === "to'plam") {
    const packs = Math.max(1, Math.ceil(gCount / 6));
    quantity = packs;
    quantityText = `${packs} to'plam`;
    subtotal = price * packs;
  } else if (item.hajm || item.type === "drink" || ['gazli', 'sharbat', 'suv', 'energetik', 'choy', 'sut', 'kompot', 'choy-qahva'].includes(kat)) {
    // Ichimliklar: hajmiga qarab baklar sonini hisoblash
    const hajm = item.hajm || "1.5 l";
    let bottles = 1;
    if (hajm.includes("1.5")) {
      bottles = Math.max(1, Math.round(gCount / 4));
    } else if (hajm.includes("1") && !hajm.includes("1.5")) {
      bottles = Math.max(1, Math.round(gCount / 5));
    } else if (hajm.includes("0.5") || hajm.includes("0.25")) {
      bottles = Math.max(1, Math.ceil(gCount / 2));
    } else {
      bottles = Math.max(1, Math.round(gCount / 4));
    }
    quantity = bottles;
    quantityText = `${bottles} dona (${hajm})`;
    subtotal = price * bottles;
  }

  return {
    quantity,
    quantityText,
    subtotal
  };
}

/**
 * Tasodifiy element tanlagich (Qayta tuzish xilma-xilligi uchun)
 */
function pickRandomItem(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Dastlabki stol rejasini generatsiya qilish
 */
function generateTablePlan(params) {
  const { eventDate, eventType, budget, guests, district, customEventName } = params;

  const foods = (state.foodsData && state.foodsData.foods) ? state.foodsData.foods : [];
  const drinks = (state.drinksData && state.drinksData.drinks) ? state.drinksData.drinks : [];

  // 1. Tort qoidasi: Faqat Tug'ilgan kun yoki Yubiley tadbirlarida tort qo'shiladi!
  const isBirthday = eventType.includes("Tug'ilgan kun") || 
    (customEventName && customEventName.toLowerCase().includes("yubiley"));
  const hasCake = !!isBirthday;
  const isKidEvent = eventType === "Tug'ilgan kun (bolalar)";

  const selectedItems = [];

  function addPlanItem(rawItem, planCategory) {
    if (!rawItem) return;
    const calc = calculateItemQuantityAndCost(rawItem, guests);
    const shop = getBestShopForItem(rawItem, district);
    selectedItems.push({
      instanceId: "item-" + Math.random().toString(36).substr(2, 9),
      item: { ...rawItem, name: rawItem.nomi || rawItem.name },
      shop,
      calc,
      planCategory,
      locked: false
    });
  }

  // 2. TAOMLAR BO'LIMI (FOOD) — Tadbir turiga mos
  if (eventType === "Navro'z") {
    // Navro'z: Sumalak yoki Halim + Ko'k somsa / Bayram oshi + Patir non
    const springSpecial = pickRandomItem(foods.filter(f => ['sumalak', 'halim'].includes(f.id))) || foods.find(f => f.id === 'sumalak');
    addPlanItem(springSpecial, "food");

    const pastry = pickRandomItem(foods.filter(f => ['kok-somsa-navroz', 'somsa-kok', 'palov-bayram'].includes(f.id)));
    addPlanItem(pastry, "food");

    const bread = foods.find(f => f.id === 'patir') || foods.find(f => f.id === 'patir-iftor');
    addPlanItem(bread, "food");
  } else if (eventType === "Iftor") {
    // Iftor: Mastava yoki to'yimli sho'rva + Somsa yoki Manti + Patir non
    const soup = pickRandomItem(foods.filter(f => ['mastava-iftor', 'mastava', 'shorva', 'chuchvara-shorva'].includes(f.id)));
    addPlanItem(soup, "food");

    const pastry = pickRandomItem(foods.filter(f => ['somsa-tandir', 'manti', 'xonim'].includes(f.id)));
    addPlanItem(pastry, "food");

    const bread = foods.find(f => f.id === 'patir-iftor') || foods.find(f => f.id === 'patir');
    addPlanItem(bread, "food");
  } else if (isKidEvent) {
    // Bolalar tadbiri: Bolalarbop taomlar (manti, tovuq shashlik, qovurilgan chuchvara, kartoshkali somsa)
    const main = pickRandomItem(foods.filter(f => ['shashlik-tovuq', 'manti', 'chuchvara-qovurilgan', 'somsa-kartoshkali'].includes(f.id)));
    addPlanItem(main, "food");

    const side = pickRandomItem(foods.filter(f => ['somsa-qovoqli', 'gumma', 'chebureki', 'kulcha'].includes(f.id)));
    addPlanItem(side, "food");
  } else if (eventType.includes("katta")) {
    // Tug'ilgan kun (katta odamlar): Palov + Shashlik + Salat + Non
    const palovCandidates = foods.filter(f => f.kategoriya === 'palov');
    const main = pickRandomItem(palovCandidates) || foods.find(f => f.id === 'palov-toshkent');
    addPlanItem(main, "food");

    const kabobCandidates = foods.filter(f => f.kategoriya === 'kabob');
    const kabob = pickRandomItem(kabobCandidates);
    addPlanItem(kabob, "food");

    const salad = pickRandomItem(foods.filter(f => ['achichuk', 'bodring-pomidor', 'toshkent-salati'].includes(f.id)));
    addPlanItem(salad, "food");

    const bread = foods.find(f => f.id === 'obi-non');
    addPlanItem(bread, "food");
  } else {
    // Oilaviy ziyofat va Boshqa: Palov yoki Ikkinchi taom + Somsa + Salat + Non
    const mainCandidates = foods.filter(f => f.kategoriya === 'palov' || ['qozon-kabob', 'dimlama', 'beshbarmoq-norin'].includes(f.id));
    const main = pickRandomItem(mainCandidates) || foods.find(f => f.id === 'palov-samarqand');
    addPlanItem(main, "food");

    const somsa = pickRandomItem(foods.filter(f => ['somsa-tandir', 'somsa-qatlama', 'manti'].includes(f.id)));
    addPlanItem(somsa, "food");

    const salad = pickRandomItem(foods.filter(f => ['achichuk', 'bodring-pomidor', 'kok-salat'].includes(f.id)));
    addPlanItem(salad, "food");

    const bread = foods.find(f => f.id === 'patir') || foods.find(f => f.id === 'obi-non');
    addPlanItem(bread, "food");
  }

  // 3. SHIRINLIKLAR BO'LIMI (SWEETS / CAKE)
  if (hasCake) {
    // Tort faqat tug'ilgan kunlarda
    const cakeList = foods.filter(f => f.id.includes('tort') || f.id === 'bayram-torti');
    const chosenCake = pickRandomItem(cakeList) || foods.find(f => f.id === 'bayram-torti');
    addPlanItem(chosenCake, "cake");

    // Bolalar bo'lsa qo'shimcha mayda shirinlik
    if (isKidEvent) {
      const sweet = pickRandomItem(foods.filter(f => ['vafli', 'eklerlar', 'pirojniy'].includes(f.id)));
      if (sweet) addPlanItem(sweet, "cake");
    }
  } else if (eventType === "Iftor") {
    // Iftorlikda Madina xurmosi albatta qo'shiladi!
    const xurmo = foods.find(f => f.id === 'xurma-iftor') || foods.find(f => f.id === 'nishalda');
    addPlanItem(xurmo, "cake");

    const sweet = pickRandomItem(foods.filter(f => ['halva', 'navvot', 'nishalda'].includes(f.id)));
    addPlanItem(sweet, "cake");
  } else {
    // Milliy bayramona shirinliklar (tort emas!)
    const sweet1 = pickRandomItem(foods.filter(f => ['chak-chak', 'halva', 'baklava', 'navvot', 'parvarda', 'pashmak'].includes(f.id)));
    addPlanItem(sweet1, "cake");

    const driedFruit = pickRandomItem(foods.filter(f => ['mayiz', 'kishmish', 'yongoq', 'bodom', 'quritilgan-orik'].includes(f.id)));
    addPlanItem(driedFruit, "cake");
  }

  // 4. ICHIMLIK VA MEVALAR BO'LIMI (DRINKS & FRUIT)
  if (eventType === "Iftor") {
    // Iftorlik ichimliklari: Ayron + Toza suv + Ko'k choy
    const ayron = drinks.find(d => d.id === 'ayron-1') || drinks[0];
    addPlanItem(ayron, "drinks");

    const water = drinks.find(d => d.id === 'suv-gazsiz-nestle-15') || drinks.find(d => d.kategoriya === 'suv');
    addPlanItem(water, "drinks");

    const tea = drinks.find(d => d.id === 'kok-choy-95');
    addPlanItem(tea, "drinks");
  } else {
    // Standart ichimlik triosi (0.5 l/mehmon): 1.5 l Coca-Cola/Pepsi + Sharbat + Suv
    const sodaCandidates = isKidEvent 
      ? drinks.filter(d => ['fanta-15', 'coca-cola-15', 'sprite-15'].includes(d.id))
      : drinks.filter(d => ['coca-cola-15', 'pepsi-15', 'dinay-15'].includes(d.id));
    const soda = pickRandomItem(sodaCandidates) || drinks[0];
    addPlanItem(soda, "drinks");

    const juiceCandidates = drinks.filter(d => d.kategoriya === 'sharbat');
    const juice = pickRandomItem(juiceCandidates);
    addPlanItem(juice, "drinks");

    const waterCandidates = drinks.filter(d => d.kategoriya === 'suv');
    const water = pickRandomItem(waterCandidates);
    addPlanItem(water, "drinks");
  }

  // Sarxil meva
  const fruitCandidates = foods.filter(f => f.kategoriya === 'meva');
  const fruit = pickRandomItem(fruitCandidates);
  addPlanItem(fruit, "drinks");

  // 5. BYUDJET NAZORATI: Generatsiya paytida umumiy summa byudjetdan oshmasligi shart!
  let currentTotal = selectedItems.reduce((s, it) => s + it.calc.subtotal, 0);

  if (currentTotal > budget) {
    // 1-bosqich: Yordamchi taomlarni (salat, qo'shimcha non, ikkinchi shirinlik) olib tashlash
    for (let i = selectedItems.length - 1; i >= 0; i--) {
      if (currentTotal <= budget) break;
      const it = selectedItems[i];
      const isRemovable = it.item.kategoriya === 'salat' || 
        (it.item.id && it.item.id.includes('non') && selectedItems.filter(x => x.item.id && x.item.id.includes('non')).length > 1) ||
        (it.planCategory === 'cake' && !hasCake && selectedItems.filter(x => x.planCategory === 'cake').length > 1);

      if (isRemovable) {
        currentTotal -= it.calc.subtotal;
        selectedItems.splice(i, 1);
      }
    }
  }

  if (currentTotal > budget) {
    // 2-bosqich: Qimmat taomlarni arzonroq mazali alternativaga tushirish
    for (let i = 0; i < selectedItems.length; i++) {
      if (currentTotal <= budget) break;
      const it = selectedItems[i];
      if (it.planCategory === 'food') {
        const cheaperFoods = foods
          .filter(f => (f.kategoriya === it.item.kategoriya || f.homeCooked) && (!f.tadbirlar || f.tadbirlar.length === 0 || f.tadbirlar.includes(eventType) || f.tadbirlar.includes("Boshqa") || f.tadbirlar.includes("Oilaviy ziyofat")))
          .map(f => ({ f, calc: calculateItemQuantityAndCost(f, guests) }))
          .filter(x => x.calc.subtotal < it.calc.subtotal)
          .sort((a, b) => a.calc.subtotal - b.calc.subtotal);

        if (cheaperFoods.length > 0) {
          currentTotal -= it.calc.subtotal;
          it.item = { ...cheaperFoods[0].f, name: cheaperFoods[0].f.nomi };
          it.calc = cheaperFoods[0].calc;
          it.shop = getBestShopForItem(it.item, district);
          currentTotal += it.calc.subtotal;
        }
      }
    }
  }

  if (currentTotal > budget) {
    // 3-bosqich: Agar byudjet juda kam bo'lsa, eng muhim 3 ta narsa qoldiriladi
    const essentialFood = selectedItems.find(x => x.planCategory === 'food');
    const essentialSweet = selectedItems.find(x => x.planCategory === 'cake');
    const essentialDrink = selectedItems.find(x => x.planCategory === 'drinks');
    selectedItems.length = 0;
    if (essentialFood) selectedItems.push(essentialFood);
    if (essentialSweet) selectedItems.push(essentialSweet);
    if (essentialDrink) selectedItems.push(essentialDrink);
    currentTotal = selectedItems.reduce((s, it) => s + it.calc.subtotal, 0);

    // Agar hatto shu ham oshsa, tejamkor uy taomi (mastava/shavla), navvot va suv tanlanadi
    if (currentTotal > budget) {
      const cheapMastava = foods.find(f => f.id === 'mastava') || foods[0];
      const cheapSweet = foods.find(f => f.id === 'navvot') || foods[1];
      const cheapWater = drinks.find(d => d.kategoriya === 'suv') || drinks[0];
      selectedItems.length = 0;
      addPlanItem(cheapMastava, "food");
      addPlanItem(cheapSweet, "cake");
      addPlanItem(cheapWater, "drinks");
    }
  }

  const daysLeft = getDaysDifference(parseLocalDate(eventDate));

  const plan = {
    id: "plan-" + Date.now(),
    params: {
      eventDate,
      eventType,
      customEventName,
      budget,
      guests,
      district,
      daysLeft
    },
    items: selectedItems,
    hasCake
  };

  return plan;
}

/**
 * Reja elementi yaratish
 */
function createPlanItem(candidate, planCategory) {
  return {
    instanceId: "item-" + Math.random().toString(36).substr(2, 9),
    item: candidate.item,
    shop: candidate.shop,
    calc: candidate.calc,
    planCategory,
    locked: false
  };
}

// ============================================================================
// NATIJA INTERFEYSI VA RENDER QILISH (UI RENDERING)
// ============================================================================

/**
 * Butun dasturxon rejasini ekranga chiqarish
 */
function renderPlan(plan, highlightItemId = null) {
  if (!plan) return;

  const resultContainer = document.getElementById("plan-result-container");
  resultContainer.classList.remove("hidden");

  // 1. Sarlavha kartasi ma'lumotlari
  const p = plan.params;
  const dateObj = parseLocalDate(p.eventDate);
  const formattedDate = formatDateUzbek(dateObj);
  const countdownText = getCountdownText(p.daysLeft);
  const eventDisplayName = p.customEventName ? `${p.eventType} (${p.customEventName})` : p.eventType;

  document.getElementById("plan-title").textContent = eventDisplayName;
  document.getElementById("plan-budget-badge").textContent = `Byudjet: ${formatMoney(p.budget)}`;
  document.getElementById("plan-summary-line").textContent = 
    `${eventDisplayName} · ${formattedDate} · ${p.guests} mehmon · ${p.district} tumani`;

  // 2. Ogohlantirishlar va maslahatlar
  // A. Kam byudjet ogohlantirishi
  const budgetPerGuest = Math.round(p.budget / p.guests);
  const lowBudgetWarningEl = document.getElementById("low-budget-warning");
  if (budgetPerGuest < CONFIG.minComfortBudgetPerGuest) {
    const recommendedBudget = p.guests * CONFIG.minComfortBudgetPerGuest;
    lowBudgetWarningEl.innerHTML = `
      ⚠️ <strong>Diqqat:</strong> Ushbu byudjet (${formatMoney(p.budget)}) ${p.guests} nafar mehmon uchun juda kam (kishi boshiga ${formatMoney(budgetPerGuest)}). 
      To'liq dasturxon uchun kamida <strong>${formatMoney(recommendedBudget)}</strong> tavsiya etiladi. 
      Quyida eng tejamkor variantlar ko'rsatilgan, yoki mehmonlar sonini kamaytirishni tavsiya qilamiz.
    `;
    lowBudgetWarningEl.classList.remove("hidden");
  } else {
    lowBudgetWarningEl.classList.add("hidden");
  }

  // B. Sana bo'yicha maslahatlar
  const dateHintEl = document.getElementById("date-hint-warning");
  const hasCakeItem = plan.items.some(it => it.item && it.item.id && it.item.id.includes("tort"));
  if (p.daysLeft <= 2 && p.daysLeft >= 0) {
    dateHintEl.innerHTML = `⚠️ <strong>Muhim eslatma:</strong> Tadbirga 2 kundan kam vaqt qoldi. Do'konlar va buyurtma xizmatlari band bo'lishi mumkin. Tezroq bog'laning.`;
    dateHintEl.classList.remove("hidden");
  } else if (p.daysLeft >= 7 && hasCakeItem) {
    dateHintEl.innerHTML = `💡 <strong>Maslahat:</strong> Tadbirga 1 haftadan ko'p vaqt bor. Katta tortni oldindan buyurtma qilib qo'ygan ma'qul.`;
    dateHintEl.classList.remove("hidden");
  } else {
    dateHintEl.classList.add("hidden");
  }

  // C. Yaqin kishi allergiyasi yoki izohi
  const allergyNoticeEl = document.getElementById("person-allergy-notice");
  if (state.activePersonContext && (state.activePersonContext.allergy || state.activePersonContext.notes)) {
    const notesParts = [];
    if (state.activePersonContext.allergy) {
      notesParts.push(`<strong>Diqqat:</strong> ${state.activePersonContext.name} uchun cheklov: ${state.activePersonContext.allergy}. Do'kondan taom va shirinliklar tarkibini so'rang.`);
    }
    if (state.activePersonContext.notes) {
      notesParts.push(`<em>Izoh:</em> ${state.activePersonContext.notes}`);
    }
    allergyNoticeEl.innerHTML = notesParts.join("<br>");
    allergyNoticeEl.classList.remove("hidden");
  } else {
    allergyNoticeEl.classList.add("hidden");
  }

  // 3. Toifalar sarlavhasi (Tort har doim emas: faqat hasCake bo'lsa tort nishoni)
  const cakeTitleEl = document.getElementById("cat-title-cake");
  const cakeAddBtn = document.getElementById("cat-add-btn-cake");
  if (cakeTitleEl && cakeAddBtn) {
    if (plan.hasCake) {
      cakeTitleEl.textContent = "🎂 Shirinliklar va tort";
      cakeAddBtn.textContent = "+ Mahsulot qo'shish";
    } else {
      cakeTitleEl.textContent = "🍬 Shirinliklar";
      cakeAddBtn.textContent = "+ Shirinlik qo'shish";
    }
  }

  // 4. Mahsulotlarni guruhlash va render qilish
  const foodItems = plan.items.filter(it => it.planCategory === "food");
  const cakeItems = plan.items.filter(it => it.planCategory === "cake");
  const drinkItems = plan.items.filter(it => it.planCategory === "drinks");

  renderCategoryItems("cat-items-food", foodItems, plan, highlightItemId);
  renderCategoryItems("cat-items-cake", cakeItems, plan, highlightItemId);
  renderCategoryItems("cat-items-drinks", drinkItems, plan, highlightItemId);

  // Subtotallar
  const foodSubtotal = foodItems.reduce((s, it) => s + it.calc.subtotal, 0);
  const cakeSubtotal = cakeItems.reduce((s, it) => s + it.calc.subtotal, 0);
  const drinkSubtotal = drinkItems.reduce((s, it) => s + it.calc.subtotal, 0);

  document.getElementById("cat-subtotal-food").textContent = formatMoney(foodSubtotal);
  document.getElementById("cat-subtotal-cake").textContent = formatMoney(cakeSubtotal);
  document.getElementById("cat-subtotal-drinks").textContent = formatMoney(drinkSubtotal);

  // 5. Jami summa va qoldiq
  const totalAmount = foodSubtotal + cakeSubtotal + drinkSubtotal;
  const balance = p.budget - totalAmount;

  document.getElementById("plan-total-amount").textContent = formatMoney(totalAmount);

  const balanceLabel = document.getElementById("plan-balance-label");
  const balanceAmount = document.getElementById("plan-balance-amount");
  const overBudgetWarningEl = document.getElementById("over-budget-warning");
  const progressBar = document.getElementById("budget-progress-bar");

  const progressPercent = Math.min(100, Math.round((totalAmount / p.budget) * 100));
  progressBar.style.width = `${progressPercent}%`;

  if (balance < 0) {
    const overAmount = Math.abs(balance);
    balanceLabel.textContent = "Byudjetdan oshdi:";
    balanceAmount.textContent = `+${formatMoney(overAmount)}`;
    balanceAmount.style.color = "var(--danger)";

    overBudgetWarningEl.innerHTML = `⚠️ <strong>Diqqat:</strong> Byudjetdan ${formatMoney(overAmount)} oshdi. Tejamkorroq variantlarni tanlash uchun "Almashtirish" tugmasini bosing ("Tejash uchun" deb belgilangan variantlarga qarang).`;
    overBudgetWarningEl.classList.remove("hidden");
    progressBar.classList.add("over");
  } else {
    balanceLabel.textContent = "Qoldiq mablag':";
    balanceAmount.textContent = formatMoney(balance);
    balanceAmount.style.color = "var(--accent-green)";

    overBudgetWarningEl.classList.add("hidden");
    progressBar.classList.remove("over");
  }

  // Undo tugmasi holati
  const undoBtn = document.getElementById("undo-plan-btn");
  undoBtn.disabled = state.undoStack.length === 0;

  // "Shu rejani saqlash" tugmasi
  const savePersonBtn = document.getElementById("save-to-person-btn");
  if (state.activePersonContext) {
    savePersonBtn.classList.remove("hidden");
  } else {
    savePersonBtn.classList.add("hidden");
  }

  // Smooth scroll
  resultContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Kategoriya ichidagi mahsulotlarni render qilish
 */
function renderCategoryItems(containerId, items, plan, highlightItemId = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<p class="form-hint" style="padding: 0.5rem 0;">Ushbu toifada mahsulot yo'q. Quyidagi tugma orqali qo'shishingiz mumkin.</p>`;
    return;
  }

  container.innerHTML = items.map((it) => {
    const isUpdated = highlightItemId === it.instanceId;
    const shop = it.shop;
    const item = it.item;
    const calc = it.calc;

    // Do'kon ish vaqti
    const openingStatus = getShopOpeningStatus(shop.hours);
    const openingBadgeHtml = openingStatus 
      ? `<span class="badge ${openingStatus.badgeClass}">${openingStatus.text}</span>` 
      : "";

    // Hamkor nishoni
    const partnerBadgeHtml = shop.partner 
      ? `<span class="badge badge-partner">⭐ Hamkor</span>` 
      : "";

    // Uyda pishirish nishoni
    const homeCookedBadgeHtml = item.homeCooked 
      ? `<span class="badge badge-home">🏠 Uyda pishiring ${item.ingredientCost ? `(taxminiy masalliq: ${formatMoney(item.ingredientCost)})` : ""}</span>` 
      : "";

    // Allergen nishoni
    const allergenHtml = (Array.isArray(item.allergenlar) && item.allergenlar.length > 0)
      ? `<span class="item-allergen-tag">Allergen: ${item.allergenlar.join(', ')}</span>`
      : "";

    // Tarkib qisqa (4-5 masalliq)
    const tarkibHtml = item.tarkib 
      ? `<div class="item-ingredients" title="${item.tarkib}">${item.tarkib}</div>`
      : "";

    // Toifaga mos fallback emoji
    const fallbackEmoji = getCategoryEmoji(item.kategoriya || it.planCategory);

    // Qulf holati
    const lockIcon = it.locked ? "🔒" : "🔓";
    const lockTitle = it.locked ? "Qulfni ochish (qayta tuzishda o'zgaradi)" : "Qulflash (qayta tuzishda saqlanadi)";

    return `
      <div class="item-row ${isUpdated ? 'item-updated' : ''}" data-id="${it.instanceId}">
        <div class="item-main-info">
          <div class="item-img-wrap">
            <img src="${item.rasm || './icons/icon-192.png'}" alt="${item.name}" loading="lazy" width="88" height="58" onerror="this.onerror=null; this.parentElement.classList.add('img-fallback');">
            <span class="item-img-fallback-icon">${fallbackEmoji}</span>
          </div>
          <div class="item-title-group">
            <h5 class="item-name">${item.name}</h5>
            ${tarkibHtml}
            <div class="item-badges">
              ${homeCookedBadgeHtml}
              ${allergenHtml}
            </div>
          </div>
          <div class="item-pricing">
            <div class="item-subtotal font-numeric">${formatMoney(calc.subtotal)}</div>
            <div class="item-unit-calc font-numeric">${calc.quantityText} · ${formatMoney(item.narx_porsiya || item.narx || item.price || 0)}/${item.birlik || item.unit || 'dona'}</div>
          </div>
        </div>

        <div class="item-shop-row">
          <div class="item-shop-details">
            <span class="shop-name">🏪 ${shop.name}</span>
            <span class="badge badge-subtle">📍 ${(shop.districts || []).join(', ')}</span>
            ${openingBadgeHtml}
            ${partnerBadgeHtml}
          </div>
          <div class="item-shop-actions">
            ${shop.telegram ? `<a href="${shop.telegram}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-subtle" title="Telegramda yozish">💬 Telegram</a>` : ""}
            ${shop.phone ? `<a href="tel:${shop.phone}" class="btn btn-sm btn-subtle" title="Qo'ng'iroq qilish">📞 Tel</a>` : ""}
          </div>
        </div>

        <div class="item-actions-row">
          <button type="button" class="btn btn-sm btn-subtle lock-item-btn" data-id="${it.instanceId}" title="${lockTitle}">
            ${lockIcon} <span class="lock-text">${it.locked ? "Qulflangan" : "Qulflash"}</span>
          </button>
          <div class="item-btn-group">
            <button type="button" class="btn btn-sm btn-outline swap-item-btn" data-id="${it.instanceId}">
              🔄 Almashtirish
            </button>
            <button type="button" class="btn btn-sm btn-subtle remove-item-btn text-danger" data-id="${it.instanceId}" title="Olib tashlash">
              🗑️ Olib tashlash
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ============================================================================
// SWAP (ALMASHTIRISH) VA QO'SHISH BOSHQARUVI
// ============================================================================

/**
 * Mahsulotni almashtirish modalini ochish
 */
function openSwapModal(instanceId) {
  const plan = state.currentPlan;
  if (!plan) return;

  const currentItem = plan.items.find(it => it.instanceId === instanceId);
  if (!currentItem) return;

  const modal = document.getElementById("swap-modal");
  const titleEl = document.getElementById("swap-modal-title");
  const infoEl = document.getElementById("swap-current-item-info");
  const listEl = document.getElementById("swap-options-list");

  titleEl.textContent = `"${currentItem.item.name}" o'rniga variantlar`;
  infoEl.innerHTML = `Hozirgi tanlov: <strong>${currentItem.item.name}</strong> (${currentItem.shop.name}) — <strong>${formatMoney(currentItem.calc.subtotal)}</strong>`;

  const guests = plan.params.guests;
  const isKidEvent = plan.params.eventType === "Tug'ilgan kun (bolalar)";
  const foods = (state.foodsData && state.foodsData.foods) ? state.foodsData.foods : [];
  const drinks = (state.drinksData && state.drinksData.drinks) ? state.drinksData.drinks : [];

  let pool = [];
  let filterChipsHtml = "";

  if (currentItem.planCategory === "food") {
    pool = foods.filter(f => ['palov', 'shorva', 'ikkinchi', 'kabob', 'xamiri', 'xamir', 'salat', 'mavsumiy'].includes(f.kategoriya));
    filterChipsHtml = `
      <div class="swap-filter-chips" id="swap-filter-chips">
        <button type="button" class="swap-filter-chip active" data-filter="all">Barchasi</button>
        <button type="button" class="swap-filter-chip" data-filter="palov">Palov</button>
        <button type="button" class="swap-filter-chip" data-filter="kabob">Kabob</button>
        <button type="button" class="swap-filter-chip" data-filter="shorva">Sho'rva</button>
        <button type="button" class="swap-filter-chip" data-filter="ikkinchi">Ikkinchi taom</button>
        <button type="button" class="swap-filter-chip" data-filter="xamir">Somsa & Non</button>
        <button type="button" class="swap-filter-chip" data-filter="salat">Salat</button>
      </div>
    `;
  } else if (currentItem.planCategory === "cake") {
    if (plan.hasCake) {
      pool = foods.filter(f => f.kategoriya === 'shirinlik' || (f.id && f.id.includes('tort')));
      filterChipsHtml = `
        <div class="swap-filter-chips" id="swap-filter-chips">
          <button type="button" class="swap-filter-chip active" data-filter="all">Barchasi</button>
          <button type="button" class="swap-filter-chip" data-filter="tort">Tortlar</button>
          <button type="button" class="swap-filter-chip" data-filter="shirinlik">Milliy shirinliklar</button>
        </div>
      `;
    } else {
      pool = foods.filter(f => f.kategoriya === 'shirinlik' && (!f.id || !f.id.includes('tort')));
      filterChipsHtml = `
        <div class="swap-filter-chips" id="swap-filter-chips">
          <button type="button" class="swap-filter-chip active" data-filter="all">Barchasi</button>
          <button type="button" class="swap-filter-chip" data-filter="shirinlik">Shirinliklar</button>
        </div>
      `;
    }
  } else if (currentItem.planCategory === "drinks") {
    if (currentItem.item.kategoriya === "meva") {
      pool = foods.filter(f => f.kategoriya === "meva");
    } else {
      pool = drinks;
      filterChipsHtml = `
        <div class="swap-filter-chips" id="swap-filter-chips">
          <button type="button" class="swap-filter-chip active" data-filter="all">Barchasi</button>
          <button type="button" class="swap-filter-chip" data-filter="gazli">Gazli</button>
          <button type="button" class="swap-filter-chip" data-filter="sharbat">Sharbat</button>
          <button type="button" class="swap-filter-chip" data-filter="suv">Suv</button>
          <button type="button" class="swap-filter-chip" data-filter="sut">Sut/Ayron</button>
          <button type="button" class="swap-filter-chip" data-filter="choy">Choy</button>
          <button type="button" class="swap-filter-chip" data-filter="kompot">Kompot</button>
        </div>
      `;
    }
  }

  const currentTotal = plan.items.reduce((s, it) => s + it.calc.subtotal, 0);
  const isCurrentlyOverBudget = currentTotal > plan.params.budget;

  function renderOptions(activeFilter = "all") {
    let filteredPool = pool;
    if (activeFilter !== "all") {
      if (activeFilter === "xamir") {
        filteredPool = pool.filter(f => f.kategoriya === 'xamir' || f.kategoriya === 'xamiri');
      } else if (activeFilter === "tort") {
        filteredPool = pool.filter(f => f.id && f.id.includes('tort'));
      } else {
        filteredPool = pool.filter(f => f.kategoriya === activeFilter);
      }
    }

    const alternatives = [];
    filteredPool.forEach(rawItem => {
      if (rawItem.id === currentItem.item.id) return;
      const calc = calculateItemQuantityAndCost(rawItem, guests);
      const shop = getBestShopForItem(rawItem, plan.params.district);
      const diff = calc.subtotal - currentItem.calc.subtotal;
      const priceProximity = Math.abs(diff);

      alternatives.push({
        item: { ...rawItem, name: rawItem.nomi || rawItem.name },
        shop,
        calc,
        diff,
        priceProximity
      });
    });

    alternatives.sort((a, b) => a.priceProximity - b.priceProximity);
    const topOptions = alternatives.slice(0, 8);

    if (topOptions.length === 0) {
      listEl.innerHTML = filterChipsHtml + `<p class="form-hint" style="padding: 1rem 0;">Bu toifada boshqa variant topilmadi.</p>`;
    } else {
      const cardsHtml = topOptions.map((opt, idx) => {
        let diffHtml = "";
        if (opt.diff > 0) {
          diffHtml = `<span class="price-diff diff-plus">+${formatMoney(opt.diff)}</span>`;
        } else if (opt.diff < 0) {
          diffHtml = `<span class="price-diff diff-minus">-${formatMoney(Math.abs(opt.diff))}</span>`;
        } else {
          diffHtml = `<span class="price-diff diff-zero">0 so'm</span>`;
        }

        const isSaving = isCurrentlyOverBudget && opt.diff < 0;
        const savingBadge = isSaving ? `<span class="badge badge-saving">Tejash uchun</span>` : "";
        const opening = getShopOpeningStatus(opt.shop.hours);
        const openingText = opening ? `<span class="badge ${opening.badgeClass}">${opening.text}</span>` : "";

        return `
          <div class="swap-option-card">
            <img src="${opt.item.rasm || './icons/icon-192.png'}" class="swap-item-img" alt="${opt.item.name}" loading="lazy" onerror="this.style.display='none'">
            <div class="swap-opt-info">
              <h5 class="swap-opt-name">${opt.item.name} ${savingBadge}</h5>
              ${opt.item.tarkib ? `<div class="item-ingredients">${opt.item.tarkib}</div>` : ""}
              <div class="swap-opt-meta">
                🏪 ${opt.shop.name} (📍 ${(opt.shop.districts || []).join(', ')})
                ${openingText}
              </div>
              <div class="item-unit-calc font-numeric">${opt.calc.quantityText} · ${formatMoney(opt.item.narx_porsiya || opt.item.narx || opt.item.price || 0)}/${opt.item.birlik || opt.item.unit || 'dona'}</div>
            </div>
            <div class="swap-opt-price-group">
              <div class="swap-opt-total font-numeric">${formatMoney(opt.calc.subtotal)}</div>
              ${diffHtml}
              <button type="button" class="btn btn-sm btn-primary select-swap-option-btn" data-index="${idx}" style="margin-top: 0.35rem;">
                Tanlash
              </button>
            </div>
          </div>
        `;
      }).join("");

      listEl.innerHTML = filterChipsHtml + cardsHtml;

      listEl.querySelectorAll(".select-swap-option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const selectedOpt = topOptions[parseInt(btn.dataset.index, 10)];
          executeSwapItem(currentItem.instanceId, selectedOpt);
          closeSwapModal();
        });
      });
    }

    // Filter chip listenerlari
    listEl.querySelectorAll(".swap-filter-chip").forEach(chip => {
      if (chip.dataset.filter === activeFilter) chip.classList.add("active");
      chip.addEventListener("click", () => {
        renderOptions(chip.dataset.filter);
      });
    });
  }

  renderOptions("all");
  modal.classList.remove("hidden");
}

/**
 * Kategoriya uchun yangi mahsulot qo'shish modalini ochish
 */
function openAddItemModal(category) {
  const plan = state.currentPlan;
  if (!plan) return;

  const modal = document.getElementById("swap-modal");
  const titleEl = document.getElementById("swap-modal-title");
  const infoEl = document.getElementById("swap-current-item-info");
  const listEl = document.getElementById("swap-options-list");

  let catLabel = "Mahsulot";
  let pool = [];
  const guests = plan.params.guests;
  const foods = (state.foodsData && state.foodsData.foods) ? state.foodsData.foods : [];
  const drinks = (state.drinksData && state.drinksData.drinks) ? state.drinksData.drinks : [];

  if (category === "taom" || category === "food") {
    catLabel = "Taom";
    pool = foods.filter(f => ['palov', 'shorva', 'ikkinchi', 'kabob', 'xamiri', 'xamir', 'salat', 'mavsumiy'].includes(f.kategoriya));
  } else if (category === "tort" || category === "cake" || category === "shirinlik") {
    catLabel = "Shirinlik yoki tort";
    pool = foods.filter(f => f.kategoriya === 'shirinlik' || (f.id && f.id.includes('tort')));
  } else if (category === "drinks") {
    catLabel = "Ichimlik yoki meva";
    pool = [...drinks, ...foods.filter(f => f.kategoriya === 'meva')];
  }

  titleEl.textContent = `Yangi ${catLabel.toLowerCase()} qo'shish`;
  infoEl.textContent = `Quyidagi variantlardan birini dasturxonga qo'shishingiz mumkin:`;

  const options = pool.map(rawItem => {
    const calc = calculateItemQuantityAndCost(rawItem, guests);
    const shop = getBestShopForItem(rawItem, plan.params.district);
    return {
      item: { ...rawItem, name: rawItem.nomi || rawItem.name },
      shop,
      calc
    };
  });

  if (options.length === 0) {
    listEl.innerHTML = `<p class="form-hint" style="padding: 1rem 0;">Bu toifa uchun variantlar topilmadi.</p>`;
  } else {
    listEl.innerHTML = options.slice(0, 10).map((opt, idx) => {
      return `
        <div class="swap-option-card">
          <img src="${opt.item.rasm || './icons/icon-192.png'}" class="swap-item-img" alt="${opt.item.name}" loading="lazy" onerror="this.style.display='none'">
          <div class="swap-opt-info">
            <h5 class="swap-opt-name">${opt.item.name}</h5>
            ${opt.item.tarkib ? `<div class="item-ingredients">${opt.item.tarkib}</div>` : ""}
            <div class="swap-opt-meta">
              🏪 ${opt.shop.name} (📍 ${(opt.shop.districts || []).join(', ')})
            </div>
            <div class="item-unit-calc font-numeric">${opt.calc.quantityText} · ${formatMoney(opt.item.narx_porsiya || opt.item.narx || opt.item.price || 0)}/${opt.item.birlik || opt.item.unit || 'dona'}</div>
          </div>
          <div class="swap-opt-price-group">
            <div class="swap-opt-total font-numeric">${formatMoney(opt.calc.subtotal)}</div>
            <button type="button" class="btn btn-sm btn-primary select-add-option-btn" data-index="${idx}" style="margin-top: 0.35rem;">
              + Qo'shish
            </button>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".select-add-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const selected = options[parseInt(btn.dataset.index, 10)];
        executeAddItem(category, selected);
        closeSwapModal();
      });
    });
  }

  modal.classList.remove("hidden");
}

function closeSwapModal() {
  const modal = document.getElementById("swap-modal");
  if (modal) modal.classList.add("hidden");
}

/**
 * Mahsulotni almashtirishni amalga oshirish
 */
function executeSwapItem(instanceId, candidate) {
  pushUndoState();
  const plan = state.currentPlan;
  const index = plan.items.findIndex(it => it.instanceId === instanceId);
  if (index === -1) return;

  const currentCategory = plan.items[index].planCategory;
  const wasLocked = plan.items[index].locked;

  const newItem = createPlanItem(candidate, currentCategory);
  newItem.locked = wasLocked;

  plan.items[index] = newItem;
  renderPlan(plan, newItem.instanceId);
  showToast(`"${newItem.item.name}" dasturxonga kiritildi`);
}

/**
 * Mahsulot qo'shishni amalga oshirish
 */
function executeAddItem(category, candidate) {
  pushUndoState();
  const plan = state.currentPlan;
  const planCategory = (category === "taom" || category === "food") ? "food" : (category === "drinks" ? "drinks" : "cake");
  const newItem = createPlanItem(candidate, planCategory);
  plan.items.push(newItem);
  renderPlan(plan, newItem.instanceId);
  showToast(`"${newItem.item.name}" qo'shildi`);
}

/**
 * Mahsulotni olib tashlash
 */
function executeRemoveItem(instanceId) {
  pushUndoState();
  const plan = state.currentPlan;
  const itemIndex = plan.items.findIndex(it => it.instanceId === instanceId);
  if (itemIndex === -1) return;

  const removedName = plan.items[itemIndex].item.name;
  plan.items.splice(itemIndex, 1);
  renderPlan(plan);
  showToast(`"${removedName}" olib tashlandi`);
}

/**
 * Qulf holatini almashtirish
 */
function toggleLockItem(instanceId) {
  const plan = state.currentPlan;
  const item = plan.items.find(it => it.instanceId === instanceId);
  if (!item) return;

  item.locked = !item.locked;
  renderPlan(plan);
  showToast(item.locked ? `"${item.item.name}" qulflab qo'yildi` : `"${item.item.name}" qulfdan chiqarildi`);
}

/**
 * Qayta tuzish (regenerate) — qulflangan mahsulotlar saqlanadi, boshqalari yangilanadi
 */
function regeneratePlan() {
  if (state.isDebouncing) return;
  state.isDebouncing = true;
  setTimeout(() => { state.isDebouncing = false; }, 300);

  const plan = state.currentPlan;
  if (!plan) return;

  pushUndoState();

  // Yangi xilma-xil reja hisoblab olamiz
  const freshPlan = generateTablePlan(plan.params);

  const updatedItems = [];

  // 1. Taom
  const lockedFood = plan.items.filter(it => it.planCategory === "food" && it.locked);
  if (lockedFood.length > 0) {
    updatedItems.push(...lockedFood);
  } else {
    updatedItems.push(...freshPlan.items.filter(it => it.planCategory === "food"));
  }

  // 2. Shirinliklar / Tort
  const lockedCake = plan.items.filter(it => it.planCategory === "cake" && it.locked);
  if (lockedCake.length > 0) {
    updatedItems.push(...lockedCake);
  } else {
    updatedItems.push(...freshPlan.items.filter(it => it.planCategory === "cake"));
  }

  // 3. Ichimlik va mevalar
  const lockedDrinks = plan.items.filter(it => it.planCategory === "drinks" && it.locked);
  if (lockedDrinks.length > 0) {
    updatedItems.push(...lockedDrinks);
  } else {
    updatedItems.push(...freshPlan.items.filter(it => it.planCategory === "drinks"));
  }

  plan.items = updatedItems;
  plan.hasCake = freshPlan.hasCake;

  renderPlan(plan);
  showToast("Dasturxon qayta tuzildi!");
}

/**
 * Undo (Orqaga qaytarish) stackiga holat saqlash
 */
function pushUndoState() {
  if (!state.currentPlan) return;
  const snapshot = JSON.stringify(state.currentPlan);
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 20) {
    state.undoStack.shift();
  }
}

/**
 * Orqaga qaytarish
 */
function undoLastChange() {
  if (state.undoStack.length === 0) return;
  const previousStateJson = state.undoStack.pop();
  state.currentPlan = JSON.parse(previousStateJson);
  renderPlan(state.currentPlan);
  showToast("Oxirgi amal bekor qilindi");
}

/**
 * Birinchi tavsiyaga qaytish (Reset)
 */
function resetToInitialPlan() {
  if (!state.initialPlan) return;
  pushUndoState();
  state.currentPlan = JSON.parse(JSON.stringify(state.initialPlan));
  renderPlan(state.currentPlan);
  showToast("Birinchi tavsiyaga qaytarildi");
}

/**
 * Natijani matn holida generatsiya qilish (Ulashish va nusxalash uchun)
 */
function generatePlanSummaryText(plan) {
  if (!plan) return "";
  const p = plan.params;
  const dateObj = parseLocalDate(p.eventDate);
  const formattedDate = formatDateUzbek(dateObj);
  const eventDisplayName = p.customEventName ? `${p.eventType} (${p.customEventName})` : p.eventType;

  const lines = [];
  lines.push(`🍽️ Stolyor: ${eventDisplayName}`);
  lines.push(`📅 Sana: ${formattedDate} (${getCountdownText(p.daysLeft)})`);
  lines.push(`👥 Mehmonlar: ${p.guests} kishi`);
  lines.push(`📍 Tuman: ${p.district}`);
  lines.push(`💰 Rejalashtirilgan byudjet: ${formatMoney(p.budget)}`);
  lines.push("");

  const foodItems = plan.items.filter(it => it.planCategory === "food");
  const cakeItems = plan.items.filter(it => it.planCategory === "cake");
  const drinkItems = plan.items.filter(it => it.planCategory === "drinks");

  if (foodItems.length > 0) {
    lines.push("🍲 TAOMLAR:");
    foodItems.forEach(it => {
      lines.push(`  • ${it.item.name}: ${it.calc.quantityText} — ${formatMoney(it.calc.subtotal)} (${it.shop.name})`);
    });
    lines.push("");
  }

  if (cakeItems.length > 0) {
    lines.push(plan.hasCake ? "🎂 SHIRINLIKLAR VA TORT:" : "🍬 SHIRINLIKLAR:");
    cakeItems.forEach(it => {
      lines.push(`  • ${it.item.name}: ${it.calc.quantityText} — ${formatMoney(it.calc.subtotal)} (${it.shop.name})`);
    });
    lines.push("");
  }

  if (drinkItems.length > 0) {
    lines.push("🍎 ICHIMLIK VA MEVALAR:");
    drinkItems.forEach(it => {
      lines.push(`  • ${it.item.name}: ${it.calc.quantityText} — ${formatMoney(it.calc.subtotal)} (${it.shop.name})`);
    });
    lines.push("");
  }

  const totalAmount = plan.items.reduce((s, it) => s + it.calc.subtotal, 0);
  lines.push(`💵 Jami: ${formatMoney(totalAmount)}`);
  if (p.budget >= totalAmount) {
    lines.push(`✨ Qoldiq mablag': ${formatMoney(p.budget - totalAmount)}`);
  } else {
    lines.push(`⚠️ Byudjetdan oshdi: ${formatMoney(totalAmount - p.budget)}`);
  }
  lines.push("");
  lines.push("🌐 Reja \"Stolyor\" ilovasida tuzildi (https://stolyor.netlify.app/)");

  return lines.join("\n");
}

/**
 * Natijani ulashish (Web Share API yoki buferga nusxalash)
 */
async function sharePlanResult() {
  const plan = state.currentPlan;
  if (!plan) return;

  const shareText = generatePlanSummaryText(plan);

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Stolyor dasturxon rejasi",
        text: shareText
      });
      showToast("Reja ulashildi!");
      return;
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("Web Share xatoligi:", err);
      }
    }
  }

  // Fallback: Clipboard
  try {
    await navigator.clipboard.writeText(shareText);
    showToast("Reja buferga nusxalandi!");
  } catch (err) {
    const textarea = document.createElement("textarea");
    textarea.value = shareText;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showToast("Reja buferga nusxalandi!");
  }
}

/**
 * ICS fayl yuklab olish (bitta tadbir uchun)
 */
function downloadPlanICS() {
  const plan = state.currentPlan;
  if (!plan) return;

  const p = plan.params;
  const dateObj = parseLocalDate(p.eventDate);
  if (!dateObj) return;

  const eventName = p.customEventName ? `${p.eventType} (${p.customEventName})` : p.eventType;
  const summaryText = generatePlanSummaryText(plan).replace(/\n/g, "\\n");

  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dtStart = `${y}${m}${d}T100000`;
  const dtEnd = `${y}${m}${d}T130000`;

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stolyor//Bayram Stoli Rejalashtiruvchisi//UZ",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:stolyor-plan-${Date.now()}@stolyor.uz`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Stolyor: ${eventName}`,
    `DESCRIPTION:${summaryText}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Ertaga tadbir: ${eventName}. Dasturxonni tayyorlang!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  downloadBlob(icsContent, `stolyor_reja_${p.eventDate}.ics`, "text/calendar;charset=utf-8");
  showToast("Kalendar fayli (.ics) yuklab olindi");
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// ============================================================================
// TAB 2: YAQINLARIM MANTIG'I
// ============================================================================

/**
 * Saqlangan yaqin kishilar ro'yxatini olish
 */
function getPeopleList() {
  return storageGet(CONFIG.storageKeys.people, []);
}

/**
 * Yaqin kishilar ro'yxatini saqlash
 */
function savePeopleList(list) {
  return storageSet(CONFIG.storageKeys.people, list);
}

/**
 * Kabisa yilini tekshirish
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Yaqin kishining keyingi nishonlanadigan sanasini aniqlash (29-fevralni to'g'ri boshqarish)
 */
function getNextCelebrationDate(person, today = new Date()) {
  const curYear = today.getFullYear();
  let day = parseInt(person.birthDay, 10);
  let month = parseInt(person.birthMonth, 10); // 1-12

  // 29-fevral qoidasi: Agar joriy yil kabisa bo'lmasa, 28-fevralga o'tkaziladi
  let actualDay = day;
  if (month === 2 && day === 29 && !isLeapYear(curYear)) {
    actualDay = 28;
  }

  let thisYearDate = new Date(curYear, month - 1, actualDay, 0, 0, 0);

  // Bugungi sanani soatsiz solishtirish
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);

  let targetDate;
  if (thisYearDate.getTime() >= todayZero.getTime()) {
    targetDate = thisYearDate;
  } else {
    // Keyingi yilga o'tadi
    const nextYear = curYear + 1;
    let nextYearDay = day;
    if (month === 2 && day === 29 && !isLeapYear(nextYear)) {
      nextYearDay = 28;
    }
    targetDate = new Date(nextYear, month - 1, nextYearDay, 0, 0, 0);
  }

  const daysLeft = getDaysDifference(targetDate, todayZero);

  // Yoshni hisoblash (agar birthYear mavjud bo'lsa)
  let age = null;
  if (person.birthYear) {
    const bYear = parseInt(person.birthYear, 10);
    if (!isNaN(bYear) && bYear > 1900) {
      age = targetDate.getFullYear() - bYear;
    }
  }

  return {
    targetDate,
    daysLeft,
    age,
    celebrationDay: targetDate.getDate(),
    celebrationMonth: targetDate.getMonth() + 1
  };
}

/**
 * Yaqinlarim sahifasini to'liq render qilish
 */
function renderPeopleTab() {
  const people = getPeopleList();
  const upcomingContainer = document.getElementById("upcoming-people-list");
  const upcomingEmptyMsg = document.getElementById("upcoming-empty-msg");
  const yearGroupedContainer = document.getElementById("year-grouped-people");
  const emptyState = document.getElementById("people-empty-state");

  if (people.length === 0) {
    upcomingContainer.innerHTML = "";
    upcomingEmptyMsg.classList.add("hidden");
    yearGroupedContainer.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  // Har bir shaxs uchun keyingi sanani hisoblash
  const enriched = people.map(p => {
    const nextInfo = getNextCelebrationDate(p);
    return {
      ...p,
      nextDate: nextInfo.targetDate,
      daysLeft: nextInfo.daysLeft,
      age: nextInfo.age
    };
  });

  // 1. Yaqin kunlar (keyingi 30 kun)
  const upcoming = enriched
    .filter(p => p.daysLeft >= 0 && p.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (upcoming.length === 0) {
    upcomingContainer.innerHTML = "";
    upcomingEmptyMsg.classList.remove("hidden");
  } else {
    upcomingEmptyMsg.classList.add("hidden");
    upcomingContainer.innerHTML = upcoming.map(p => {
      const isUrgent = p.daysLeft <= 3;
      let countdownClass = "person-countdown";
      let countdownText = "";

      if (p.daysLeft === 0) {
        countdownClass += " today";
        countdownText = "Bugun";
      } else if (p.daysLeft === 1) {
        countdownClass += " soon";
        countdownText = "Ertaga";
      } else {
        if (p.daysLeft <= 3) countdownClass += " soon";
        countdownText = `${p.daysLeft} kun qoldi`;
      }

      const formattedDate = formatDateUzbek(p.nextDate);
      const ageText = p.age ? ` (${p.age} yoshga to'ladi)` : "";

      return `
        <article class="person-card ${isUrgent ? 'urgent-card' : ''}" data-id="${p.id}">
          <div>
            <div class="person-card-header">
              <div class="person-name-group">
                <h4>${p.name}${ageText}</h4>
                <span class="person-rel-badge">${p.relationship || 'Yaqin'}</span>
                <span class="badge badge-subtle">${p.eventType || "Tug'ilgan kun"}</span>
              </div>
              <span class="${countdownClass}">${countdownText}</span>
            </div>

            <div class="person-date-row" style="margin: 0.6rem 0;">
              <span class="person-date-text">📅 ${formattedDate}</span>
            </div>

            <div class="person-meta">
              ${p.favorite ? `<div>🍰 <em>Sevimli:</em> ${p.favorite}</div>` : ""}
              ${p.allergy ? `<div style="color: var(--danger);">⚠️ <em>Allergiya:</em> ${p.allergy}</div>` : ""}
              ${p.budget ? `<div>💰 <em>Odatiy byudjet:</em> ${formatMoney(p.budget)}</div>` : ""}
            </div>

            ${p.notes ? `<div class="person-notes-box" style="margin-top: 0.5rem;">${p.notes}</div>` : ""}

            ${p.lastPlanSummary ? `
              <div class="person-notes-box" style="margin-top: 0.5rem; background-color: var(--accent-amber-light);">
                <strong>O'tgan yilgi reja mavjud:</strong> ${p.lastPlanSummary}
                <button type="button" class="btn btn-sm btn-amber repeat-plan-btn" data-id="${p.id}" style="margin-top: 0.35rem; width: 100%;">
                  🔁 Shuni takrorlash
                </button>
              </div>
            ` : ""}
          </div>

          <div class="person-card-actions">
            <button type="button" class="btn btn-sm btn-primary plan-for-person-btn" data-id="${p.id}">
              🎯 Reja tuzish
            </button>
            <button type="button" class="btn btn-sm btn-outline export-person-ics-btn" data-id="${p.id}" title="Telefon kalendariga qo'shish">
              📅 Kalendar
            </button>
            <button type="button" class="btn btn-sm btn-subtle edit-person-btn" data-id="${p.id}">
              ✏️
            </button>
            <button type="button" class="btn btn-sm btn-subtle text-danger delete-person-btn" data-id="${p.id}">
              🗑️
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  // 2. Butun yil bo'yicha guruhlangan ro'yxat (Oylar bo'yicha)
  const byMonth = {};
  for (let m = 1; m <= 12; m++) {
    byMonth[m] = [];
  }

  people.forEach(p => {
    const m = parseInt(p.birthMonth, 10);
    if (byMonth[m]) {
      byMonth[m].push(p);
    }
  });

  let yearHtml = "";
  for (let m = 1; m <= 12; m++) {
    const monthPeople = byMonth[m];
    if (monthPeople.length === 0) continue;

    // Kunlar bo'yicha saralash
    monthPeople.sort((a, b) => parseInt(a.birthDay, 10) - parseInt(b.birthDay, 10));

    yearHtml += `
      <div class="month-group-card">
        <h4 class="month-heading">${UZ_MONTHS[m - 1].toUpperCase()}</h4>
        <div class="month-people-list">
          ${monthPeople.map(p => {
            const ageInfo = p.birthYear ? ` (${new Date().getFullYear() - parseInt(p.birthYear, 10)} yosh)` : "";
            return `
              <div class="month-person-item">
                <div>
                  <strong>${p.birthDay}-${UZ_MONTHS[m - 1]}</strong>: ${p.name} (${p.relationship})
                  <span class="badge badge-subtle" style="margin-left: 0.35rem;">${p.eventType || "Tug'ilgan kun"}</span>
                  ${ageInfo}
                </div>
                <div style="display: flex; gap: 0.3rem; align-items: center;">
                  <button type="button" class="btn btn-sm btn-outline plan-for-person-btn" data-id="${p.id}" title="Reja tuzish">🎯 Reja</button>
                  <button type="button" class="btn btn-sm btn-subtle edit-person-btn" data-id="${p.id}" title="Tahrirlash">✏️</button>
                  <button type="button" class="btn btn-sm btn-subtle text-danger delete-person-btn" data-id="${p.id}" title="O'chirish">🗑️</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  yearGroupedContainer.innerHTML = yearHtml;

  // Hodisalarni ulash
  attachPeopleCardEvents();
}

/**
 * Yaqinlar kartalaridagi tugmalar hodisalarini bog'lash
 */
function attachPeopleCardEvents() {
  // Reja tuzish tugmasi
  document.querySelectorAll(".plan-for-person-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      startPlanForPerson(btn.dataset.id);
    });
  });

  // Takrorlash tugmasi
  document.querySelectorAll(".repeat-plan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      startPlanForPerson(btn.dataset.id);
    });
  });

  // Tahrirlash tugmasi
  document.querySelectorAll(".edit-person-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openPersonModal(btn.dataset.id);
    });
  });

  // O'chirish tugmasi
  document.querySelectorAll(".delete-person-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      confirmDeletePerson(btn.dataset.id);
    });
  });

  // Bitta shaxsni kalendarga eksport qilish
  document.querySelectorAll(".export-person-ics-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      exportSinglePersonICS(btn.dataset.id);
    });
  });
}

/**
 * Yaqin kishi kartasidan to'g'ridan-to'g'ri Tab 1 ga o'tib reja tuzish
 */
function startPlanForPerson(personId) {
  const people = getPeopleList();
  const person = people.find(p => p.id === personId);
  if (!person) return;

  const nextInfo = getNextCelebrationDate(person);
  const targetDateStr = formatDateToInput(nextInfo.targetDate);

  // Tab 1 ga o'tish
  switchTab("planner");

  // Formani to'ldirish
  const dateInput = document.getElementById("event-date");
  dateInput.value = targetDateStr;
  updateDateDisplay();

  // Tadbir turi moslash
  let eventTypeToSelect = "Tug'ilgan kun (katta odamlar)";
  if (person.eventType === "Tug'ilgan kun") {
    if (person.relationship === "Farzand" || (nextInfo.age && nextInfo.age < 16)) {
      eventTypeToSelect = "Tug'ilgan kun (bolalar)";
    } else {
      eventTypeToSelect = "Tug'ilgan kun (katta odamlar)";
    }
  } else if (person.eventType === "Nikoh yilligi" || person.eventType === "Yubiley") {
    eventTypeToSelect = "Oilaviy ziyofat";
  } else {
    eventTypeToSelect = "Boshqa";
    const customInput = document.getElementById("custom-event-input");
    customInput.value = person.eventType || "Bayram";
  }

  selectEventTypeChip(eventTypeToSelect);

  // Odatiy byudjet bo'lsa qo'yish
  if (person.budget) {
    document.getElementById("budget-input").value = person.budget;
  }

  // Faol shaxs kontekstini saqlash (allergiya va izohlar ko'rinishi uchun)
  state.activePersonContext = person;

  // Agar byudjet mavjud bo'lsa, darhol reja tuziladi
  const curBudget = parseInt(document.getElementById("budget-input").value, 10);
  if (!isNaN(curBudget) && curBudget >= 50000) {
    document.getElementById("planner-form").dispatchEvent(new Event("submit"));
    showToast(`${person.name} uchun dasturxon rejasi tuzildi!`);
  } else {
    showToast(`${person.name} uchun dasturxon parametrlari to'ldirildi. "Stol tuzish" tugmasini bosing!`);
  }
}

function formatDateToInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Yaqin kishi modalini ochish (yangi yoki tahrirlash)
 */
function openPersonModal(personId = null) {
  const modal = document.getElementById("person-modal");
  const title = document.getElementById("person-modal-title");
  const form = document.getElementById("person-form");

  form.reset();
  document.getElementById("person-id-input").value = "";

  // Kunlar selectini to'ldirish (1-31)
  const daySelect = document.getElementById("person-birth-day");
  if (daySelect.options.length === 0) {
    for (let d = 1; d <= 31; d++) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = `${d}-kun`;
      daySelect.appendChild(opt);
    }
  }

  if (personId) {
    const people = getPeopleList();
    const person = people.find(p => p.id === personId);
    if (person) {
      title.textContent = "Yaqin kishini tahrirlash";
      document.getElementById("person-id-input").value = person.id;
      document.getElementById("person-name").value = person.name || "";
      document.getElementById("person-birth-day").value = person.birthDay || 1;
      document.getElementById("person-birth-month").value = person.birthMonth || 1;
      document.getElementById("person-birth-year").value = person.birthYear || "";
      document.getElementById("person-favorite").value = person.favorite || "";
      document.getElementById("person-allergy").value = person.allergy || "";
      document.getElementById("person-budget").value = person.budget || "";
      document.getElementById("person-notes").value = person.notes || "";

      selectRelationshipChip(person.relationship || "Ona");
      selectPersonEventTypeChip(person.eventType || "Tug'ilgan kun");
    }
  } else {
    title.textContent = "Yangi yaqin kishini qo'shish";
    selectRelationshipChip("Ona");
    selectPersonEventTypeChip("Tug'ilgan kun");
  }

  modal.classList.remove("hidden");
}

function closePersonModal() {
  document.getElementById("person-modal").classList.add("hidden");
}

function selectRelationshipChip(rel) {
  document.querySelectorAll("#relationship-chips .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.rel === rel);
  });
}

function selectPersonEventTypeChip(type) {
  document.querySelectorAll("#person-event-type-chips .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.type === type);
  });
}

/**
 * Yaqin kishini saqlash (form submit)
 */
function handlePersonFormSubmit(e) {
  e.preventDefault();
  const idInput = document.getElementById("person-id-input").value;
  const name = document.getElementById("person-name").value.trim();
  const day = parseInt(document.getElementById("person-birth-day").value, 10);
  const month = parseInt(document.getElementById("person-birth-month").value, 10);
  const yearVal = document.getElementById("person-birth-year").value.trim();
  const year = yearVal ? parseInt(yearVal, 10) : null;

  const relActive = document.querySelector("#relationship-chips .chip.active");
  const relationship = relActive ? relActive.dataset.rel : "Boshqa";

  const typeActive = document.querySelector("#person-event-type-chips .chip.active");
  const eventType = typeActive ? typeActive.dataset.type : "Tug'ilgan kun";

  const favorite = document.getElementById("person-favorite").value.trim();
  const allergy = document.getElementById("person-allergy").value.trim();
  const budgetVal = document.getElementById("person-budget").value.trim();
  const budget = budgetVal ? parseInt(budgetVal, 10) : null;
  const notes = document.getElementById("person-notes").value.trim();

  if (!name) {
    showToast("Iltimos, ismni kiriting!");
    return;
  }

  const people = getPeopleList();

  if (idInput) {
    // Tahrirlash
    const idx = people.findIndex(p => p.id === idInput);
    if (idx !== -1) {
      people[idx] = {
        ...people[idx],
        name,
        relationship,
        birthDay: day,
        birthMonth: month,
        birthYear: year,
        eventType,
        favorite,
        allergy,
        budget,
        notes
      };
      savePeopleList(people);
      showToast(`${name} ma'lumotlari yangilandi`);
    }
  } else {
    // Yangi qo'shish
    const newPerson = {
      id: "person-" + Date.now(),
      name,
      relationship,
      birthDay: day,
      birthMonth: month,
      birthYear: year,
      eventType,
      favorite,
      allergy,
      budget,
      notes,
      createdAt: new Date().toISOString()
    };
    people.push(newPerson);
    savePeopleList(people);
    showToast(`${name} yaqinlaringiz safiga qo'shildi`);
  }

  closePersonModal();
  renderPeopleTab();
  checkGlobalReminders();
}

/**
 * Shaxsni o'chirish
 */
function confirmDeletePerson(personId) {
  const people = getPeopleList();
  const person = people.find(p => p.id === personId);
  if (!person) return;

  if (confirm(`Haqiqatan ham ${person.name}ni o'chirib tashlamoqchimisiz?`)) {
    const filtered = people.filter(p => p.id !== personId);
    savePeopleList(filtered);
    renderPeopleTab();
    checkGlobalReminders();
    showToast(`${person.name} o'chirildi`);
  }
}

// ============================================================================
// KALENDAR (ICS) EKSPORTI: RRULE VA 3 TA VALARM
// ============================================================================

/**
 * Bitta shaxs uchun har yili takrorlanuvchi .ics fayli
 */
function exportSinglePersonICS(personId) {
  const people = getPeopleList();
  const person = people.find(p => p.id === personId);
  if (!person) return;

  const nextInfo = getNextCelebrationDate(person);
  const ics = buildPersonICS(person, nextInfo.targetDate);
  downloadBlob(ics, `${person.name.toLowerCase().replace(/\s+/g, '_')}_eslatma.ics`, "text/calendar;charset=utf-8");
  showToast(`${person.name} uchun kalendar eslatmasi yuklab olindi`);
}

/**
 * Barcha yaqinlarni yagona .ics faylida eksport qilish
 */
function exportAllPeopleICS() {
  const people = getPeopleList();
  if (people.length === 0) {
    showToast("Kalendarga o'tkazish uchun hech kim qo'shilmagan");
    return;
  }

  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stolyor//Yaqinlar Kalendari//UZ",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  people.forEach(person => {
    const nextInfo = getNextCelebrationDate(person);
    const dateObj = nextInfo.targetDate;
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    const dtStart = `${y}${m}${d}T090000`;
    const dtEnd = `${y}${m}${d}T100000`;

    const summary = `${person.name} — ${person.eventType || "Tug'ilgan kun"}`;
    let desc = `Yaqin kishi: ${person.name} (${person.relationship})\\nSana: ${person.birthDay}-${UZ_MONTHS[person.birthMonth - 1]}`;
    if (person.favorite) desc += `\\nSevimli taom/shirinlik: ${person.favorite}`;
    if (person.allergy) desc += `\\nAllergiya: ${person.allergy}`;

    lines = lines.concat([
      "BEGIN:VEVENT",
      `UID:stolyor-person-${person.id}@stolyor.uz`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `RRULE:FREQ=YEARLY`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      // 1. Eslatma: 7 kun oldin
      "BEGIN:VALARM",
      "TRIGGER:-P7D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${person.name}ning ${person.eventType || "tadbiriga"} 7 kun qoldi! Stolyor ilovasida dasturxon rejasini tuzing.`,
      "END:VALARM",
      // 2. Eslatma: 3 kun oldin
      "BEGIN:VALARM",
      "TRIGGER:-P3D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${person.name}ning ${person.eventType || "tadbiriga"} 3 kun qoldi! Do'konlardan tort va taomlarni buyurtma qiling.`,
      "END:VALARM",
      // 3. Eslatma: 1 kun oldin
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:Ertaga ${person.name}ning ${person.eventType || "kuni"}!`,
      "END:VALARM",
      "END:VEVENT"
    ]);
  });

  lines.push("END:VCALENDAR");

  // ESLATMA: Bu yerga kelgusida Telegram bot yoki push xabarnomalar integratsiyasini ulash mumkin.
  // Hozirgi kunda eng ishonchli va xavfsiz oflayn usul — tizim kalendariga (RRULE + VALARM) qo'shishdir.

  downloadBlob(lines.join("\r\n"), "stolyor_barcha_yaqinlar.ics", "text/calendar;charset=utf-8");
  showToast("Barcha yaqinlar kalendar fayliga saqlandi");
}

function buildPersonICS(person, dateObj) {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const dtStart = `${y}${m}${d}T090000`;
  const dtEnd = `${y}${m}${d}T100000`;

  const summary = `${person.name} — ${person.eventType || "Tug'ilgan kun"}`;
  let desc = `Yaqin kishi: ${person.name} (${person.relationship})\\nSana: ${person.birthDay}-${UZ_MONTHS[person.birthMonth - 1]}`;
  if (person.favorite) desc += `\\nSevimli: ${person.favorite}`;
  if (person.allergy) desc += `\\nAllergiya: ${person.allergy}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stolyor//Yaqinlar Kalendari//UZ",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:stolyor-person-${person.id}@stolyor.uz`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `RRULE:FREQ=YEARLY`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    // 7 kun oldin
    "BEGIN:VALARM",
    "TRIGGER:-P7D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${person.name}ning tadbiriga 7 kun qoldi!`,
    "END:VALARM",
    // 3 kun oldin
    "BEGIN:VALARM",
    "TRIGGER:-P3D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${person.name}ning tadbiriga 3 kun qoldi! Tort buyurtma qilish vaqti keldi.`,
    "END:VALARM",
    // 1 kun oldin
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Ertaga ${person.name}ning tadbiri!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  return lines.join("\r\n");
}

// ============================================================================
// MAXFIYLIK, ZAXIRA (EXPORT/IMPORT) VA HAMMASINI TOZALASH
// ============================================================================

/**
 * JSON formatida zaxira nusxasini eksport qilish
 */
function exportPeopleJSON() {
  const people = getPeopleList();
  const backupData = {
    app: "Stolyor",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    people
  };
  const jsonStr = JSON.stringify(backupData, null, 2);
  downloadBlob(jsonStr, "stolyor_yaqinlar_zaxira.json", "application/json");
  showToast("Zaxira nusxasi (JSON) yuklab olindi");
}

/**
 * JSON fayldan ma'lumotlarni tiklash (Import)
 */
function handleImportJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      let peopleArray = null;

      if (Array.isArray(parsed)) {
        peopleArray = parsed;
      } else if (parsed && Array.isArray(parsed.people)) {
        peopleArray = parsed.people;
      }

      if (!peopleArray) {
        throw new Error("Noto'g'ri JSON formati: shaxslar ro'yxati topilmadi");
      }

      // Validatsiya
      const validated = peopleArray.filter(p => p && p.name && p.birthDay && p.birthMonth);
      if (validated.length === 0) {
        throw new Error("Faylda yaroqli shaxslar ma'lumotlari mavjud emas");
      }

      savePeopleList(validated);
      renderPeopleTab();
      checkGlobalReminders();
      showToast(`${validated.length} nafar yaqin kishi muvaffaqiyatli tiklandi!`);
    } catch (err) {
      console.error("Import xatosi:", err);
      showToast("Xatolik: JSON fayli buzilgan yoki noto'g'ri formatda!");
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

/**
 * Hammasini o'chirish
 */
function clearAllPeople() {
  if (confirm("Diqqat! Barcha yaqinlaringiz ro'yxati o'chiriladi. Ishonchingiz komilmi?")) {
    savePeopleList([]);
    renderPeopleTab();
    checkGlobalReminders();
    showToast("Barcha ma'lumotlar o'chirildi");
  }
}

// ============================================================================
// GLOBAL ESMATMALAR BANNERI (KEYINGI 7 KUN)
// ============================================================================
function checkGlobalReminders() {
  const people = getPeopleList();
  const banner = document.getElementById("global-reminder-banner");
  const textEl = document.getElementById("global-reminder-text");

  if (!people || people.length === 0) {
    banner.classList.add("hidden");
    return;
  }

  // Keyingi 7 kun ichidagi eng yaqin tadbirni topish
  let closestPerson = null;
  let minDays = 8;

  people.forEach(p => {
    const nextInfo = getNextCelebrationDate(p);
    if (nextInfo.daysLeft >= 0 && nextInfo.daysLeft <= 7 && nextInfo.daysLeft < minDays) {
      minDays = nextInfo.daysLeft;
      closestPerson = { ...p, daysLeft: nextInfo.daysLeft };
    }
  });

  if (closestPerson) {
    let msg = "";
    const relText = closestPerson.relationship ? closestPerson.relationship.toLowerCase() : "yaqiningiz";
    if (closestPerson.daysLeft === 0) {
      msg = `Bugun ${closestPerson.name}ning (${relText}) tadbiri! Dasturxonni hozirlang.`;
    } else if (closestPerson.daysLeft === 1) {
      msg = `Ertaga ${closestPerson.name}ning (${relText}) tadbiri. Tort buyurtma qiling!`;
    } else {
      msg = `${closestPerson.daysLeft} kundan so'ng ${closestPerson.name}ning (${relText}) tadbiri. Rejani oldindan tuzing.`;
    }

    textEl.innerHTML = msg;
    banner.classList.remove("hidden");

    // Banner tugmalari
    const planBtn = document.getElementById("reminder-plan-btn");
    planBtn.onclick = () => {
      startPlanForPerson(closestPerson.id);
    };

    const laterBtn = document.getElementById("reminder-later-btn");
    laterBtn.onclick = () => {
      banner.classList.add("hidden");
    };
  } else {
    banner.classList.add("hidden");
  }
}

// ============================================================================
// TABLARNI ALMASHTIRISH (NAVIGATION)
// ============================================================================
function switchTab(tabName) {
  const plannerTab = document.getElementById("tab-planner");
  const peopleTab = document.getElementById("tab-people");
  const btnPlanner = document.getElementById("tab-btn-planner");
  const btnPeople = document.getElementById("tab-btn-people");

  if (tabName === "planner") {
    plannerTab.classList.remove("hidden");
    peopleTab.classList.add("hidden");
    btnPlanner.classList.add("active");
    btnPlanner.setAttribute("aria-selected", "true");
    btnPeople.classList.remove("active");
    btnPeople.setAttribute("aria-selected", "false");
  } else {
    plannerTab.classList.add("hidden");
    peopleTab.classList.remove("hidden");
    btnPlanner.classList.remove("active");
    btnPlanner.setAttribute("aria-selected", "false");
    btnPeople.classList.add("active");
    btnPeople.setAttribute("aria-selected", "true");
    renderPeopleTab();
  }
}

// ============================================================================
// FORM INPUTLARI VA SANA BOSHQARUVI
// ============================================================================

function setupFormInputs() {
  const dateInput = document.getElementById("event-date");
  const dateError = document.getElementById("date-error");
  const budgetInput = document.getElementById("budget-input");
  const guestsInput = document.getElementById("guests-input");
  const districtSelect = document.getElementById("district-select");

  // Standart bugungi sanani o'rnatish
  const todayStr = getTodayString();
  dateInput.min = todayStr;
  if (!dateInput.value) {
    dateInput.value = todayStr;
  }
  updateDateDisplay();

  dateInput.addEventListener("change", updateDateDisplay);
  dateInput.addEventListener("input", updateDateDisplay);

  // Tadbir turi chiplari
  const chips = document.querySelectorAll("#event-type-chips .chip");
  const customEventBox = document.getElementById("custom-event-container");
  const customEventInput = document.getElementById("custom-event-input");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => {
        c.classList.remove("active");
        c.setAttribute("aria-checked", "false");
      });
      chip.classList.add("active");
      chip.setAttribute("aria-checked", "true");

      const type = chip.dataset.type;
      storageSet(CONFIG.storageKeys.lastEventType, type);

      if (type === "Boshqa") {
        customEventBox.classList.remove("hidden");
        customEventInput.focus();
      } else {
        customEventBox.classList.add("hidden");
      }
    });
  });

  // Oxirgi tanlangan tadbir turini tiklash
  const lastType = storageGet(CONFIG.storageKeys.lastEventType);
  if (lastType) {
    selectEventTypeChip(lastType);
  }

  // Maxsus nomni eslab qolish
  const lastCustomName = storageGet(CONFIG.storageKeys.lastCustomName);
  if (lastCustomName && customEventInput) {
    customEventInput.value = lastCustomName;
  }
  if (customEventInput) {
    customEventInput.addEventListener("input", () => {
      storageSet(CONFIG.storageKeys.lastCustomName, customEventInput.value);
    });
  }

  // Standart byudjet
  if (!budgetInput.value) {
    budgetInput.value = "500000";
  }

  // Tezkor byudjet tugmalari
  const quickBtns = document.querySelectorAll(".quick-buttons .btn-chip");
  function syncQuickButtons() {
    const curVal = budgetInput.value;
    quickBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.budget === curVal);
    });
  }
  syncQuickButtons();

  quickBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      budgetInput.value = btn.dataset.budget;
      syncQuickButtons();
      document.getElementById("budget-error").classList.add("hidden");
    });
  });

  budgetInput.addEventListener("input", () => {
    syncQuickButtons();
    document.getElementById("budget-error").classList.add("hidden");
  });

  // Mehmonlar soni (- va +)
  const minusBtn = document.getElementById("guests-minus-btn");
  const plusBtn = document.getElementById("guests-plus-btn");

  const lastGuests = storageGet(CONFIG.storageKeys.lastGuests);
  if (lastGuests) {
    guestsInput.value = lastGuests;
  }

  minusBtn.addEventListener("click", () => {
    let val = parseInt(guestsInput.value, 10) || 8;
    if (val > 2) {
      guestsInput.value = val - 1;
      storageSet(CONFIG.storageKeys.lastGuests, guestsInput.value);
    }
  });

  plusBtn.addEventListener("click", () => {
    let val = parseInt(guestsInput.value, 10) || 8;
    if (val < 50) {
      guestsInput.value = val + 1;
      storageSet(CONFIG.storageKeys.lastGuests, guestsInput.value);
    }
  });

  guestsInput.addEventListener("input", () => {
    storageSet(CONFIG.storageKeys.lastGuests, guestsInput.value);
  });

  // Oxirgi tanlangan tumanni tiklash
  const lastDistrict = storageGet(CONFIG.storageKeys.lastDistrict);
  if (lastDistrict && districtSelect.querySelector(`option[value="${lastDistrict}"]`)) {
    districtSelect.value = lastDistrict;
  }

  districtSelect.addEventListener("change", () => {
    storageSet(CONFIG.storageKeys.lastDistrict, districtSelect.value);
  });

  // Form submit
  document.getElementById("planner-form").addEventListener("submit", handlePlannerSubmit);
}

function selectEventTypeChip(type) {
  const chips = document.querySelectorAll("#event-type-chips .chip");
  const customBox = document.getElementById("custom-event-container");
  chips.forEach(c => {
    if (c.dataset.type === type) {
      c.classList.add("active");
      c.setAttribute("aria-checked", "true");
    } else {
      c.classList.remove("active");
      c.setAttribute("aria-checked", "false");
    }
  });

  if (type === "Boshqa") {
    customBox.classList.remove("hidden");
  } else {
    customBox.classList.add("hidden");
  }
}

function updateDateDisplay() {
  const dateInput = document.getElementById("event-date");
  const uzbekDisplay = document.getElementById("date-uzbek-display");
  const countdownDisplay = document.getElementById("date-countdown-display");
  const dateError = document.getElementById("date-error");

  const val = dateInput.value;
  if (!val) {
    uzbekDisplay.textContent = "";
    countdownDisplay.textContent = "";
    countdownDisplay.style.display = "none";
    return;
  }

  const selectedDate = parseLocalDate(val);
  const today = new Date();
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (!selectedDate || isNaN(selectedDate.getTime()) || selectedDate.getTime() < todayZero.getTime()) {
    dateError.textContent = "O'tgan sanani tanlab bo'lmaydi";
    dateError.classList.remove("hidden");
    uzbekDisplay.textContent = "";
    countdownDisplay.textContent = "";
    countdownDisplay.style.display = "none";
    return;
  } else {
    dateError.classList.add("hidden");
  }

  const formatted = formatDateUzbek(selectedDate);
  const daysDiff = getDaysDifference(selectedDate, todayZero);
  const countdownText = getCountdownText(daysDiff);

  uzbekDisplay.textContent = formatted;
  countdownDisplay.textContent = countdownText;
  countdownDisplay.style.display = "inline-block";

  if (daysDiff <= 2) {
    countdownDisplay.classList.add("urgent");
  } else {
    countdownDisplay.classList.remove("urgent");
  }
}

/**
 * Stol tuzish tugmasi bosilganda (Form Submit)
 */
function handlePlannerSubmit(e) {
  e.preventDefault();

  const dateInput = document.getElementById("event-date");
  const budgetInput = document.getElementById("budget-input");
  const guestsInput = document.getElementById("guests-input");
  const districtSelect = document.getElementById("district-select");

  const dateVal = dateInput.value;
  const budgetVal = parseInt(budgetInput.value, 10);
  const guestsVal = parseInt(guestsInput.value, 10);
  const districtVal = districtSelect.value;

  // Validatsiya
  let hasError = false;

  const selectedDate = parseLocalDate(dateVal);
  const todayZero = new Date();
  todayZero.setHours(0, 0, 0, 0);

  if (!dateVal || !selectedDate || isNaN(selectedDate.getTime()) || selectedDate.getTime() < todayZero.getTime()) {
    document.getElementById("date-error").textContent = "O'tgan sanani tanlab bo'lmaydi";
    document.getElementById("date-error").classList.remove("hidden");
    hasError = true;
  } else {
    document.getElementById("date-error").classList.add("hidden");
  }

  const activeChip = document.querySelector("#event-type-chips .chip.active");
  const eventType = activeChip ? activeChip.dataset.type : "Tug'ilgan kun (katta odamlar)";
  let customEventName = "";

  if (eventType === "Boshqa") {
    customEventName = document.getElementById("custom-event-input").value.trim();
  }

  if (isNaN(budgetVal) || budgetVal < 50000) {
    const budgetError = document.getElementById("budget-error");
    budgetError.textContent = "Iltimos, kamida 50 000 so'm miqdorida byudjet kiriting";
    budgetError.classList.remove("hidden");
    hasError = true;
  } else {
    document.getElementById("budget-error").classList.add("hidden");
  }

  if (isNaN(guestsVal) || guestsVal < 2 || guestsVal > 50) {
    const guestsError = document.getElementById("guests-error");
    guestsError.textContent = "Mehmonlar soni 2 dan 50 gacha bo'lishi lozim";
    guestsError.classList.remove("hidden");
    hasError = true;
  } else {
    document.getElementById("guests-error").classList.add("hidden");
  }

  if (hasError) return;

  // Plan generatsiyasi
  const plan = generateTablePlan({
    eventDate: dateVal,
    eventType,
    customEventName,
    budget: budgetVal,
    guests: guestsVal,
    district: districtVal
  });

  state.currentPlan = plan;
  state.initialPlan = JSON.parse(JSON.stringify(plan));
  state.undoStack = [];

  renderPlan(plan);
  showToast("Dasturxon rejasi muvaffaqiyatli tuzildi!");
}

// ============================================================================
// NATIJA HARAKATLARINI BOG'LASH (ACTIONS)
// ============================================================================
function setupResultActionButtons() {
  // Qayta tuzish
  document.getElementById("regenerate-plan-btn").addEventListener("click", regeneratePlan);

  // Undo
  document.getElementById("undo-plan-btn").addEventListener("click", undoPlanChange);

  // Birinchi tavsiyaga qaytish
  document.getElementById("reset-plan-btn").addEventListener("click", resetToInitialPlan);

  // Natijani ulashish
  document.getElementById("share-plan-btn").addEventListener("click", sharePlanResult);

  // Eslatma (.ics)
  document.getElementById("calendar-export-btn").addEventListener("click", downloadPlanICS);

  // Shu rejani saqlash (shaxs konteksti bo'lsa)
  document.getElementById("save-to-person-btn").addEventListener("click", () => {
    if (!state.activePersonContext || !state.currentPlan) return;
    const people = getPeopleList();
    const idx = people.findIndex(p => p.id === state.activePersonContext.id);
    if (idx !== -1) {
      const totalAmount = state.currentPlan.items.reduce((s, it) => s + it.calc.subtotal, 0);
      people[idx].lastPlanSummary = `${formatMoney(totalAmount)} (${state.currentPlan.items.length} xil mahsulot)`;
      savePeopleList(people);
      showToast(`${state.activePersonContext.name} uchun ushbu reja eslab qolindi!`);
    }
  });

  // Kategoriya ichidagi mahsulotlar boshqaruvi (Delegatsiya)
  document.getElementById("plan-result-container").addEventListener("click", (e) => {
    // Almashtirish
    const swapBtn = e.target.closest(".swap-item-btn");
    if (swapBtn) {
      openSwapModal(swapBtn.dataset.id);
      return;
    }

    // Olib tashlash
    const removeBtn = e.target.closest(".remove-item-btn");
    if (removeBtn) {
      executeRemoveItem(removeBtn.dataset.id);
      return;
    }

    // Qulflash
    const lockBtn = e.target.closest(".lock-item-btn");
    if (lockBtn) {
      toggleLockItem(lockBtn.dataset.id);
      return;
    }

    // Yangi qo'shish
    const addBtn = e.target.closest(".add-item-btn");
    if (addBtn) {
      openAddItemModal(addBtn.dataset.category);
      return;
    }
  });

  // Swap modalni yopish
  document.getElementById("close-swap-modal-btn").addEventListener("click", closeSwapModal);
  document.getElementById("swap-modal").addEventListener("click", (e) => {
    if (e.target.id === "swap-modal") closeSwapModal();
  });

  // Person modalni yopish (fon bosilganda)
  const personModal = document.getElementById("person-modal");
  if (personModal) {
    personModal.addEventListener("click", (e) => {
      if (e.target.id === "person-modal") closePersonModal();
    });
  }

  // Escape tugmasi orqali ochiq modallarni yopish
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSwapModal();
      closePersonModal();
    }
  });

  // Fikr bildirish (Feedback)
  // ESLATMA: Haqiqiy backend (masalan Google Form yoki API) ulanishi mumkin bo'lgan joy:
  // Masalan: fetch("https://example.com/api/feedback", { method: "POST", body: JSON.stringify({ answer }) });
  document.querySelectorAll(".feedback-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const answer = btn.dataset.answer;
      storageSet(CONFIG.storageKeys.feedback, { answer, date: new Date().toISOString() });
      document.getElementById("feedback-prompt").classList.add("hidden");
      document.getElementById("feedback-thanks").classList.remove("hidden");
    });
  });
}

// ============================================================================
// PWA O'RNATISH VA SERVICE WORKER
// ============================================================================
function setupPWA() {
  const pwaBanner = document.getElementById("pwa-install-banner");
  const installBtn = document.getElementById("pwa-install-btn");
  const dismissBtn = document.getElementById("pwa-dismiss-btn");
  const instructions = document.getElementById("pwa-instructions");

  // Agar ilgari yopilgan bo'lsa
  const dismissed = storageGet(CONFIG.storageKeys.pwaDismissed);
  if (!dismissed) {
    pwaBanner.classList.remove("hidden");
  }

  // Qurilma turini aniqlash (iOS yoki Android)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    instructions.textContent = "iPhone uchun: 'Ulashish' tugmasini bosing va 'Bosh ekranga qo'shish'ni tanlang.";
  } else {
    instructions.textContent = "Android uchun: Brauzer menyusidan 'Ilovani o'rnatish'ni tanlang.";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    const { outcome } = await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    pwaBanner.classList.add("hidden");
    storageSet(CONFIG.storageKeys.pwaDismissed, true);
  });

  dismissBtn.addEventListener("click", () => {
    pwaBanner.classList.add("hidden");
    storageSet(CONFIG.storageKeys.pwaDismissed, true);
  });

  // Service Workerni ro'yxatdan o'tkazish (faqat HTTP yoki HTTPS protokollarida, file:// da xatolik bermasligi uchun)
  if ("serviceWorker" in navigator && typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => {
          console.log("Service Worker muvaffaqiyatli ro'yxatdan o'tdi:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker ro'yxatdan o'tishda xatolik:", err);
        });
    });
  }
}

// ============================================================================
// DASTURNI BOSHLASH (INIT)
// ============================================================================
async function initApp() {
  // 1. Do'konlar ma'lumotlarini yuklash
  await loadAllDatasets();

  // 2. Form inputlarini sozlash
  setupFormInputs();

  // 3. Natija harakatlarini sozlash
  setupResultActionButtons();

  // 4. Tab navigatsiyasi
  document.getElementById("tab-btn-planner").addEventListener("click", () => switchTab("planner"));
  document.getElementById("tab-btn-people").addEventListener("click", () => switchTab("people"));

  // 5. Tab 2 hodisalari
  document.getElementById("open-add-person-btn").addEventListener("click", () => openPersonModal());
  document.querySelector(".add-first-person-btn").addEventListener("click", () => openPersonModal());
  document.getElementById("close-person-modal-btn").addEventListener("click", closePersonModal);
  document.getElementById("cancel-person-modal-btn").addEventListener("click", closePersonModal);
  document.getElementById("person-form").addEventListener("submit", handlePersonFormSubmit);

  // Munosabat chiplari
  document.querySelectorAll("#relationship-chips .chip").forEach(c => {
    c.addEventListener("click", () => selectRelationshipChip(c.dataset.rel));
  });

  // Tadbir turi chiplari
  document.querySelectorAll("#person-event-type-chips .chip").forEach(c => {
    c.addEventListener("click", () => selectPersonEventTypeChip(c.dataset.type));
  });

  // Zaxira / Tiklash / Kalendar
  document.getElementById("export-json-btn").addEventListener("click", exportPeopleJSON);
  document.getElementById("import-json-input").addEventListener("change", handleImportJSON);
  document.getElementById("clear-all-people-btn").addEventListener("click", clearAllPeople);
  document.getElementById("export-all-ics-btn").addEventListener("click", exportAllPeopleICS);

  // 6. Global eslatmalarni tekshirish
  checkGlobalReminders();

  // 7. PWA
  setupPWA();
}

// DOM yuklanganda ishga tushirish
document.addEventListener("DOMContentLoaded", initApp);
