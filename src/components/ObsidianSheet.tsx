import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obsidianOf, obsidianOpenUrl, openUrl, SaveResult } from '../lib/obsidian';
import { useStore } from '../lib/store';
import { colors, gradients, radius } from '../theme';
import { Chip, GradientButton } from './ui';

export type SheetValues<S extends string> = { stage: S; rating: number | null; notes: string };

/** Вікно «В Obsidian»: стан, оцінка, свої думки → нотатка в базі. */
export function ObsidianSheet<S extends string>({
  visible,
  onClose,
  heading,
  stages,
  initial,
  ratingMax,
  notesLabel,
  notesPlaceholder,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  heading: string;
  stages?: { value: S; label: string }[];
  initial: SheetValues<S>;
  ratingMax: number;
  notesLabel: string;
  notesPlaceholder: string;
  onSave: (v: SheetValues<S>) => Promise<SaveResult>;
}) {
  const insets = useSafeAreaInsets();
  const { state } = useStore();
  const o = obsidianOf(state.settings.obsidian);
  const ready = o.method !== 'github' || !!o.token.trim();
  const [v, setV] = useState<SheetValues<S>>(initial);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SaveResult | null>(null);

  useEffect(() => {
    if (visible) {
      setV(initial);
      setRes(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    setBusy(true);
    const r = await onSave(v);
    setBusy(false);
    setRes(r);
    // на телефоні Obsidian можна відкрити одразу; у браузері — лише окремим дотиком
    if (r.ok && r.open && Platform.OS !== 'web') openUrl(r.open);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрити" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.head}>
            <Text style={styles.h1} numberOfLines={1}>
              💎 В Obsidian
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Закрити">
              <Ionicons name="close" size={24} color={colors.textDim} />
            </Pressable>
          </View>
          <Text style={styles.sub} numberOfLines={2}>
            {heading} → {o.folder}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            {!ready ? (
              <View style={styles.box}>
                <Text style={styles.text}>Спершу підключіть базу: один ключ GitHub, і нотатки самі потраплять в Obsidian на всіх пристроях.</Text>
                <GradientButton
                  title="Підключити базу"
                  icon="link-outline"
                  small
                  style={{ marginTop: 12, alignSelf: 'flex-start' }}
                  onPress={() => {
                    onClose();
                    router.push('/obsidian' as never);
                  }}
                />
              </View>
            ) : res?.ok ? (
              <View style={styles.box}>
                <Text style={[styles.text, { color: colors.like, fontWeight: '800' }]}>
                  ✓ {res.open ? 'Нотатка готова' : res.updated ? 'Оновлено в базі' : 'Збережено в базу'}: {res.path.split('/').pop()?.replace(/\.md$/, '')}
                </Text>
                <Text style={[styles.text, { marginTop: 6 }]}>
                  {res.open
                    ? 'Натисніть, щоб Obsidian створив нотатку.'
                    : o.method === 'github'
                      ? 'База забере її сама, щойно відкриєте Obsidian (і щохвилини, поки він відкритий). Якщо така нотатка вже є — вона доповниться, а не задвоїться.'
                      : 'Файл завантажено — перетягніть його в теку бази.'}
                </Text>
                {res.open || o.method === 'github' ? (
                  <GradientButton
                    title={res.open ? 'Відкрити Obsidian і зберегти' : 'Відкрити в Obsidian'}
                    icon="open-outline"
                    colorsPair={gradients.like}
                    small
                    style={{ marginTop: 12, alignSelf: 'flex-start' }}
                    onPress={() => openUrl(res.open ?? obsidianOpenUrl(o.vault, res.path))}
                  />
                ) : null}
              </View>
            ) : (
              <>
                {stages ? (
                  <>
                    <Text style={styles.label}>Статус</Text>
                    <View style={styles.row}>
                      {stages.map((s) => (
                        <Chip key={s.value} label={s.label} active={v.stage === s.value} onPress={() => setV({ ...v, stage: s.value })} />
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={styles.label}>Моя оцінка</Text>
                <View style={styles.stars}>
                  {Array.from({ length: ratingMax }, (_, i) => i + 1).map((n) => (
                    <Pressable key={n} hitSlop={4} onPress={() => setV({ ...v, rating: v.rating === n ? null : n })} accessibilityLabel={`Оцінка ${n}`}>
                      <Ionicons name={v.rating && n <= v.rating ? 'star' : 'star-outline'} size={ratingMax > 5 ? 24 : 30} color={colors.gold} />
                    </Pressable>
                  ))}
                  {v.rating ? <Text style={styles.ratingText}>{v.rating}/{ratingMax}</Text> : null}
                </View>
                <Text style={styles.label}>{notesLabel}</Text>
                <TextInput
                  value={v.notes}
                  onChangeText={(notes) => setV({ ...v, notes })}
                  placeholder={notesPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={styles.input}
                />
                {res && !res.ok ? <Text style={[styles.text, { color: colors.nope, marginTop: 10 }]}>⚠️ {res.error}</Text> : null}
                <GradientButton title={busy ? 'Зберігаю…' : 'Зберегти в базу'} icon="diamond-outline" onPress={busy ? undefined : save} style={{ marginTop: 16 }} />
                {busy ? <ActivityIndicator color={colors.textDim} style={{ marginTop: 10 }} /> : null}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: colors.text, fontSize: 20, fontWeight: '900', flex: 1 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 6 },
  box: { marginTop: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  text: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  stars: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  ratingText: { color: colors.text, fontWeight: '800', marginLeft: 8 },
  input: { color: colors.text, fontSize: 15, minHeight: 96, padding: 12, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top', outlineStyle: 'none' } as object,
});

/** Рядок у Профілі: стан підключення бази й перехід до налаштувань. */
export function ObsidianLink() {
  const { state } = useStore();
  const o = obsidianOf(state.settings.obsidian);
  const ok = o.method !== 'github' || (!!o.token && o.verified !== false);
  const sub =
    o.method === 'github'
      ? o.token
        ? o.verified === false
          ? '⚠️ Ключ не перевірено — натисніть, щоб перевірити'
          : `Зберігаю в базу · ${o.folder}`
        : '⚠️ База не підключена — натисніть, щоб підключити'
      : o.method === 'uri'
        ? `Через Obsidian на пристрої · ${o.folder}`
        : 'Файлом .md';
  return (
    <Pressable onPress={() => router.push('/obsidian' as never)} style={({ pressed }) => [linkStyles.card, pressed && { opacity: 0.8 }]}>
      <Ionicons name="diamond-outline" size={22} color={ok ? colors.like : colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={linkStyles.title}>Obsidian</Text>
        <Text style={linkStyles.sub} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const linkStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
