// Политика мотивации агентов 2026.
// Перенесено из Dom2: assets/js/policies/motivation-policy-2026.js — значения без изменений.

const packages = [
  { id: 'newcomer', rank: 0, label: 'Новичок', status: 'trainee', floorRate: 30, maxRate: 40, tenureMonths: 0, performanceLevel: null },
  { id: 'standard', rank: 1, label: 'Стандарт', status: 'partner', floorRate: 45, maxRate: 80, tenureMonths: 0, performanceLevel: 1 },
  { id: 'extended', rank: 2, label: 'Расширенный', status: 'partner', floorRate: 50, maxRate: 80, tenureMonths: 12, performanceLevel: 3 },
  { id: 'advanced', rank: 3, label: 'Продвинутый', status: 'partner', floorRate: 55, maxRate: 80, tenureMonths: 24, performanceLevel: 4 },
  { id: 'premium', rank: 4, label: 'Премиум', status: 'partner', floorRate: 60, maxRate: 80, tenureMonths: 36, performanceLevel: 5 },
  { id: 'premiumPlus', rank: 5, label: 'Премиум +', status: 'partner', floorRate: 65, maxRate: 80, tenureMonths: 48, performanceLevel: 6 },
  { id: 'individual', rank: 6, label: 'Индивидуальный', status: 'partner', floorRate: 70, maxRate: 80, tenureMonths: 60, performanceLevel: 7 },
].map(Object.freeze);

export const MOTIVATION_POLICY_2026 = Object.freeze({
  id: 'motivation-2026.1',
  title: 'Мотивация 2026',
  source: 'Dom2 / motivation-policy-2026.js',
  partnershipQuarterDeposits: 250_000,
  travelMinimumHalfYearLevel: 4,
  individualAdvertisingRate: 0.03,
  individualAdvertisingLimit: 15_000,
  packages: Object.freeze(packages),
  quarterLevels: Object.freeze([
    { level: 1, threshold: 250_000, stipendMonthly: 0 },
    { level: 2, threshold: 400_000, stipendMonthly: 0 },
    { level: 3, threshold: 600_000, stipendMonthly: 3_000 },
    { level: 4, threshold: 800_000, stipendMonthly: 4_000 },
    { level: 5, threshold: 1_000_000, stipendMonthly: 5_000 },
    { level: 6, threshold: 1_200_000, stipendMonthly: 6_000 },
    { level: 7, threshold: 1_500_000, stipendMonthly: 7_000 },
  ].map(Object.freeze)),
  halfYearLevels: Object.freeze([
    { level: 1, threshold: 500_000 },
    { level: 2, threshold: 800_000 },
    { level: 3, threshold: 1_200_000 },
    { level: 4, threshold: 1_600_000 },
    { level: 5, threshold: 2_000_000 },
    { level: 6, threshold: 2_400_000 },
    { level: 7, threshold: 3_000_000 },
  ].map(Object.freeze)),
});
