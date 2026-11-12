import AsyncStorage from '@react-native-async-storage/async-storage';
import * as H from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Platform } from 'react-native';
import { getRecipe } from './recipes';
import { ENV_SPOON_KEY, loadWorld, saveWorld } from './spoon';
import { DEFAULT_FILTERS, Filters, LibraryEntry, Profile, Settings, ShopItem, SwipeKind } from './types';

const STORAGE_KEY = 'cookcasting/state/v1';
const FILTERS_VERSION = 1;

type State = {
  ready: boolean;
  profile: Profile;
  settings: Settings;
  filters: Filters;
  liked: LibraryEntry[];
  cooked: LibraryEntry[];
  disliked: LibraryEntry[];
  history: { id: number; kind: SwipeKind; at: number }[];
  videosViewed: number;
  shopping: ShopItem[];
  filtersV?: number;
};

const DEFAULT_PROFILE: Profile = { name: 'Кухар', avatar: '👩‍🍳', createdAt: Date.now() };

const initial: State = {
  ready: false,
  profile: DEFAULT_PROFILE,
  settings: { haptics: true, pantry: [] },
  filters: DEFAULT_FILTERS,
  liked: [],
  cooked: [],
  disliked: [],
  history: [],
  videosViewed: 0,
  shopping: [],
  filtersV: FILTERS_VERSION,
};

export type ListName = 'liked' | 'cooked' | 'disliked';

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'swipe'; id: number; kind: SwipeKind }
  | { type: 'undo' }
  | { type: 'toggle'; id: number; list: ListName }
  | { type: 'rate'; id: number; rating: number }
  | { type: 'remove'; id: number; list: ListName }
  | { type: 'restore'; entries: LibraryEntry[]; list: ListName }
  | { type: 'filters'; filters: Filters }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'profile'; profile: Partial<Profile> }
  | { type: 'videoViewed' }
  | { type: 'shopAdd'; items: Omit<ShopItem, 'key' | 'done' | 'at'>[] }
  | { type: 'shopToggle'; key: string }
  | { type: 'shopRemove'; keys: string[] }
  | { type: 'shopClearDone' }
  | { type: 'resetLibrary' };

const without = (list: LibraryEntry[], id: number) => list.filter((e) => e.id !== id);
const has = (list: LibraryEntry[], id: number) => list.some((e) => e.id === id);
/** Рецепти, яких більше немає в базі (після оновлення), прибираємо. */
const existing = (list: LibraryEntry[] = []) => list.filter((e) => !!getRecipe(e.id));

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return {
        ...s,
        ...a.state,
        settings: { ...s.settings, ...(a.state.settings ?? {}) },
        filters: a.state.filtersV === FILTERS_VERSION ? { ...DEFAULT_FILTERS, ...(a.state.filters ?? {}) } : DEFAULT_FILTERS,
        filtersV: FILTERS_VERSION,
        liked: existing(a.state.liked),
        cooked: existing(a.state.cooked),
        disliked: existing(a.state.disliked),
        shopping: a.state.shopping ?? [],
        ready: true,
      };
    case 'swipe': {
      const entry = { id: a.id, at: Date.now() };
      const history = [...s.history, { id: a.id, kind: a.kind, at: entry.at }].slice(-3000);
      if (a.kind === 'like') return { ...s, history, liked: [entry, ...without(s.liked, a.id)], disliked: without(s.disliked, a.id) };
      if (a.kind === 'nope') return { ...s, history, disliked: [entry, ...without(s.disliked, a.id)], liked: without(s.liked, a.id) };
      return { ...s, history, cooked: [entry, ...without(s.cooked, a.id)] };
    }
    case 'undo': {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      const list: ListName = last.kind === 'like' ? 'liked' : last.kind === 'nope' ? 'disliked' : 'cooked';
      return { ...s, history: s.history.slice(0, -1), [list]: without(s[list], last.id) };
    }
    case 'toggle': {
      if (has(s[a.list], a.id)) return { ...s, [a.list]: without(s[a.list], a.id) };
      const entry = { id: a.id, at: Date.now() };
      const next = { ...s, [a.list]: [entry, ...s[a.list]] };
      if (a.list === 'liked') next.disliked = without(s.disliked, a.id);
      if (a.list === 'disliked') next.liked = without(s.liked, a.id);
      if (a.list === 'cooked') next.history = [...s.history, { id: a.id, kind: 'cooked' as const, at: entry.at }].slice(-3000);
      return next;
    }
    case 'rate': {
      const cooked = has(s.cooked, a.id) ? s.cooked : [{ id: a.id, at: Date.now() }, ...s.cooked];
      return { ...s, cooked: cooked.map((e) => (e.id === a.id ? { ...e, myRating: a.rating } : e)) };
    }
    case 'remove':
      return { ...s, [a.list]: without(s[a.list], a.id) };
    case 'restore': {
      const ids = new Set(a.entries.map((e) => e.id));
      return { ...s, [a.list]: [...a.entries, ...s[a.list].filter((e) => !ids.has(e.id))].sort((x, y) => y.at - x.at) };
    }
    case 'filters':
      return { ...s, filters: a.filters };
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.settings } };
    case 'profile':
      return { ...s, profile: { ...s.profile, ...a.profile } };
    case 'videoViewed':
      return { ...s, videosViewed: s.videosViewed + 1 };
    case 'shopAdd': {
      const now = Date.now();
      const items = [...s.shopping];
      a.items.forEach((it, i) => {
        // той самий продукт для того самого рецепта не дублюємо
        if (items.some((x) => !x.done && x.name === it.name && x.recipeId === it.recipeId)) return;
        items.push({ ...it, key: `${now}-${i}-${Math.random().toString(36).slice(2, 6)}`, done: false, at: now });
      });
      return { ...s, shopping: items };
    }
    case 'shopToggle':
      return { ...s, shopping: s.shopping.map((x) => (x.key === a.key ? { ...x, done: !x.done } : x)) };
    case 'shopRemove': {
      const keys = new Set(a.keys);
      return { ...s, shopping: s.shopping.filter((x) => !keys.has(x.key)) };
    }
    case 'shopClearDone':
      return { ...s, shopping: s.shopping.filter((x) => !x.done) };
    case 'resetLibrary':
      return { ...s, liked: [], cooked: [], disliked: [], history: [], videosViewed: 0, shopping: [] };
  }
}

