import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { openRecipe } from '../lib/nav';
import { areaOf, formatTime } from '../lib/recipes';
import { Recipe } from '../lib/types';
import { colors, radius } from '../theme';
import { Photo } from './ui';

export function Heading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.hRow}>
      <Text style={styles.h}>{children}</Text>
      {right}
    </View>
  );
}

export function Fact({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, { color }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type Mark = 'heart' | 'restaurant' | null;

/** Горизонтальна стрічка рецептів (схожі, добірки). */
export function RecipeRow({ title, items, mark }: { title: string; items: Recipe[]; mark?: (id: number) => Mark }) {
  if (!items.length) return null;
  return (
    <>
      <Heading>{title}</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {items.map((r) => (
          <RecipeTile key={r.id} r={r} width={132} mark={mark?.(r.id) ?? null} />
        ))}
      </ScrollView>
    </>
  );
}

export function RecipeTile({ r, width, mark, sub, onLongPress }: { r: Recipe; width: number; mark?: Mark; sub?: string; onLongPress?: () => void }) {
  return (
    <Pressable style={{ width }} onPress={() => openRecipe(r.id)} onLongPress={onLongPress}>
      <Photo uri={r.img} title={r.name} style={{ width, height: width }} />
      {mark ? (
        <View style={styles.mark}>
          <Ionicons name={mark} size={12} color="#fff" />
        </View>
      ) : null}
      <View style={styles.flag}>
        <Text style={{ fontSize: 13 }}>{areaOf(r.area).flag}</Text>
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {r.name}
      </Text>
      <Text style={styles.tileSub} numberOfLines={1}>
        {sub ?? `≈ ${formatTime(r.time)} · ${r.ingr.length} інгр.`}
      </Text>
    </Pressable>
  );
}

/** Рядок у списку (пошук, бібліотека). */
export function RecipeListItem({ r, right, sub, onPress }: { r: Recipe; right?: React.ReactNode; sub?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress ?? (() => openRecipe(r.id))} style={({ pressed }) => [styles.item, pressed && { opacity: 0.75 }]}>
      <Photo uri={r.img} style={styles.itemImg} rounded={radius.sm} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.itemName} numberOfLines={2}>
          {r.name}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          {sub ?? `${areaOf(r.area).flag} ${areaOf(r.area).uk} · ≈ ${formatTime(r.time)} · ${r.ingr.length} інгр.`}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  h: { color: colors.text, fontSize: 19, fontWeight: '800' },
  fact: { width: '48%', flexGrow: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  factLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  factValue: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  mark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  flag: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(14,11,10,0.7)' },
  tileName: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  tileSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  itemImg: { width: 64, height: 64 },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  itemSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600' },
});
