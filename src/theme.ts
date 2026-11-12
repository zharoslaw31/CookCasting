export const colors = {
  bg: '#0E0B0A',
  bgElevated: '#181311',
  card: '#211A17',
  cardHigh: '#2B221E80',
  border: '#3A2E29',
  text: '#FAF6F3',
  textDim: '#BCAFA8',
  textMuted: '#85766F',
  accent: '#FF5A36',
  accent2: '#FFB13D',
  like: '#2EE59D',
  nope: '#FF4D67',
  cooked: '#4DA3FF',
  gold: '#FFC94D',
  overlay: 'rgba(14,11,10,0.72)',
};

export const gradients = {
  brand: ['#FF5A36', '#FFA53D'] as const,
  like: ['#21D4A0', '#2EE59D'] as const,
  nope: ['#FF4D67', '#FF7A59'] as const,
  cooked: ['#4D7CFF', '#4DA3FF'] as const,
  cardFade: ['transparent', 'rgba(14,11,10,0.55)', 'rgba(14,11,10,0.97)'] as const,
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 };

export const space = (n: number) => n * 4;

export const TAB_BAR_HEIGHT = 64;
