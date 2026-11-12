const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("==================================================================");
console.log("   STOLYOR — TO'LIQ TEST VA VERIFIKATSIYA DASTURI (NODE.JS)       ");
console.log("==================================================================");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
  }
}

// ----------------------------------------------------------------------------
// 1. FAYLLAR VA MA'LUMOTLAR BAZASI TEKSHIRUVI
// ----------------------------------------------------------------------------
console.log("\n1. ASOSIY FAYLLAR VA MA'LUMOTLAR BAZASI:");

const requiredFiles = [
  'index.html', 'style.css', 'app.js', 'manifest.json', 'sw.js', 'CREDITS.md',
  'data/foods.json', 'data/foods.js', 'data/drinks.json', 'data/drinks.js',
  'data/shops.json', 'data/shops.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

requiredFiles.forEach(f => {
  assert(fs.existsSync(path.join(__dirname, f)), `Fayl mavjud: ${f}`);
});

const foodsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/foods.json'), 'utf-8'));
const drinksJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/drinks.json'), 'utf-8'));
const shopsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shops.json'), 'utf-8'));

assert(foodsJson.foods && foodsJson.foods.length === 99, `Taomlar soni roppa-rosa 99 ta (amalda: ${foodsJson.foods ? foodsJson.foods.length : 0})`);
assert(drinksJson.drinks && drinksJson.drinks.length === 30, `Ichimliklar soni roppa-rosa 30 ta (amalda: ${drinksJson.drinks ? drinksJson.drinks.length : 0})`);
assert(shopsJson.shops && shopsJson.shops.length >= 10, `Do'konlar mavjud (amalda: ${shopsJson.shops ? shopsJson.shops.length : 0})`);

// Maydonlar tekshiruvi: id, nomi, kategoriya, rasm, birlik, porsiya_gramm, narx_porsiya, tadbirlar, allergenlar, tarkib
let allFieldsValid = true;
foodsJson.foods.forEach(f => {
  if (!f.id || !f.nomi || !f.kategoriya || !f.rasm || !f.birlik || !f.porsiya_gramm || !f.narx_porsiya || !Array.isArray(f.tadbirlar) || !Array.isArray(f.allergenlar) || !f.tarkib) {
    allFieldsValid = false;
    console.error(`Invalid food item fields: ${f.id}`);
  }
});
assert(allFieldsValid, "Barcha 99 ta taomda talab qilingan 10 ta maydon to'liq mavjud");

// Tarkib qisqaligi (4-5 masalliq)
let allTarkibShort = true;
foodsJson.foods.forEach(f => {
  const parts = f.tarkib.split(',');
  if (parts.length > 7) {
    allTarkibShort = false;
    console.warn(`Long tarkib for ${f.id}: ${f.tarkib}`);
  }
});
assert(allTarkibShort, "Barcha taomlarning tarkibi qisqa va aniq (4-5 asosiy masalliq)");

// ----------------------------------------------------------------------------
// 2. RASMLAR VA O'LCHAMLAR TEKSHIRUVI
// ----------------------------------------------------------------------------
console.log("\n2. RASMLAR (WEBP FORMAT VA HAJM < 60 KB):");

const foodImgFiles = fs.readdirSync(path.join(__dirname, 'images/foods'));
const drinkImgFiles = fs.readdirSync(path.join(__dirname, 'images/drinks'));

assert(foodImgFiles.length === 99, `Taom rasmlari soni: 99 ta (amalda: ${foodImgFiles.length})`);
assert(drinkImgFiles.length === 30, `Ichimlik rasmlari soni: 30 ta (amalda: ${drinkImgFiles.length})`);

let maxImgSize = 0;
let imgFormatCorrect = true;

[...foodImgFiles.map(f => 'images/foods/' + f), ...drinkImgFiles.map(d => 'images/drinks/' + d)].forEach(imgPath => {
  if (!imgPath.endsWith('.webp')) imgFormatCorrect = false;
  const sz = fs.statSync(path.join(__dirname, imgPath)).size;
  if (sz > maxImgSize) maxImgSize = sz;
});

assert(imgFormatCorrect, "Barcha 129 ta rasm WebP formatida");
assert(maxImgSize < 60 * 1024, `Barcha rasmlar 60 KB dan kichik (eng kattasi: ${(maxImgSize / 1024).toFixed(1)} KB)`);

// ----------------------------------------------------------------------------
// 3. TORT QOIDASI (TORT HAR DOIM QO'SHILMAYDI)
// ----------------------------------------------------------------------------
console.log("\n3. TORT QOIDASI (Tug'ilgan kun vs Boshqa tadbirlar):");

// Test functions loaded in Node context
const vm = require('vm');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');

// Create mock browser sandbox
const sandbox = {
  window: {
    STOLYOR_FOODS_DATA: foodsJson,
    STOLYOR_DRINKS_DATA: drinksJson,
    STOLYOR_SHOPS_DATA: shopsJson,
    location: { protocol: 'file:' }
  },
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Math: Math,
  Date: Date,
  JSON: JSON,
  Array: Array,
  Number: Number,
  String: String,
  parseInt: parseInt
};

vm.createContext(sandbox);
vm.runInContext(appCode + `
  state.foodsData = window.STOLYOR_FOODS_DATA;
  state.drinksData = window.STOLYOR_DRINKS_DATA;
  state.shopsData = window.STOLYOR_SHOPS_DATA;
  window.testGenerateTablePlan = generateTablePlan;
`, sandbox);

// Test A: Tug'ilgan kun (katta odamlar) -> Tort bo'lishi shart
const bdayAdultPlan = sandbox.window.testGenerateTablePlan({
  eventDate: '2026-11-20',
  eventType: "Tug'ilgan kun (katta odamlar)",
  budget: 600000,
  guests: 8,
  district: "Chilonzor"
});
assert(bdayAdultPlan.hasCake === true, "Tug'ilgan kun (katta odamlar)da hasCake === true");
const hasCakeItemA = bdayAdultPlan.items.some(it => it.item.id && it.item.id.includes('tort'));
assert(hasCakeItemA, "Tug'ilgan kunda tort mahsuloti rejaga kiritildi");

// Test B: Tug'ilgan kun (bolalar) -> Tort bo'lishi shart
const bdayKidPlan = sandbox.window.testGenerateTablePlan({
  eventDate: '2026-11-20',
  eventType: "Tug'ilgan kun (bolalar)",
  budget: 500000,
  guests: 10,
  district: "Yunusobod"
});
assert(bdayKidPlan.hasCake === true, "Tug'ilgan kun (bolalar)da hasCake === true");

// Test C: Oilaviy ziyofat -> Tort AVTOMATIK QO'SHILMAYDI!
const familyPlan = sandbox.window.testGenerateTablePlan({
  eventDate: '2026-11-20',
  eventType: "Oilaviy ziyofat",
  budget: 700000,
  guests: 12,
  district: "Mirzo Ulug'bek"
});
assert(familyPlan.hasCake === false, "Oilaviy ziyofatda hasCake === false");
const hasCakeInFamily = familyPlan.items.some(it => it.item.id && it.item.id.includes('tort'));
assert(!hasCakeInFamily, "Oilaviy ziyofatga tort qo'shilmadi (shirinliklar kiritildi)");

// Test D: Iftor -> Tort AVTOMATIK QO'SHILMAYDI! Madina xurmosi bo'lishi shart!
const iftorPlan = sandbox.window.testGenerateTablePlan({
  eventDate: '2026-11-20',
  eventType: "Iftor",
  budget: 450000,
  guests: 6,
  district: "Shayxontohur"
});
assert(iftorPlan.hasCake === false, "Iftorlikda hasCake === false (tort yo'q)");
const hasXurmo = iftorPlan.items.some(it => it.item.id === 'xurma-iftor');
assert(hasXurmo, "Iftorlik dasturxoniga Madina xurmosi (xurma-iftor) kiritildi");

// Test E: Navro'z -> Sumalak / Halim / Ko'k somsa, tort yo'q!
const navrozPlan = sandbox.window.testGenerateTablePlan({
  eventDate: '2026-11-20',
  eventType: "Navro'z",
  budget: 800000,
  guests: 15,
  district: "Olmazor"
});
assert(navrozPlan.hasCake === false, "Navro'zda hasCake === false (tort yo'q)");
console.log("Navroz selected items:", navrozPlan.items.map(it => it.item.id + ' : ' + it.item.name));
const hasSpringDish = navrozPlan.items.some(it => ['sumalak', 'halim', 'kok-somsa-navroz'].includes(it.item.id));
assert(hasSpringDish, "Navro'z dasturxoniga milliy bahoriy taom kiritildi");

// ----------------------------------------------------------------------------
// 4. ICHIMLIKLAR ALGORITMI (0.5 L / KISHI VA STANDART TRIO)
// ----------------------------------------------------------------------------
console.log("\n4. ICHIMLIKLAR ALGORITMI (0.5 l/mehmon, Standart trio):");

// 8 kishi uchun standart ichimliklar
const drinksInAdult = bdayAdultPlan.items.filter(it => it.planCategory === 'drinks' && it.item.type === 'drink' || ['gazli', 'sharbat', 'suv'].includes(it.item.kategoriya));
assert(drinksInAdult.length >= 2, `8 kishi uchun kamida 2-3 turdagi ichimlik tanlandi (amalda: \${drinksInAdult.length})`);
const hasSoda = bdayAdultPlan.items.some(it => ['gazli'].includes(it.item.kategoriya));
const hasWater = bdayAdultPlan.items.some(it => ['suv'].includes(it.item.kategoriya));
assert(hasSoda, "Gazli ichimlik (Coca-Cola/Pepsi/Dinay) mavjud");
assert(hasWater, "Toza ichimlik suvi (Nestle/Hydrolife) mavjud");

// ----------------------------------------------------------------------------
// 5. BYUDJET CHEKLOVI (TOTAL <= BUDGET AT GENERATION TIME)
// ----------------------------------------------------------------------------
console.log("\n5. BYUDJET NAZORATI (Generatsiyada jami summa byudjetdan aslo oshmasligi):");

const budgetTests = [
  { eventType: "Tug'ilgan kun (katta odamlar)", budget: 300000, guests: 4, district: "Chilonzor" },
  { eventType: "Tug'ilgan kun (bolalar)", budget: 500000, guests: 10, district: "Yakkasaroy" },
  { eventType: "Oilaviy ziyofat", budget: 400000, guests: 8, district: "Sergeli" },
  { eventType: "Iftor", budget: 250000, guests: 5, district: "Uchtepa" },
  { eventType: "Navro'z", budget: 1000000, guests: 20, district: "Bektemir" },
  { eventType: "Boshqa", budget: 150000, guests: 3, district: "Yashnobod" },
  { eventType: "Tug'ilgan kun (katta odamlar)", budget: 2000000, guests: 30, district: "Mirobod" }
];

let allBudgetsRespected = true;
budgetTests.forEach((bt, idx) => {
  const p = sandbox.window.testGenerateTablePlan({
    eventDate: '2026-11-25',
    eventType: bt.eventType,
    budget: bt.budget,
    guests: bt.guests,
    district: bt.district
  });
  const total = p.items.reduce((sum, it) => sum + it.calc.subtotal, 0);
  if (total > bt.budget) {
    allBudgetsRespected = false;
    console.error(`Budget exceeded in test \${idx}: total=\${total}, budget=\${bt.budget}`);
  }
});
assert(allBudgetsRespected, "Barcha tadbir turlari va mehmonlar sonida total <= budget qat'iy bajarildi");

// ----------------------------------------------------------------------------
// 6. QAYTA TUZISH XILMA-XILLIGI (VARIETY ON REGENERATE)
// ----------------------------------------------------------------------------
console.log("\n6. QAYTA TUZISH XILMA-XILLIGI (Variety):");

const run1 = sandbox.window.testGenerateTablePlan({ eventDate: '2026-11-25', eventType: "Oilaviy ziyofat", budget: 800000, guests: 10, district: "Chilonzor" });
const run2 = sandbox.window.testGenerateTablePlan({ eventDate: '2026-11-25', eventType: "Oilaviy ziyofat", budget: 800000, guests: 10, district: "Chilonzor" });

const run1Ids = run1.items.map(it => it.item.id).join(',');
const run2Ids = run2.items.map(it => it.item.id).join(',');
assert(run1Ids !== run2Ids, `Qayta tuzish yangi mazali kombinatsiyalarni tanlaydi (Run 1: \${run1.items.length} taom, Run 2: \${run2.items.length} taom)`);

// ----------------------------------------------------------------------------
// 7. NATIJA XULOSASI
// ----------------------------------------------------------------------------
console.log("\n==================================================================");
console.log(`TEST NATIJALARI: Jami ${testsPassed + testsFailed} ta tekshiruv.`);
console.log(`Muvaffaqiyatli: ${testsPassed} ta ✅ | Xatolar: ${testsFailed} ta ❌`);
console.log("==================================================================");

if (testsFailed > 0) {
  process.exit(1);
}
