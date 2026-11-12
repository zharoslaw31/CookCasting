#!/usr/bin/env node
/**
 * Збирає базу рецептів CookCasting.
 *
 * 1. Завантажує всі рецепти TheMealDB (безкоштовний API, кухні всього світу).
 * 2. Перекладає українською: назви, інгредієнти, міри, кроки приготування, теги.
 *    Кухні, категорії й найчастіші інгредієнти перекладені вручну (scripts/glossary.mjs),
 *    решта — машинним перекладом із ручними виправленнями.
 * 3. Записує src/data/recipes.json, який вбудовується в додаток (працює офлайн, без ключів).
 *
 * Пам'ять перекладів (scripts/translations.json) зберігається в репозиторії,
 * тож повторний запуск перекладає лише нові рецепти.
 *
 *   node scripts/build-recipes.mjs                # уся база TheMealDB
 *   node scripts/build-recipes.mjs --input f.json # рецепти з файлу (формат TheMealDB)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, CATEGORIES, INGREDIENTS, TAGS, fixText } from './glossary.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/recipes.json');
const TM_FILE = join(ROOT, 'scripts/translations.json');
const API = 'https://www.themealdb.com/api/json/v1/1';

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

/* ───────────── мережа ───────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'CookCasting data builder' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries - 1) throw new Error(`${url}: ${e.message}`);
      await sleep(1000 * 2 ** i);
    }
  }
}

async function fetchAllMeals() {
  const byId = new Map();
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  for (const l of letters) {
    const d = await getJson(`${API}/search.php?f=${l}`);
    (d.meals ?? []).forEach((m) => byId.set(m.idMeal, m));
    process.stdout.write(`\rTheMealDB: ${byId.size} рецептів (літера ${l})   `);
    await sleep(150);
  }
  // Деякі рецепти не знаходяться пошуком за літерою (назва з цифри/лапок) — добираємо через категорії.
  try {
    const cats = await getJson(`${API}/list.php?c=list`);
    for (const { strCategory } of cats.meals ?? []) {
      const d = await getJson(`${API}/filter.php?c=${encodeURIComponent(strCategory)}`);
      for (const m of d.meals ?? []) {
        if (byId.has(m.idMeal)) continue;
        const full = await getJson(`${API}/lookup.php?i=${m.idMeal}`);
        if (full.meals?.[0]) byId.set(m.idMeal, full.meals[0]);
        await sleep(120);
      }
    }
  } catch (e) {
    console.warn('\nНе вдалося дібрати рецепти за категоріями:', e.message);
  }
  process.stdout.write('\n');
  return [...byId.values()];
}

/* ───────────── переклад ───────────── */

const tm = existsSync(TM_FILE) ? JSON.parse(readFileSync(TM_FILE, 'utf8')) : {};
let tmDirty = 0;
const SEP = '\n¶¶\n';
const MAX_CHARS = 3800;

async function gtx(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=uk&dt=t';
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'q=' + encodeURIComponent(text),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return (d[0] ?? []).map((s) => s[0] ?? '').join('');
    } catch (e) {
      if (i >= 6) throw new Error(`переклад: ${e.message}`);
      await sleep(1500 * 2 ** i);
    }
  }
}

