import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, View, ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedPlayer, USES_FEED_PLAYER } from '../../components/FeedPlayer';
import { TrailerPlayer } from '../../components/TrailerPlayer';
import { Photo } from '../../components/ui';
import { openRecipe } from '../../lib/nav';
import { areaOf, catOf, formatTime, matches, RECIPES, shuffle } from '../../lib/recipes';
import { shareRecipe } from '../../lib/share';
import { useHaptics, useStore } from '../../lib/store';
import { Recipe } from '../../lib/types';
import { colors, TAB_BAR_HEIGHT } from '../../theme';

type Item = { r: Recipe; key: string };
type FeedKind = 'mix' | 'mine' | 'liked' | 'quick' | 'dessert' | 'meat';

const KINDS: { value: FeedKind; label: string }[] = [
  { value: 'mix', label: 'Мікс' },
  { value: 'mine', label: 'Для тебе' },
  { value: 'quick', label: 'Швидкі' },
  { value: 'meat', label: 'М’ясне' },
  { value: 'dessert', label: 'Десерти' },
  { value: 'liked', label: 'Обране' },
];

/**
 * Розкладка картки відео: відео вгорі, кнопки — внизу над меню (зручно великим пальцем),
 * а опис займає весь простір між ними, тож порожнечі немає. На великих екранах відео не ширше 760.
 */
