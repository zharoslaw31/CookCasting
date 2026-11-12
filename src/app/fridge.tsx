import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecipeListItem } from '../components/RecipeParts';
import { Toast } from '../components/ui';
import { goBack } from '../lib/nav';
import { byPantry, ingredientImage, ingredientUk, plural, searchIngredients } from '../lib/recipes';
import { useHaptics, useStore } from '../lib/store';
import { colors, radius } from '../theme';

/** «Що є вдома»: обираєте продукти — бачите, що з них приготувати і чого бракує. */
export default function FridgeScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const haptic = useHaptics();
  const pantry = state.settings.pantry ?? [];
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const suggestions = useMemo(() => searchIngredients(q).filter((i) => !pantry.includes(i.key)).slice(0, q ? 40 : 30), [q, pantry]);
  const results = useMemo(() => byPantry(pantry, state.filters.without.length ? { ...emptyFilters, without: state.filters.without } : undefined).slice(0, 60), [pantry, state.filters.without]);

  const setPantry = (p: string[]) => dispatch({ type: 'settings', settings: { pantry: p } });
  const toggle = (key: string) => {
    haptic('light');
    setPantry(pantry.includes(key) ? pantry.filter((k) => k !== key) : [...pantry, key]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>🧺 Що є вдома</Text>
        {pantry.length ? (
          <Pressable onPress={() => setPantry([])} hitSlop={10}>
            <Text style={styles.reset}>Очистити</Text>
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(x) => String(x.r.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 30 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.lead}>Оберіть продукти, які у вас є, — покажемо рецепти, для яких майже все вже є. Сіль, перець, олію й воду враховувати не треба.</Text>
            {pantry.length ? (
              <View style={styles.wrap}>
                {pantry.map((k) => (
                  <Pressable key={k} onPress={() => toggle(k)} style={[styles.pill, styles.pillOn]}>
                    <Text style={styles.pillTextOn}>{ingredientUk(k)}</Text>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.input}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Додати продукт: курка, рис, сир…" placeholderTextColor={colors.textMuted} autoCorrect={false} style={styles.inputText} />
              {q ? (
                <Pressable onPress={() => setQ('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal={!q} showsHorizontalScrollIndicator={false} contentContainerStyle={q ? styles.wrap : { gap: 8, paddingRight: 16 }} keyboardShouldPersistTaps="handled">
              {suggestions.map((i) => (
                <Pressable
                  key={i.key}
                  onPress={() => {
                    toggle(i.key);
                    if (q) {
                      setQ('');
                      setToast(`Додано: ${i.uk}`);
                      setTimeout(() => setToast(null), 1500);
                    }
                  }}
                  style={[styles.pill, !q && { marginBottom: 0 }]}
                >
                  <Image source={{ uri: ingredientImage(i.en) }} style={{ width: 20, height: 20 }} contentFit="contain" />
                  <Text style={styles.pillText}>{i.uk}</Text>
                </Pressable>
              ))}
              {q && !suggestions.length ? <Text style={styles.muted}>Такого продукту в рецептах немає</Text> : null}
            </ScrollView>
            {pantry.length ? (
              <Text style={styles.count}>{results.length ? `${results.length} ${plural(results.length, ['рецепт', 'рецепти', 'рецептів'])} — спершу ті, де бракує найменше` : 'Поки нічого не знайшлось — додайте ще продуктів'}</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RecipeListItem
            r={item.r}
            sub={item.missing.length ? `Бракує: ${item.missing.map((m) => m.n.toLocaleLowerCase('uk')).join(', ')}` : '✅ Усе є!'}
            right={
              <View style={[styles.badge, !item.missing.length && { backgroundColor: colors.like + '33', borderColor: colors.like }]}>
                <Text style={[styles.badgeText, !item.missing.length && { color: colors.like }]}>{item.missing.length ? `−${item.missing.length}` : '✓'}</Text>
              </View>
            }
          />
        )}
      />
      {toast ? <Toast text={toast} bottom={Math.max(insets.bottom, 14) + 20} /> : null}
    </View>
  );
}

const emptyFilters = { areas: [], excludeAreas: [], cats: [], excludeCats: [], maxTime: null, maxIngr: null, without: [], withVideo: false, sortBy: 'random' as const };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  reset: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  lead: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, marginBottom: 2 },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  pillTextOn: { color: '#fff', fontSize: 14, fontWeight: '800' },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, marginVertical: 12 },
  inputText: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  muted: { color: colors.textMuted, fontSize: 14 },
  count: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 4 },
  badge: { minWidth: 40, height: 30, paddingHorizontal: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold + '22', borderWidth: 1, borderColor: colors.gold + '88', marginLeft: 8 },
  badgeText: { color: colors.gold, fontWeight: '900', fontSize: 13 },
});
