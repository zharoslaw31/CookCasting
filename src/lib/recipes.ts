import raw from '../data/recipes.json';
import { Area, Category, Filters, Flag, Recipe, RecipeDb, SortBy } from './types';

/** Уся база рецептів (вбудована в додаток, працює без інтернету — крім фото й відео). */
export const DB = raw as unknown as RecipeDb;
export const RECIPES: Recipe[] = DB.recipes;
const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export const getRecipe = (id: number) => BY_ID.get(id);

const AREA_MAP = new Map(DB.areas.map((a) => [a.id, a]));
const CAT_MAP = new Map(DB.cats.map((c) => [c.id, c]));

export const AREAS: Area[] = DB.areas;
export const CATEGORIES: Category[] = DB.cats;
export const areaOf = (id: string): Area => AREA_MAP.get(id) ?? { id, uk: id, flag: '🌍', count: 0 };
export const catOf = (id: string): Category => CAT_MAP.get(id) ?? { id, uk: id, emoji: '🍽️', count: 0 };
/** «Італійська кухня» */
export const areaLabel = (id: string) => (id === 'Unknown' ? 'Інтернаціональна кухня' : `${areaOf(id).uk} кухня`);

/** Регіони — для швидкого вибору в «Що приготувати?» */
export const REGIONS: { id: string; label: string; icon: string; areas: string[] }[] = [
  { id: 'europe', label: 'Європа', icon: '🇪🇺', areas: ['British', 'Irish', 'French', 'Italian', 'Spanish', 'Portuguese', 'Greek', 'Dutch', 'Belgian', 'German', 'Polish', 'Croatian', 'Slovakian', 'Ukrainian', 'Russian', 'Norwegian', 'Swedish'] },
  { id: 'asia', label: 'Азія', icon: '🥢', areas: ['Chinese', 'Japanese', 'Thai', 'Vietnamese', 'Malaysian', 'Filipino', 'Indian', 'Korean', 'Indonesian'] },
  { id: 'east', label: 'Близький Схід і Африка', icon: '🧆', areas: ['Turkish', 'Egyptian', 'Moroccan', 'Tunisian', 'Algerian', 'Kenyan', 'Syrian', 'Lebanese', 'Saudi Arabian'] },
  { id: 'americas', label: 'Америка', icon: '🌮', areas: ['American', 'Canadian', 'Mexican', 'Jamaican', 'Argentinian', 'Uruguayan', 'Venezulan', 'Venezuelan', 'Brazilian', 'Peruvian', 'Colombian', 'Cuban'] },
];

export const FLAGS: { id: Flag; label: string; icon: string }[] = [
  { id: 'meat', label: 'м’яса', icon: '🥩' },
  { id: 'pork', label: 'свинини', icon: '🐖' },
  { id: 'fish', label: 'риби й морепродуктів', icon: '🐟' },
  { id: 'dairy', label: 'молочного', icon: '🥛' },
  { id: 'egg', label: 'яєць', icon: '🥚' },
  { id: 'gluten', label: 'глютену', icon: '🌾' },
  { id: 'nuts', label: 'горіхів', icon: '🥜' },
  { id: 'alcohol', label: 'алкоголю', icon: '🍷' },
  { id: 'spicy', label: 'гострого', icon: '🌶️' },
];

export const DIETS: { id: string; label: string; icon: string; without: Flag[] }[] = [
  { id: 'veg', label: 'Вегетаріанське', icon: '🥦', without: ['meat', 'pork', 'fish'] },
  { id: 'vegan', label: 'Веганське', icon: '🌱', without: ['meat', 'pork', 'fish', 'dairy', 'egg'] },
  { id: 'gf', label: 'Без глютену', icon: '🌾', without: ['gluten'] },
  { id: 'kids', label: 'Для дітей', icon: '🧒', without: ['alcohol', 'spicy'] },
];

/* ───────── складність і час ───────── */

export type Difficulty = 1 | 2 | 3;
export function difficulty(r: Recipe): Difficulty {
  const score = r.ingr.length + r.steps.length * 1.5 + (r.time > 120 ? 6 : r.time > 60 ? 3 : 0);
  return score <= 14 ? 1 : score <= 24 ? 2 : 3;
}
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Легко', 2: 'Середньо', 3: 'Складно' };

export function formatTime(min: number): string {
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) return 'понад добу';
  return m ? `${h} год ${m} хв` : `${h} год`;
}

/** Відмінювання: plural(5, ['рецепт', 'рецепти', 'рецептів']) */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/* ───────── фільтри ───────── */

