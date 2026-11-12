import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXTRA, SPOON_OFFSET } from './recipes';
import { capFirst, titleCase, translateMany } from './translate';
import { Filters, Flag, Recipe } from './types';

/**
 * Світова база рецептів Spoonacular (понад 300 тис. рецептів з фото).
 * Потрібен безкоштовний ключ: у Профілі або секретом SPOONACULAR_API_KEY під час збирання сайту.
 * Нові рецепти перекладаються українською на пристрої й зберігаються локально.
 */

export const ENV_SPOON_KEY = process.env.EXPO_PUBLIC_SPOONACULAR_KEY ?? '';
const API = 'https://api.spoonacular.com';
const STORE_KEY = 'cookcasting/world/v1';
const KEEP_UNSAVED = 250;

/* ───────── локальне сховище перекладених рецептів ───────── */

let order: number[] = []; // від найновішого

export async function loadWorld() {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as Recipe[];
    list.forEach((r) => EXTRA.set(r.id, r));
    order = list.map((r) => r.id);
  } catch {}
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** keep — id рецептів у бібліотеці: їх не видаляємо ніколи. */
export function saveWorld(keep: Set<number>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    let unsaved = 0;
    const ids = order.filter((id) => {
      if (!EXTRA.has(id)) return false;
      if (keep.has(id)) return true;
      return ++unsaved <= KEEP_UNSAVED;
    });
    const drop = order.filter((id) => !ids.includes(id));
    drop.forEach((id) => EXTRA.delete(id));
    order = ids;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(ids.map((id) => EXTRA.get(id)))).catch(() => {});
  }, 1500);
}

function remember(list: Recipe[]) {
  list.forEach((r) => {
    EXTRA.set(r.id, r);
    order = [r.id, ...order.filter((x) => x !== r.id)];
  });
}

/* ───────── API ───────── */

export class QuotaError extends Error {}

async function call<T>(key: string, path: string, params: Record<string, string | number | boolean>): Promise<T> {
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), apiKey: key });
  const res = await fetch(`${API}${path}?${qs}`);
  if (res.status === 402 || res.status === 429) throw new QuotaError('Денний ліміт світової бази вичерпано — продовжимо завтра. Поки показуємо вбудовані рецепти.');
  if (res.status === 401) throw new Error('Ключ Spoonacular не підходить. Перевірте його в Профілі.');
  if (!res.ok) throw new Error(`Світова база недоступна (HTTP ${res.status})`);
  return res.json();
}

export async function validateSpoonKey(key: string) {
  try {
    await call(key, '/recipes/random', { number: 1 });
    return true;
  } catch (e) {
    return e instanceof QuotaError; // ключ правильний, просто ліміт
  }
}

type SpoonIngredient = { name?: string; nameClean?: string | null; original?: string; amount?: number; unit?: string; measures?: { metric?: { amount: number; unitShort: string } } };
type SpoonRecipe = {
  id: number;
  title: string;
  image?: string;
  readyInMinutes?: number;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  sourceUrl?: string;
  extendedIngredients?: SpoonIngredient[];
  analyzedInstructions?: { steps: { step: string }[] }[];
  instructions?: string | null;
};

const CUISINE_MAP: Record<string, string> = {
  american: 'American', british: 'British', english: 'British', scottish: 'British', irish: 'Irish', french: 'French', german: 'German',
  greek: 'Greek', italian: 'Italian', spanish: 'Spanish', mexican: 'Mexican', chinese: 'Chinese', japanese: 'Japanese', korean: 'Korean',
  thai: 'Thai', vietnamese: 'Vietnamese', indian: 'Indian', african: 'African', asian: 'Asian', cajun: 'Cajun', creole: 'Cajun',
  caribbean: 'Caribbean', 'eastern european': 'Eastern European', european: 'European', jewish: 'Jewish', 'latin american': 'Latin American',
  'south american': 'Latin American', 'central american': 'Latin American', mediterranean: 'Mediterranean', 'middle eastern': 'Middle Eastern',
  nordic: 'Nordic', scandinavian: 'Nordic', southern: 'Southern', moroccan: 'Moroccan', turkish: 'Turkish', portuguese: 'Portuguese',
};
/** Наші кухні → теги Spoonacular для запиту */
const AREA_TO_TAG: Record<string, string> = Object.fromEntries(Object.entries(CUISINE_MAP).map(([k, v]) => [v, k]));

