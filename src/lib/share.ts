import { Platform, Share } from 'react-native';
import { Recipe } from './types';

export const SITE = 'https://zharoslaw31.github.io/CookCasting';
const base = () => (Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin + '/CookCasting' : SITE);

async function shareText(title: string, text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  const full = url ? `${text}\n${url}` : text;
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return 'shared';
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'shared';
      }
    }
    try {
      await nav?.clipboard?.writeText(full);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message: full });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** Поділитись рецептом: системне меню, а якщо його немає — копіюємо посилання. */
export function shareRecipe(r: Pick<Recipe, 'id' | 'name'>) {
  return shareText(r.name, `${r.name} — рецепт у CookCasting`, `${base()}/recipe/${r.id}`);
}

/** Поділитись повним рецептом текстом (інгредієнти + кроки). */
export function shareRecipeText(r: Recipe) {
  const text = [
    r.name,
    '',
    'Інгредієнти:',
    ...r.ingr.map((i) => `• ${i.n}${i.m ? ` — ${i.m}` : ''}`),
    '',
    'Приготування:',
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
  return shareText(r.name, text, `${base()}/recipe/${r.id}`);
}

/** Поділитись списком покупок. */
export function shareList(title: string, lines: string[]) {
  return shareText(title, `${title}\n${lines.map((l) => `☐ ${l}`).join('\n')}`);
}
