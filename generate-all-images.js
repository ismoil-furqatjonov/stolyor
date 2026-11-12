const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const foodsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/foods.json'), 'utf-8')).foods;
const drinksData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/drinks.json'), 'utf-8')).drinks;

// Ensure directories exist
const foodsDir = path.join(__dirname, 'images/foods');
const drinksDir = path.join(__dirname, 'images/drinks');
fs.mkdirSync(foodsDir, { recursive: true });
fs.mkdirSync(drinksDir, { recursive: true });

// Emoji mappings
const foodEmojiMap = {
  shorva: '🍲',
  palov: '🍚',
  ikkinchi: '🥘',
  kabob: '🍢',
  xamiri: '🥟',
  salat: '🥗',
  shirinlik: '🍬',
  meva: '🍇',
  mavsumiy: '🌱'
};

const specificFoodEmoji = {
  'mastava': '🍲', 'shorva': '🥣', 'moshxorda': '🍲', 'lagmon-shorvali': '🍜', 'chuchvara-shorva': '🥟',
  'mampar': '🍲', 'naryn-shorva': '🍜', 'shavla': '🍚', 'dovdirak': '🍲', 'moshkichiri': '🍚',
  'palov-toshkent': '🍚', 'palov-samarqand': '🍚', 'palov-fargona': '🍚', 'palov-xorazm': '🍚',
  'palov-buxoro': '🍚', 'palov-bayram': '🍚', 'palov-oq': '🍚', 'palov-sabzi': '🍚',
  'dimlama': '🥘', 'qozon-kabob': '🍖', 'qovurdoq': '🥩', 'beshbarmoq-norin': '🍜', 'dolma': '🥬',
  'jizz': '🥩', 'tandir-gosht': '🍖', 'qovurma-lagmon': '🍝', 'jigar-kabob': '🍢', 'hasip': '🌭',
  'shashlik-qoy': '🍢', 'shashlik-mol': '🍢', 'shashlik-tovuq': '🍢', 'lyulya-kabob': '🍢',
  'qiyma-kabob': '🍢', 'jigar-charvi': '🍢', 'dumba-kabob': '🍢', 'tandir-kabob': '🍖',
  'somsa-tandir': '🥟', 'somsa-qatlama': '🥟', 'somsa-kok': '🥟', 'somsa-kartoshka': '🥟',
  'somsa-qovoq': '🥟', 'manti': '🥟', 'chuchvara-qovurilgan': '🥟', 'xonim': '🥟', 'gumma': '🥟',
  'patir-non': '🍞', 'obi-non': '🫓', 'lochira': '🫓', 'qatlama': '🫓', 'bogirsoq': '🧆',
  'kulcha-non': '🫓', 'chebureki': '🥟',
  'achichuk': '🥗', 'toshkent-salat': '🥗', 'bodring-pomidor': '🥗', 'koreyscha-sabzi': '🥕',
  'baqlajon-salat': '🍆', 'olivye': '🥗', 'mimoza': '🥗', 'selyodka-shuba': '🐟', 'kok-salat': '🥬',
  'qatiqli-salat': '🥒',
  'halva-milliy': '🥮', 'navvot': '🍬', 'parvarda': '🍬', 'pashmak': '🧁', 'chak-chak': '🍯',
  'baklava': '🥐', 'nishalda': '🍥', 'kishmish': '🍇', 'yongoq': '🥜', 'bodom': '🥜',
  'pista': '🥜', 'mayiz': '🍇', 'turshak-orik': '🍑', 'anjir-qurutilgan': '🫒', 'napoleon-tort': '🍰',
  'medovik-tort': '🍰', 'pirojniy-assorti': '🧁', 'eklerlar': '🥖', 'vafli': '🧇', 'bayram-torti': '🎂',
  'qovun': '🍈', 'tarvuz': '🍉', 'uzum': '🍇', 'anor': '🫐', 'olma': '🍎',
  'nok': '🍐', 'shaftoli': '🍑', 'orik': '🍑', 'banan': '🍌', 'mandarin': '🍊', 'apelsin': '🍊',
  'sumalak': '🌱', 'halim': '🍲', 'kok-somsa-mavsumiy': '🥟', 'xurmo-iftor': '🌴',
  'mastava-iftor': '🍲', 'patir-iftor': '🍞'
};

const drinkEmojiMap = {
  'gazli': '🥤',
  'sharbat': '🧃',
  'suv': '💧',
  'energetik': '⚡',
  'choy': '🧋',
  'sut': '🥛',
  'kompot': '🍷',
  'qahva': '☕'
};

const specificDrinkEmoji = {
  'coca-cola-15': '🥤', 'pepsi-15': '🥤', 'fanta-15': '🍊', 'sprite-15': '🍋',
  'dinay-15': '🥤', 'mirinda-15': '🍊', 'rc-cola-15': '🥤',
  'rich-apelsin': '🍊', 'rich-olma': '🍏', 'sandora-gilos': '🍒', 'dobry-multimeva': '🧃',
  'bliss-shaftoli': '🍑', 'dena-anor': '🫐', 'natural-juice-olma': '🍎',
  'chortoq-mineral': '💧', 'nestle-suv-15': '💧', 'montella-suv-15': '💧',
  'borjomi-gazli': '🍾', 'tashkent-suv-15': '💧',
  'flash-up': '⚡', 'red-bull': '⚡', 'energetik-13': '⚡',
  'fuse-tea-limon': '🍋', 'lipton-shaftoli': '🍑',
  'ayron-bio-1l': '🥛', 'qatiq-1l': '🥣', 'sut-pasterizatsiyalangan': '🥛', 'kefir-1l': '🥛',
  'uy-kompoti-olcha': '🍒', 'mors-brusnika': '🫐',
  'kok-choy-95': '🍵', 'qora-choy-premium': '🫖', 'qahva-dasturxon': '☕'
};

