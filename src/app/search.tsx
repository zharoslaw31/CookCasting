import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecipeListItem } from '../components/RecipeParts';
import { Chip } from '../components/ui';
import { goBack } from '../lib/nav';
import { plural, RECIPES, search } from '../lib/recipes';
import { searchWorld } from '../lib/spoon';
import { toEnglish } from '../lib/translate';
import { Recipe } from '../lib/types';
import { useHaptics, useStore } from '../lib/store';
import { colors, radius } from '../theme';

const IDEAS = ['курка', 'паста', 'борщ', 'шоколад', 'суп', 'каррі', 'пиріг', 'креветки', 'сир', 'гриби', 'рис', 'баранина'];

/** Пошук рецепту за назвою (українською чи англійською), інгредієнтом, кухнею. */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { dispatch, isLiked, worldKey } = useStore();
  const haptic = useHaptics();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(typeof params.q === 'string' ? params.q : '');
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  const local = useMemo(() => (debounced.trim().length >= 2 ? search(debounced) : []), [debounced]);
  // світова база: запит перекладаємо англійською, результати — українською
  const [world, setWorld] = useState<{ q: string; items: Recipe[] } | null>(null);
  const [worldBusy, setWorldBusy] = useState(false);
  const [worldErr, setWorldErr] = useState<string | null>(null);
  const searchWorldNow = async () => {
    const query = debounced.trim();
    if (!worldKey || query.length < 2 || worldBusy) return;
    Keyboard.dismiss();
    setWorldBusy(true);
    setWorldErr(null);
    try {
      const found = await searchWorld(worldKey, await toEnglish(query), 20);
      setWorld({ q: query, items: found });
    } catch (e: any) {
      setWorldErr(e?.message ?? 'Світова база недоступна');
    } finally {
      setWorldBusy(false);
    }
  };
  const items = useMemo(() => {
    if (!world || world.q !== debounced.trim()) return local;
    const ids = new Set(local.map((r) => r.id));
    return [...local, ...world.items.filter((r) => !ids.has(r.id))];
  }, [local, world, debounced]);
  const worldShown = !!world && world.q === debounced.trim();
  const worldFooter =
    worldKey && debounced.trim().length >= 2 ? (
      <View style={styles.worldBox}>
        {worldBusy ? (
          <View style={styles.worldRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.worldText}>Шукаємо у світовій базі й перекладаємо…</Text>
          </View>
        ) : worldShown ? (
          <Text style={styles.worldText}>{world!.items.length ? `🌍 Зі світової бази: ${world!.items.length}` : '🌍 У світовій базі теж нічого не знайшлося'}</Text>
        ) : (
          <Pressable onPress={searchWorldNow} style={styles.worldBtn}>
            <Text style={styles.worldBtnText}>🌍 Шукати у світовій базі (360 000+ рецептів)</Text>
          </Pressable>
        )}
        {worldErr ? <Text style={[styles.worldText, { color: colors.nope }]}>{worldErr}</Text> : null}
      </View>
    ) : undefined;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.input}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Страва, інгредієнт або кухня"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => (local.length ? Keyboard.dismiss() : searchWorldNow())}
            autoCorrect={false}
            style={styles.inputText}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Очистити">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(r) => String(r.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 30 }}
        ListHeaderComponent={items.length ? <Text style={styles.count}>{`${items.length} ${plural(items.length, ['рецепт', 'рецепти', 'рецептів'])}`}</Text> : undefined}
        ListFooterComponent={worldFooter}
        ListEmptyComponent={
          <View style={styles.empty}>
            {debounced.trim().length >= 2 ? (
              <>
                <Text style={styles.emptyEmoji}>🤷</Text>
                <Text style={styles.emptyText}>{worldKey ? 'У вбудованій базі нічого. Пошукаймо у світовій 👇' : 'Нічого не знайдено. Спробуйте інше слово — можна й англійською.'}</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyEmoji}>🔎</Text>
                <Text style={styles.emptyTitle}>{`Пошук серед ${RECIPES.length} ${plural(RECIPES.length, ['рецепту', 'рецептів', 'рецептів'])}`}</Text>
                <Text style={styles.emptyText}>Шукайте за назвою страви, інгредієнтом чи кухнею. Наприклад:</Text>
                <View style={styles.ideas}>
                  {IDEAS.map((i) => (
                    <Chip key={i} label={i} onPress={() => setQ(i)} />
                  ))}
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const liked = isLiked(item.id);
          return (
            <RecipeListItem
              r={item}
              right={
                <Pressable
                  hitSlop={6}
                  accessibilityLabel={liked ? 'Прибрати з обраного' : 'В обране'}
                  onPress={() => {
                    dispatch({ type: 'toggle', id: item.id, list: 'liked' });
                    haptic(liked ? 'light' : 'success');
                  }}
                  style={[styles.act, liked && { backgroundColor: colors.accent + '33', borderColor: colors.accent }]}
                >
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? colors.accent : colors.textDim} />
                </Pressable>
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  inputText: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  count: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  empty: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 46 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 },
  worldBox: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  worldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  worldText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  worldBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accent + '1A' },
  worldBtnText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  act: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginLeft: 8 },
});
