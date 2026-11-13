import { Linking, Platform } from 'react-native';
import { ObsidianOpts } from './types';

/**
 * Збереження в базу Obsidian (BAZA) — так само, як в InfoCasting.
 *
 * Способи:
 *  - github — нотатка комітиться в окрему гілку репозиторію бази (за замовчуванням «infocasting»,
 *             спільну для InfoCasting, MovieCasting і CookCasting). Плагін BAZA сам забирає її
 *             на кожному пристрої: при запуску, при поверненні в Obsidian і щохвилини.
 *  - uri    — відкривається Obsidian на цьому пристрої (obsidian://new);
 *  - file   — завантажується .md-файл.
 *
 * Кожна нотатка має свій номер у властивостях (`moviecasting: <id>` чи `cookcasting: <id>`):
 * повторне збереження оновлює ту саму нотатку в гілці, а база доповнює свою — без дублів.
 */

export const APP_NAME = 'CookCasting';
/** властивість з номером запису застосунку */
export const ID_KEY = 'cookcasting';

export const DEFAULT_OBSIDIAN: ObsidianOpts = {
  method: 'github',
  vault: 'BAZA',
  folder: '4 Колекції/4.1 Рецепти',
  repo: 'zharoslaw31/BAZA',
  branch: 'infocasting',
  token: '',
};

export const obsidianOf = (o?: Partial<ObsidianOpts>): ObsidianOpts => ({ ...DEFAULT_OBSIDIAN, ...(o ?? {}) });

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date | number = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const stamp = (d = new Date()) => `${isoDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const yamlStr = (s?: string | null) => (s ? JSON.stringify(s) : '');
export const cleanName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110)
    .replace(/[\s.]+$/, '');

/** Свій текст з вікна збереження → пункти списку (кожен рядок — окремий пункт). */
export function bulletLines(t?: string) {
  const lines = (t ?? '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
  return lines.length ? lines.map((l) => '- ' + l) : ['- '];
}

// ───────────────────────── збереження ─────────────────────────

export type SaveResult = { ok: true; path: string; how: string; open?: string; updated?: boolean } | { ok: false; error: string };

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (s: string) => {
  const bin = atob(s.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

async function gh(o: ObsidianOpts, path: string, init?: RequestInit) {
  return fetch(`https://api.github.com/repos/${o.repo}${path ? '/' + path : ''}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${o.token.trim()}`, 'x-github-api-version': '2022-11-28', ...(init?.headers ?? {}) },
  });
}

/** Шлях у гілці: та сама нотатка (з тим самим номером) — оновлюю; інша з такою ж назвою — беру іншу назву. */
async function findPath(o: ObsidianOpts, names: string[], id: string): Promise<{ path: string; sha?: string } | { error: string }> {
  const ref = o.branch ? `?ref=${encodeURIComponent(o.branch)}` : '';
  const folder = o.folder.replace(/\/+$/, '');
  const tries = [...names];
  for (let n = 2; n < 30; n++) tries.push(`${names[names.length - 1]} ${n}`);
  const mine = new RegExp(`^${ID_KEY}:\\s*["']?${id.replace(/[-]/g, '\\-')}["']?\\s*$`, 'm');
  for (const name of tries) {
    const path = `${folder}/${name}.md`;
    const r = await gh(o, `contents/${encPath(path)}${ref}`);
    if (r.status === 404) return { path };
    if (r.status === 401 || r.status === 403) return { error: 'GitHub не пускає: перевірте ключ (потрібен доступ Contents: Read and write до репозиторію бази)' };
    if (!r.ok) return { error: `GitHub: HTTP ${r.status}` };
    const d = (await r.json()) as { sha?: string; content?: string };
    let text = '';
    try {
      text = d.content ? unb64(d.content) : '';
    } catch {
      text = '';
    }
    if (mine.test(text)) return { path, sha: d.sha };
  }
  return { error: 'Забагато нотаток з такою назвою' };
}

