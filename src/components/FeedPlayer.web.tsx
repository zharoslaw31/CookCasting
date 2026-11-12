import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/**
 * Один постійний плеєр YouTube (офіційний IFrame API) для стрічки трейлерів у браузері.
 * Браузери не дозволяють автозапуск зі звуком, доки людина не торкнеться сторінки.
 * Тому: перший трейлер стартує без звуку, перший дотик будь-де вмикає звук,
 * і далі той самий плеєр перемикає відео (loadVideoById) — звук лишається.
 */
type Props = { videoKey: string | null; top: number; height: number; left?: number; width?: number; visible: boolean; playing: boolean };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

let soundUnlocked = false;

export function FeedPlayer({ videoKey, top, height, left = 0, width, visible, playing }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const player = useRef<any>(null);
  const readyRef = useRef(false);
  const currentKey = useRef<string | null>(null);
  const [muted, setMuted] = useState(!soundUnlocked);
  const [hint, setHint] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const wantPlay = useRef(playing && visible);
  wantPlay.current = playing && visible;

  const applySound = () => {
    const p = player.current;
    if (!p || !readyRef.current) return;
    if (mutedRef.current) p.mute();
    else {
      p.unMute();
      p.setVolume(100);
    }
  };

  // створюємо плеєр один раз
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !host.current || !videoKey) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      currentKey.current = videoKey;
      player.current = new YT.Player(el, {
        width: '100%',
        height: '100%',
        videoId: videoKey,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1, fs: 1, mute: soundUnlocked ? 0 : 1, origin: window.location.origin },
        events: {
          onReady: () => {
            readyRef.current = true;
            const ifr: HTMLIFrameElement | undefined = player.current?.getIframe?.();
            if (ifr) {
              ifr.setAttribute('allowfullscreen', '');
              ifr.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
            }
            applySound();
            if (wantPlay.current) player.current.playVideo();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        player.current?.destroy();
      } catch {}
      player.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // перший дотик будь-де вмикає звук (дозвіл браузера на звук)
  useEffect(() => {
    if (soundUnlocked) return;
    const unlock = () => {
      soundUnlocked = true;
      mutedRef.current = false;
      setMuted(false);
      applySound();
      if (wantPlay.current) player.current?.playVideo?.();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // наступний трейлер — у тому ж плеєрі, зі звуком
  useEffect(() => {
    const p = player.current;
    if (!p || !readyRef.current || !videoKey || videoKey === currentKey.current) return;
    currentKey.current = videoKey;
    p.loadVideoById(videoKey);
    applySound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey]);

  useEffect(() => {
    const p = player.current;
    if (!p || !readyRef.current) return;
    if (playing && visible) {
      applySound();
      p.playVideo();
    } else p.pauseVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, visible]);

  // На весь екран + горизонтальна орієнтація (Android/Chrome); на iPhone — системний повноекранний плеєр
  const exitFullscreen = () => {
    const d = document as any;
    try {
      if (d.fullscreenElement) d.exitFullscreen?.();
      else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
    } catch {}
    try {
      (screen.orientation as any)?.unlock?.();
    } catch {}
  };

  // кнопка «Вийти» всередині повноекранного блоку (наші звичайні кнопки там не видно)
  const exitBtn = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '✕  Вийти';
    b.setAttribute('aria-label', 'Вийти з повноекранного режиму');
    Object.assign(b.style, {
      position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))', zIndex: '10',
      display: 'none', padding: '10px 16px', borderRadius: '22px', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
      fontSize: '15px', fontWeight: '800', cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      exitFullscreen();
    });
    host.current.appendChild(b);
    exitBtn.current = b;
    return () => b.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goFullscreen = async () => {
    const box = host.current as any;
    const ifr: any = player.current?.getIframe?.();
    const target = box?.requestFullscreen || box?.webkitRequestFullscreen ? box : ifr;
    try {
      if (target?.requestFullscreen) await target.requestFullscreen({ navigationUI: 'hide' });
      else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen();
      else if (ifr?.webkitEnterFullscreen) ifr.webkitEnterFullscreen();
      else throw new Error('no fullscreen');
      try {
        await (screen.orientation as any)?.lock?.('landscape');
      } catch {}
      if (!mutedRef.current) applySound();
      player.current?.playVideo?.();
    } catch {
      setHint(true);
      setTimeout(() => setHint(false), 4000);
    }
  };

  useEffect(() => {
    const onChange = () => {
      const on = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (exitBtn.current) exitBtn.current.style.display = on ? 'block' : 'none';
      if (!on) {
        try {
          (screen.orientation as any)?.unlock?.();
        } catch {}
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggleSound = () => {
    soundUnlocked = true;
    mutedRef.current = !muted;
    setMuted(!muted);
    applySound();
    if (!mutedRef.current) player.current?.playVideo?.();
  };

  return (
    <View pointerEvents={visible ? 'box-none' : 'none'} style={[styles.wrap, { top, height, left, width: width ?? '100%', opacity: visible ? 1 : 0 }]}>
      {React.createElement('div', { ref: host, style: { position: 'absolute', inset: 0, background: '#000' } })}
      <View style={styles.controls}>
        <Pressable onPress={toggleSound} style={styles.sound} hitSlop={8} accessibilityLabel={muted ? 'Увімкнути звук' : 'Вимкнути звук'}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
          {muted ? <Text style={styles.soundText}>Звук</Text> : null}
        </Pressable>
        <Pressable onPress={goFullscreen} style={[styles.sound, styles.fs]} hitSlop={8} accessibilityLabel="На весь екран">
          <Ionicons name="expand" size={18} color="#fff" />
          <Text style={styles.soundText}>На весь екран</Text>
        </Pressable>
      </View>
      {hint ? <Text style={styles.hint}>Натисніть ⛶ у правому нижньому куті відео та поверніть телефон</Text> : null}
    </View>
  );
}

export const USES_FEED_PLAYER = true;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', backgroundColor: '#000', zIndex: 3 },
  controls: { position: 'absolute', left: 12, bottom: -46, flexDirection: 'row', gap: 8 },
  fs: { backgroundColor: 'rgba(255,255,255,0.14)' },
  hint: { position: 'absolute', left: 12, right: 90, bottom: -90, color: '#fff', fontSize: 12, fontWeight: '600' },
  sound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
  },
  soundText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
