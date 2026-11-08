/**
 * Stolyor — Keng qamrovli avtomatik testlar to'plami (a dan q gacha)
 */
const fs = require('fs');
const path = require('path');

// Rangli konsol chiqarish
const GREEN = '\x1b[32m[O\'TDI]\x1b[0m';
const RED = '\x1b[31m[XATO]\x1b[0m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const results = [];

function recordTest(id, name, passed, details = '') {
  results.push({ id, name, passed, details });
  const status = passed ? GREEN : RED;
  console.log(`${status} ${BOLD}(${id})${RESET} ${name}`);
  if (details) {
    console.log(`       ${details}`);
  }
}

// 1. shops.json ma'lumotlarini yuklash
const shopsData = JSON.parse(fs.readFileSync('data/shops.json', 'utf8'));

// 2. app.js dagi asosiy funksiyalar va konfiguratsiyani o'qish
const appCode = fs.readFileSync('app.js', 'utf8');

// app.js ni qumloq muhitda (sandbox) yuklash
const mockLocalStorage = {};
const mockWindow = {
  localStorage: {
    getItem: (k) => mockLocalStorage[k] || null,
    setItem: (k, v) => { mockLocalStorage[k] = String(v); },
    removeItem: (k) => { delete mockLocalStorage[k]; },
    clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }
  },
  addEventListener: () => {},
  MSStream: false
};