const FLAG_RULES: Record<Flag, RegExp> = {
  meat: /\b(beef|steak|mince|chicken|turkey|duck|lamb|mutton|goat|pork|bacon|ham|sausage|chorizo|salami|pancetta|prosciutto|veal|venison|rabbit|liver|meat|goose|brisket|pepperoni|gelatin)\w*/i,
  pork: /\b(pork|bacon|ham|gammon|chorizo|salami|pancetta|prosciutto|lard|pepperoni|sausage)\w*/i,
  fish: /\b(fish|salmon|tuna|cod|haddock|mackerel|sardine|anchov|prawn|shrimp|crab|lobster|mussel|clam|oyster|squid|octopus|scallop|herring|trout|tilapia|seafood)\w*/i,
  dairy: /\b(milk|butter|cream|cheese|yogurt|yoghurt|cheddar|parmesan|mozzarella|ricotta|mascarpone|feta|ghee|buttermilk|paneer)\w*/i,
  egg: /\beggs?\b|\begg (yolk|white)s?\b|\bmayonnaise\b/i,
  gluten: /\b(flour|bread|pasta|spaghetti|noodle|breadcrumbs|couscous|bulgur|barley|tortilla|pastry|biscuit|cracker|semolina|lasagna|macaroni|penne|wheat|soy sauce|beer)\w*/i,
  nuts: /\b(almond|walnut|pecan|hazelnut|cashew|pistachio|peanut|macadamia|pine nut|nut)\w*/i,
  alcohol: /\b(wine|beer|brandy|rum|vodka|whisky|whiskey|sherry|cognac|liqueur|cider|sake|bourbon|gin|tequila)\b/i,
  spicy: /\b(chili|chilli|jalapeno|cayenne|harissa|sriracha|hot sauce|chipotle|gochujang|tabasco|red pepper flakes)\w*/i,
};

const UNIT_UK: Record<string, string> = {
  g: 'г', kg: 'кг', ml: 'мл', l: 'л', tbsp: 'ст. л.', tbsps: 'ст. л.', tsp: 'ч. л.', tsps: 'ч. л.', cup: 'скл.', cups: 'скл.',
  pinch: 'щіпка', pinches: 'щіпки', clove: 'зубч.', cloves: 'зубч.', slice: 'скибка', slices: 'скибок', can: 'банка', cans: 'банки',
  handful: 'жменя', bunch: 'пучок', sprig: 'гілочка', sprigs: 'гілочок', serving: 'порц.', servings: 'порц.', small: 'маленьк.',
  medium: 'середн.', large: 'велик.', leaf: 'листок', leaves: 'листків', stalk: 'стебло', stalks: 'стебла', piece: 'шт.', pieces: 'шт.',
  head: 'головка', package: 'пачка', packages: 'пачки', pkg: 'пачка', dash: 'кілька крапель', stick: 'паличка', sticks: 'палички', '': '',
};

