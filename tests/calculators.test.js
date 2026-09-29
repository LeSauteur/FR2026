import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoyalty, royaltyRate, calculateMotivation, packageByTenure } from '../shared/calculators.js';
import { weekdayId, isIsoDate } from '../shared/dates.js';

test('роялти: граница шкалы не включается', () => {
  assert.equal(royaltyRate(0), 0.07);
  assert.equal(royaltyRate(499_999.99), 0.07);
  assert.equal(royaltyRate(500_000), 0.065);
  assert.equal(royaltyRate(3_999_999), 0.035);
  assert.equal(royaltyRate(4_000_000), 0.03);
  assert.equal(royaltyRate(50_000_000), 0.03);
});

test('роялти: сумма и остаток', () => {
  const r = calculateRoyalty({ turnover: 2_540_000 });
  assert.equal(r.rate, 0.04);
  assert.equal(r.royalty, 101_600);
  assert.equal(r.remainder, 2_438_400);
  assert.equal(r.policyId, 'royalty-2026.1');
});

test('роялти: мусор на входе даёт ноль, а не NaN', () => {
  assert.equal(calculateRoyalty({ turnover: 'abc' }).royalty, 0);
  assert.equal(calculateRoyalty({ turnover: -5 }).royalty, 0);
  assert.equal(calculateRoyalty(undefined).royalty, 0);
});

test('мотивация: пакет по стажу', () => {
  assert.equal(packageByTenure(0, 'partner').id, 'standard');
  assert.equal(packageByTenure(11, 'partner').id, 'standard');
  assert.equal(packageByTenure(12, 'partner').id, 'extended');
  assert.equal(packageByTenure(60, 'partner').id, 'individual');
  assert.equal(packageByTenure(100, 'trainee').id, 'newcomer');
});

test('мотивация: стажёр всегда «Новичок», стипендии нет', () => {
  const r = calculateMotivation({ status: 'trainee', tenureMonths: 30, quarterDeposits: 1e6, quarterCommission: 1e6 });
  assert.equal(r.package.id, 'newcomer');
  assert.equal(r.stipendMonthly, 0);
  assert.equal(r.performanceAction, 'not-applicable');
});

test('мотивация: подтверждённый результат повышает пакет', () => {
  const r = calculateMotivation({ tenureMonths: 3, previousPackage: 'standard', halfYearCommission: 1_600_000, halfYearConfirmed: true });
  assert.equal(r.halfYearLevel, 4);
  assert.equal(r.package.id, 'advanced');
  assert.equal(r.packageSource, 'performance');
});

test('мотивация: без подтверждения пакет по результатам не меняется', () => {
  const r = calculateMotivation({ tenureMonths: 3, previousPackage: 'standard', halfYearCommission: 3_000_000, halfYearConfirmed: false });
  assert.equal(r.package.id, 'standard');
  assert.equal(r.performanceAction, 'hold');
});

test('мотивация: падение результата снижает пакет на одну ступень', () => {
  const r = calculateMotivation({ tenureMonths: 0, previousPackage: 'premium', halfYearCommission: 500_000, halfYearConfirmed: true });
  assert.equal(r.performanceAction, 'demote-one-step');
  assert.equal(r.package.id, 'advanced');
});

test('мотивация: стаж перекрывает снижение по результату', () => {
  const r = calculateMotivation({ tenureMonths: 48, previousPackage: 'premium', halfYearCommission: 500_000, halfYearConfirmed: true });
  assert.equal(r.package.id, 'premiumPlus');
  assert.equal(r.packageSource, 'tenure');
});

test('мотивация: стипендия — «Стандарт», задатки от 250 000, квартал от 3-го уровня', () => {
  assert.equal(calculateMotivation({ tenureMonths: 1, quarterDeposits: 250_000, quarterCommission: 600_000 }).stipendMonthly, 3_000);
  assert.equal(calculateMotivation({ tenureMonths: 1, quarterDeposits: 249_999, quarterCommission: 1_500_000 }).stipendMonthly, 0);
  assert.equal(calculateMotivation({ tenureMonths: 1, quarterDeposits: 300_000, quarterCommission: 599_999 }).stipendMonthly, 0);
  assert.equal(calculateMotivation({ tenureMonths: 24, quarterDeposits: 300_000, quarterCommission: 1_500_000 }).stipendMonthly, 0);
});

test('даты: день недели и проверка формата', () => {
  assert.equal(weekdayId('2026-09-27'), 'sunday');
  assert.equal(weekdayId('2026-09-28'), 'monday');
  assert.ok(isIsoDate('2026-01-31'));
  assert.ok(!isIsoDate('31.01.2026'));
  assert.ok(!isIsoDate(undefined));
});
