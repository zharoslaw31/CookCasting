/** Рецепт з вбудованої бази (src/data/recipes.json, перекладено українською). */
export type Ingredient = {
  /** назва українською */
  n: string;
  /** назва англійською (оригінал TheMealDB) */
  en: string;
  /** кількість / міра українською */
  m: string;
};

export type Flag = 'meat' | 'pork' | 'fish' | 'dairy' | 'egg' | 'gluten' | 'nuts' | 'alcohol' | 'spicy';

export type Recipe = {
  id: number;
  name: string;
  nameEn: string;
  /** категорія (ключ англійською, напр. «Dessert») */
  cat: string;
  /** кухня (ключ англійською, напр. «Italian») */
  area: string;
  img: string;
  /** id відео YouTube */
  video: string | null;
  tags: string[];
  src: string | null;
  /** приблизний час приготування, хв */
  time: number;
  flags: Flag[];
  ingr: Ingredient[];
  steps: string[];
};

export type Area = { id: string; uk: string; flag: string; count: number };
export type Category = { id: string; uk: string; emoji: string; count: number };

export type RecipeDb = {
  v: number;
  source: string;
  builtAt: string;
  areas: Area[];
  cats: Category[];
  recipes: Recipe[];
};

export type SortBy = 'random' | 'quick' | 'simple' | 'video' | 'complex';

export type Filters = {
  areas: string[];
  excludeAreas: string[];
  cats: string[];
  excludeCats: string[];
  /** максимальний час, хв (null — будь-який) */
  maxTime: number | null;
  /** максимальна кількість інгредієнтів */
  maxIngr: number | null;
  /** без цих складників */
  without: Flag[];
  withVideo: boolean;
  sortBy: SortBy;
};

export const DEFAULT_FILTERS: Filters = {
  areas: [],
  excludeAreas: [],
  cats: [],
  excludeCats: [],
  maxTime: null,
  maxIngr: null,
  without: [],
  withVideo: false,
  sortBy: 'random',
};

/** like — хочу приготувати, nope — не цікаво, cooked — вже готував */
export type SwipeKind = 'like' | 'nope' | 'cooked';

export type LibraryEntry = { id: number; at: number; myRating?: number };

export type ShopItem = { key: string; name: string; amount: string; recipeId: number | null; done: boolean; at: number };

export type Profile = { name: string; avatar: string; createdAt: number };

export type Settings = {
  haptics: boolean;
  onboarded?: boolean;
  castingMode?: 'all' | 'foryou';
  /** продукти «у холодильнику» (англійські назви інгредієнтів) */
  pantry?: string[];
};
