import { Platform } from 'react-native';

/**
 * Веб-версія: перевіряє, чи на сайті вийшла нова збірка, і перезавантажує сторінку.
 * GitHub Pages і телефони кешують сайт до ~10 хвилин, тож без цього оновлення
 * з'являлись би із затримкою.
 *
 * Підпис збірки — назви ВСІХ скриптів сторінки. Лише entry-… не годиться:
 * він майже ніколи не змінюється, а сам код лежить у __common-….
 */
const SCRIPT_RE = /[\w-]+-[a-f0-9]{16,}\.js/g;
const root = () => `${location.pathname.split('/').slice(0, 2).join('/')}/`;

const signature = (names: (string | undefined | null)[]) =>
  [...new Set(names.filter(Boolean) as string[])].sort().join('|');

const currentBuild = () =>
  signature(
    Array.from(document.scripts)
      .filter((s) => s.src.includes('/_expo/static/js/'))
      .map((s) => s.src.split('/').pop()),
  );

let reloading = false;
async function reloadFresh() {
  if (reloading) return;
  // захист від нескінченних перезавантажень (напр., без інтернету)
  try {
    const last = Number(sessionStorage.getItem('cc-reload') ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('cc-reload', String(Date.now()));
  } catch {}
  reloading = true;
  // оновлюємо кеш самої сторінки, інакше телефон може перезавантажити стару копію
  await Promise.all([location.href, root()].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
  location.reload();
}

let checking = false;
async function check() {
  if (checking || reloading || !navigator.onLine) return;
  checking = true;
  try {
    const mine = currentBuild();
    if (!mine) return;
    const res = await fetch(`${root()}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok && res.status !== 404) return;
    const html = await res.text();
    const scripts = html.match(/<script[^>]+src="[^"]*_expo\/static\/js\/[^"]+"/g) ?? [];
    const latest = signature(scripts.map((s) => s.match(SCRIPT_RE)?.[0]));
    if (latest && latest !== mine) await reloadFresh();
  } catch {
  } finally {
    checking = false;
  }
}

export function startAutoUpdate() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  setInterval(check, 5 * 60 * 1000);

  // Після нової публікації старі частини сайту зникають: якщо екран не довантажився —
  // одразу беремо свіжу версію замість порожнього екрана.
  const chunkFailed = (msg: string) => /Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
  window.addEventListener('unhandledrejection', (e) => {
    const m = String((e.reason as Error | undefined)?.message ?? e.reason ?? '');
    if (chunkFailed(m)) reloadFresh();
  });
  window.addEventListener('error', (e) => {
    if (chunkFailed(String(e.message ?? ''))) reloadFresh();
  });
}
