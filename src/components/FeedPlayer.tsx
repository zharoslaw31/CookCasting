// У нативному додатку кожен трейлер має власний плеєр зі звуком (див. TrailerPlayer),
// тому спільний плеєр потрібен лише у браузері (FeedPlayer.web.tsx).
export function FeedPlayer(_: { videoKey: string | null; top: number; height: number; left?: number; width?: number; visible: boolean; playing: boolean }) {
  return null;
}

export const USES_FEED_PLAYER = false;
