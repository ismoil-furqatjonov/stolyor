# Stolyor — Byudjetli bayram stoli rejalashtiruvchisi (PWA)

**Stolyor** — Toshkent shahri bo'yicha bayram, tug'ilgan kun, oilaviy ziyofat va boshqa tadbirlar uchun dasturxonni ko'rsatilgan byudjet va mehmonlar soniga mos ravishda rejalashtirib beruvchi mobil yordamchi ilova.

Loyiha toza HTML5, CSS3 va JavaScript (ES6+) asosida yaratilgan bo'lib, server (backend), ma'lumotlar bazasi yoki tashqi kutubxonalarga (frameworks, CDNs) muhtoj emas. Barcha ma'lumotlar to'liq foydalanuvchining o'z qurilmasida (brauzer LocalStorage keshida) saqlanadi.

---

## Asosiy imkoniyatlar
1. **Stol tuzish (Tab 1):**
   - Tadbir sanasini o'zbek tilida ko'rsatish (`12-dekabr, shanba`) va qolgan kunlar hisoblagichi (`Tadbirga 5 kun qoldi`).
   - Tadbir turlari: bolalar/kattalar tug'ilgan kuni, oilaviy ziyofat, iftor, navro'z, boshqa.
   - Byudjet taqsimoti: taom, tort/shirinlik, ichimlik va mevalar o'rtasida avtomatik mutanosib taqsimlash.
   - Do'konlarning ish vaqtlari tekshiruvi: real vaqt rejimida «Hozir ochiq» yoki «Hozir yopiq, ertaga soat 08:00 da ochiladi» holatini ko'rsatish.
   - Har bir mahsulotni almashtirish (swap), yangi qo'shish, olib tashlash, qulflash (lock) va orqaga qaytarish (undo).
   - Kam byudjet yoki byudjetdan oshib ketish holatlarini aniqlab, «Tejash uchun» belgili tejamkor variantlarni taklif qilish.
   - Natijani matn sifatida ulashish (WhatsApp, Telegram, SMS) va `.ics` formatida telefon kalendariga saqlash.

2. **Yaqinlarim (Tab 2):**
   - Oila a'zolari, do'stlar va hamkasblar sanalarini kiritish (kabisa yili 29-fevral to'g'ri hisobga olinadi).
   - Yaqin 30 kun ichidagi bayramlar uchun ortga hisoblash va oylar bo'yicha guruhlangan yillik taqvim.
   - Bir tugma orqali to'g'ridan-to'g'ri rejalashtirishga o'tish (allergiya va sevimli taom eslatmalari bilan).
   - Yillik takrorlanuvchi kalendar eslatmalari (`RRULE:FREQ=YEARLY` va 7, 3, 1 kun oldin `VALARM` signallari).
   - Ma'lumotlarni JSON fayl ko'rinishida zaxiralash (Eksport) va qayta tiklash (Import).

---

## 1. `data/shops.json` faylini tahrirlash va yangi do'kon qo'shish

Barcha namunaviy do'konlar va mahsulotlar `data/shops.json` faylida saqlanadi. Yangi do'kon qo'shish uchun quyidagi strukturadan foydalaning:

```json
{
  "id": "shop-13",
  "name": "Namuna oshxona 4",
  "category": "taomxona",
  "districts": ["Chilonzor", "Mirobod", "Yakkasaroy"],
  "telegram": "https://t.me/namuna_oshxona4",
  "phone": "+998901234567",
  "partner": true,
  "hours": "09:00-22:00",
  "items": [
    {
      "id": "f-20",
      "name": "Chustcha to'y oshi",
      "category": "taom",
      "unit": "porsiya",
      "price": 35000,
      "kidFriendly": true,
      "perPersonQty": 1
    }
  ]
}
```

### Parametrlar tavsifi:
- `category`: `taomxona`, `somsa`, `qandolat`, `mevafurush`, `supermarket`.
- `districts`: Do'kon joylashgan yoki yetkazib beradigan Toshkent tumanlari ro'yxati.
- `partner`: `true` bo'lsa, ro'yxatda «Hamkor» oltin nishoni chiqadi.
- `items`:
  - `category`: `taom`, `tort`, `shirinlik`, `ichimlik`, `meva`.
  - `kidFriendly`: `true` bo'lsa, bolalar tadbirlarida birinchi o'ringa qo'yiladi.
  - `homeCooked`: `true` bo'lsa, «Uyda pishiring» nishoni chiqadi.

