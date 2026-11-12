import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GhostButton, GradientButton, SectionTitle } from '../components/ui';
import { goBack } from '../lib/nav';
import { AREAS, CATEGORIES, DIETS, FLAGS, matches, plural, allRecipes } from '../lib/recipes';
import { useStore } from '../lib/store';
import { DEFAULT_FILTERS, Filters, Flag, SortBy } from '../lib/types';
import { colors } from '../theme';

const TIMES: { label: string; value: number | null }[] = [
  { label: 'Будь-який', value: null },
  { label: 'до 20 хв', value: 20 },
  { label: 'до 30 хв', value: 30 },
  { label: 'до 45 хв', value: 45 },
  { label: 'до 1 год', value: 60 },
  { label: 'до 2 год', value: 120 },
];
const INGR: { label: string; value: number | null }[] = [
  { label: 'Будь-яка', value: null },
  { label: 'до 5', value: 5 },
  { label: 'до 8', value: 8 },
  { label: 'до 12', value: 12 },
];
const SORTS: { value: SortBy; label: string; icon: string }[] = [
  { value: 'random', label: 'Випадково', icon: '🎲' },
  { value: 'quick', label: 'Спершу швидкі', icon: '⚡' },
  { value: 'simple', label: 'Спершу прості', icon: '👌' },
  { value: 'complex', label: 'Спершу складні', icon: '👨‍🍳' },
  { value: 'video', label: 'Спершу з відео', icon: '▶️' },
];

export default function FiltersScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch, worldKey } = useStore();
  const world = !!worldKey && state.settings.world !== false;
  const [f, setF] = useState<Filters>(state.filters);
  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));
  const count = useMemo(() => allRecipes().filter((r) => matches(r, f)).length, [f]);

  // тап: увімкнути → виключити → нейтрально
  const cycle = (id: string, inc: string[], exc: string[]) => {
    if (inc.includes(id)) return { inc: inc.filter((x) => x !== id), exc: [...exc, id] };
    if (exc.includes(id)) return { inc, exc: exc.filter((x) => x !== id) };
    return { inc: [...inc, id], exc };
  };
  const toggleArea = (id: string) => {
    const { inc, exc } = cycle(id, f.areas, f.excludeAreas);
    set({ areas: inc, excludeAreas: exc });
  };
  const toggleCat = (id: string) => {
    const { inc, exc } = cycle(id, f.cats, f.excludeCats);
    set({ cats: inc, excludeCats: exc });
  };
  const toggleFlag = (id: Flag) => set({ without: f.without.includes(id) ? f.without.filter((x) => x !== id) : [...f.without, id] });
  const dietOn = (w: Flag[]) => w.every((x) => f.without.includes(x));
  const toggleDiet = (w: Flag[]) => set({ without: dietOn(w) ? f.without.filter((x) => !w.includes(x)) : [...new Set([...f.without, ...w])] });

  const apply = () => {
    dispatch({ type: 'filters', filters: f });
    goBack();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} hitSlop={12} accessibilityLabel="Закрити">
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Фільтри</Text>
        <Pressable onPress={() => setF(DEFAULT_FILTERS)} hitSlop={12}>
          <Text style={styles.reset}>Скинути</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <SectionTitle>Порядок</SectionTitle>
        <View style={styles.wrap}>
          {SORTS.map((s) => (
            <Chip key={s.value} label={s.label} icon={s.icon} active={f.sortBy === s.value} onPress={() => set({ sortBy: s.value })} />
          ))}
        </View>

        <SectionTitle>Харчування</SectionTitle>
        <View style={styles.wrap}>
          {DIETS.map((d) => (
            <Chip key={d.id} label={d.label} icon={d.icon} active={dietOn(d.without)} onPress={() => toggleDiet(d.without)} />
          ))}
        </View>
        <Text style={styles.hint}>Або окремо — без чого:</Text>
        <View style={styles.wrap}>
          {FLAGS.map((fl) => (
            <Chip key={fl.id} label={`без ${fl.label}`} icon={fl.icon} tone="nope" active={f.without.includes(fl.id)} onPress={() => toggleFlag(fl.id)} />
          ))}
        </View>

        <SectionTitle>Час приготування</SectionTitle>
        <View style={styles.wrap}>
          {TIMES.map((t) => (
            <Chip key={t.label} label={t.label} active={f.maxTime === t.value} onPress={() => set({ maxTime: t.value })} />
          ))}
        </View>

        <SectionTitle>Кількість інгредієнтів</SectionTitle>
        <View style={styles.wrap}>
          {INGR.map((t) => (
            <Chip key={t.label} label={t.label} active={f.maxIngr === t.value} onPress={() => set({ maxIngr: t.value })} />
          ))}
        </View>

        <SectionTitle>Відео</SectionTitle>
        <View style={styles.wrap}>
          <Chip label="Будь-які" active={!f.withVideo} onPress={() => set({ withVideo: false })} />
          <Chip label="Лише з відеорецептом" icon="▶️" active={f.withVideo} onPress={() => set({ withVideo: true })} />
        </View>

        <SectionTitle>Категорії</SectionTitle>
        <Text style={styles.hint}>Тап — включити, ще тап — виключити, ще — скинути</Text>
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={f.excludeCats.includes(c.id) ? `без: ${c.uk}` : `${c.uk} · ${c.count}`}
              icon={c.emoji}
              active={f.cats.includes(c.id) || f.excludeCats.includes(c.id)}
              tone={f.excludeCats.includes(c.id) ? 'nope' : 'brand'}
              onPress={() => toggleCat(c.id)}
            />
          ))}
        </View>

        <SectionTitle>Кухні світу</SectionTitle>
        <Text style={styles.hint}>Тап — включити, ще тап — виключити, ще — скинути</Text>
        <View style={styles.wrap}>
          {AREAS.map((a) => (
            <Chip
              key={a.id}
              label={f.excludeAreas.includes(a.id) ? `без: ${a.uk}` : a.count ? `${a.uk} · ${a.count}` : `${a.uk} 🌍`}
              icon={a.flag}
              active={f.areas.includes(a.id) || f.excludeAreas.includes(a.id)}
              tone={f.excludeAreas.includes(a.id) ? 'nope' : 'brand'}
              onPress={() => toggleArea(a.id)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <GhostButton title="Скасувати" onPress={() => goBack()} style={{ flex: 1 }} />
        <GradientButton
          title={count ? `Показати ${count}${world ? '+' : ''} ${plural(count, ['рецепт', 'рецепти', 'рецептів'])}` : world ? 'Шукати у світовій базі' : 'Нічого не знайдено'}
          icon="sparkles"
          onPress={count || world ? apply : undefined}
          style={{ flex: 2, opacity: count || world ? 1 : 0.5 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  reset: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: -6, marginBottom: 10 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: colors.bg + 'F2',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
