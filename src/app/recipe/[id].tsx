import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fact, Heading, RecipeRow } from '../../components/RecipeParts';
import { TrailerPlayer } from '../../components/TrailerPlayer';
import { GhostButton, GradientButton, Stars, Toast } from '../../components/ui';
import { goBack } from '../../lib/nav';
import { areaLabel, areaOf, catOf, DIFFICULTY_LABEL, difficulty, FLAGS, formatTime, getRecipe, ingredientImage, isWorld, pantryCovers, plural, similar, stepTimers } from '../../lib/recipes';
import { useKeepAwake } from '../../lib/keepAwake';
import { TimerList, useTimers } from '../../lib/timer';
import { loadWorldRecipe } from '../../lib/spoon';
import { shareRecipe, shareRecipeText } from '../../lib/share';
import { ObsidianSheet } from '../../components/ObsidianSheet';
import { obsidianOf, saveToObsidian } from '../../lib/obsidian';
import { buildRecipeNote, CookStage } from '../../lib/recipeNote';
import { useHaptics, useStore } from '../../lib/store';
import { colors, gradients, radius } from '../../theme';

export default function RecipeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const [, setLoaded] = useState(0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const r = getRecipe(id);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, isLiked, isCooked, isDisliked, ratingOf, dispatch, worldKey } = useStore();
  const haptic = useHaptics();
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [solidHeader, setSolidHeader] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [cookMode, setCookMode] = useState<number | null>(null);
  const [showIngr, setShowIngr] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sim = useMemo(() => (r ? similar(r, 12) : []), [r]);
  const { start: startTimer, setInline: setTimersInline, timers } = useTimers();
  useKeepAwake(cookMode !== null);
  useEffect(() => {
    setTimersInline(cookMode !== null);
    return () => setTimersInline(false);
  }, [cookMode !== null, setTimersInline]);

  // що вже є вдома («Що є вдома») — одразу позначено
  useEffect(() => {
    setPlaying(false);
    const covers = pantryCovers(state.settings.pantry ?? []);
    setChecked(new Set(r && state.settings.pantry?.length ? r.ingr.map((i, k) => (covers(i.en) ? k : -1)).filter((k) => k >= 0) : []));
    setDoneSteps(new Set());
    setCookMode(null);
    setShowIngr(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!r]);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // клавіатура в режимі готування: ← → кроки, Esc — вийти
  const cookRef = useRef({ cookMode, steps: r?.steps.length ?? 0 });
  cookRef.current = { cookMode, steps: r?.steps.length ?? 0 };
  useEffect(() => {
    if (Platform.OS !== 'web' || cookMode === null) return;
    const onKey = (e: KeyboardEvent) => {
      const { cookMode: c, steps } = cookRef.current;
      if (c === null) return;
      if (e.key === 'ArrowRight' && c < steps - 1) setCookMode(c + 1);
      else if (e.key === 'ArrowLeft' && c > 0) setCookMode(c - 1);
      else if (e.key === 'Escape') setCookMode(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cookMode === null]);

  // рецепт світової бази, якого ще немає на пристрої (напр., відкрили посилання) — завантажуємо й перекладаємо
  const needsLoad = !r && isWorld(id) && !!worldKey;
  useEffect(() => {
    if (!needsLoad) return;
    let alive = true;
    setLoadErr(null);
    loadWorldRecipe(worldKey, id)
      .then(() => alive && setLoaded((n) => n + 1))
      .catch((e) => alive && setLoadErr(e?.message ?? 'Не вдалося завантажити рецепт'));
    return () => {
      alive = false;
    };
  }, [needsLoad, id, worldKey]);

  const flash = (t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  if (!r) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyEmoji}>🍽️</Text>
        <Text style={styles.muted}>{needsLoad && !loadErr ? 'Завантажуємо й перекладаємо рецепт…' : loadErr ?? 'Рецепт не знайдено'}</Text>
        <GhostButton title="Назад" icon="chevron-back" onPress={goBack} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const liked = isLiked(id);
  const cooked = isCooked(id);
  const disliked = isDisliked(id);
  const myRating = ratingOf(id);
  const heroH = Math.min(width * 0.95, 480);
  const area = areaOf(r.area);
  const cat = catOf(r.cat);
  const d = difficulty(r);
  const free = FLAGS.filter((f) => !r.flags.includes(f.id) && ['meat', 'dairy', 'gluten', 'egg', 'nuts'].includes(f.id));

  const toggleSet = (set: Set<number>, i: number) => {
    const n = new Set(set);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  };

  const addToShopping = () => {
    // якщо щось уже відмічено як «є вдома» — додаємо лише решту
    const items = r.ingr.filter((_, i) => !checked.has(i)).map((i) => ({ name: i.n, amount: i.m, recipeId: r.id }));
    if (!items.length) return flash('Усе вже є вдома 👌');
    const before = state.shopping.filter((x) => !x.done && x.recipeId === r.id).length;
    dispatch({ type: 'shopAdd', items });
    haptic('success');
    flash(before ? 'Список покупок оновлено' : `Додано до списку покупок: ${items.length}`);
  };

  const share = async () => {
    const res = await shareRecipe(r);
    if (res === 'copied') flash('Посилання скопійовано');
    else if (res === 'failed') flash('Не вдалося поділитись');
  };
  const shareFull = async () => {
    const res = await shareRecipeText(r);
    if (res === 'copied') flash('Рецепт скопійовано');
    else if (res === 'failed') flash('Не вдалося поділитись');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const solid = e.nativeEvent.contentOffset.y > heroH - 140;
          if (solid !== solidHeader) setSolidHeader(solid);
        }}
      >
        <View style={{ height: heroH }}>
          {playing && r.video ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 56, aspectRatio: 16 / 9 }}>
              <TrailerPlayer videoKey={r.video} muted={false} />
            </View>
          ) : (
            <>
              <Image source={{ uri: r.img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              <LinearGradient colors={['rgba(14,11,10,0.35)', 'rgba(14,11,10,0.05)', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
              {r.video ? (
                <Pressable onPress={() => setPlaying(true)} style={styles.playCenter} accessibilityLabel="Дивитись відеорецепт">
                  <LinearGradient colors={gradients.brand} style={styles.playBtn}>
                    <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
                  </LinearGradient>
                  <Text style={styles.playText}>Відеорецепт</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        <View style={[styles.body, playing && { marginTop: 0 }]}>
          <Text style={styles.title}>{r.name}</Text>
          {r.nameEn !== r.name ? <Text style={styles.original}>{r.nameEn}</Text> : null}

          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {area.flag} {areaLabel(r.area)}
              </Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {cat.emoji} {cat.uk}
              </Text>
            </View>
            {r.tags.map((t) => (
              <View key={t} style={[styles.chip, styles.chipSoft]}>
                <Text style={styles.chipText}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={styles.facts}>
            <Fact label="Час" value={`≈ ${formatTime(r.time)}`} color={colors.gold} />
            <Fact label="Складність" value={DIFFICULTY_LABEL[d]} color={d === 1 ? colors.like : d === 2 ? colors.gold : colors.nope} />
            <Fact label="Інгредієнти" value={`${r.ingr.length}`} />
            <Fact label="Кроків" value={`${r.steps.length}`} />
          </View>
          {free.length ? <Text style={styles.free}>Без: {free.map((f) => `${f.icon} ${f.label}`).join(', ')}</Text> : null}

          {cooked ? (
            <View style={styles.rateBox}>
              <Text style={styles.rateTitle}>Як вийшло?</Text>
              <Stars
                value={myRating ?? 0}
                onChange={(v) => {
                  dispatch({ type: 'rate', id, rating: v });
                  haptic('light');
                }}
              />
            </View>
          ) : null}

          <Heading
            right={
              <Pressable onPress={addToShopping} style={styles.smallBtn} hitSlop={6}>
                <Ionicons name="cart-outline" size={16} color={colors.accent} />
                <Text style={styles.smallBtnText}>{checked.size ? 'Докупити решту' : 'У список покупок'}</Text>
              </Pressable>
            }
          >
            Інгредієнти
          </Heading>
          <Text style={styles.hint}>Позначте те, що вже є вдома</Text>
          {r.ingr.map((ing, i) => {
            const on = checked.has(i);
            return (
              <Pressable key={i} onPress={() => setChecked((s) => toggleSet(s, i))} style={styles.ingRow}>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.like : colors.textMuted} />
                <Image source={{ uri: ingredientImage(ing.en) }} style={styles.ingImg} contentFit="contain" />
                <Text style={[styles.ingName, on && styles.struck]} numberOfLines={2}>
                  {ing.n}
                </Text>
                <Text style={[styles.ingAmount, on && styles.struck]} numberOfLines={2}>
                  {ing.m}
                </Text>
              </Pressable>
            );
          })}

          <Heading
            right={
              <Pressable onPress={() => setCookMode(0)} style={styles.smallBtn} hitSlop={6}>
                <Ionicons name="flame-outline" size={16} color={colors.accent} />
                <Text style={styles.smallBtnText}>Режим готування</Text>
              </Pressable>
            }
          >
            Приготування
          </Heading>
          {r.steps.map((s, i) => {
            const on = doneSteps.has(i);
            return (
              <Pressable key={i} onPress={() => setDoneSteps((x) => toggleSet(x, i))} style={[styles.step, on && { opacity: 0.5 }]}>
                <View style={[styles.stepNum, on && { backgroundColor: colors.like }]}>
                  {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={styles.stepNumText}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepText}>{s}</Text>
                  <TimerChips text={s} label={`${r.name} · крок ${i + 1}`} onStart={(m, l) => {
                    startTimer(m, l);
                    haptic('light');
                    flash(`Таймер на ${formatTime(m)} запущено`);
                  }} />
                </View>
              </Pressable>
            );
          })}
          {doneSteps.size === r.steps.length && r.steps.length > 0 && !cooked ? (
            <GradientButton
              title="Готово! Позначити «Приготував»"
              icon="checkmark-done"
              colorsPair={gradients.like}
              onPress={() => {
                dispatch({ type: 'toggle', id, list: 'cooked' });
                haptic('success');
                flash('Смачного! Оцініть, як вийшло 👆');
                scroll.current?.scrollTo({ y: heroH - 40, animated: true });
              }}
              style={{ marginTop: 14 }}
            />
          ) : null}

          <Text style={styles.note}>
            Рецепт перекладено українською автоматично з {isWorld(r.id) ? 'світової бази Spoonacular' : 'бази TheMealDB'}. Час приготування орієнтовний.
          </Text>
          <View style={styles.links}>
            <Pressable onPress={shareFull} style={styles.smallBtn}>
              <Ionicons name="document-text-outline" size={16} color={colors.accent} />
              <Text style={styles.smallBtnText}>Поділитись текстом</Text>
            </Pressable>
            {r.src ? (
              <Pressable onPress={() => Linking.openURL(r.src!)} style={styles.smallBtn}>
                <Ionicons name="open-outline" size={16} color={colors.accent} />
                <Text style={styles.smallBtnText}>Оригінал</Text>
              </Pressable>
            ) : null}
            {r.video ? (
              <Pressable onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${r.video}`)} style={styles.smallBtn}>
                <Ionicons name="logo-youtube" size={16} color={colors.accent} />
                <Text style={styles.smallBtnText}>YouTube</Text>
              </Pressable>
            ) : null}
          </View>

          <RecipeRow title="Схожі рецепти" items={sim} mark={(sid) => (isLiked(sid) ? 'heart' : isCooked(sid) ? 'restaurant' : null)} />
        </View>
      </ScrollView>

      {solidHeader ? (
        <View style={[styles.header, { height: insets.top + 56, paddingTop: insets.top }]}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {r.name}
          </Text>
        </View>
      ) : null}

      <Pressable onPress={goBack} style={[styles.topBtn, { top: insets.top + 8, left: 14 }]} hitSlop={10} accessibilityLabel="Назад">
        <Ionicons name="chevron-down" size={24} color="#fff" />
      </Pressable>
      <View style={[styles.topRight, { top: insets.top + 8 }]}>
        <Pressable onPress={() => setSaveOpen(true)} style={styles.circle} hitSlop={8} accessibilityLabel="Зберегти в Obsidian">
          <Ionicons name="diamond-outline" size={19} color="#fff" />
        </Pressable>
        <Pressable onPress={share} style={styles.circle} hitSlop={8} accessibilityLabel="Поділитись">
          <Ionicons name="share-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      {toast ? <Toast text={toast} bottom={Math.max(insets.bottom, 14) + 84} /> : null}

      <ObsidianSheet<CookStage>
        visible={saveOpen}
        onClose={() => setSaveOpen(false)}
        heading={r.name}
        stages={[
          { value: 'want', label: 'Хочу приготувати' },
          { value: 'today', label: 'Приготував сьогодні' },
          { value: 'done', label: 'Уже готував' },
        ]}
        initial={{ stage: cooked ? 'done' : 'want', rating: myRating ?? null, notes: '' }}
        ratingMax={5}
        notesLabel="Мої зміни і поради"
        notesPlaceholder="Що змінив, що вийшло, що зробити інакше (кожен рядок — окремий пункт)"
        onSave={async (v) => {
          const at = state.cooked.find((e) => e.id === id)?.at;
          const res = await saveToObsidian(obsidianOf(state.settings.obsidian), buildRecipeNote(r, { stage: v.stage, rating: v.rating, notes: v.notes, cookedAt: at }));
          if (res.ok) {
            // застосунок і база кажуть одне й те саме
            if (v.stage !== 'want' && !cooked) dispatch({ type: 'toggle', id, list: 'cooked' });
            if (v.stage === 'want' && !liked && !cooked) dispatch({ type: 'toggle', id, list: 'liked' });
            if (v.rating && v.rating !== myRating) dispatch({ type: 'rate', id, rating: v.rating });
            haptic('success');
          } else haptic('warning');
          return res;
        }}
      />

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          accessibilityLabel={disliked ? 'Прибрати з «Не цікаво»' : 'Не цікаво'}
          onPress={() => {
            dispatch({ type: 'toggle', id, list: 'disliked' });
            haptic('light');
            if (!disliked) flash('Більше не покажемо в Кастингу');
          }}
          style={[styles.nopeBtn, disliked && { backgroundColor: colors.nope + '33', borderColor: colors.nope }]}
        >
          <Ionicons name="close" size={24} color={colors.nope} />
        </Pressable>
        <GhostButton
          title="Готував"
          icon={cooked ? 'restaurant' : 'restaurant-outline'}
          tight
          onPress={() => {
            dispatch({ type: 'toggle', id, list: 'cooked' });
            haptic('light');
            if (!cooked) setTimeout(() => scroll.current?.scrollTo({ y: heroH - 40, animated: true }), 50);
          }}
          style={[{ flex: 1 }, cooked && { borderColor: colors.cooked, backgroundColor: colors.cooked + '22' }]}
        />
        <GradientButton
          title={liked ? 'В обраному' : width < 380 ? 'В обране' : 'Хочу!'}
          icon={liked ? 'heart' : 'heart-outline'}
          colorsPair={liked ? gradients.like : gradients.brand}
          tight
          onPress={() => {
            dispatch({ type: 'toggle', id, list: 'liked' });
            haptic(liked ? 'light' : 'success');
          }}
          style={{ flex: 1.5 }}
        />
      </View>

      {cookMode !== null ? (
        <View style={[styles.cook, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.cookHead}>
            <Text style={styles.cookCounter}>
              Крок {cookMode + 1} з {r.steps.length}
            </Text>
            <Pressable onPress={() => setCookMode(null)} hitSlop={10} accessibilityLabel="Закрити">
              <Ionicons name="close" size={30} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${((cookMode + 1) / r.steps.length) * 100}%` }]} />
          </View>
          {timers.length ? (
            <View style={{ marginTop: 12, gap: 6, alignItems: 'flex-start' }}>
              <TimerList />
            </View>
          ) : null}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 24 }}>
            <Text style={styles.cookText}>{r.steps[cookMode]}</Text>
            <TimerChips big text={r.steps[cookMode]} label={`${r.name} · крок ${cookMode + 1}`} onStart={(m, l) => {
              startTimer(m, l);
              haptic('light');
            }} />
            {cookMode === 0 ? (
              <Text style={styles.cookHint}>
                Знадобиться: {r.ingr.length} {plural(r.ingr.length, ['інгредієнт', 'інгредієнти', 'інгредієнтів'])}. Екран не згасатиме, поки відкрито режим готування.
              </Text>
            ) : null}
            <Pressable onPress={() => setShowIngr((v) => !v)} style={[styles.smallBtn, { alignSelf: 'flex-start', marginTop: 22 }]}>
              <Ionicons name={showIngr ? 'chevron-up' : 'list-outline'} size={16} color={colors.accent} />
              <Text style={styles.smallBtnText}>{showIngr ? 'Сховати інгредієнти' : 'Інгредієнти'}</Text>
            </Pressable>
            {showIngr
              ? r.ingr.map((ing, i) => (
                  <Pressable key={i} onPress={() => setChecked((s2) => toggleSet(s2, i))} style={styles.ingRow}>
                    <Ionicons name={checked.has(i) ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={checked.has(i) ? colors.like : colors.textMuted} />
                    <Text style={[styles.ingName, checked.has(i) && styles.struck]}>{ing.n}</Text>
                    <Text style={[styles.ingAmount, checked.has(i) && styles.struck]}>{ing.m}</Text>
                  </Pressable>
                ))
              : null}
          </ScrollView>
          <View style={styles.cookBar}>
            <GhostButton title="Назад" icon="chevron-back" onPress={() => setCookMode(Math.max(0, cookMode - 1))} style={{ flex: 1, opacity: cookMode === 0 ? 0.4 : 1 }} />
            {cookMode < r.steps.length - 1 ? (
              <GradientButton
                title="Далі"
                icon="chevron-forward"
                onPress={() => {
                  setDoneSteps((s) => new Set(s).add(cookMode));
                  setCookMode(cookMode + 1);
                  haptic('light');
                }}
                style={{ flex: 1.5 }}
              />
            ) : (
              <GradientButton
                title="Готово!"
                icon="checkmark-done"
                colorsPair={gradients.like}
                onPress={() => {
                  setDoneSteps(new Set(r.steps.map((_, i) => i)));
                  if (!cooked) dispatch({ type: 'toggle', id, list: 'cooked' });
                  setCookMode(null);
                  haptic('success');
                  flash('Смачного! Оцініть, як вийшло');
                  setTimeout(() => scroll.current?.scrollTo({ y: heroH - 40, animated: true }), 50);
                }}
                style={{ flex: 1.5 }}
              />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Кнопки таймера для часу, згаданого в кроці: «⏱ 20 хв». */
function TimerChips({ text, label, onStart, big }: { text: string; label: string; onStart: (minutes: number, label: string) => void; big?: boolean }) {
  const mins = stepTimers(text);
  if (!mins.length) return null;
  return (
    <View style={[styles.timers, big && { marginTop: 18 }]}>
      {mins.map((m) => (
        <Pressable key={m} onPress={() => onStart(m, label)} hitSlop={4} style={[styles.timerChip, big && styles.timerChipBig]} accessibilityLabel={`Таймер на ${formatTime(m)}`}>
          <Ionicons name="timer-outline" size={big ? 18 : 14} color={colors.accent2} />
          <Text style={[styles.timerText, big && { fontSize: 16 }]}>{formatTime(m)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  timers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  timerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: colors.accent2 + '1A', borderWidth: 1, borderColor: colors.accent2 + '55' },
  timerChipBig: { height: 42, borderRadius: 21, paddingHorizontal: 16 },
  timerText: { color: colors.accent2, fontWeight: '800', fontSize: 13 },
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 15 },
  playCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#fff', fontWeight: '800', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  body: { paddingHorizontal: 18, marginTop: -70, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.4 },
  original: { color: colors.textDim, fontSize: 14, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accent + '1F', borderWidth: 1, borderColor: colors.accent + '55' },
  chipSoft: { backgroundColor: colors.bgElevated, borderColor: colors.border },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  free: { color: colors.textDim, fontSize: 13, marginTop: 12, lineHeight: 19 },
  rateBox: { marginTop: 18, padding: 14, borderRadius: radius.md, backgroundColor: colors.cooked + '18', borderWidth: 1, borderColor: colors.cooked + '55', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  rateTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: -6, marginBottom: 6 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.accent + '18', borderWidth: 1, borderColor: colors.accent + '44' },
  smallBtnText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ingImg: { width: 34, height: 34 },
  ingName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  ingAmount: { color: colors.gold, fontSize: 14, fontWeight: '700', maxWidth: '42%', textAlign: 'right' },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  step: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stepNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  stepText: { flex: 1, color: '#E6DDD8', fontSize: 16, lineHeight: 24 },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 22, lineHeight: 17 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg + 'F5', borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center', paddingLeft: 66, paddingRight: 66 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(14,11,10,0.6)', alignItems: 'center', justifyContent: 'center' },
  topBtn: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(14,11,10,0.6)', alignItems: 'center', justifyContent: 'center' },
  topRight: { position: 'absolute', right: 14, flexDirection: 'row', gap: 8 },
  nopeBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, backgroundColor: colors.bg + 'F2', borderTopWidth: 1, borderTopColor: colors.border },
  cook: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, paddingHorizontal: 22, zIndex: 50 },
  cookHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cookCounter: { color: colors.accent, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.card, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  cookText: { color: colors.text, fontSize: 24, lineHeight: 36, fontWeight: '600' },
  cookHint: { color: colors.textMuted, fontSize: 14, marginTop: 20 },
  cookBar: { flexDirection: 'row', gap: 12 },
});
