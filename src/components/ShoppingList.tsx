import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { openRecipe } from '../lib/nav';
import { getRecipe } from '../lib/recipes';
import { shareList } from '../lib/share';
import { useHaptics, useStore } from '../lib/store';
import { ShopItem } from '../lib/types';
import { colors, radius } from '../theme';
import { GhostButton, Toast } from './ui';

/** Список покупок: згрупований за рецептами, з відмітками «куплено». */
export function ShoppingList({ bottomPad }: { bottomPad: number }) {
  const { state, dispatch } = useStore();
  const haptic = useHaptics();
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const items = state.shopping;

  const groups = useMemo(() => {
    const map = new Map<number | null, ShopItem[]>();
    items.forEach((it) => map.set(it.recipeId, [...(map.get(it.recipeId) ?? []), it]));
    return [...map.entries()].sort((a, b) => (a[0] === null ? -1 : b[0] === null ? 1 : 0));
  }, [items]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    dispatch({ type: 'shopAdd', items: [{ name: t, amount: '', recipeId: null }] });
    setText('');
  };

  const share = async () => {
    const lines = items.filter((x) => !x.done).map((x) => `${x.name}${x.amount ? ` — ${x.amount}` : ''}`);
    const res = await shareList('Список покупок', lines);
    if (res === 'copied') {
      setToast('Список скопійовано');
      setTimeout(() => setToast(null), 2000);
    }
  };

  const done = items.filter((x) => x.done).length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad + 20 }} keyboardShouldPersistTaps="handled">
        <View style={styles.addRow}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={add} placeholder="Додати продукт вручну" placeholderTextColor={colors.textMuted} style={styles.addInput} returnKeyType="done" />
          <Pressable onPress={add} style={styles.addBtn} accessibilityLabel="Додати">
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        {!items.length ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 46 }}>🛒</Text>
            <Text style={styles.emptyText}>Список порожній. На сторінці рецепту натисніть «У список покупок» — інгредієнти з’являться тут, згруповані за стравами.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tools}>
              <GhostButton title="Поділитись" icon="share-outline" onPress={share} tight style={{ flex: 1 }} />
              {done ? (
                <GhostButton
                  title={`Прибрати куплене (${done})`}
                  icon="checkmark-done"
                  tight
                  onPress={() => {
                    dispatch({ type: 'shopClearDone' });
                    haptic('light');
                  }}
                  style={{ flex: 1.3 }}
                />
              ) : null}
            </View>
            {groups.map(([rid, list]) => {
              const r = rid ? getRecipe(rid) : null;
              return (
                <View key={String(rid)} style={styles.group}>
                  <View style={styles.groupHead}>
                    <Pressable onPress={r ? () => openRecipe(r.id) : undefined} style={{ flex: 1 }}>
                      <Text style={styles.groupTitle} numberOfLines={1}>
                        {r ? `🍽️ ${r.name}` : '📝 Інше'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => dispatch({ type: 'shopRemove', keys: list.map((x) => x.key) })} hitSlop={8} accessibilityLabel="Видалити групу">
                      <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  {list.map((it) => (
                    <Pressable
                      key={it.key}
                      onPress={() => {
                        dispatch({ type: 'shopToggle', key: it.key });
                        haptic('light');
                      }}
                      style={styles.item}
                    >
                      <Ionicons name={it.done ? 'checkbox' : 'square-outline'} size={22} color={it.done ? colors.like : colors.textMuted} />
                      <Text style={[styles.itemName, it.done && styles.struck]}>{it.name}</Text>
                      {it.amount ? <Text style={[styles.itemAmount, it.done && styles.struck]}>{it.amount}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      {toast ? <Toast text={toast} bottom={bottomPad + 10} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, height: 46, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15 },
  addBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: 8, marginTop: 12 },
  group: { marginTop: 16, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  groupTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemName: { flex: 1, color: colors.text, fontSize: 15 },
  itemAmount: { color: colors.gold, fontSize: 14, fontWeight: '700', maxWidth: '45%', textAlign: 'right' },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