type Ctx = {
  state: State;
  dispatch: React.Dispatch<Action>;
  seen: Set<number>;
  isLiked: (id: number) => boolean;
  isCooked: (id: number) => boolean;
  isDisliked: (id: number) => boolean;
  ratingOf: (id: number) => number | undefined;
  swipe: (id: number, kind: SwipeKind) => void;
  /** ключ світової бази (Spoonacular): з Профілю або вбудований у сайт */
  worldKey: string;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // спершу — збережені рецепти світової бази, щоб бібліотека їх «бачила»
    loadWorld()
      .then(() => AsyncStorage.getItem(STORAGE_KEY))
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? JSON.parse(raw) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { ready, ...persist } = state;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persist)).catch(() => {});
    }, 400);
  }, [state]);

  // рецепти світової бази з бібліотеки й списку покупок зберігаємо назавжди, решту — останні кілька сотень
  useEffect(() => {
    if (!state.ready) return;
    saveWorld(new Set([...state.liked, ...state.cooked, ...state.disliked].map((e) => e.id).concat(state.shopping.map((x) => x.recipeId ?? 0))));
  }, [state.ready, state.liked, state.cooked, state.disliked, state.shopping]);

  const value = useMemo<Ctx>(() => {
    const likedIds = new Set(state.liked.map((e) => e.id));
    const cookedIds = new Set(state.cooked.map((e) => e.id));
    const dislikedIds = new Set(state.disliked.map((e) => e.id));
    const ratings = new Map(state.cooked.filter((e) => e.myRating).map((e) => [e.id, e.myRating!]));
    return {
      state,
      dispatch,
      seen: new Set([...likedIds, ...cookedIds, ...dislikedIds]),
      isLiked: (id) => likedIds.has(id),
      isCooked: (id) => cookedIds.has(id),
      isDisliked: (id) => dislikedIds.has(id),
      ratingOf: (id) => ratings.get(id),
      swipe: (id, kind) => dispatch({ type: 'swipe', id, kind }),
      worldKey: state.settings.spoonKey || ENV_SPOON_KEY,
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export const countActiveFilters = (f: Filters) =>
  (f.areas.length ? 1 : 0) +
  (f.excludeAreas.length ? 1 : 0) +
  (f.cats.length ? 1 : 0) +
  (f.excludeCats.length ? 1 : 0) +
  (f.maxTime ? 1 : 0) +
  (f.maxIngr ? 1 : 0) +
  (f.without.length ? 1 : 0) +
  (f.withVideo ? 1 : 0) +
  (f.sortBy !== DEFAULT_FILTERS.sortBy ? 1 : 0);

export function useHaptics() {
  const { state } = useStore();
  return useCallback(
    async (kind: 'light' | 'success' | 'warning' = 'light') => {
      if (!state.settings.haptics || Platform.OS === 'web') return;
      try {
        if (kind === 'light') await H.impactAsync(H.ImpactFeedbackStyle.Light);
        else await H.notificationAsync(kind === 'success' ? H.NotificationFeedbackType.Success : H.NotificationFeedbackType.Warning);
      } catch {}
    },
    [state.settings.haptics],
  );
}
