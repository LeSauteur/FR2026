// Шкала роялти от месячного комиссионного оборота офиса.
// Перенесено из Dom2: pub/domian-calculator-a4/assets/js/constants.js (ROYALTY_RATES).
// Граница не включается: оборот ровно 500 000 ₽ уже попадает в ставку 6,5 %.

export const ROYALTY_POLICY_2026 = Object.freeze({
  id: 'royalty-2026.1',
  title: 'Роялти 2026',
  source: 'Dom2 / constants.js',
  brackets: Object.freeze([
    { limit: 500_000, rate: 0.07 },
    { limit: 750_000, rate: 0.065 },
    { limit: 1_000_000, rate: 0.06 },
    { limit: 1_500_000, rate: 0.055 },
    { limit: 2_000_000, rate: 0.05 },
    { limit: 2_500_000, rate: 0.045 },
    { limit: 3_000_000, rate: 0.04 },
    { limit: 4_000_000, rate: 0.035 },
    { limit: Infinity, rate: 0.03 },
  ].map(Object.freeze)),
});
