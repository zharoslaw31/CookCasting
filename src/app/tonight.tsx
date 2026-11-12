import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostButton, GradientButton } from '../components/ui';
import { goBack, openRecipe } from '../lib/nav';
import { areaOf, buildTaste, catOf, DIFFICULTY_LABEL, difficulty, formatTime, allRecipes, REGIONS, shuffle, tasteScore } from '../lib/recipes';
import { useHaptics, useStore } from '../lib/store';
import { Flag, Recipe } from '../lib/types';
import { colors, gradients, radius } from '../theme';

const MAIN_CATS = ['Beef', 'Chicken', 'Lamb', 'Pork', 'Seafood', 'Pasta', 'Vegetarian', 'Vegan', 'Goat', 'Miscellaneous'];
const isSoup = (r: Recipe) => /soup|broth|chowder|borscht|bisque|ramen|pho|stew/i.test(r.nameEn) || r.tags.some((t) => /суп/i.test(t));

type Meal = { id: string; emoji: string; label: string; test: (r: Recipe) => boolean };
const MEALS: Meal[] = [
  { id: 'breakfast', emoji: '🍳', label: 'Сніданок', test: (r) => r.cat === 'Breakfast' || r.tags.some((t) => /сніданок|бранч/i.test(t)) },
  { id: 'main', emoji: '🍲', label: 'Основна страва', test: (r) => MAIN_CATS.includes(r.cat) && !isSoup(r) },
  { id: 'soup', emoji: '🥣', label: 'Суп', test: isSoup },
  { id: 'dessert', emoji: '🍰', label: 'Десерт', test: (r) => r.cat === 'Dessert' },
  { id: 'snack', emoji: '🥗', label: 'Закуска чи гарнір', test: (r) => r.cat === 'Starter' || r.cat === 'Side' },
  { id: 'any', emoji: '🎲', label: 'Будь-що', test: () => true },
];
const TIMES = [
  { id: 'fast', label: '⚡ До 30 хв', max: 30 },
  { id: 'hour', label: 'До 1 год', max: 60 },
  { id: 'any', label: 'Не поспішаю', max: null as number | null },
];
const CUISINES = [
  { id: 'any', label: '🌍 Будь-яка' },
  ...REGIONS.map((r) => ({ id: r.id, label: `${r.icon} ${r.label}` })),
  { id: 'ua', label: '🇺🇦 Українська' },
];
const DIET: { id: string; label: string; without: Flag[] }[] = [
  { id: 'any', label: 'Без обмежень', without: [] },
  { id: 'veg', label: '🥦 Без м’яса', without: ['meat', 'pork', 'fish'] },
  { id: 'nodairy', label: '🥛 Без молочного', without: ['dairy'] },
  { id: 'gf', label: '🌾 Без глютену', without: ['gluten'] },
  { id: 'mild', label: '🧒 Не гостре', without: ['spicy', 'alcohol'] },
];

type Pick = { r: Recipe; reason: string };

