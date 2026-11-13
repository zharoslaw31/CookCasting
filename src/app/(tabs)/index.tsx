import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeDeck, SwipeDeckHandle } from '../../components/SwipeDeck';
import { GradientButton, RoundButton, Stars } from '../../components/ui';
import { openRecipe } from '../../lib/nav';
import { buildTaste, isWorld, matches, plural, RECIPES, sortRecipes, tasteScore } from '../../lib/recipes';
import { countActiveFilters, useHaptics, useStore } from '../../lib/store';
import { QuotaError, randomRecipes } from '../../lib/spoon';
import { Recipe, SwipeKind } from '../../lib/types';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

export default function CastingScreen() {
  const insets = useSafeAreaInsets();
  const { state, seen, swipe, dispatch, worldKey } = useStore();
  const haptic = useHaptics();
  const deck = useRef<SwipeDeckHandle>(null);
  const [queue, setQueue] = useState<Recipe[]>([]);
  const [shuffleTick, setShuffleTick] = useState(0);
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const mode = state.settings.castingMode ?? 'all';
  const forYou = mode === 'foryou';
  const filtersKey = JSON.stringify(state.filters) + shuffleTick + mode;
  const pool = useMemo(() => RECIPES.filter((r) => matches(r, state.filters)), [state.filters]);

  // ───── світова база: безкінечні рецепти з перекладом ─────
  const worldOn = !!worldKey && state.settings.world !== false;
  const [worldLoading, setWorldLoading] = useState(false);
  const [worldError, setWorldError] = useState<string | null>(null);
  const worldBusy = useRef(false);
  const worldGen = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const loadWorld = useCallback(async () => {
    if (worldBusy.current || !worldKey) return;
    worldBusy.current = true;
    setWorldLoading(true);
    const gen = worldGen.current;
    try {
      let added: Recipe[] = [];
      for (let round = 0; round < 3 && added.length < 6; round++) {
        const list = await randomRecipes(worldKey, state.filters, 20);
        if (gen !== worldGen.current) return;
        const have = new Set(queueRef.current.map((r) => r.id));
        added = added.concat(list.filter((r) => matches(r, state.filters) && !seenRef.current.has(r.id) && !have.has(r.id) && !added.some((x) => x.id === r.id)));
      }
      setWorldError(null);
      // вставляємо впереміш з вбудованими, не чіпаючи верхню картку
      setQueue((q) => {
        if (!q.length) return added;
        const [top, ...rest] = q;
        const out: Recipe[] = [top];
        let i = 0;
        let j = 0;
        while (i < rest.length || j < added.length) {
          if (j < added.length) out.push(added[j++]);
          if (i < rest.length) out.push(rest[i++]);
        }
        return out;
      });
    } catch (e) {
      if (gen === worldGen.current) setWorldError(e instanceof QuotaError || e instanceof Error ? e.message : 'Світова база недоступна');
    } finally {
      worldBusy.current = false;
      setWorldLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldKey, filtersKey]);

  // світових рецептів у колоді завжди кілька наперед
  const worldLow = queue.filter((r) => isWorld(r.id)).length < 5;
  useEffect(() => {
    if (state.ready && worldOn && !worldError && worldLow) loadWorld();
  }, [state.ready, worldOn, worldLow, worldError, loadWorld]);

  // Нова колода при зміні фільтрів / режиму / натисканні «Перемішати»
  useEffect(() => {
    if (!state.ready) return;
    const fresh = pool.filter((r) => !seenRef.current.has(r.id));
    if (forYou) {
      const taste = buildTaste(
        state.liked.map((e) => e.id),
        state.cooked,
        state.disliked.map((e) => e.id),
      );
      // найкращі збіги першими, але з дрібкою випадковості, щоб колода не була однаковою
      setQueue(
        fresh
          .map((r) => ({ r, s: tasteScore(r, taste) + Math.random() * 1.5 }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.r),
      );
    } else setQueue(sortRecipes(fresh, state.filters.sortBy));
    worldGen.current += 1;
    worldBusy.current = false;
    setWorldError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, state.ready]);

  const lastSwiped = useRef<Recipe[]>([]);
  // «Вже готував» — одразу пропонуємо оцінити, як вийшло
  const [rateFor, setRateFor] = useState<Recipe | null>(null);
  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askRating = useCallback((r: Recipe | null) => {
    if (rateTimer.current) clearTimeout(rateTimer.current);
    setRateFor(r);
    if (r) rateTimer.current = setTimeout(() => setRateFor(null), 7000);
  }, []);
  useEffect(() => () => {
    if (rateTimer.current) clearTimeout(rateTimer.current);
  }, []);

  const handleSwipe = useCallback(
    (r: Recipe, kind: SwipeKind) => {
      lastSwiped.current = [r, ...lastSwiped.current].slice(0, 30);
      swipe(r.id, kind);
      haptic(kind === 'like' ? 'success' : 'light');
      setQueue((q) => q.filter((x) => x.id !== r.id));
      askRating(kind === 'cooked' ? r : null);
    },
    [swipe, haptic, askRating],
  );

  const undo = () => {
    const r = lastSwiped.current.shift();
    if (!r) return;
    askRating(null);
    dispatch({ type: 'undo' });
    haptic('warning');
    setQueue((q) => [r, ...q.filter((x) => x.id !== r.id)]);
  };

  // клавіатура на комп'ютері: ← ні, → хочу, ↑ готував, Backspace — скасувати
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!location.pathname.replace(/\/+$/, '').endsWith('/CookCasting') && location.pathname !== '/') return;
      if (e.key === 'ArrowRight') deck.current?.swipe('like');
      else if (e.key === 'ArrowLeft') deck.current?.swipe('nope');
      else if (e.key === 'ArrowUp') deck.current?.swipe('cooked');
      else if (e.key === 'Backspace') undoRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { width } = useWindowDimensions();
  const activeFilters = countActiveFilters(state.filters);
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 12;
  const left = queue.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.logo, width < 380 && { fontSize: 22 }]}>
            Cook<Text style={{ color: colors.accent }}>Casting</Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {!state.ready ? ' ' : worldOn ? (worldError ? (/ліміт/i.test(worldError) ? 'Світова база: ліміт на сьогодні' : 'Світова база недоступна') : '∞ Світова база + вбудовані рецепти') : `${left} ${plural(left, ['рецепт', 'рецепти', 'рецептів'])} у колоді`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityLabel="Пошук рецепту" onPress={() => router.push('/search')} style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="search" size={21} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Перемішати"
            onPress={() => {
              haptic('light');
              setShuffleTick((t) => t + 1);
            }}
            style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="shuffle" size={22} color={colors.text} />
          </Pressable>
          <Pressable accessibilityLabel="Фільтри" onPress={() => router.push('/filters')} style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="options-outline" size={22} color={colors.text} />
            {activeFilters ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modes} contentContainerStyle={styles.modesRow}>
        <ModeChip icon="🎲" label="Уся база" active={!forYou} onPress={() => dispatch({ type: 'settings', settings: { castingMode: 'all' } })} />
        <ModeChip icon="✨" label="Для тебе" active={forYou} onPress={() => dispatch({ type: 'settings', settings: { castingMode: 'foryou' } })} />
        <ModeChip
          icon="🌍"
          label="Світ ∞"
          active={worldOn}
          onPress={() => (worldKey ? dispatch({ type: 'settings', settings: { world: !worldOn } }) : router.push('/profile'))}
        />
        <View style={styles.modeSep} />
        <ModeChip icon="🍳" label="Що приготувати?" onPress={() => router.push('/tonight')} />
        <ModeChip icon="🧺" label="Що є вдома" onPress={() => router.push('/fridge')} />
      </ScrollView>
      {forYou && state.liked.length + state.cooked.length < 3 ? (
        <Text style={styles.forYouHint}>Вподобайте хоча б 3 рецепти — і підбір врахує ваші улюблені кухні, категорії та продукти.</Text>
      ) : null}

      <View style={{ flex: 1, marginTop: 10 }}>
        {queue.length ? (
          <SwipeDeck ref={deck} movies={queue} onSwipe={handleSwipe} onOpen={(r) => openRecipe(r.id)} />
        ) : state.ready && worldOn && worldLoading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.emptyText, { marginTop: 14 }]}>Шукаємо нові рецепти у світовій базі й перекладаємо українською…</Text>
          </View>
        ) : state.ready ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={styles.emptyTitle}>{pool.length ? 'Ви переглянули всі рецепти' : 'Нічого не знайдено'}</Text>
            <Text style={styles.emptyText}>
              {worldError
                ? worldError
                : !worldKey
                  ? 'Вбудовані рецепти закінчились. Підключіть безкоштовну світову базу в Профілі — і рецепти не закінчаться ніколи.'
                  : pool.length
                    ? 'Під ці фільтри більше нових рецептів немає. Змініть фільтри або перегляньте Обране в Бібліотеці.'
                    : 'Під ці фільтри немає жодного рецепту. Спробуйте розширити пошук.'}
            </Text>
            {worldError ? <GradientButton title="Спробувати ще" icon="refresh" onPress={() => setWorldError(null)} style={{ marginTop: 20 }} /> : null}
            <GradientButton title="Змінити фільтри" icon="options-outline" onPress={() => router.push('/filters')} style={{ marginTop: 20 }} />
          </View>
        ) : null}
      </View>

      {state.ready && !state.settings.onboarded && queue.length ? (
        <Pressable style={styles.tipWrap} onPress={() => dispatch({ type: 'settings', settings: { onboarded: true } })}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Як це працює</Text>
            <TipRow icon="arrow-forward" color={colors.like} text="Свайп вправо — хочу приготувати, рецепт піде в Обране" />
            <TipRow icon="arrow-back" color={colors.nope} text="Свайп вліво — не цікаво, більше не покажемо" />
            <TipRow icon="arrow-up" color={colors.cooked} text="Свайп вгору — вже готував, можна оцінити" />
            <TipRow icon="information-circle-outline" color={colors.textDim} text="Тап по картці — інгредієнти, покрокове приготування та відео" />
            <GradientButton title="Зрозуміло" icon="checkmark" onPress={() => dispatch({ type: 'settings', settings: { onboarded: true } })} style={{ marginTop: 16 }} />
          </View>
        </Pressable>
      ) : null}

      {rateFor ? (
        <View style={[styles.rate, { bottom: bottomPad + 92 }]}>
          <Text style={styles.rateText} numberOfLines={1}>
            Як вийшло «{rateFor.name}»?
          </Text>
          <Stars
            size={24}
            value={0}
            onChange={(v) => {
              dispatch({ type: 'rate', id: rateFor.id, rating: v });
              haptic('success');
              askRating(null);
            }}
          />
        </View>
      ) : null}

      <View style={[styles.actions, { paddingBottom: bottomPad }]}>
        <RoundButton icon="arrow-undo" size={48} color={colors.gold} onPress={undo} disabled={!lastSwiped.current.length} />
        <RoundButton icon="close" size={66} color={colors.nope} onPress={() => deck.current?.swipe('nope')} disabled={!queue.length} iconSize={34} />
        <RoundButton icon="restaurant" size={52} color={colors.cooked} onPress={() => deck.current?.swipe('cooked')} disabled={!queue.length} iconSize={22} />
        <RoundButton icon="heart" size={66} color={colors.like} filled={gradients.brand} onPress={() => deck.current?.swipe('like')} disabled={!queue.length} iconSize={32} />
      </View>
    </View>
  );
}

