import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingList } from '../../components/ShoppingList';
import { Chip, GhostButton, GradientButton, Photo, Segmented } from '../../components/ui';
import { openRecipe } from '../../lib/nav';
import { areaOf, formatTime, getRecipe, plural } from '../../lib/recipes';
import { ListName, useHaptics, useStore } from '../../lib/store';
import { LibraryEntry, Recipe } from '../../lib/types';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

type Sort = 'recent' | 'quick' | 'mine' | 'title';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Нещодавні' },
  { value: 'quick', label: 'Найшвидші' },
  { value: 'mine', label: 'Моя оцінка' },
  { value: 'title', label: 'А–Я' },
];
type Tab = ListName | 'shop';
type Row = LibraryEntry & { r: Recipe };
type Undo = { entries: LibraryEntry[]; list: ListName; text: string } | null;

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, dispatch, isCooked } = useStore();
  const haptic = useHaptics();
  const [tab, setTab] = useState<Tab>('liked');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [hideCooked, setHideCooked] = useState(false);
  const [undo, setUndo] = useState<Undo>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cols = width > 700 ? 5 : width > 480 ? 4 : 3;
  const gap = 10;
  const cardW = (Math.min(width, 1100) - 32 - gap * (cols - 1)) / cols;
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 12;
  const shopLeft = state.shopping.filter((x) => !x.done).length;

  useEffect(() => setArea(null), [tab]);

  const source: Row[] = useMemo(() => {
    if (tab === 'shop') return [];
    return state[tab].map((e) => ({ ...e, r: getRecipe(e.id)! })).filter((e) => !!e.r);
  }, [state, tab]);

  const areasHere = useMemo(() => {
    const count = new Map<string, number>();
    source.forEach((e) => count.set(e.r.area, (count.get(e.r.area) ?? 0) + 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
  }, [source]);

  const data = useMemo(() => {
    let list = [...source];
    const q = query.trim().toLocaleLowerCase('uk');
    if (q) list = list.filter((e) => `${e.r.name} ${e.r.nameEn} ${e.r.ingr.map((i) => i.n).join(' ')}`.toLocaleLowerCase('uk').includes(q));
    if (area) list = list.filter((e) => e.r.area === area);
    if (tab === 'liked' && hideCooked) list = list.filter((e) => !isCooked(e.id));
    const by: Record<Sort, (a: Row, b: Row) => number> = {
      recent: (a, b) => b.at - a.at,
      quick: (a, b) => a.r.time - b.r.time,
      mine: (a, b) => (b.myRating ?? 0) - (a.myRating ?? 0) || b.at - a.at,
      title: (a, b) => a.r.name.localeCompare(b.r.name, 'uk'),
    };
    return list.sort(by[sort]);
  }, [source, query, area, sort, tab, hideCooked, isCooked]);

  const removeEntry = (e: Row) => {
    if (tab === 'shop') return;
    dispatch({ type: 'remove', id: e.id, list: tab });
    haptic('warning');
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ entries: [{ id: e.id, at: e.at, myRating: e.myRating }], list: tab, text: `«${e.r.name}» видалено` });
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };

  const pickRandom = () => {
    const pool = state.liked.filter((e) => !isCooked(e.id));
    const list = pool.length ? pool : state.liked;
    if (!list.length) return;
    haptic('light');
    openRecipe(list[Math.floor(Math.random() * list.length)].id);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, width < 380 && { fontSize: 24 }]}>Бібліотека</Text>
        {state.liked.length && tab === 'liked' ? (
          <Pressable onPress={pickRandom} accessibilityLabel="Що приготувати з Обраного?" style={({ pressed }) => [styles.diceBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="dice-outline" size={18} color={colors.text} />
            <Text style={styles.diceText}>Що приготувати?</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          compact
          options={[
            { value: 'liked', label: width < 400 ? 'Обране' : '❤️ Обране', count: state.liked.length },
            { value: 'cooked', label: width < 400 ? 'Готував' : '🍳 Готував', count: state.cooked.length },
            { value: 'shop', label: width < 400 ? 'Покупки' : '🛒 Покупки', count: shopLeft || undefined },
            { value: 'disliked', label: '✕ Ні', count: state.disliked.length },
          ]}
        />
        {tab !== 'shop' ? (
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Пошук у бібліотеці" placeholderTextColor={colors.textMuted} style={styles.search} />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {tab === 'shop' ? (
        <ShoppingList bottomPad={bottomPad} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
            {SORTS.filter((s) => s.value !== 'mine' || tab === 'cooked').map((s) => (
              <Chip key={s.value} label={s.label} active={sort === s.value} onPress={() => setSort(s.value)} />
            ))}
            {tab === 'liked' ? <Chip label="Без приготованих" icon="🙈" active={hideCooked} onPress={() => setHideCooked((v) => !v)} /> : null}
          </ScrollView>
          {areasHere.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
              <Chip label="Усі кухні" active={!area} onPress={() => setArea(null)} />
              {areasHere.map((a) => (
                <Chip key={a} label={areaOf(a).uk} icon={areaOf(a).flag} active={area === a} onPress={() => setArea(area === a ? null : a)} />
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.summary}>
            {data.length} {plural(data.length, ['рецепт', 'рецепти', 'рецептів'])}
          </Text>

          <FlatList
            key={`grid-${cols}`}
            data={data}
            numColumns={cols}
            keyExtractor={(e) => String(e.id)}
            columnWrapperStyle={{ gap }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: bottomPad + 20, gap }}
            ListEmptyComponent={<Empty tab={tab} filtered={!!query || !!area || hideCooked} />}
            renderItem={({ item }) => (
              <Pressable style={({ pressed }) => [{ width: cardW, opacity: pressed ? 0.8 : 1 }]} onPress={() => openRecipe(item.id)}>
                <View>
                  <Photo uri={item.r.img} title={item.r.name} style={{ width: cardW, height: cardW }} />
                  <View style={styles.flag}>
                    <Text style={{ fontSize: 12 }}>{areaOf(item.r.area).flag}</Text>
                  </View>
                  <Pressable onPress={() => removeEntry(item)} hitSlop={8} style={styles.cardDelete} accessibilityLabel="Видалити">
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                  {tab === 'liked' && isCooked(item.id) ? (
                    <View style={styles.cookedMark}>
                      <Ionicons name="restaurant" size={11} color="#fff" />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.r.name}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.myRating ? `${'★'.repeat(item.myRating)}  ` : ''}≈ {formatTime(item.r.time)}
                </Text>
              </Pressable>
            )}
          />

          {undo ? (
            <UndoBar
              bottom={bottomPad}
              text={undo.text}
              onUndo={() => {
                dispatch({ type: 'restore', entries: undo.entries, list: undo.list });
                setUndo(null);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function UndoBar({ bottom, text, onUndo }: { bottom: number; text: string; onUndo: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [anim]);
  return (
    <Animated.View style={[styles.undo, { bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      <Ionicons name="trash-outline" size={18} color={colors.textDim} />
      <Text style={styles.undoText} numberOfLines={1}>
        {text}
      </Text>
      <Pressable onPress={onUndo} hitSlop={10}>
        <Text style={styles.undoBtn}>Скасувати</Text>
      </Pressable>
    </Animated.View>
  );
}

function Empty({ tab, filtered }: { tab: ListName; filtered: boolean }) {
  const text = filtered
    ? 'Нічого не знайдено. Спробуйте змінити пошук або фільтр.'
    : tab === 'liked'
      ? 'Свайпайте вправо в «Кастингу» або ставте ❤️ у відео — рецепти, які хочете приготувати, з’являться тут.'
      : tab === 'cooked'
        ? 'Свайп вгору або кнопка «Готував» позначає рецепт як приготований — потім його можна оцінити.'
        : 'Тут зберігається те, що ви відхилили.';
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 46 }}>{filtered ? '🔍' : tab === 'liked' ? '💘' : tab === 'cooked' ? '🍳' : '🗑️'}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {!filtered && tab !== 'disliked' ? <GradientButton title="До кастингу" icon="flame" small onPress={() => router.push('/')} style={{ marginTop: 16 }} colorsPair={gradients.brand} /> : null}
      {tab !== 'disliked' ? <GhostButton title="Знайти рецепт" icon="search" onPress={() => router.push('/search')} style={{ marginTop: 10 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14, minHeight: 44 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  diceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  diceText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 14, height: 44, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  chipsScroll: { flexGrow: 0, marginTop: 10 },
  chipsRow: { paddingHorizontal: 16 },
  summary: { color: colors.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, marginTop: 2, marginBottom: 4 },
  flag: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(14,11,10,0.7)' },
  cardDelete: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(14,11,10,0.75)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  cookedMark: { position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cooked, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  undo: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: '#33261F', borderWidth: 1, borderColor: colors.border, maxWidth: 560, alignSelf: 'center' },
  undoText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  undoBtn: { color: colors.accent, fontSize: 14, fontWeight: '900' },
  empty: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 30 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
