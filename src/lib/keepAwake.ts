import { useEffect } from 'react';
import { Platform } from 'react-native';

type Sentinel = { release: () => Promise<void> };

/** Не даємо екрану згаснути, поки active (режим готування). Працює в браузерах із Wake Lock API. */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let lock: Sentinel | null = null;
    let alive = true;
    const acquire = () =>
      wl
        .request('screen')
        .then((l) => {
          if (alive) lock = l;
          else l.release().catch(() => {});
        })
        .catch(() => {});
    acquire();
    // після повернення у вкладку замок знімається браузером — беремо знову
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