async function saveGithub(o: ObsidianOpts, names: string[], id: string, md: string): Promise<SaveResult> {
  if (!o.token.trim() || !o.repo.includes('/')) return { ok: false, error: 'Підключіть базу: Профіль → Obsidian' };
  const at = await findPath(o, names, id);
  if ('error' in at) return { ok: false, error: at.error };
  const title = at.path.split('/').pop()!.replace(/\.md$/, '');
  const res = await gh(o, `contents/${encPath(at.path)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: `${APP_NAME}: ${title}`, content: b64(md), ...(at.sha ? { sha: at.sha } : {}), ...(o.branch ? { branch: o.branch } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { message?: string }).message ?? 'HTTP ' + res.status;
    return { ok: false, error: /branch/i.test(msg) ? `У базі нема гілки «${o.branch}»` : `GitHub: ${msg}` };
  }
  return { ok: true, path: at.path, how: at.sha ? 'оновлено в базі' : 'у базу', updated: !!at.sha };
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function saveUri(o: ObsidianOpts, title: string, md: string): Promise<SaveResult> {
  const file = `${o.folder.replace(/\/+$/, '')}/${title}`;
  const base = `obsidian://new?vault=${encodeURIComponent(o.vault)}&file=${encodeURIComponent(file)}`;
  let url = `${base}&content=${encodeURIComponent(md)}`;
  // довгі нотатки — через буфер обміну (адреса має межу довжини)
  if (url.length > 12000 && Platform.OS === 'web' && (await copy(md))) url = `${base}&clipboard=true`;
  // браузер може не відкрити obsidian:// не з дотику — тому повертаю посилання для окремої кнопки
  return { ok: true, path: file + '.md', how: 'в Obsidian', open: url };
}

function saveFile(title: string, md: string): SaveResult {
  if (Platform.OS !== 'web') return { ok: false, error: 'Завантаження файлу працює у браузері' };
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { ok: true, path: title + '.md', how: 'файлом' };
}

export type Note = {
  /** назва нотатки */
  title: string;
  /** запасні назви, якщо зайнята іншою нотаткою (напр. «Дюна (2021)») */
  alt?: string[];
  /** номер запису в застосунку */
  id: string;
  md: string;
};

export async function saveToObsidian(o: ObsidianOpts, n: Note): Promise<SaveResult> {
  try {
    if (o.method === 'github') return await saveGithub(o, [n.title, ...(n.alt ?? [])], n.id, n.md);
    if (o.method === 'file') return saveFile(n.title, n.md);
    return await saveUri(o, n.title, n.md);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Помилка збереження' };
  }
}

export function openUrl(url: string) {
  if (Platform.OS === 'web') window.location.href = url;
  else Linking.openURL(url).catch(() => {});
}

/** Посилання, що відкриває нотатку в Obsidian. */
export const obsidianOpenUrl = (vault: string, path: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`;

/** Перевірити доступ до бази й гілки. */
export async function checkBase(o: ObsidianOpts): Promise<{ ok: true; branch: string; branchExists: boolean } | { ok: false; error: string }> {
  if (!o.token.trim()) return { ok: false, error: 'Вставте ключ' };
  try {
    const r = await gh(o, '');
    if (r.status === 401) return { ok: false, error: 'Ключ недійсний — створіть новий' };
    if (r.status === 404 || r.status === 403) return { ok: false, error: `Ключ не бачить ${o.repo}: у ключі виберіть цей репозиторій (Repository access → Only select repositories)` };
    if (!r.ok) return { ok: false, error: `GitHub: HTTP ${r.status}` };
    const d = (await r.json()) as { permissions?: { push?: boolean }; default_branch?: string };
    if (d.permissions && d.permissions.push === false) return { ok: false, error: 'Ключ може лише читати базу: дайте Contents → Read and write' };
    const branch = o.branch || d.default_branch || 'master';
    const b = await gh(o, `branches/${encodeURIComponent(branch)}`);
    return { ok: true, branch, branchExists: b.ok };
  } catch {
    return { ok: false, error: 'Немає зʼєднання з GitHub' };
  }
}
