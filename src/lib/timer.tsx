import { Ionicons } from '@expo/vector-icons';
import * as H from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

/**
 * Кухонні таймери: запускаються з кроків рецепта («варіть 20 хвилин» → ⏱ 20 хв)
 * і працюють, поки ви ходите по додатку. Рахують від часу завершення, тож не збиваються,
 * якщо телефон на хвилину заснув.
 */
export type CookTimer = { id: string; label: string; total: number; endsAt: number; pausedLeft: number | null; done: boolean };

type Ctx = {
  timers: CookTimer[];
  start: (minutes: number, label: string) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  add: (id: string, minutes: number) => void;
  /** екран сам показує таймери (режим готування) — загальну смужку ховаємо */
  setInline: (on: boolean) => void;
  now: number;
};

const TimerCtx = createContext<Ctx | null>(null);

const leftOf = (t: CookTimer, now: number) => (t.pausedLeft ?? Math.max(0, t.endsAt - now));

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

/** Короткий сигнал (у браузері — звук, на телефоні — ще й вібрація). */
function ring() {
  if (Platform.OS === 'web') {
    try {
      navigator.vibrate?.([300, 150, 300, 150, 300]);
    } catch {}
    try {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      [0, 0.45, 0.9].forEach((at) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + 0.4);
      });
      setTimeout(() => ctx.close().catch(() => {}), 2000);
    } catch {}
    return;
  }
  H.notificationAsync(H.NotificationFeedbackType.Success).catch(() => {});
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [inline, setInline] = useState(false);
  const running = timers.some((t) => !t.done && t.pausedLeft === null);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [running]);

  // завершені таймери — сигнал
  useEffect(() => {
    const finished = timers.filter((t) => !t.done && t.pausedLeft === null && t.endsAt <= now);
    if (!finished.length) return;
    ring();
    setTimers((list) => list.map((t) => (finished.some((f) => f.id === t.id) ? { ...t, done: true } : t)));
  }, [now, timers]);

  const start = useCallback((minutes: number, label: string) => {
    const ms = minutes * 60_000;
    setNow(Date.now());
    setTimers((list) => [...list.filter((t) => !t.done).slice(-2), { id: `${Date.now()}`, label, total: ms, endsAt: Date.now() + ms, pausedLeft: null, done: false }]);
    // браузер дозволяє звук лише після дотику — «розігріваємо» його зараз
    if (Platform.OS === 'web') {
      try {
        const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
        if (AC) new AC().close().catch(() => {});
      } catch {}
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setTimers((list) =>
      list.map((t) => {
        if (t.id !== id || t.done) return t;
        if (t.pausedLeft !== null) return { ...t, endsAt: Date.now() + t.pausedLeft, pausedLeft: null };
        return { ...t, pausedLeft: Math.max(0, t.endsAt - Date.now()) };
      }),
    );
    setNow(Date.now());
  }, []);

  const add = useCallback((id: string, minutes: number) => {
    const ms = minutes * 60_000;
    setTimers((list) =>
      list.map((t) =>
        t.id !== id
          ? t
          : t.done
            ? { ...t, done: false, total: ms, endsAt: Date.now() + ms, pausedLeft: null }
            : t.pausedLeft !== null
              ? { ...t, pausedLeft: t.pausedLeft + ms, total: t.total + ms }
              : { ...t, endsAt: t.endsAt + ms, total: t.total + ms },
      ),
    );
    setNow(Date.now());
  }, []);

  const remove = useCallback((id: string) => setTimers((list) => list.filter((t) => t.id !== id)), []);

  const value = useMemo(() => ({ timers, start, toggle, remove, add, setInline, now }), [timers, start, toggle, remove, add, now]);
  const insets = useSafeAreaInsets();
  return (
    <TimerCtx.Provider value={value}>
      {children}
      {inline || !timers.length ? null : (
        <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 58 }]}>
          <TimerList />
        </View>
      )}
    </TimerCtx.Provider>
  );
}

export function useTimers() {
  const c = useContext(TimerCtx);
  if (!c) throw new Error('useTimers must be used inside TimerProvider');
  return c;
}

/** Запущені таймери (смужки з часом, паузою й закриттям). */
export function TimerList() {
  const { timers, now, toggle, remove, add } = useTimers();
  return (
    <>
      {timers.map((t) => {
        const left = leftOf(t, now);
        const paused = t.pausedLeft !== null;
        return (
          <View key={t.id} style={[styles.pill, t.done && styles.pillDone]}>
            <Ionicons name={t.done ? 'alarm' : 'timer-outline'} size={18} color={t.done ? '#fff' : colors.accent2} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.time, t.done && { color: '#fff' }]}>{t.done ? 'Час вийшов!' : fmtClock(left)}</Text>
              <Text style={[styles.label, t.done && { color: '#fff' }]} numberOfLines={1}>
                {t.label}
              </Text>
            </View>
            {t.done ? (
              <Pressable onPress={() => add(t.id, 1)} hitSlop={6} style={styles.btn} accessibilityLabel="Ще хвилину">
                <Text style={styles.btnText}>+1 хв</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => toggle(t.id)} hitSlop={6} style={styles.icon} accessibilityLabel={paused ? 'Продовжити' : 'Пауза'}>
                <Ionicons name={paused ? 'play' : 'pause'} size={16} color={colors.text} />
              </Pressable>
            )}
            <Pressable onPress={() => remove(t.id)} hitSlop={6} style={styles.icon} accessibilityLabel="Прибрати таймер">
              <Ionicons name="close" size={16} color={t.done ? '#fff' : colors.textDim} />
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 6, zIndex: 200, maxWidth: '94%' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(43,33,28,0.97)',
    borderWidth: 1,
    borderColor: colors.accent2 + '66',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  pillDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  time: { color: colors.text, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', maxWidth: 150 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  btn: { paddingHorizontal: 10, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
});