---

## 2. Ish vaqtlarini (`hours`) sozlash

Do'konning ish vaqti `hours` maydonida `"SS:DD-SS:DD"` formatida yoziladi (24 soatlik format):
- Misol: `"08:00-22:00"` yoki `"09:30-23:00"`.
- Dastur foydalanuvchining mahalliy soati bilan solishtirib:
  - Ish vaqtida bo'lsa: **«Hozir ochiq»** (yashil nishon) chiqaradi.
  - Ish vaqtidan tashqari bo'lsa: **«Hozir yopiq, ertaga soat 08:00 da ochiladi»** (sariq nishon) deb ko'rsatadi.
- Agar do'konning ish vaqti noma'lum bo'lsa, `hours: null` deb qoldiring. Dastur taxminiy taxmin qilmaydi va hech narsa ko'rsatmaydi.

---

## 3. Byudjet taqsimoti foizlarini o'zgartirish

Byudjet taqsimoti qoidalari `app.js` faylining eng yuqori qismidagi `CONFIG.budgetSplits` obyektida belgilangan:

```javascript
const CONFIG = {
  budgetSplits: {
    "Tug'ilgan kun (katta odamlar)": { food: 50, cake: 30, drinks: 20, cakeType: "cake" },
    "Oilaviy ziyofat": { food: 50, cake: 30, drinks: 20, cakeType: "cake" },
    "Tug'ilgan kun (bolalar)": { food: 35, cake: 40, drinks: 25, cakeType: "cake" },
    "Iftor": { food: 55, cake: 25, drinks: 20, cakeType: "sweets" },
    "Navro'z": { food: 55, cake: 25, drinks: 20, cakeType: "sweets" },
    "Boshqa": { food: 50, cake: 25, drinks: 25, cakeType: "sweets" }
  },
  // Mehmon boshiga me'yorlar:
  perGuest: {
    cakeGrams: 150,     // 1 kishi uchun 150 g tort
    drinkLiters: 0.4,   // 0.4 litr ichimlik
    fruitGrams: 200,    // 200 g meva
    somsaCount: 2       // 2 dona somsa
  }
};
```
*Eslatma: Har bir tadbir turi uchun `food + cake + drinks` yig'indisi 100% bo'lishi kerak.*

---

## 4. GitHub Pages ga joylashtirish (Qadamma-qadam)

Loyiha to'liq nisbiy yo'llar (`./`) bilan tuzilgan, shuning uchun GitHub Pages da har qanday subfolder (masalan: `username.github.io/stolyor/`) ichida muammosiz ishlaydi.

1. GitHub da yangi ombor (repository) oching: masalan `stolyor`.
2. Loyiha fayllarini yuklang:
   ```bash
   git init
   git add .
   git commit -m "Ilk versiya: Stolyor PWA"
   git branch -M main
   git remote add origin https://github.com/USERNAME/stolyor.git
   git push -u origin main
   ```
3. GitHub omboringiz sozlamalariga kiring: **Settings** > **Pages**.
4. **Build and deployment** bo'limida:
   - Source: `Deploy from a branch`
   - Branch: `main` / `root`
   - **Save** tugmasini bosing.
5. 1-2 daqiqada saytingiz `https://USERNAME.github.io/stolyor/` manzilida ishga tushadi.

---

## 5. Fayllar o'zgarganda Service Worker kesh versiyasini yangilash

Foydalanuvchilar brauzerida saytning yangilangan versiyasi (yangi CSS, JS yoki `shops.json`) darhol ko'rinishi uchun `sw.js` faylidagi kesh nomini oshiring:

```javascript
// sw.js faylining 3-qatori:
const CACHE_NAME = 'stolyor-v2'; // 'stolyor-v1' o'rniga 'stolyor-v2', 'stolyor-v3' va hokazo
```

Kesh nomi o'zgarganda Service Worker avtomatik tarzda eski keshni tozalaydi va yangi fayllarni yuklaydi.
`data/shops.json` fayli uchun esa **Network-First** strategiyasi qo'llangan bo'lib, foydalanuvchida internet aloqasi bo'lganda yangi narxlar darhol yangilanadi.