/** Перекладає масив рядків з пам'яттю перекладів і пакетами по ~4 тис. символів. */
async function translateAll(texts, label) {
  const todo = [...new Set(texts.filter((t) => t && !(t in tm)))];
  let done = 0;
  const batches = [];
  let cur = [];
  let len = 0;
  for (const t of todo) {
    if (cur.length && len + t.length + SEP.length > MAX_CHARS) {
      batches.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(t);
    len += t.length + SEP.length;
  }
  if (cur.length) batches.push(cur);

  const runBatch = async (batch) => {
    let parts = null;
    if (batch.length > 1) {
      const out = await gtx(batch.join(SEP));
      parts = out.split(/\s*¶\s*¶\s*/);
      if (parts.length !== batch.length) parts = null;
    }
    if (!parts) parts = await Promise.all(batch.map((t) => gtx(t)));
    batch.forEach((t, i) => {
      tm[t] = parts[i].trim();
      tmDirty++;
    });
    done += batch.length;
    process.stdout.write(`\r${label}: ${done}/${todo.length}   `);
  };

  // по 3 запити паралельно, щоб не впертися в обмеження
  for (let i = 0; i < batches.length; i += 3) {
    await Promise.all(batches.slice(i, i + 3).map(runBatch));
    if (tmDirty > 200) saveTm();
    await sleep(300);
  }
  if (todo.length) process.stdout.write('\n');
  return (t) => (t ? fixText(tm[t] ?? t) : '');
}

function saveTm() {
  const sorted = Object.fromEntries(Object.entries(tm).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(TM_FILE, JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"') + '\n');
  tmDirty = 0;
}

/* ───────────── обробка рецепту ───────────── */

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const capFirst = (s) => (s ? s[0].toLocaleUpperCase('uk') + s.slice(1) : s);

/** «200C/180C Fan/Gas 6» → «200°C», «375 degrees F» → «190°C». */
function normalizeTemps(t) {
  const fToC = (f) => Math.round(((f - 32) * 5) / 9 / 5) * 5;
  t = t.replace(/(\d{3})\s*(?:°|º|degrees?|deg\.?)?\s*F(?:ahrenheit)?\b/g, (_, f) => `${fToC(+f)}°C`);
  t = t.replace(/(\d{2,3})\s*(?:°|º|degrees?)?\s*C(?:elsius)?\b(?:\s*\/\s*\d{2,3}\s*(?:°|º)?\s*C?\s*(?:fan(?:\s*forced)?)?)?(?:\s*(?:\/|,|or)?\s*gas(?:\s*mark)?\s*\d+)?/gi, '$1°C');
  t = t.replace(/\(?\s*gas(?:\s*mark)?\s*\d+\s*\)?/gi, '');
  t = t.replace(/(\d{3})°C\s*\(\s*\d{3}°C\s*\)/g, '$1°C');
  return t;
}

/** Розбиває текст інструкції на кроки. */
function splitSteps(text) {
  let t = normalizeTemps(clean(text).replace(/\r/g, ''));
  // «STEP 1», «Step 2:», «1.», «1)» на початку рядка — лише позначки
  let lines = t
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(step\s*\d+[:.)-]?|\d{1,2}\s*[.):-]|[-•▢*])\s*/i, '').trim())
    .filter((l) => l && !/^(step\s*\d+|method|instructions|directions)[:.]?$/i.test(l));
  // один довгий абзац — ділимо на кроки по 2 речення
  const out = [];
  for (const l of lines) {
    if (l.length < 420) {
      out.push(l);
      continue;
    }
    const sentences = l.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [l];
    let buf = '';
    for (const s of sentences) {
      if (buf && (buf + s).length > 300) {
        out.push(buf.trim());
        buf = '';
      }
      buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  // дуже короткі кроки зливаємо з попереднім
  const merged = [];
  for (const s of out) {
    if (merged.length && (s.length < 25 || merged[merged.length - 1].length < 25)) merged[merged.length - 1] += ' ' + s;
    else merged.push(s);
  }
  return merged.map(capFirst);
}

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const numOf = (s) => {
  s = s.trim();
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  const mixed = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/);
  if (mixed) return +mixed[1] + FRACTIONS[mixed[2]];
  const frac = s.match(/^(\d+)\s+(\d+)\/(\d+)$/) ?? s.match(/^()(\d+)\/(\d+)$/);
  if (frac) return (+frac[1] || 0) + +frac[2] / +frac[3];
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n) => {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10).replace('.', ',');
};
const NUM = '(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[½¼¾⅓⅔⅛]|[½¼¾⅓⅔⅛]|\\d+(?:[.,]\\d+)?)';