/** «Що приготувати?»: тип страви + час + кухня + обмеження → 5 варіантів з Обраного та з усієї бази. */
export default function TonightScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, dispatch, isLiked, isDisliked } = useStore();
  const haptic = useHaptics();
  const [meal, setMeal] = useState('main');
  const [time, setTime] = useState('any');
  const [cuisine, setCuisine] = useState('any');
  const [diet, setDiet] = useState('any');
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const pool = useRef<Pick[]>([]);
  const scroll = useRef<ScrollViewInstance>(null);
  const cardTops = useRef<Record<number, number>>({});
  const taste = useMemo(() => buildTaste(state.liked.map((e) => e.id), state.cooked, state.disliked.map((e) => e.id)), [state.liked, state.cooked, state.disliked]);

  const fits = (r: Recipe) => {
    const m = MEALS.find((x) => x.id === meal)!;
    const t = TIMES.find((x) => x.id === time)!;
    const d = DIET.find((x) => x.id === diet)!;
    if (!m.test(r)) return false;
    if (t.max && r.time > t.max) return false;
    if (d.without.some((f) => r.flags.includes(f))) return false;
    if (cuisine === 'ua') return r.area === 'Ukrainian';
    if (cuisine !== 'any') return REGIONS.find((x) => x.id === cuisine)!.areas.includes(r.area);
    return true;
  };

  const find = () => {
    setError(null);
    setChosen(null);
    haptic('light');
    const all = allRecipes().filter((r) => fits(r) && !isDisliked(r.id));
    const fromLiked: Pick[] = shuffle(all.filter((r) => isLiked(r.id)))
      .slice(0, 6)
      .map((r) => ({ r, reason: '❤️ З вашого Обраного' }));
    const hasTaste = taste.size > 0;
    const fromBase: Pick[] = all
      .filter((r) => !isLiked(r.id))
      .map((r) => ({ r, s: tasteScore(r, taste) + Math.random() * 2.2 }))
      .sort((a, b) => b.s - a.s)
      .map(({ r }) => ({
        r,
        reason: hasTaste && tasteScore(r, taste) > 1 ? '✨ Схоже на ваш смак' : r.time <= 30 ? '⚡ Швидко' : difficulty(r) === 1 ? '👌 Просто' : r.video ? '▶️ Є відеорецепт' : '🍽️ Добрий вибір',
      }));
    const nLiked = Math.min(2, fromLiked.length);
    const first = [...fromLiked.slice(0, nLiked), ...fromBase.slice(0, 5 - nLiked)];
    pool.current = [...fromLiked.slice(nLiked), ...fromBase.slice(5 - nLiked)];
    setPicks(first);
    if (!first.length) setError('Під ці побажання нічого не знайшлось. Спробуйте іншу кухню чи більше часу.');
    setTimeout(() => scroll.current?.scrollTo({ y: 0, animated: true }), 50);
  };

  const replace = (i: number) => {
    const next = pool.current.shift();
    if (!next || !picks) return;
    haptic('light');
    setPicks(picks.map((p, k) => (k === i ? next : p)));
    if (chosen === i) setChosen(null);
  };

  const more = () => {
    if (pool.current.length < 3) return find();
    setPicks(pool.current.splice(0, 5));
    setChosen(null);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const decideForMe = () => {
    if (!picks?.length) return;
    let n = 0;
    const steps = 9 + Math.floor(Math.random() * picks.length);
    const tick = () => {
      setChosen(n % picks.length);
      haptic('light');
      n++;
      if (n <= steps) setTimeout(tick, 70 + n * 12);
      else {
        const idx = (n - 1) % picks.length;
        haptic('success');
        const y = cardTops.current[idx];
        if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
      }
    };
    tick();
  };

  const cookThis = (r: Recipe) => {
    if (!isLiked(r.id)) dispatch({ type: 'toggle', id: r.id, list: 'liked' });
    haptic('success');
    openRecipe(r.id);
  };

  const cardW = Math.min(width, 640) - 32;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={picks ? () => setPicks(null) : goBack} hitSlop={10} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{picks ? 'Ваші варіанти' : 'Що приготувати?'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 640 }}>
          {!picks ? (
            <>
              <Text style={styles.lead}>Кілька швидких питань — і ми запропонуємо 5 страв: з вашого Обраного та з усієї бази, з урахуванням вашого смаку.</Text>
              <Text style={styles.q}>Що готуємо?</Text>
              <View style={styles.moodGrid}>
                {MEALS.map((m) => {
                  const on = meal === m.id;
                  return (
                    <Pressable key={m.id} onPress={() => setMeal(m.id)} style={({ pressed }) => [styles.mood, on && styles.moodOn, pressed && { opacity: 0.8 }]}>
                      {on ? <LinearGradient colors={[colors.accent + '40', colors.accent2 + '30']} style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]} /> : null}
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={[styles.moodLabel, on && { color: colors.text }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.q}>Скільки є часу?</Text>
              <Options items={TIMES} value={time} onChange={setTime} />
              <Text style={styles.q}>Яка кухня?</Text>
              <Options items={CUISINES} value={cuisine} onChange={setCuisine} />
              <Text style={styles.q}>Обмеження</Text>
              <Options items={DIET} value={diet} onChange={setDiet} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {picks.map((p, i) => (
                <View key={p.r.id} onLayout={(e) => (cardTops.current[i] = e.nativeEvent.layout.y)} style={[styles.card, { width: cardW }, chosen === i && styles.cardChosen]}>
                  <Pressable onPress={() => openRecipe(p.r.id)}>
                    <View style={{ height: cardW * 0.55 }}>
                      <Image source={{ uri: p.r.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <LinearGradient colors={['transparent', 'rgba(24,19,17,0.95)']} style={StyleSheet.absoluteFill} />
                      <View style={styles.reason}>
                        <Text style={styles.reasonText}>{p.reason}</Text>
                      </View>
                      {chosen === i ? (
                        <View style={styles.chosenBadge}>
                          <Text style={styles.chosenText}>🎯 Готуємо це!</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.title} numberOfLines={2}>
                        {p.r.name}
                      </Text>
                      <Text style={styles.meta}>
                        {areaOf(p.r.area).flag} {areaOf(p.r.area).uk} · {catOf(p.r.cat).uk} · ≈ {formatTime(p.r.time)} · {DIFFICULTY_LABEL[difficulty(p.r)]}
                      </Text>
                      <Text style={styles.overview} numberOfLines={2}>
                        {p.r.ingr.map((x) => x.n.toLocaleLowerCase('uk')).join(', ')}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => replace(i)} style={[styles.smallBtn, styles.iconBtn]} disabled={!pool.current.length} accessibilityLabel="Інший варіант">
                      <Ionicons name="refresh" size={18} color={pool.current.length ? colors.textDim : colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => openRecipe(p.r.id)} style={styles.smallBtn}>
                      <Ionicons name="book-outline" size={16} color={colors.textDim} />
                      <Text style={styles.smallText}>Рецепт</Text>
                    </Pressable>
                    <GradientButton title="Готую це!" icon="flame" small onPress={() => cookThis(p.r)} style={{ flex: 1 }} colorsPair={chosen === i ? gradients.like : gradients.brand} />
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {picks ? (
          <>
            <GhostButton title="Ще варіанти" icon="refresh" onPress={more} style={{ flex: 1 }} tight />
            <GradientButton title="Обери за мене" icon="dice-outline" onPress={decideForMe} style={{ flex: 1.2 }} tight />
          </>
        ) : (
          <GradientButton title="Підібрати страви" icon="sparkles" onPress={find} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

function Options<T extends { id: string; label: string }>({ items, value, onChange }: { items: T[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.options}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <Pressable key={it.id} onPress={() => onChange(it.id)} style={[styles.option, on && styles.optionOn]}>
            <Text style={[styles.optionText, on && { color: colors.text }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  lead: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 4 },
  q: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 22, marginBottom: 12 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mood: { width: '47.5%', flexGrow: 1, height: 74, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 14, overflow: 'hidden' },
  moodOn: { borderColor: colors.accent },
  moodEmoji: { fontSize: 24 },
  moodLabel: { color: colors.textDim, fontSize: 14, fontWeight: '800', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accent + '26' },
  optionText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  error: { color: colors.nope, fontSize: 14, marginTop: 16, textAlign: 'center' },
  card: { alignSelf: 'center', marginTop: 14, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  cardChosen: { borderColor: colors.like, borderWidth: 2 },
  reason: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(14,11,10,0.78)' },
  reasonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chosenBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.like },
  chosenText: { color: '#06281D', fontSize: 12, fontWeight: '900' },
  cardBody: { paddingHorizontal: 14, marginTop: -26 },
  title: { color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  overview: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 8 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  iconBtn: { width: 40, paddingHorizontal: 0, justifyContent: 'center' },
  smallText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg + 'F2', borderTopWidth: 1, borderTopColor: colors.border },
});