export type FeedLayout = {
  videoW: number;
  videoH: number;
  videoLeft: number;
  videoTop: number;
  textTop: number;
  actionsTop: number;
  compact: boolean;
  lines: number;
  controlsH: number;
};
const LINE = 21;
export function feedLayout(w: number, h: number, topInset: number, bottomInset: number): FeedLayout {
  const compact = h < 700;
  const tabsBottom = topInset + 46;
  const controlsH = USES_FEED_PLAYER ? 50 : 0; // кнопки «Звук» / «На весь екран» під відео
  const actionsH = compact ? 50 : 70;
  const infoBase = compact ? 70 : 92; // постер, назва, рік, рейтинг
  const avail = h - tabsBottom - bottomInset - 12;
  let videoW = Math.min(w, 760);
  let videoH = (videoW * 9) / 16;
  const minBlock = (vh: number) => vh + controlsH + infoBase + 2 * LINE + actionsH + 28;
  if (minBlock(videoH) > avail) {
    videoH = Math.max(150, avail - minBlock(0));
    videoW = Math.min(videoW, (videoH * 16) / 9);
  }
  const extra = Math.max(0, avail - minBlock(videoH));
  const videoTop = tabsBottom + Math.min(extra * 0.25, 48);
  const textTop = videoTop + videoH + controlsH + 6;
  const actionsTop = h - bottomInset - actionsH - 14;
  const lines = Math.max(2, Math.min(10, Math.floor((actionsTop - textTop - infoBase - 6) / LINE)));
  return { videoW, videoH, videoLeft: (w - videoW) / 2, videoTop, textTop, actionsTop, compact, lines, controlsH };
}

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { dispatch, state, isLiked, isDisliked } = useStore();
  const [kind, setKind] = useState<FeedKind>('mix');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const list = useRef<FlatList<Item>>(null);

  // список формуємо при зміні вкладки, а не на кожну дію — щоб стрічка не перемішувалась під пальцем
  const items = useMemo<Item[]>(() => {
    const withVideo = RECIPES.filter((r) => r.video && !isDisliked(r.id));
    let pick: Recipe[];
    switch (kind) {
      case 'liked':
        pick = withVideo.filter((r) => isLiked(r.id));
        break;
      case 'quick':
        pick = shuffle(withVideo.filter((r) => r.time <= 40));
        break;
      case 'dessert':
        pick = shuffle(withVideo.filter((r) => r.cat === 'Dessert'));
        break;
      case 'meat':
        pick = shuffle(withVideo.filter((r) => ['Beef', 'Chicken', 'Lamb', 'Pork', 'Goat'].includes(r.cat)));
        break;
      case 'mine':
        pick = shuffle(withVideo.filter((r) => matches(r, state.filters)));
        break;
      default:
        pick = shuffle(withVideo);
    }
    return pick.map((r) => ({ r, key: r.video! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, state.ready]);

  useEffect(() => {
    setActive(0);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [kind]);

  const { width: winW } = useWindowDimensions();
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    if (!USES_FEED_PLAYER) return;
    setScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), 160);
  };
  const bottomInset = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12);
  const layout = feedLayout(winW, height, insets.top, bottomInset);

  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActive(first.index);
  }).current;

  useEffect(() => {
    if (items.length && focused) dispatch({ type: 'videoViewed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && items.length > 0 ? (
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(i) => String(i.r.id)}
          renderItem={({ item, index }) => (
            <TrailerItem
              item={item}
              height={height}
              active={focused && index === active}
              near={Math.abs(index - active) <= 1}
              layout={layout}
              onNext={() => index + 1 < items.length && list.current?.scrollToIndex({ index: index + 1, animated: true })}
            />
          )}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          onScroll={onScroll}
          scrollEventThrottle={32}
          viewabilityConfig={viewConfig}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      ) : (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>{kind === 'liked' ? '❤️' : '🎬'}</Text>
          <Text style={styles.emptyText}>
            {!height ? '' : kind === 'liked' ? 'В Обраному поки немає рецептів з відео. Вподобайте кілька в Кастингу.' : kind === 'mine' ? 'Під ваші фільтри немає рецептів з відео.' : 'Відеорецептів поки немає'}
          </Text>
        </View>
      )}

      {USES_FEED_PLAYER && height > 0 && items.length > 0 ? (
        <FeedPlayer videoKey={items[active]?.key ?? null} top={layout.videoTop} height={layout.videoH} left={layout.videoLeft} width={layout.videoW} visible={!scrolling} playing={focused} />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { top: insets.top + 8 }]} contentContainerStyle={styles.tabsRow}>
        {KINDS.map((k) => (
          <Pressable key={k.value} onPress={() => setKind(k.value)} hitSlop={8}>
            <Text style={[styles.tab, kind === k.value && styles.tabActive]}>{k.label}</Text>
            {kind === k.value ? <View style={styles.tabLine} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const TrailerItem = React.memo(function TrailerItem({
  item,
  height,
  active,
  near,
  layout,
  onNext,
}: {
  item: Item;
  height: number;
  active: boolean;
  near: boolean;
  layout: FeedLayout;
  onNext: () => void;
}) {
  const { r, key } = item;
  const { isLiked, isCooked, isDisliked, dispatch } = useStore();
  const haptic = useHaptics();
  const liked = isLiked(r.id);
  const cooked = isCooked(r.id);
  const disliked = isDisliked(r.id);
  const { videoW, videoH, videoLeft, videoTop, textTop, actionsTop, compact, lines } = layout;
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) setStarted(false);
    else {
      const t = setTimeout(() => setStarted(true), 350); // не вантажимо плеєр під час швидкого гортання
      return () => clearTimeout(t);
    }
  }, [active]);

  const thumb = `https://img.youtube.com/vi/${key}/hqdefault.jpg`;
  const area = areaOf(r.area);

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {near ? <Image source={{ uri: r.img }} style={StyleSheet.absoluteFill} blurRadius={30} contentFit="cover" /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />

      <View style={[styles.video, { top: videoTop, left: videoLeft, width: videoW, height: videoH }]}>
        {active && started && !USES_FEED_PLAYER ? (
          <TrailerPlayer videoKey={key} />
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStarted(true)}>
            {near ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.playWrap}>
              <View style={styles.play}>
                <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
              </View>
            </View>
          </Pressable>
        )}
      </View>

      <View style={[styles.block, { top: textTop }]}>
        <View style={styles.maxW}>
          <Pressable style={styles.head} onPress={() => openRecipe(r.id)}>
            {near ? <Photo uri={r.img} rounded={10} style={compact ? styles.thumbSmall : styles.thumb} /> : null}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.title, compact && { fontSize: 20 }]} numberOfLines={2}>
                {r.name}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {area.flag} {area.uk}
                </Text>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.meta}>{catOf(r.cat).uk}</Text>
                <Text style={styles.dot}>•</Text>
                <Ionicons name="time-outline" size={13} color={colors.gold} />
                <Text style={styles.meta}> ≈ {formatTime(r.time)}</Text>
              </View>
            </View>
          </Pressable>
          <Text style={styles.overview} numberOfLines={lines} onPress={() => openRecipe(r.id)}>
            <Text style={{ fontWeight: '800', color: '#fff' }}>Інгредієнти: </Text>
            {r.ingr.map((i) => `${i.n.toLocaleLowerCase('uk')}${i.m ? ` (${i.m})` : ''}`).join(', ')}
          </Text>
        </View>
      </View>

      <View style={[styles.block, { top: actionsTop }]}>
        <View style={styles.maxW}>
          <View style={styles.actions}>
            <ActionButton
              compact={compact}
              icon={liked ? 'heart' : 'heart-outline'}
              color={liked ? colors.accent : '#fff'}
              active={liked}
              label={liked ? 'В обраному' : 'Хочу!'}
              onPress={() => {
                dispatch({ type: 'toggle', id: r.id, list: 'liked' });
                haptic(liked ? 'light' : 'success');
              }}
            />
            <ActionButton compact={compact} icon={cooked ? 'restaurant' : 'restaurant-outline'} color={cooked ? colors.cooked : '#fff'} active={cooked} label="Готував" onPress={() => dispatch({ type: 'toggle', id: r.id, list: 'cooked' })} />
            <ActionButton
              compact={compact}
              icon="close"
              color={disliked ? colors.nope : '#fff'}
              active={disliked}
              label="Не цікаво"
              onPress={() => {
                dispatch({ type: 'toggle', id: r.id, list: 'disliked' });
                haptic('light');
                if (!disliked) setTimeout(onNext, 250);
              }}
            />
            <ActionButton compact={compact} icon="book-outline" color="#fff" label="Рецепт" onPress={() => openRecipe(r.id)} />
            <ActionButton compact={compact} icon="share-social-outline" color="#fff" label="Поділитись" onPress={() => shareRecipe(r)} />
          </View>
        </View>
      </View>
    </View>
  );
});

