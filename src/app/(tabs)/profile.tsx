import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountCard } from '../../components/AccountCard';
import { SectionTitle } from '../../components/ui';
import { AREAS, areaOf, catOf, DB, EXTRA, getRecipe, RECIPES } from '../../lib/recipes';
import { ENV_SPOON_KEY, validateSpoonKey } from '../../lib/spoon';
import { useStore } from '../../lib/store';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

const AVATARS = ['👩‍🍳', '👨‍🍳', '🧑‍🍳', '🍕', '🍣', '🥐', '🌮', '🍜', '🧁', '🥗', '🐻', '🦊'];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.profile.name);

  const stats = useMemo(() => {
    const likes = state.liked.length;
    const nopes = state.disliked.length;
    const swipes = state.history.length;
    const totalDecisions = likes + nopes;
    const cookedRecipes = state.cooked.map((e) => getRecipe(e.id)).filter(Boolean);
    const minutes = cookedRecipes.reduce((s, r) => s + (r?.time ?? 0), 0);

    const areaCount = new Map<string, number>();
    const catCount = new Map<string, number>();
    [...state.liked, ...state.cooked].forEach((e) => {
      const r = getRecipe(e.id);
      if (!r) return;
      areaCount.set(r.area, (areaCount.get(r.area) ?? 0) + 1);
      catCount.set(r.cat, (catCount.get(r.cat) ?? 0) + 1);
    });
    const topAreas = [...areaCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topCats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const cuisinesCooked = new Set(cookedRecipes.map((r) => r!.area)).size;

    const days: { label: string; count: number }[] = [];
    const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      days.push({ label: dayNames[d.getDay()], count: state.history.filter((h) => h.at >= start && h.at < end).length });
    }

    const rated = state.cooked.filter((e) => e.myRating);
    const myAvg = rated.length ? rated.reduce((s, e) => s + (e.myRating ?? 0), 0) / rated.length : 0;

    return {
      likes,
      nopes,
      swipes,
      likeRate: totalDecisions ? Math.round((likes / totalDecisions) * 100) : 0,
      hours: Math.round(minutes / 60),
      cooked: state.cooked.length,
      cuisinesCooked,
      topAreas,
      topCats,
      days,
      myAvg,
    };
  }, [state]);

  const level = levelFor(stats.swipes + state.cooked.length * 5);

  const reset = () => {
    const doReset = () => dispatch({ type: 'resetLibrary' });
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Очистити бібліотеку, список покупок і статистику?')) doReset();
      return;
    }
    Alert.alert('Очистити бібліотеку?', 'Буде видалено всі вподобані й приготовані рецепти, список покупок і статистику.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Очистити', style: 'destructive', onPress: doReset },
    ]);
  };

  const since = new Date(state.profile.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const maxDay = Math.max(1, ...stats.days.map((d) => d.count));
  const maxArea = Math.max(1, ...stats.topAreas.map((g) => g[1]));
  const maxCat = Math.max(1, ...stats.topCats.map((d) => d[1]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Профіль</Text>

      {/* Акаунт */}
      <LinearGradient colors={['#3A1E14', '#24170F', '#16110E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroRow}>
          <LinearGradient colors={gradients.brand} style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={{ fontSize: 40 }}>{state.profile.avatar}</Text>
            </View>
          </LinearGradient>
          <View style={{ flex: 1, marginLeft: 16 }}>
            {editing ? (
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={24}
                style={styles.nameInput}
                onSubmitEditing={() => {
                  dispatch({ type: 'profile', profile: { name: name.trim() || 'Кухар' } });
                  setEditing(false);
                }}
                onBlur={() => {
                  dispatch({ type: 'profile', profile: { name: name.trim() || 'Кухар' } });
                  setEditing(false);
                }}
              />
            ) : (
              <Pressable
                onPress={() => {
                  setName(state.profile.name);
                  setEditing(true);
                }}
                accessibilityLabel="Змінити ім'я"
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {state.profile.name}
                </Text>
                <Ionicons name="pencil" size={15} color={colors.textMuted} style={{ marginLeft: 8 }} />
              </Pressable>
            )}
            <Text style={styles.since}>З нами з {since}</Text>
            <View style={styles.level}>
              <Text style={styles.levelText}>
                {level.emoji} {level.name}
              </Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 8 }}>
          {AVATARS.map((a) => (
            <Pressable key={a} onPress={() => dispatch({ type: 'profile', profile: { avatar: a } })} style={[styles.avatarOpt, state.profile.avatar === a && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}>
              <Text style={{ fontSize: 22 }}>{a}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.progressTrack}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${Math.round(level.progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>{level.next ? `До рівня «${level.next}»: ${level.left} дій` : 'Максимальний рівень 🏆'}</Text>
      </LinearGradient>

      {/* Статистика */}
      <AccountCard />

      <SectionTitle>Статистика</SectionTitle>
      <View style={styles.grid}>
        <Stat icon="flame" color={colors.accent} value={stats.swipes} label="Свайпів" />
        <Stat icon="heart" color={colors.like} value={stats.likes} label="Хочу приготувати" />
        <Stat icon="restaurant" color={colors.cooked} value={stats.cooked} label="Приготовано" />
        <Stat icon="close-circle" color={colors.nope} value={stats.nopes} label="Не цікаво" />
        <Stat icon="earth" color={colors.accent2} value={stats.cuisinesCooked} label="Кухонь спробувано" />
        <Stat icon="time" color={colors.gold} value={`≈${stats.hours}`} label="Годин біля плити" />
        <Stat icon="play-circle" color="#FF6B6B" value={state.videosViewed} label="Відео переглянуто" />
        <Stat icon="star" color={colors.gold} value={stats.myAvg ? stats.myAvg.toFixed(1) : '—'} label="Моя сер. оцінка" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Активність за тиждень</Text>
        <View style={styles.week}>
          {stats.days.map((d, i) => (
            <View key={i} style={styles.weekCol}>
              <Text style={styles.weekCount}>{d.count || ''}</Text>
              <View style={styles.weekTrack}>
                <LinearGradient colors={gradients.brand} style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%`, borderRadius: 6, opacity: d.count ? 1 : 0.25 }} />
              </View>
              <Text style={styles.weekLabel}>{d.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Улюблені кухні</Text>
        {stats.topAreas.length ? (
          stats.topAreas.map(([a, c]) => (
            <View key={a} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {areaOf(a).flag} {areaOf(a).uk}
              </Text>
              <View style={styles.barTrack}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.barFill, { width: `${(c / maxArea) * 100}%` }]} />
              </View>
              <Text style={styles.barValue}>{c}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Вподобайте кілька рецептів, і тут з’явиться ваш смак.</Text>
        )}
      </View>

      {stats.topCats.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Улюблені страви</Text>
          {stats.topCats.map(([c, n]) => (
            <View key={c} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {catOf(c).emoji} {catOf(c).uk}
              </Text>
              <View style={styles.barTrack}>
                <LinearGradient colors={gradients.cooked} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.barFill, { width: `${(n / maxCat) * 100}%` }]} />
              </View>
              <Text style={styles.barValue}>{n}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <SectionTitle>База рецептів</SectionTitle>
      <View style={styles.card}>
        <View style={styles.dbHeader}>
          <View style={[styles.dot, { backgroundColor: colors.like }]} />
          <Text style={styles.cardTitleInline}>
            {RECIPES.length} рецептів · {AREAS.length} кухонь світу
          </Text>
        </View>
        <Text style={styles.muted}>
          Рецепти з відкритої бази TheMealDB, перекладені українською (назви, інгредієнти, міри й кроки). Унції й фунти переведено в грами, Фаренгейти — у Цельсії. Базу вбудовано в додаток, тож пошук і рецепти працюють навіть без інтернету (крім фото й відео). Оновлено: {DB.builtAt}.
        </Text>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }} onPress={() => Linking.openURL('https://www.themealdb.com')}>
          <Text style={styles.link}>TheMealDB</Text>
          <Ionicons name="open-outline" size={14} color={colors.accent} />
        </Pressable>
      </View>

      <WorldCard />

      <SectionTitle>Налаштування</SectionTitle>
      <View style={styles.card}>
        {Platform.OS !== 'web' ? <Row label="Вібровідгук" value={state.settings.haptics} onChange={(v) => dispatch({ type: 'settings', settings: { haptics: v } })} /> : null}
        <Row label="Показати підказку «Як це працює»" value={!state.settings.onboarded} onChange={(v) => dispatch({ type: 'settings', settings: { onboarded: !v } })} />
        <Pressable onPress={reset} style={styles.danger}>
          <Ionicons name="trash-outline" size={18} color={colors.nope} />
          <Text style={styles.dangerText}>Очистити бібліотеку і статистику</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>CookCasting 1.1 · Рецепти: TheMealDB і Spoonacular · Переклад українською автоматичний, з ручними правками.</Text>
    </ScrollView>
  );
}

/** Світова база Spoonacular: безкінечні рецепти з автоматичним перекладом. */
function WorldCard() {
  const { state, dispatch, worldKey } = useStore();
  const [key, setKey] = useState(state.settings.spoonKey ?? '');
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  const on = !!worldKey && state.settings.world !== false;

  const save = async () => {
    const k = key.trim();
    if (!k) {
      dispatch({ type: 'settings', settings: { spoonKey: undefined } });
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const ok = await validateSpoonKey(k);
    setStatus(ok ? 'ok' : 'bad');
    if (ok) dispatch({ type: 'settings', settings: { spoonKey: k, world: true } });
  };

  return (
    <>
      <SectionTitle>Світова база ∞</SectionTitle>
      <View style={styles.card}>
        <View style={styles.dbHeader}>
          <View style={[styles.dot, { backgroundColor: on ? colors.like : colors.textMuted }]} />
          <Text style={styles.cardTitleInline}>{on ? `Увімкнено · вже перекладено ${EXTRA.size}` : worldKey ? 'Вимкнено' : 'Потрібен ключ'}</Text>
        </View>
        <Text style={styles.muted}>
          Понад 360 000 рецептів Spoonacular з усього світу. Додаток підмішує їх у Кастинг, коли вбудовані закінчуються, і одразу перекладає українською. Рецепти з бібліотеки зберігаються на пристрої назавжди.
        </Text>
        {worldKey ? <Row label="Показувати рецепти світової бази" value={state.settings.world !== false} onChange={(v) => dispatch({ type: 'settings', settings: { world: v } })} /> : null}
        <Text style={[styles.muted, { marginTop: 12 }]}>
          {ENV_SPOON_KEY ? 'Ключ уже вбудовано в сайт. Можна вказати власний, якщо денний ліміт вичерпано:' : 'Безкоштовний ключ (150 запитів на день) — на spoonacular.com/food-api → Console → Profile:'}
        </Text>
        <View style={styles.keyRow}>
          <TextInput
            value={key}
            onChangeText={(t) => {
              setKey(t);
              setStatus('idle');
            }}
            placeholder="API-ключ Spoonacular"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={save}
            style={styles.keyInput}
          />
          <Pressable onPress={save} style={styles.keyBtn} disabled={status === 'checking'}>
            <Text style={styles.keyBtnText}>{status === 'checking' ? '…' : 'Зберегти'}</Text>
          </Pressable>
        </View>
        {status === 'ok' ? <Text style={[styles.muted, { color: colors.like, marginTop: 6 }]}>Ключ працює — світову базу увімкнено ✓</Text> : null}
        {status === 'bad' ? <Text style={[styles.muted, { color: colors.nope, marginTop: 6 }]}>Ключ не підійшов. Перевірте, чи скопійовано повністю.</Text> : null}
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }} onPress={() => Linking.openURL('https://spoonacular.com/food-api/console#Profile')}>
          <Text style={styles.link}>Отримати ключ</Text>
          <Ionicons name="open-outline" size={14} color={colors.accent} />
        </Pressable>
      </View>
    </>
  );
}

function Stat({ icon, color, value, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.settingLabel, disabled && { color: colors.textMuted }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

const LEVELS = [
  { at: 0, name: 'Поварчук', emoji: '🥄' },
  { at: 20, name: 'Домашній кухар', emoji: '🍳' },
  { at: 75, name: 'Гурман', emoji: '😋' },
  { at: 200, name: 'Су-шеф', emoji: '🔪' },
  { at: 500, name: 'Шеф-кухар', emoji: '👨‍🍳' },
  { at: 1200, name: 'Мішленівська зірка', emoji: '⭐' },
];
function levelFor(points: number) {
  let i = 0;
  while (i < LEVELS.length - 1 && points >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i];
  const nxt = LEVELS[i + 1];
  return {
    ...cur,
    next: nxt?.name,
    left: nxt ? nxt.at - points : 0,
    progress: nxt ? (points - cur.at) / (nxt.at - cur.at) : 1,
  };
}

const styles = StyleSheet.create({
  keyRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  keyInput: { flex: 1, height: 42, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, fontSize: 14 },
  keyBtn: { height: 42, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  keyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginBottom: 14, marginLeft: 4 },
  hero: { borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: { width: 84, height: 84, borderRadius: 42, padding: 3 },
  avatar: { flex: 1, borderRadius: 40, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', flexShrink: 1 },
  nameInput: { color: colors.text, fontSize: 22, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 2 },
  since: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  level: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)' },
  levelText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  avatarOpt: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { color: colors.textMuted, fontSize: 12, marginTop: 6, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 10 },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  cardTitleInline: { color: colors.text, fontSize: 15, fontWeight: '800' },
  week: { flexDirection: 'row', justifyContent: 'space-between', height: 130 },
  weekCol: { flex: 1, alignItems: 'center' },
  weekCount: { color: colors.textDim, fontSize: 11, fontWeight: '700', height: 16 },
  weekTrack: { flex: 1, width: 18, justifyContent: 'flex-end', marginVertical: 4 },
  weekLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', width: 128 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { color: colors.text, fontSize: 13, fontWeight: '800', width: 30, textAlign: 'right' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  dbHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  settingLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 12 },
  danger: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  dangerText: { color: colors.nope, fontSize: 15, fontWeight: '700' },
  footer: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 16, paddingHorizontal: 20 },
});