export function matches(r: Recipe, f: Filters): boolean {
  if (f.areas.length && !f.areas.includes(r.area)) return false;
  if (f.excludeAreas.includes(r.area)) return false;
  if (f.cats.length && !f.cats.includes(r.cat)) return false;
  if (f.excludeCats.includes(r.cat)) return false;
  if (f.maxTime && r.time > f.maxTime) return false;
  if (f.maxIngr && r.ingr.length > f.maxIngr) return false;
  if (f.withVideo && !r.video) return false;
  if (f.without.some((fl) => r.flags.includes(fl))) return false;
  return true;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortRecipes(list: Recipe[], sortBy: SortBy): Recipe[] {
  switch (sortBy) {
    case 'quick':
      return [...list].sort((a, b) => a.time - b.time || Math.random() - 0.5);
    case 'simple':
      return [...list].sort((a, b) => a.ingr.length + a.steps.length - (b.ingr.length + b.steps.length));
    case 'complex':
      return [...list].sort((a, b) => b.ingr.length + b.steps.length - (a.ingr.length + a.steps.length));
    case 'video':
      return shuffle(list).sort((a, b) => Number(!!b.video) - Number(!!a.video));
    default:
      return shuffle(list);
  }
}

/* ───────── смак («Для тебе») ───────── */

export type Taste = { areas: Map<string, number>; cats: Map<string, number>; ingr: Map<string, number>; size: number };

export function buildTaste(liked: number[], cooked: { id: number; myRating?: number }[], disliked: number[]): Taste {
  const areas = new Map<string, number>();
  const cats = new Map<string, number>();
  const ingr = new Map<string, number>();
  const add = (id: number, w: number) => {
    const r = BY_ID.get(id);
    if (!r) return;
    areas.set(r.area, (areas.get(r.area) ?? 0) + w);
    cats.set(r.cat, (cats.get(r.cat) ?? 0) + w);
    r.ingr.forEach((i) => {
      const k = i.en.toLowerCase();
      if (BASIC.has(k)) return;
      ingr.set(k, (ingr.get(k) ?? 0) + w * 0.3);
    });
  };
  liked.forEach((id) => add(id, 1));
  cooked.forEach((e) => add(e.id, e.myRating ? (e.myRating >= 4 ? 1.5 : e.myRating <= 2 ? -1 : 0.3) : 0.6));
  disliked.forEach((id) => add(id, -0.5));
  return { areas, cats, ingr, size: liked.length + cooked.length };
}

export function tasteScore(r: Recipe, t: Taste): number {
  let s = (t.areas.get(r.area) ?? 0) * 1.2 + (t.cats.get(r.cat) ?? 0);
  r.ingr.forEach((i) => (s += t.ingr.get(i.en.toLowerCase()) ?? 0));
  return s;
}

/** Базові продукти, які є в кожній кухні — не враховуємо в смаку й у «Що є вдома». */
export const BASIC = new Set(['salt', 'pepper', 'black pepper', 'water', 'olive oil', 'vegetable oil', 'oil', 'sugar', 'sea salt', 'ground black pepper', 'cold water', 'hot water', 'boiling water', 'sunflower oil', 'ice cubes']);

/* ───────── пошук ───────── */

const norm = (s: string) =>
  s
    .toLocaleLowerCase('uk')
    .replace(/[’'`ʼ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const INDEX = RECIPES.map((r) => ({
  r,
  name: norm(`${r.name} ${r.nameEn}`),
  rest: norm(`${areaOf(r.area).uk} ${catOf(r.cat).uk} ${r.tags.join(' ')} ${r.ingr.map((i) => `${i.n} ${i.en}`).join(' ')}`),
}));

export function search(q: string): Recipe[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  return INDEX.map(({ r, name, rest }) => {
    let score = 0;
    for (const w of words) {
      if (name.includes(w)) score += name.startsWith(w) ? 4 : 3;
      else if (rest.includes(w)) score += 1;
      else return null;
    }
    return { r, score };
  })
    .filter((x): x is { r: Recipe; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/* ───────── інгредієнти («Що є вдома») ───────── */

export type IngredientInfo = { en: string; key: string; uk: string; count: number };

/** Усі інгредієнти бази з кількістю рецептів (для вибору «що є вдома»). */
export const ALL_INGREDIENTS: IngredientInfo[] = (() => {
  const map = new Map<string, IngredientInfo>();
  RECIPES.forEach((r) =>
    r.ingr.forEach((i) => {
      const key = i.en.toLowerCase();
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { en: i.en, key, uk: i.n, count: 1 });
    }),
  );
  return [...map.values()].filter((i) => !BASIC.has(i.key)).sort((a, b) => b.count - a.count);
})();
const ING_MAP = new Map(ALL_INGREDIENTS.map((i) => [i.key, i]));
export const ingredientUk = (key: string) => ING_MAP.get(key)?.uk ?? key;

export function searchIngredients(q: string): IngredientInfo[] {
  const w = norm(q);
  if (!w) return ALL_INGREDIENTS.slice(0, 40);
  return ALL_INGREDIENTS.filter((i) => norm(i.uk).includes(w) || i.key.includes(w)).slice(0, 60);
}

/** Рецепти за наявними продуктами: скільки збігів і чого бракує. */
export function byPantry(pantry: string[], f?: Filters) {
  const have = new Set(pantry.map((p) => p.toLowerCase()));
  if (!have.size) return [];
  // «chicken» вдома покриває «chicken breast», «chicken thighs» тощо
  const covers = (k: string) => have.has(k) || [...have].some((h) => k.includes(h) && h.length >= 4);
  return RECIPES.filter((r) => !f || matches(r, f))
    .map((r) => {
      const needed = r.ingr.filter((i) => !BASIC.has(i.en.toLowerCase()));
      const got = needed.filter((i) => covers(i.en.toLowerCase()));
      const missing = needed.filter((i) => !covers(i.en.toLowerCase()));
      return { r, got: got.length, missing, ratio: needed.length ? got.length / needed.length : 0 };
    })
    .filter((x) => x.got > 0)
    .sort((a, b) => a.missing.length - b.missing.length || b.ratio - a.ratio || b.got - a.got);
}

export const ingredientImage = (en: string) => `https://www.themealdb.com/images/ingredients/${encodeURIComponent(en)}-small.png`;

/** Схожі рецепти: та сама кухня/категорія + спільні інгредієнти. */
export function similar(r: Recipe, n = 10): Recipe[] {
  const mine = new Set(r.ingr.map((i) => i.en.toLowerCase()).filter((k) => !BASIC.has(k)));
  return RECIPES.filter((x) => x.id !== r.id)
    .map((x) => {
      let s = (x.area === r.area ? 2 : 0) + (x.cat === r.cat ? 2.5 : 0);
      x.ingr.forEach((i) => mine.has(i.en.toLowerCase()) && (s += 0.6));
      return { x, s: s + Math.random() * 0.5 };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((e) => e.x);
}