function fmtAmount(n: number) {
  if (!n) return '';
  const whole = Math.floor(n);
  const frac = n - whole;
  const fr = [
    [0.25, '¼'],
    [0.33, '⅓'],
    [0.5, '½'],
    [0.67, '⅔'],
    [0.75, '¾'],
  ] as const;
  const near = fr.find(([v]) => Math.abs(frac - v) < 0.04);
  if (near && whole < 10) return `${whole || ''}${near[1]}`;
  if (n >= 100) return String(Math.round(n / 5) * 5);
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function categoryOf(r: SpoonRecipe, enIngr: string): string {
  const types = (r.dishTypes ?? []).map((t) => t.toLowerCase());
  if (types.includes('dessert')) return 'Dessert';
  if (types.some((t) => ['breakfast', 'morning meal', 'brunch'].includes(t))) return 'Breakfast';
  if (types.some((t) => ['appetizer', 'starter', 'snack', 'antipasti', 'antipasto', 'fingerfood', "hor d'oeuvre"].includes(t))) return 'Starter';
  if (types.includes('side dish')) return 'Side';
  if (r.vegan) return 'Vegan';
  if (/\b(beef|steak|veal)\b/i.test(enIngr)) return 'Beef';
  if (/\b(chicken|turkey|duck)\b/i.test(enIngr)) return 'Chicken';
  if (/\b(pork|bacon|ham|sausage)\b/i.test(enIngr)) return 'Pork';
  if (/\b(lamb|mutton)\b/i.test(enIngr)) return 'Lamb';
  if (FLAG_RULES.fish.test(enIngr)) return 'Seafood';
  if (/\b(pasta|spaghetti|penne|linguine|fettuccine|macaroni|lasagna|noodles)\b/i.test(enIngr)) return 'Pasta';
  if (r.vegetarian) return 'Vegetarian';
  return 'Miscellaneous';
}

const TYPE_UK: Record<string, string> = {
  'main course': 'Основна страва', 'side dish': 'Гарнір', dessert: 'Десерт', appetizer: 'Закуска', salad: 'Салат', bread: 'Хліб',
  breakfast: 'Сніданок', soup: 'Суп', beverage: 'Напій', sauce: 'Соус', marinade: 'Маринад', fingerfood: 'Фінгерфуд', snack: 'Перекус',
  drink: 'Напій', lunch: 'Обід', dinner: 'Вечеря',
};
const DIET_UK: Record<string, string> = {
  'gluten free': 'Без глютену', 'dairy free': 'Без молочного', 'lacto ovo vegetarian': 'Вегетаріанське', vegan: 'Веганське',
  paleolithic: 'Палео', primal: 'Праймал', ketogenic: 'Кето', 'whole 30': 'Whole30', pescatarian: 'Пескетаріанське', 'fodmap friendly': 'Low FODMAP',
};

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function stepsOf(r: SpoonRecipe): string[] {
  const steps = (r.analyzedInstructions ?? []).flatMap((b) => b.steps.map((s) => s.step.trim())).filter(Boolean);
  if (steps.length) {
    // дрібні кроки зливаємо, щоб не було по одному слову
    const out: string[] = [];
    for (const s of steps) {
      if (out.length && (s.length < 25 || out[out.length - 1].length < 25)) out[out.length - 1] += ' ' + s;
      else out.push(s);
    }
    return out;
  }
  const text = stripHtml(r.instructions ?? '');
  if (!text) return [];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && (buf + s).length > 280) {
      out.push(buf.trim());
      buf = '';
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Перетворює рецепт Spoonacular на наш формат і перекладає. */
async function convert(list: SpoonRecipe[]): Promise<Recipe[]> {
  const usable = list.filter((r) => r.image && r.title && (r.extendedIngredients?.length ?? 0) > 0 && !(r.dishTypes ?? []).some((t) => /beverage|drink/i.test(t)));
  const prepared = usable.map((r) => {
    const ingr = (r.extendedIngredients ?? []).map((i) => {
      const en = (i.nameClean || i.name || '').trim();
      const metric = i.measures?.metric;
      const amount = metric?.amount ?? i.amount ?? 0;
      const unit = (metric?.unitShort ?? i.unit ?? '').trim();
      const unitKey = unit.toLowerCase().replace(/\.$/, '');
      const ukUnit = UNIT_UK[unitKey];
      const m = `${fmtAmount(amount)}${unit ? ' ' + (ukUnit ?? unit) : ''}`.trim();
      return { en, m, needsM: ukUnit === undefined && /[a-z]{2,}/i.test(unit) };
    });
    // однакові інгредієнти (буває) — лишаємо перший
    const seen = new Set<string>();
    const uniq = ingr.filter((i) => i.en && !seen.has(i.en.toLowerCase()) && (seen.add(i.en.toLowerCase()), true));
    return { r, ingr: uniq, steps: stepsOf(r) };
  }).filter((p) => p.steps.length);

  const texts: string[] = [];
  prepared.forEach((p) => {
    texts.push(p.r.title);
    p.ingr.forEach((i) => {
      texts.push(titleCase(i.en));
      if (i.needsM) texts.push(i.m);
    });
    texts.push(...p.steps);
    (p.r.dishTypes ?? []).forEach((t) => !TYPE_UK[t] && texts.push(t));
  });
  const tr = await translateMany(texts);
  const map = new Map(texts.map((t, i) => [t, tr[i]]));
  const t = (s: string) => map.get(s) ?? s;

  return prepared.map(({ r, ingr, steps }) => {
    const enAll = ingr.map((i) => i.en).join(' | ');
    let flags = (Object.keys(FLAG_RULES) as Flag[]).filter((f) => FLAG_RULES[f].test(enAll));
    if (r.vegetarian || r.vegan) flags = flags.filter((f) => !['meat', 'pork', 'fish'].includes(f));
    if (r.vegan) flags = flags.filter((f) => !['dairy', 'egg'].includes(f));
    if (r.dairyFree) flags = flags.filter((f) => f !== 'dairy');
    if (r.glutenFree) flags = flags.filter((f) => f !== 'gluten');
    const cuisine = (r.cuisines ?? []).map((c) => CUISINE_MAP[c.toLowerCase()]).find(Boolean) ?? 'Unknown';
    const tags = [
      ...(r.dishTypes ?? []).slice(0, 2).map((d) => TYPE_UK[d] ?? capFirst(t(d))),
      ...(r.diets ?? []).map((d) => DIET_UK[d]).filter(Boolean).slice(0, 2),
    ].filter((x, i, a) => x && a.indexOf(x) === i);
    return {
      id: SPOON_OFFSET + r.id,
      name: capFirst(t(r.title)),
      nameEn: r.title,
      cat: categoryOf(r, enAll),
      area: cuisine,
      img: r.image!.replace(/-\d+x\d+\./, '-636x393.'),
      video: null,
      tags,
      src: r.sourceUrl ?? null,
      time: Math.max(5, Math.min(r.readyInMinutes ?? 45, 24 * 60)),
      flags,
      ingr: ingr.map((i) => ({ n: capFirst(t(titleCase(i.en))), en: i.en, m: i.needsM ? t(i.m) : i.m })),
      steps: steps.map((s) => capFirst(t(s))),
    } satisfies Recipe;
  });
}

/** Теги запиту з фільтрів: кухня (якщо одна) і дієта. */
function tagsFor(f?: Filters) {
  const include: string[] = [];
  if (f) {
    const cuisines = f.areas.map((a) => AREA_TO_TAG[a]).filter(Boolean);
    if (cuisines.length === 1) include.push(cuisines[0]);
    if (f.cats.length === 1) {
      const c = f.cats[0];
      if (c === 'Dessert') include.push('dessert');
      if (c === 'Breakfast') include.push('breakfast');
      if (c === 'Side') include.push('side dish');
      if (c === 'Starter') include.push('appetizer');
      if (c === 'Vegan') include.push('vegan');
      if (c === 'Vegetarian') include.push('vegetarian');
    }
    if (f.without.includes('meat') && f.without.includes('fish')) include.push(f.without.includes('dairy') && f.without.includes('egg') ? 'vegan' : 'vegetarian');
    if (f.without.includes('gluten')) include.push('gluten free');
    if (f.without.includes('dairy')) include.push('dairy free');
  }
  return [...new Set(include)];
}

/** Випадкові рецепти зі світової бази (вже перекладені). */
export async function randomRecipes(key: string, f?: Filters, n = 20): Promise<Recipe[]> {
  const include = tagsFor(f);
  const d = await call<{ recipes: SpoonRecipe[] }>(key, '/recipes/random', { number: n, ...(include.length ? { 'include-tags': include.join(',') } : {}) });
  const list = await convert(d.recipes ?? []);
  remember(list);
  return list;
}

/** Пошук у світовій базі (запит англійською). */
export async function searchWorld(key: string, queryEn: string, n = 12): Promise<Recipe[]> {
  const found = await call<{ results: { id: number }[] }>(key, '/recipes/complexSearch', { query: queryEn, number: n, instructionsRequired: true });
  const ids = (found.results ?? []).map((r) => r.id);
  if (!ids.length) return [];
  const fresh = ids.filter((id) => !EXTRA.has(SPOON_OFFSET + id));
  if (fresh.length) {
    const info = await call<SpoonRecipe[]>(key, '/recipes/informationBulk', { ids: fresh.join(',') });
    remember(await convert(info));
  }
  return ids.map((id) => EXTRA.get(SPOON_OFFSET + id)).filter((r): r is Recipe => !!r);
}

/** Один рецепт за id (коли відкрили посилання на рецепт, якого немає на пристрої). */
export async function loadWorldRecipe(key: string, id: number): Promise<Recipe | null> {
  const info = await call<SpoonRecipe>(key, `/recipes/${id - SPOON_OFFSET}/information`, {});
  const [r] = await convert([info]);
  if (r) remember([r]);
  return r ?? null;
}