function ModeChip({ icon, label, active, soft, onPress }: { icon: string; label: string; active?: boolean; soft?: boolean; onPress: () => void }) {
  // soft — увімкнено разом з іншим варіантом (показуємо і фільми, і серіали): лише обведення
  const filled = active && !soft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [styles.modeChip, filled && styles.modeChipActive, active && soft && styles.modeChipSoft, pressed && { opacity: 0.75 }]}
    >
      {filled ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      <Text style={styles.modeIcon}>{icon}</Text>
      <Text style={[styles.modeText, active && { color: filled ? '#fff' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function TipRow({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipIcon, { backgroundColor: color + '26' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexGrow: 0, marginTop: 12 },
  modesRow: { paddingHorizontal: 14, gap: 8 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modeChipActive: { borderColor: 'transparent' },
  modeChipSoft: { borderColor: colors.accent + 'AA', backgroundColor: colors.accent + '1A' },
  modeSep: { width: 1, height: 22, backgroundColor: colors.border, alignSelf: 'center', marginHorizontal: 2 },
  modeIcon: { fontSize: 15 },
  modeText: { color: colors.textDim, fontSize: 14, fontWeight: '800' },
  forYouHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 20, marginTop: 8 },
  tipWrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,7,6,0.74)', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 30 },
  tip: { width: '100%', maxWidth: 420, backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.border },
  tipTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  tipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, color: colors.textDim, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rate: { position: 'absolute', left: 24, right: 24, zIndex: 20, flexDirection: 'column', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: 'rgba(43,33,28,0.98)', borderWidth: 1, borderColor: colors.cooked + '88' },
  rateText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 16 },
  empty: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 12 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
});

