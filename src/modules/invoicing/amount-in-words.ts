const UNITS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0 à 99, orthographe traditionnelle (« vingt et un », « soixante-dix », « quatre-vingts »). */
function belowHundred(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) {
    // 70-79 : soixante + 10-19 ; 90-99 : quatre-vingt + 10-19
    const base = ten === 7 ? 'soixante' : 'quatre-vingt';
    const rest = belowHundred(10 + unit);
    return ten === 7 && unit === 1 ? `${base} et ${rest}` : `${base}-${rest}`;
  }
  if (ten === 8) return unit === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITS[unit]}`;
  if (unit === 0) return TENS[ten];
  if (unit === 1) return `${TENS[ten]} et un`;
  return `${TENS[ten]}-${UNITS[unit]}`;
}

/** 0 à 999 ; `final` : le groupe termine le nombre (« deux cents » mais « deux cent mille »). */
function belowThousand(n: number, final: boolean): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const words: string[] = [];
  if (hundred > 0) {
    const cents = hundred > 1 && rest === 0 && final ? 'cents' : 'cent';
    words.push(hundred === 1 ? 'cent' : `${UNITS[hundred]} ${cents}`);
  }
  if (rest > 0 || hundred === 0) {
    const text = belowHundred(rest);
    // « quatre-vingts » perd son s devant « mille »
    words.push(!final && text === 'quatre-vingts' ? 'quatre-vingt' : text);
  }
  return words.join(' ');
}

/** Nombre entier en toutes lettres, en français (jusqu'aux milliards). */
export function numberToFrenchWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'zéro';
  const groups: [number, string, string][] = [
    [1_000_000_000, 'milliard', 'milliards'],
    [1_000_000, 'million', 'millions'],
  ];
  const words: string[] = [];
  for (const [size, one, many] of groups) {
    const count = Math.floor(n / size);
    if (count > 0) {
      words.push(`${belowThousand(count, true)} ${count > 1 ? many : one}`);
      n %= size;
    }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    // « mille » est invariable et « un mille » ne se dit pas
    words.push(thousands === 1 ? 'mille' : `${belowThousand(thousands, false)} mille`);
    n %= 1000;
  }
  if (n > 0) words.push(belowThousand(n, true));
  return words.join(' ');
}

/** Montant en francs CFA, en lettres : « dix mille francs CFA ». */
export const amountInWords = (xof: number) =>
  `${numberToFrenchWords(xof)} ${Math.floor(xof) > 1 ? 'francs' : 'franc'} CFA`;