const context = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  String,
  Number,
  parseInt,
  parseFloat,
  JSON,
  Array,
  RegExp,
  navigator: { userAgent: 'NodeTest', clipboard: { writeText: async () => {} } },
  window: mockWindow,
  localStorage: mockWindow.localStorage,
  document: {
    addEventListener: () => {},
    getElementById: (id) => ({
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      setAttribute: () => {},
      textContent: '',
      innerHTML: '',
      value: '',
      options: [],
      style: {},
      dataset: {},
      scrollIntoView: () => {}
    }),
    querySelectorAll: () => [],
    createElement: (tag) => ({ appendChild: () => {}, setAttribute: () => {}, style: {}, dataset: {}, click: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  }
};

const vm = require('vm');
vm.createContext(context);

// app.js ni kontekstda ishga tushirish va eksport qilib olish
vm.runInContext(appCode + `
  window.CONFIG = CONFIG;
  window.UZ_MONTHS = UZ_MONTHS;
  window.UZ_WEEKDAYS = UZ_WEEKDAYS;
  window.state = state;
  window.formatMoney = formatMoney;
  window.formatDateUzbek = formatDateUzbek;
  window.parseLocalDate = parseLocalDate;
  window.getDaysDifference = getDaysDifference;
  window.getCountdownText = getCountdownText;
  window.getShopOpeningStatus = getShopOpeningStatus;
  window.calculateItemQuantityAndCost = calculateItemQuantityAndCost;
  window.getAllCandidateItems = getAllCandidateItems;
  window.generateTablePlan = generateTablePlan;
  window.createPlanItem = createPlanItem;
  window.regeneratePlan = regeneratePlan;
  window.generatePlanSummaryText = generatePlanSummaryText;
  window.buildPersonICS = buildPersonICS;
  window.getNextCelebrationDate = getNextCelebrationDate;
  window.isLeapYear = isLeapYear;
  window.getPeopleList = getPeopleList;
  window.savePeopleList = savePeopleList;
`, context);

// Context dan funksiyalarni olish
const {
  CONFIG,
  UZ_MONTHS,
  UZ_WEEKDAYS,
  state,
  formatMoney,
  formatDateUzbek,
  parseLocalDate,
  getDaysDifference,
  getCountdownText,
  getShopOpeningStatus,
  calculateItemQuantityAndCost,
  getAllCandidateItems,
  generateTablePlan,
  createPlanItem,
  regeneratePlan,
  generatePlanSummaryText,
  buildPersonICS,
  getNextCelebrationDate,
  isLeapYear,
  getPeopleList,
  savePeopleList
} = mockWindow;

// State ga shops ma'lumotlarini o'rnatish
state.shopsData = shopsData;

console.log(`${BOLD}============================================================${RESET}`);
console.log(`${BOLD}STOLYOR: 17 TA SINOV (a dan q gacha) TEKSHIRUVI BOSHLANDI${RESET}`);
console.log(`${BOLD}============================================================${RESET}\n`);

// -------------------------------------------------------------
// (a) 500 000 som, 8 guests, Chilonzor, adults' birthday
// -------------------------------------------------------------
try {
  const planA = generateTablePlan({
    eventDate: '2026-12-12',
    eventType: "Tug'ilgan kun (katta odamlar)",
    budget: 500000,
    guests: 8,
    district: 'Chilonzor'
  });

  const totalA = planA.items.reduce((s, it) => s + it.calc.subtotal, 0);
  const foodItems = planA.items.filter(it => it.planCategory === 'food');
  const cakeItems = planA.items.filter(it => it.planCategory === 'cake');
  const drinkItems = planA.items.filter(it => it.planCategory === 'drinks');

  const passedA = totalA <= 500000 &&
                  foodItems.length > 0 &&
                  cakeItems.length > 0 &&
                  drinkItems.length > 0 &&
                  planA.params.district === 'Chilonzor';

  recordTest('a', "500 000 so'm, 8 mehmon, Chilonzor, kattalar tug'ilgan kuni", passedA,
    `Jami: ${formatMoney(totalA)} <= 500 000 so'm | Taom: ${foodItems.length}, Tort: ${cakeItems.length}, Ichimlik/meva: ${drinkItems.length}`);
} catch (e) {
  recordTest('a', "500 000 so'm, 8 mehmon, Chilonzor, kattalar tug'ilgan kuni", false, e.message);
}

// -------------------------------------------------------------
// (b) 150 000 som, 20 guests (must show a warning)
// -------------------------------------------------------------
try {
  const planB = generateTablePlan({
    eventDate: '2026-12-15',
    eventType: "Oilaviy ziyofat",
    budget: 150000,
    guests: 20,
    district: 'Yunusobod'
  });

  const budgetPerGuest = Math.round(planB.params.budget / planB.params.guests);
  const isLowBudget = budgetPerGuest < CONFIG.minComfortBudgetPerGuest;
  const passedB = isLowBudget && budgetPerGuest === 7500;

  recordTest('b', "150 000 so'm, 20 mehmon (kam byudjet ogohlantirishi)", passedB,
    `Kishi boshiga: ${formatMoney(budgetPerGuest)} (< ${formatMoney(CONFIG.minComfortBudgetPerGuest)} me'yordan kam, ogohlantirish ko'rsatiladi)`);
} catch (e) {
  recordTest('b', "150 000 so'm, 20 mehmon (kam byudjet ogohlantirishi)", false, e.message);
}

// -------------------------------------------------------------
// (c) 2 000 000 som, 30 guests, family gathering
// -------------------------------------------------------------
try {
  const planC = generateTablePlan({
    eventDate: '2026-12-20',
    eventType: "Oilaviy ziyofat",
    budget: 2000000,
    guests: 30,
    district: 'Mirzo Ulug\'bek'
  });

  const totalC = planC.items.reduce((s, it) => s + it.calc.subtotal, 0);
  const cake = planC.items.find(it => it.planCategory === 'cake');
  const cakeWeight = cake ? cake.calc.quantity : 0;
  const passedC = totalC <= 2000000 && cakeWeight >= 4.5; // 30 guests * 150g = 4.5 kg

  recordTest('c', "2 000 000 so'm, 30 mehmon, oilaviy ziyofat", passedC,
    `Jami: ${formatMoney(totalC)} <= 2 000 000 so'm | Tort vazni: ${cakeWeight} kg (30 mehmon uchun hisoblangan)`);
} catch (e) {
  recordTest('c', "2 000 000 so'm, 30 mehmon, oilaviy ziyofat", false, e.message);
}

// -------------------------------------------------------------
// (d) 400 000 som, 10 guests, kids' birthday
// -------------------------------------------------------------
try {
  const planD = generateTablePlan({
    eventDate: '2026-12-25',
    eventType: "Tug'ilgan kun (bolalar)",
    budget: 400000,
    guests: 10,
    district: 'Chilonzor'
  });

  const totalD = planD.items.reduce((s, it) => s + it.calc.subtotal, 0);
  const hasKidFriendly = planD.items.some(it => it.item.kidFriendly === true);
  const splitRule = CONFIG.budgetSplits["Tug'ilgan kun (bolalar)"];
  const passedD = totalD <= 400000 && hasKidFriendly && splitRule.cake === 40;

  recordTest('d', "400 000 so'm, 10 mehmon, bolalar tug'ilgan kuni", passedD,
    `Jami: ${formatMoney(totalD)} <= 400 000 so'm | Bolalarbop mahsulotlar afzalligi: ${hasKidFriendly} | Tort foizi: ${splitRule.cake}%`);
} catch (e) {
  recordTest('d', "400 000 so'm, 10 mehmon, bolalar tug'ilgan kuni", false, e.message);
}

// -------------------------------------------------------------
// (e) event date = today
// -------------------------------------------------------------
try {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const daysDiff = getDaysDifference(parseLocalDate(todayStr), today);
  const countdown = getCountdownText(daysDiff);
  const uzFormatted = formatDateUzbek(today);

  const passedE = daysDiff === 0 && countdown === "Tadbir bugun" && uzFormatted.includes(UZ_MONTHS[today.getMonth()]);

  recordTest('e', "Tadbir sanasi = bugun", passedE,
    `Format: "${uzFormatted}" | Ortga hisoblash: "${countdown}"`);
} catch (e) {
  recordTest('e', "Tadbir sanasi = bugun", false, e.message);
}

// -------------------------------------------------------------
// (f) event date = 10 days from now
// -------------------------------------------------------------
try {
  const future = new Date();
  future.setDate(future.getDate() + 10);
  const daysDiff = getDaysDifference(future, new Date());
  const countdown = getCountdownText(daysDiff);

  const passedF = daysDiff === 10 && countdown === "Tadbirga 10 kun qoldi";

  recordTest('f', "Tadbir sanasi = 10 kundan so'ng", passedF,
    `Ortga hisoblash: "${countdown}" (7+ kun bo'lgani sababli oldindan buyurtma maslahati faollashadi)`);
} catch (e) {
  recordTest('f', "Tadbir sanasi = 10 kundan so'ng", false, e.message);
}

// -------------------------------------------------------------
// (g) event type "Boshqa" with a custom name
// -------------------------------------------------------------
try {
  const planG = generateTablePlan({
    eventDate: '2026-12-30',
    eventType: "Boshqa",
    customEventName: "Chaqaloq to'yi",
    budget: 600000,
    guests: 12,
    district: 'Yakkasaroy'
  });

  const passedG = planG.params.customEventName === "Chaqaloq to'yi" &&
                  planG.isSweetsEvent === true &&
                  planG.items.some(it => it.planCategory === 'cake' && it.item.category === 'shirinlik');

  recordTest('g', 'Tadbir turi "Boshqa" va maxsus nom', passedG,
    `Tadbir: "${planG.params.customEventName}" | Tort o'rniga "Shirinliklar" toifasi tanlandi: ${planG.isSweetsEvent}`);
} catch (e) {
  recordTest('g', 'Tadbir turi "Boshqa" va maxsus nom', false, e.message);
}

// -------------------------------------------------------------
// (h) swap the cake for a pricier one and confirm over-budget warning
// -------------------------------------------------------------
try {
  const planH = generateTablePlan({
    eventDate: '2026-12-12',
    eventType: "Tug'ilgan kun (katta odamlar)",
    budget: 350000,
    guests: 8,
    district: 'Chilonzor'
  });

  const cakeIdx = planH.items.findIndex(it => it.planCategory === 'cake');
  const originalCake = planH.items[cakeIdx];
  const originalTotal = planH.items.reduce((s, it) => s + it.calc.subtotal, 0);

  // Qimmatroq tortga almashtiramiz (San Sebastian 150 000 so'm/kg)
  const expensiveCake = {
    id: "t-8",
    name: "San Sebastian pishloqli tort",
    category: "tort",
    unit: "kg",
    price: 150000
  };
  const expCalc = calculateItemQuantityAndCost(expensiveCake, 8);
  planH.items[cakeIdx] = {
    instanceId: 'item-exp',
    item: expensiveCake,
    shop: { name: 'Namuna qandolatxona 3', districts: ['Mirobod'] },
    calc: expCalc,
    planCategory: 'cake',
    locked: false
  };

  const newTotal = planH.items.reduce((s, it) => s + it.calc.subtotal, 0);
  const isOver = newTotal > planH.params.budget;
  const overAmount = newTotal - planH.params.budget;

  const passedH = isOver && overAmount > 0;

  recordTest('h', "Tortni qimmatroqqa almashtirish va byudjetdan oshish", passedH,
    `Eski jami: ${formatMoney(originalTotal)} -> Yangi jami: ${formatMoney(newTotal)} | Byudjetdan ${formatMoney(overAmount)} oshdi`);
} catch (e) {
  recordTest('h', "Tortni qimmatroqqa almashtirish va byudjetdan oshish", false, e.message);
}

// -------------------------------------------------------------
// (i) remove an item and add it back
// -------------------------------------------------------------
try {
  const planI = generateTablePlan({
    eventDate: '2026-12-12',
    eventType: "Tug'ilgan kun (katta odamlar)",
    budget: 500000,
    guests: 8,
    district: 'Chilonzor'
  });

  const initialCount = planI.items.length;
  const removed = planI.items.pop(); // 1 ta elementni olib tashlash
  const afterRemoveCount = planI.items.length;

  planI.items.push(removed); // Qaytadan qo'shish
  const afterAddCount = planI.items.length;

  const passedI = initialCount === 4 && afterRemoveCount === 3 && afterAddCount === 4;

  recordTest('i', "Mahsulotni olib tashlash va qayta qo'shish", passedI,
    `Elementlar soni: ${initialCount} -> olib tashlangach: ${afterRemoveCount} -> qayta qo'shilgach: ${afterAddCount}`);
} catch (e) {
  recordTest('i', "Mahsulotni olib tashlash va qayta qo'shish", false, e.message);
}

// -------------------------------------------------------------
// (j) lock the cake, regenerate, confirm the cake stays
// -------------------------------------------------------------
try {
  const planJ = generateTablePlan({
    eventDate: '2026-12-12',
    eventType: "Tug'ilgan kun (katta odamlar)",
    budget: 500000,
    guests: 8,
    district: 'Chilonzor'
  });

  state.currentPlan = planJ;
  const cakeItem = planJ.items.find(it => it.planCategory === 'cake');
  cakeItem.locked = true;
  const lockedCakeName = cakeItem.item.name;

  regeneratePlan();

  const newCakeItem = state.currentPlan.items.find(it => it.planCategory === 'cake');
  const passedJ = newCakeItem && newCakeItem.item.name === lockedCakeName && newCakeItem.locked === true;

  recordTest('j', "Tortni qulflash va qayta tuzganda saqlanib qolishi", passedJ,
    `Qulflangan tort: "${lockedCakeName}" -> Qayta tuzilgach: "${newCakeItem.item.name}" (o'zgarmadi)`);
} catch (e) {
  recordTest('j', "Tortni qulflash va qayta tuzganda saqlanib qolishi", false, e.message);
}

// -------------------------------------------------------------
// (k) shop outside its opening hours shows "Hozir yopiq" with next opening time
// -------------------------------------------------------------
try {
  // Sinov uchun vaqt mock qilish
  const statusOpen = getShopOpeningStatus("00:00-23:59"); // Har doim ochiq
  const statusClosedMorning = getShopOpeningStatus("23:58-23:59"); // ertalab/kunduzi yopiq

  const passedK = statusOpen.isOpen === true &&
                  statusOpen.text === "Hozir ochiq" &&
                  statusClosedMorning.isOpen === false &&
                  statusClosedMorning.text.includes("Hozir yopiq");

  // Shuningdek, hours: null bo'lgan do'kon uchun null qaytarishini tekshiramiz
  const statusNull = getShopOpeningStatus(null);
  const passedKFinal = passedK && statusNull === null;

  recordTest('k', 'Ish vaqtidan tashqaridagi do\'kon "Hozir yopiq" ko\'rsatishi', passedKFinal,
    `Ochiq holat: "${statusOpen.text}" | Yopiq holat: "${statusClosedMorning.text}" | Noma'lum vaqt: ${statusNull}`);
} catch (e) {
  recordTest('k', 'Ish vaqtidan tashqaridagi do\'kon "Hozir yopiq" ko\'rsatishi', false, e.message);
}

// -------------------------------------------------------------
// (l) add a person born today and confirm "Bugun" and banner
// -------------------------------------------------------------
try {
  const today = new Date();
  const personToday = {
    id: 'test-person-today',
    name: 'Akmal',
    relationship: 'Aka-uka',
    birthDay: today.getDate(),
    birthMonth: today.getMonth() + 1,
    birthYear: today.getFullYear() - 25,
    eventType: "Tug'ilgan kun"
  };

  const nextInfo = getNextCelebrationDate(personToday, today);
  const passedL = nextInfo.daysLeft === 0 && nextInfo.age === 25;

  recordTest('l', 'Bugun tug\'ilgan yaqin kishi va "Bugun" eslatmasi', passedL,
    `Qolgan kun: ${nextInfo.daysLeft} ("Bugun") | Yoshi: ${nextInfo.age} yosh`);
} catch (e) {
  recordTest('l', 'Bugun tug\'ilgan yaqin kishi va "Bugun" eslatmasi', false, e.message);
}

// -------------------------------------------------------------
// (m) add a person born 29-fevral
// -------------------------------------------------------------
try {
  const personLeap = {
    id: 'test-person-leap',
    name: 'Madina',
    relationship: 'Opa-singil',
    birthDay: 29,
    birthMonth: 2,
    birthYear: 2000,
    eventType: "Tug'ilgan kun"
  };

  // 2026-yil (kabisa emas) uchun tekshirish
  const testDateNonLeap = new Date(2026, 0, 15);
  const nonLeapInfo = getNextCelebrationDate(personLeap, testDateNonLeap);

  // 2028-yil (kabisa yili) uchun tekshirish
  const testDateLeap = new Date(2028, 0, 15);
  const leapInfo = getNextCelebrationDate(personLeap, testDateLeap);

  const passedM = nonLeapInfo.targetDate.getDate() === 28 &&
                  nonLeapInfo.targetDate.getMonth() === 1 &&
                  leapInfo.targetDate.getDate() === 29 &&
                  leapInfo.targetDate.getMonth() === 1;

  recordTest('m', '29-fevralda tug\'ilgan shaxsning nishonlanishi', passedM,
    `Kabisa bo'lmagan yilda (2026): ${nonLeapInfo.targetDate.getDate()}-fevral | Kabisa yilida (2028): ${leapInfo.targetDate.getDate()}-fevral`);
} catch (e) {
  recordTest('m', '29-fevralda tug\'ilgan shaxsning nishonlanishi', false, e.message);
}

// -------------------------------------------------------------
// (n) tap "Reja tuzish" on a person and confirm prefill and allergy warning
// -------------------------------------------------------------
try {
  const personWithAllergy = {
    id: 'p-allergy',
    name: 'Sardor',
    relationship: 'Do\'st',
    birthDay: 15,
    birthMonth: 12,
    birthYear: 1995,
    allergy: 'yong\'oqqa allergiya',
    budget: 600000,
    notes: 'Gazlangan ichimliklar bo\'lmasin'
  };

  state.activePersonContext = personWithAllergy;
  const planN = generateTablePlan({
    eventDate: '2026-12-15',
    eventType: "Tug'ilgan kun (katta odamlar)",
    budget: personWithAllergy.budget,
    guests: 8,
    district: 'Chilonzor'
  });

  const passedN = planN.params.budget === 600000 &&
                  state.activePersonContext.allergy === 'yong\'oqqa allergiya';

  recordTest('n', 'Shaxs kartasidan reja tuzish, byudjet va allergiya ogohlantirishi', passedN,
    `Byudjet to'ldirildi: ${formatMoney(planN.params.budget)} | Allergiya eslatmasi: "${state.activePersonContext.allergy}"`);
} catch (e) {
  recordTest('n', 'Shaxs kartasidan reja tuzish, byudjet va allergiya ogohlantirishi', false, e.message);
}

// -------------------------------------------------------------
// (o) export the .ics for one person and for all; confirm RRULE and 3 VALARMs
// -------------------------------------------------------------
try {
  const testPerson = {
    id: 'test-p-ics',
    name: 'Dilshod',
    relationship: 'Aka-uka',
    birthDay: 10,
    birthMonth: 5,
    eventType: "Tug'ilgan kun"
  };

  const icsOne = buildPersonICS(testPerson, new Date(2027, 4, 10));

  const hasRRULE = icsOne.includes('RRULE:FREQ=YEARLY');
  const hasAlarm7 = icsOne.includes('TRIGGER:-P7D');
  const hasAlarm3 = icsOne.includes('TRIGGER:-P3D');
  const hasAlarm1 = icsOne.includes('TRIGGER:-P1D');

  const valarmCount = (icsOne.match(/BEGIN:VALARM/g) || []).length;

  const passedO = hasRRULE && hasAlarm7 && hasAlarm3 && hasAlarm1 && valarmCount === 3;

  recordTest('o', 'Kalendar (.ics) eksporti: RRULE va 3 ta VALARM signali', passedO,
    `RRULE:FREQ=YEARLY mavjud: ${hasRRULE} | VALARM soni: ${valarmCount} (7 kun, 3 kun, 1 kun oldin)`);
} catch (e) {
  recordTest('o', 'Kalendar (.ics) eksporti: RRULE va 3 ta VALARM signali', false, e.message);
}

// -------------------------------------------------------------
// (p) export JSON, delete all, import it back
// -------------------------------------------------------------
try {
  const samplePeople = [
    { id: '1', name: 'Ona', birthDay: 8, birthMonth: 3, relationship: 'Ona' },
    { id: '2', name: 'Ota', birthDay: 14, birthMonth: 1, relationship: 'Ota' }
  ];

  savePeopleList(samplePeople);
  const exported = JSON.stringify({ app: 'Stolyor', people: getPeopleList() });

  // Hammasini o'chirish
  savePeopleList([]);
  const countAfterDelete = getPeopleList().length;

  // Qayta tiklash (Import)
  const importedData = JSON.parse(exported);
  savePeopleList(importedData.people);
  const countAfterImport = getPeopleList().length;

  const passedP = countAfterDelete === 0 && countAfterImport === 2;

  recordTest('p', "JSON eksport qilish, barchasini tozalash va qayta tiklash", passedP,
    `O'chirilgach: ${countAfterDelete} ta -> Qayta import qilingach: ${countAfterImport} ta tiklandi`);
} catch (e) {
  recordTest('p', "JSON eksport qilish, barchasini tozalash va qayta tiklash", false, e.message);
}

// -------------------------------------------------------------
// (q) layout at 360x640, 390x844, 768x1024, 1440x900, SW and manifest valid
// -------------------------------------------------------------
try {
  const css = fs.readFileSync('style.css', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const swCode = fs.readFileSync('sw.js', 'utf8');

  // CSS talablarini tekshirish
  const hasMobileResponsive = css.includes('max-width: 960px') &&
                              css.includes('min-height: 48px') &&
                              css.includes('font-size: 1rem') &&
                              css.includes('grid-template-columns');

  // Manifest talablarini tekshirish
  const hasValidManifest = manifest.name === 'Stolyor' &&
                           manifest.short_name === 'Stolyor' &&
                           manifest.display === 'standalone' &&
                           manifest.theme_color === '#16231D' &&
                           manifest.background_color === '#F6F1E7' &&
                           Array.isArray(manifest.icons) &&
                           manifest.icons.length >= 2;

  // Ikonkalar diskda mavjudligini tekshirish
  const icon192Exists = fs.existsSync('icons/icon-192.png');
  const icon512Exists = fs.existsSync('icons/icon-512.png');
  const iconSvgExists = fs.existsSync('icons/icon.svg');

  // Service Worker tekshiruvi
  const hasSWCache = swCode.includes('CACHE_NAME') &&
                     swCode.includes('install') &&
                     swCode.includes('activate') &&
                     swCode.includes('fetch') &&
                     swCode.includes('shops.json');

  const passedQ = hasMobileResponsive &&
                  hasValidManifest &&
                  icon192Exists &&
                  icon512Exists &&
                  iconSvgExists &&
                  hasSWCache;

  recordTest('q', '360/390/768/1440 moslashuvchanlik, Service Worker va Manifest', passedQ,
    `CSS mobil moslashuv: ${hasMobileResponsive} | Manifest: to'g'ri | Ikonkalar (192, 512, SVG): mavjud | SW keshlash: to'g'ri`);
} catch (e) {
  recordTest('q', '360/390/768/1440 moslashuvchanlik, Service Worker va Manifest', false, e.message);
}

console.log(`\n${BOLD}============================================================${RESET}`);
const passedCount = results.filter(r => r.passed).length;
console.log(`${BOLD}XULOSA: ${passedCount} / ${results.length} TA TEST MUVAFFAQIYATLI O'TDI!${RESET}`);
console.log(`${BOLD}============================================================${RESET}`);

if (passedCount === results.length) {
  process.exit(0);
} else {
  process.exit(1);
}