function ActionButton({
  icon,
  color,
  label,
  onPress,
  compact,
  active,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  onPress: () => void;
  compact?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.actBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
      <View style={[styles.actIcon, compact && styles.actIconSmall, active && { backgroundColor: color + '33', borderColor: color }]}>
        <Ionicons name={icon} size={compact ? 21 : 24} color={color} />
      </View>
      {compact ? null : (
        <Text style={styles.actLabel} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  tabs: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  tabsRow: { flexGrow: 1, justifyContent: 'center', gap: 16, paddingHorizontal: 16, paddingBottom: 4 },
  tab: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  tabActive: { color: '#fff', fontWeight: '900' },
  tabLine: { height: 3, width: 22, borderRadius: 2, backgroundColor: colors.accent, alignSelf: 'center', marginTop: 5 },
  video: { position: 'absolute', backgroundColor: '#000', overflow: 'hidden' },
  playWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  play: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent + 'E6', alignItems: 'center', justifyContent: 'center' },
  block: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16, zIndex: 5 },
  maxW: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 64, height: 64, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  thumbSmall: { width: 46, height: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  actBtn: { alignItems: 'center', flex: 1 },
  actIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  actIconSmall: { width: 42, height: 42, borderRadius: 21 },
  actLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  swipeHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 18 },
  swipeHintText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  meta: { color: '#E5E5EF', fontSize: 13, fontWeight: '700' },
  dot: { color: 'rgba(255,255,255,0.5)', marginHorizontal: 6 },
  overview: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: LINE, marginTop: 10 },
});