/** Перетворює англійські міри на звичні українські (унції → грами тощо). */
function convertMeasure(m) {
  let s = clean(m);
  if (!s) return '';
  // імперські одиниці → метричні
  const conv = [
    [/(?:fl\.?\s*oz|fl)\b/i, 29.6, 'мл'],
    [/(?:oz|ounces?)\b/i, 28.35, 'г'],
    [/(?:lbs?|pounds?)\b/i, 453.6, 'г'],
    [/(?:pints?)\b/i, 568, 'мл'],
    [/(?:quarts?)\b/i, 946, 'мл'],
  ];
  for (const [re, k, unit] of conv) {
    const r = new RegExp(`${NUM}\\s*-?\\s*${re.source}`, 'i');
    s = s.replace(r, (_, n) => {
      const v = numOf(n);
      if (v === null) return _;
      const g = v * k;
      return g >= 1000 ? `${fmt(g / 1000)} ${unit === 'г' ? 'кг' : 'л'}` : `${fmt(g)} ${unit}`;
    });
  }
  s = s
    .replace(/\b(?:grated\s+)?zest\s+(?:of\s+)?(\d+)\b/gi, 'цедра з $1 шт.')
    .replace(/\bjuice\s+(?:of\s+)?(\d+(?:\/\d+)?)\b/gi, 'сік з $1 шт.')
    .replace(/\b(\d+)\s+juice(?:d)?\b/gi, 'сік з $1 шт.')
    .replace(/\b(?:dusting|sprinkling|sprinkle|topping|to top|top)\b/gi, 'для посипання')
    .replace(/\b(?:as required|as needed|as necessary|optional)\b/gi, 'за потреби')
    .replace(/\b(?:knob)\b/gi, 'шматочок')
    .replace(/\b(?:glug|drizzle|splash|spinkling|spinkle|drop)\b/gi, 'трохи')
    .replace(/\bbottle\b/gi, 'пляшка');
  const units = [
    [/\b(?:tbsp|tbs|tblsp|tblspn|tablespoons?|tbls)\b\.?/gi, 'ст. л.'],
    [/\b(?:tsp|tspn|teaspoons?)\b\.?/gi, 'ч. л.'],
    [/\bcups?\b/gi, 'скл.'],
    [/\b(?:grams?|gr|g)\b\.?/gi, 'г'],
    [/\b(?:kilograms?|kg)\b/gi, 'кг'],
    [/\b(?:millilitres?|milliliters?|ml)\b/gi, 'мл'],
    [/\b(?:litres?|liters?|l)\b(?!\w)/gi, 'л'],
    [/\b(?:cm)\b/gi, 'см'],
    [/\bpinch(?:es)?\b/gi, 'щіпка'],
    [/\bdash(?:es)?\b/gi, 'кілька крапель'],
    [/\bhandfuls?\b/gi, 'жменя'],
    [/\bcloves?\b/gi, 'зубч.'],
    [/\bslices?\b/gi, 'скибок'],
    [/\bsprigs?\b/gi, 'гілочок'],
    [/\bbunch(?:es)?\b/gi, 'пучок'],
    [/\b(?:cans?|tins?)\b/gi, 'банка'],
    [/\bpackets?|packs?|packages?\b/gi, 'пачка'],
    [/\bleaves\b/gi, 'листки'],
    [/\bsticks?\b/gi, 'паличка'],
    [/\bto taste\b/gi, 'за смаком'],
    [/\bto serve\b/gi, 'для подачі'],
    [/\bto garnish|for garnish|garnish\b/gi, 'для прикраси'],
    [/\bfor frying\b/gi, 'для смаження'],
    [/\bdrizzle\b/gi, 'трохи'],
    [/\bsplash\b/gi, 'трохи'],
    [/\bsmall\b/gi, 'маленький'],
    [/\bmedium\b/gi, 'середній'],
    [/\blarge\b/gi, 'великий'],
    [/\bchopped\b/gi, 'подрібнений'],
    [/\bfinely chopped\b/gi, 'дрібно нарізаний'],
    [/\bsliced\b/gi, 'нарізаний'],
    [/\bdiced\b/gi, 'кубиками'],
    [/\bgrated\b/gi, 'тертий'],
    [/\bminced\b/gi, 'подрібнений'],
    [/\bcrushed\b/gi, 'подавлений'],
    [/\bbeaten\b/gi, 'збитий'],
    [/\bmelted\b/gi, 'розтоплений'],
    [/\bsoftened\b/gi, 'м’який'],
    [/\bground\b/gi, 'мелений'],
    [/\bfresh\b/gi, 'свіжий'],
    [/\bwhole\b/gi, 'цілий'],
    [/\bheaped\b/gi, 'з гіркою'],
    [/\blevel\b/gi, 'без гірки'],
    [/\bof\b/gi, ''],
    [/\band\b/gi, 'і'],
    [/\bor\b/gi, 'або'],
    [/\bto\b/gi, '–'],
  ];
  for (const [re, uk] of units) s = s.replace(new RegExp(re.source.replace(/^\\b/, '(?<![A-Za-z])'), re.flags), uk);
  // «175 г/170 г» (метричне й перераховане імперське) — лишаємо перше
  s = s.replace(/(\d)\s*(г|кг|мл|л|см|ст\. л\.|ч\. л\.)(?![\p{L}])/gu, '$1 $2');
  s = s.replace(/^([\d.,\/ ]+\s(?:г|кг|мл|л))\s*\/\s*[\d.,\/ ]+\s(?:г|кг|мл|л)(?![\p{L}])/u, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);

/* Ознаки для фільтрів «без …» — за англійськими назвами інгредієнтів */
const FLAG_RULES = {
  meat: /\b(beef|steak|mince|chicken|turkey|duck|lamb|mutton|goat|pork|bacon|ham|sausage|chorizo|salami|pancetta|prosciutto|veal|venison|rabbit|liver|kidney|oxtail|brisket|gammon|pepperoni|meat|goose|pheasant|chop|lard|suet|gelatine|stock cube|chicken stock|beef stock)\b/i,
  pork: /\b(pork|bacon|ham|gammon|chorizo|salami|pancetta|prosciutto|lard|pepperoni|sausage)\b/i,
  fish: /\b(fish|salmon|tuna|cod|haddock|mackerel|sardine|anchov|prawn|shrimp|crab|lobster|mussel|clam|oyster|squid|octopus|scallop|herring|trout|bass|monkfish|tilapia|seafood|kipper|fish sauce)\w*/i,
  dairy: /\b(milk|butter|cream|cheese|yogurt|yoghurt|cheddar|parmesan|mozzarella|ricotta|mascarpone|feta|ghee|creme|crème|buttermilk|paneer|brie|gruyere|gruyère|halloumi|custard|condensed)\b/i,
  egg: /\beggs?\b|\begg (yolk|white)s?\b|\bmayonnaise\b/i,
  gluten: /\b(flour|bread|pasta|spaghetti|noodle|breadcrumbs|couscous|bulgur|barley|rye|tortilla|pastry|biscuit|cracker|digestive|semolina|lasagne|macaroni|penne|tagliatelle|fettuccine|linguine|rigatoni|farfalle|orzo|pitta|pita|naan|baguette|brioche|wheat|soy sauce|beer|sponge)\w*/i,
  nuts: /\b(almond|walnut|pecan|hazelnut|cashew|pistachio|peanut|macadamia|pine nut|chestnut|nut)\w*/i,
  alcohol: /\b(wine|beer|brandy|rum|vodka|whisky|whiskey|sherry|port|cognac|liqueur|cider|sake|mirin|marsala|bourbon|gin|tequila|stout|ale|kirsch|amaretto|calvados)\b/i,
  spicy: /\b(chilli|chili|jalapeno|jalapeño|cayenne|harissa|sriracha|scotch bonnet|hot sauce|chipotle|gochujang|tabasco|szechuan|sichuan|red pepper flakes|piri)\w*/i,
};

/* ───────────── головне ───────────── */

async function main() {
  const input = argVal('--input');
  let meals;
  if (input) {
    const raw = JSON.parse(readFileSync(input, 'utf8'));
    meals = Array.isArray(raw) ? raw : raw.meals;
  } else {
    meals = await fetchAllMeals();
  }
  if (!meals?.length) throw new Error('Немає рецептів');
  meals.sort((a, b) => +a.idMeal - +b.idMeal);
  console.log(`Рецептів: ${meals.length}`);

  // сирі дані без перекладу
  const parsed = meals.map((m) => {
    const ingr = [];
    for (let i = 1; i <= 20; i++) {
      const n = clean(m[`strIngredient${i}`]);
      if (!n) continue;
      ingr.push({ en: n, m: clean(m[`strMeasure${i}`]) });
    }
    return {
      id: +m.idMeal,
      nameEn: clean(m.strMeal),
      cat: clean(m.strCategory) || 'Miscellaneous',
      area: clean(m.strArea) || 'Unknown',
      img: clean(m.strMealThumb),
      video: (clean(m.strYoutube).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) ?? [])[1] ?? null,
      tags: clean(m.strTags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      src: clean(m.strSource) || null,
      steps: splitSteps(m.strInstructions),
      ingr,
    };
  });

  // що перекласти
  const ingKey = (en) => en.toLowerCase();
  // назви з великої літери перекладаються в називному відмінку («Нежирний фарш», а не «нежирного фаршу»)
  const ingNames = [...new Set(parsed.flatMap((r) => r.ingr.map((i) => i.en)).filter((n) => !INGREDIENTS[ingKey(n)]).map(titleCase))];
  const measures = [...new Set(parsed.flatMap((r) => r.ingr.map((i) => convertMeasure(i.m))))].filter((s) => /[a-z]{2,}/i.test(s));
  const tags = [...new Set(parsed.flatMap((r) => r.tags))].filter((t) => !TAGS[t.toLowerCase()]);
  const areas = [...new Set(parsed.map((r) => r.area))].filter((a) => !AREAS[a]);
  const cats = [...new Set(parsed.map((r) => r.cat))].filter((c) => !CATEGORIES[c]);

  const tName = await translateAll(parsed.map((r) => r.nameEn), 'Назви');
  const tIng = await translateAll(ingNames, 'Інгредієнти');
  const tMeasure = await translateAll(measures, 'Міри');
  const tTag = await translateAll(tags, 'Теги');
  const tArea = await translateAll(areas.map((a) => `${a} cuisine`), 'Кухні');
  const tCat = await translateAll(cats, 'Категорії');
  const tStep = await translateAll(parsed.flatMap((r) => r.steps), 'Кроки');
  saveTm();

  const ingUk = (en) => INGREDIENTS[ingKey(en)] ?? capFirst(tIng(titleCase(en)));
  const measureUk = (m) => {
    const c = convertMeasure(m);
    return /[a-z]{2,}/i.test(c) ? tMeasure(c) : c;
  };

  const recipes = parsed.map((r) => {
    const enAll = r.ingr.map((i) => i.en).join(' | ');
    const flags = Object.entries(FLAG_RULES)
      .filter(([, re]) => re.test(enAll))
      .map(([k]) => k);
    if (/vegetarian|vegan/i.test(r.cat)) {
      ['meat', 'pork', 'fish'].forEach((f) => flags.includes(f) && flags.splice(flags.indexOf(f), 1));
    }
    const minutes = estimateMinutes(r);
    return {
      id: r.id,
      name: capFirst(fixText(tName(r.nameEn))),
      nameEn: r.nameEn,
      cat: r.cat,
      area: r.area,
      img: r.img,
      video: r.video,
      tags: r.tags.map((t) => TAGS[t.toLowerCase()] ?? capFirst(tTag(t))),
      src: r.src,
      time: minutes,
      flags,
      ingr: r.ingr.map((i) => ({ n: ingUk(i.en), en: i.en, m: measureUk(i.m) })),
      steps: r.steps.map((s) => capFirst(tStep(s))),
    };
  });

  const usedAreas = [...new Set(recipes.map((r) => r.area))];
  const usedCats = [...new Set(recipes.map((r) => r.cat))];
  const data = {
    v: 1,
    source: 'TheMealDB',
    builtAt: new Date().toISOString().slice(0, 10),
    hash: hash(recipes.map((r) => r.id)),
    areas: usedAreas
      .map((a) => ({ id: a, ...(AREAS[a] ?? { uk: capFirst(tArea(`${a} cuisine`)), flag: '🌍' }), count: recipes.filter((r) => r.area === a).length }))
      .sort((x, y) => y.count - x.count),
    cats: usedCats
      .map((c) => ({ id: c, ...(CATEGORIES[c] ?? { uk: capFirst(tCat(c)), emoji: '🍽️' }), count: recipes.filter((r) => r.cat === c).length }))
      .sort((x, y) => y.count - x.count),
    recipes,
  };
  writeFileSync(OUT, JSON.stringify(data));
  const left = recipes.flatMap((r) => [r.name, ...r.ingr.map((i) => i.n + ' ' + i.m)]).filter((s) => /[a-z]{4,}/i.test(s));
  console.log(`Готово: ${recipes.length} рецептів, ${data.areas.length} кухонь → ${OUT}`);
  if (left.length) console.log(`Залишились англійські слова (${left.length}), напр.:`, left.slice(0, 15));
}

/** Приблизний час: сума згаданих у кроках хвилин/годин, з урахуванням складності. */
function estimateMinutes(r) {
  const text = r.steps.join(' ');
  let total = 0;
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?))?\s*(minutes?|mins?|hours?|hrs?)\b/gi)) {
    const v = parseFloat((m[2] ?? m[1]).replace(',', '.'));
    total += /^h/i.test(m[3]) ? v * 60 : v;
  }
  if (/overnight/i.test(text)) total += 8 * 60;
  const prep = 5 + r.ingr.length * 1.5;
  const est = Math.max(total, 0) + prep;
  const round = est < 60 ? Math.ceil(est / 5) * 5 : Math.ceil(est / 15) * 15;
  return Math.min(Math.max(round, 10), 24 * 60);
}

main().catch((e) => {
  saveTm();
  console.error('\nПомилка:', e.message);
  process.exit(1);
});
