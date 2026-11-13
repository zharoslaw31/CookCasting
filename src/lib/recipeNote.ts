import { bulletLines, cleanName, ID_KEY, isoDay, Note, stamp, yamlStr } from './obsidian';
import { areaOf, catOf } from './recipes';
import { SITE } from './share';
import { Recipe } from './types';

/** Що з рецептом: хочу приготувати / приготував сьогодні / уже готував раніше. */
export type CookStage = 'want' | 'today' | 'done';

/** Категорія страви так, як її знає Кухня в базі. */
export function kitchenCategory(r: Recipe): string {
  const text = `${r.name} ${r.nameEn} ${r.tags.join(' ')}`.toLowerCase();
  if (/суп|борщ|бульйон|soup|chowder|broth/.test(text)) return 'суп';
  if (/салат|salad/.test(text)) return 'салат';
  if (/напій|коктейль|смузі|drink|smoothie|cocktail/.test(text)) return 'напій';
  if (/хліб|булоч|кекс|печиво|\bbread\b|\bcake\b|muffin|cookie|bun\b/.test(text) && r.cat !== 'Dessert') return 'випічка';
  switch (r.cat) {
    case 'Dessert':
      return 'десерт';
    case 'Breakfast':
      return 'сніданок';
    case 'Side':
      return 'гарнір';
    case 'Starter':
      return 'закуска';
    default:
      return 'основне';
  }
}

export type RecipeExtra = {
  stage: CookStage;
  rating?: number | null;
  notes?: string;
  /** коли готував востаннє (для «Уже готував») */
  cookedAt?: number | null;
};

/** Нотатка рецепта у форматі Кухні бази: інгредієнти чекбоксами, кроки, «Мої зміни і поради». */
export function buildRecipeNote(r: Recipe, x: RecipeExtra): Note {
  const title = cleanName(r.name) || 'Без назви';
  const last = x.stage === 'today' ? isoDay() : x.stage === 'done' && x.cookedAt ? isoDay(x.cookedAt) : '';
  const area = areaOf(r.area);
  const link = `${SITE}/recipe/${r.id}`;
  const fm = [
    '---',
    'tags:',
    '  - тип/рецепт',
    '  - ресурс/харчування',
    `створено: ${stamp()}`,
    `категорія: ${kitchenCategory(r)}`,
    `час: ${r.time || ''}`,
    'порцій: ',
    'тарілка: ',
    `оцінка: ${x.rating ? x.rating : ''}`,
    `фото: ${r.img || ''}`,
    `джерело: ${r.src || link}`,
    `востаннє: ${last}`,
    `кухня: ${yamlStr(r.area === 'Unknown' ? '' : area.uk)}`,
    `${ID_KEY}: ${r.id}`,
    '---',
  ];
  const ingr = r.ingr.map((i) => `- [ ] ${i.n}${i.m ? ` — ${i.m}` : ''}`);
  const steps = r.steps.map((s, i) => `${i + 1}. ${s.replace(/\s+/g, ' ').trim()}`);
  const more: string[] = [];
  if (r.video) more.push(`- [Відео](https://www.youtube.com/watch?v=${r.video})`);
  if (r.src) more.push(`- [Оригінал рецепта](${r.src})`);
  more.push(`- [У CookCasting](${link})`);
  const extra = [r.area !== 'Unknown' ? `${area.flag} ${area.uk} кухня` : '', catOf(r.cat).uk, r.tags.length ? r.tags.join(', ') : ''].filter(Boolean).join(' · ');
  const body = [
    `# ${title}`,
    ...(r.nameEn && r.nameEn !== r.name ? [`*${r.nameEn.replace(/\*/g, '')}*`] : []),
    ...(extra ? ['', extra] : []),
    '',
    '## Інгредієнти',
    ...(ingr.length ? ingr : ['- [ ] ']),
    '',
    '## Приготування',
    ...(steps.length ? steps : ['1. ']),
    '',
    '## Мої зміни і поради',
    ...bulletLines(x.notes),
    '',
    '## Посилання',
    ...more,
    '',
  ];
  return { title, alt: r.nameEn && cleanName(r.nameEn) !== title ? [`${title} (${cleanName(r.nameEn)})`] : [], id: String(r.id), md: [...fm, ...body].join('\n') };
}