// Gradient color maps
const categoryColors = {
  shorva: ['#9a3412', '#431407'],
  palov: ['#d97706', '#78350f'],
  ikkinchi: ['#b45309', '#451a03'],
  kabob: ['#be123c', '#4c0519'],
  xamiri: ['#d97706', '#713f12'],
  salat: ['#15803d', '#064e3b'],
  shirinlik: ['#db2777', '#831843'],
  meva: ['#ea580c', '#7e22ce'],
  mavsumiy: ['#059669', '#064e3b'],
  gazli: ['#dc2626', '#7f1d1d'],
  sharbat: ['#ea580c', '#9a3412'],
  suv: ['#0284c7', '#0369a1'],
  energetik: ['#0f766e', '#111827'],
  choy: ['#65a30d', '#365314'],
  sut: ['#0284c7', '#1e3a8a'],
  kompot: ['#a21caf', '#581c87'],
  qahva: ['#78350f', '#291206']
};

// Build items collection for HTML generator
const allItems = [];

foodsData.forEach(f => {
  allItems.push({
    type: 'food',
    id: f.id,
    name: f.nomi,
    category: f.kategoriya,
    subtitle: `${f.porsiya_gramm} g · ${f.birlik}`,
    badge: "O'ZBEK MILLIY TAOMI",
    emoji: specificFoodEmoji[f.id] || foodEmojiMap[f.kategoriya] || '🍽️',
    colors: categoryColors[f.kategoriya] || ['#292524', '#0c0a09'],
    outPath: path.join(foodsDir, `${f.id}.webp`)
  });
});

drinksData.forEach(d => {
  allItems.push({
    type: 'drink',
    id: d.id,
    name: d.nomi,
    category: d.kategoriya,
    subtitle: `${d.hajm} · Supermarket`,
    badge: "ICHIMLIK",
    emoji: specificDrinkEmoji[d.id] || drinkEmojiMap[d.kategoriya] || '🥤',
    colors: categoryColors[d.kategoriya] || ['#0369a1', '#082f49'],
    outPath: path.join(drinksDir, `${d.id}.webp`)
  });
});

console.log(`Total items to render: ${allItems.length}`);

// We can render items in batches of 30 into a helper HTML, then capture base64
const batchSize = 35;
const batches = [];
for (let i = 0; i < allItems.length; i += batchSize) {
  batches.push(allItems.slice(i, i + batchSize));
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let totalGenerated = 0;

batches.forEach((batch, batchIdx) => {
  const htmlPath = path.join(__dirname, `temp_batch_${batchIdx}.html`);
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <div id="results"></div>
  <script>
    const items = ${JSON.stringify(batch)};
    const results = {};

    items.forEach(item => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 250;
      const ctx = c.getContext("2d");

      // 1. Radial/Linear gradient fon
      const grad = ctx.createLinearGradient(0, 0, 400, 250);
      grad.addColorStop(0, item.colors[0]);
      grad.addColorStop(1, item.colors[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 250);

      // 2. Dekorativ to'r / burchak bezaklari
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 20; x < 400; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 250);
        ctx.stroke();
      }

      // 3. Markaziy tarelka / pishirish taxtasi
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;

      ctx.fillStyle = "#fffdf7";
      ctx.beginPath();
      ctx.arc(200, 115, 68, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ichki halqa
      ctx.strokeStyle = "rgba(180, 140, 90, 0.25)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(200, 115, 62, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Katta emoji / rasm
      ctx.font = "62px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.emoji, 200, 115);

      // 5. Yuqori badge
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.roundRect(100, 12, 200, 22, 11);
      ctx.fill();

      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.letterSpacing = "1px";
      ctx.fillText(item.badge, 200, 24);

      // 6. Pastki nom kartochkasi
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.beginPath();
      ctx.roundRect(16, 185, 368, 52, 10);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.name, 200, 206);

      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(item.subtitle, 200, 226);

      results[item.id] = c.toDataURL("image/webp", 0.82);
    });

    const out = document.getElementById("results");
    out.textContent = JSON.stringify(results);
  </script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  try {
    const stdout = execSync(`"${chromePath}" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`, {
      encoding: 'utf-8',
      maxBuffer: 40 * 1024 * 1024
    });

    const match = stdout.match(/<div id="results">([\s\S]*?)<\/div>/);
    if (match) {
      const data = JSON.parse(match[1]);
      batch.forEach(item => {
        const base64Str = data[item.id];
        if (base64Str) {
          const base64Data = base64Str.replace(/^data:image\/webp;base64,/, '');
          const buf = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(item.outPath, buf);
          totalGenerated++;
        }
      });
      console.log(`Batch ${batchIdx + 1}/${batches.length} done (${batch.length} images)`);
    } else {
      console.error(`Batch ${batchIdx + 1} did not return results.`);
    }
  } catch (err) {
    console.error(`Batch ${batchIdx + 1} failed:`, err.message);
  } finally {
    if (fs.existsSync(htmlPath)) {
      fs.unlinkSync(htmlPath);
    }
  }
});

console.log(`\nCOMPLETED: Generated ${totalGenerated} WebP images.`);

