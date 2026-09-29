// Расчётные движки кабинета. Чистые функции без DOM и хранилища:
// одна и та же формула работает в браузере, на сервере и в тестах.

import { ROYALTY_POLICY_2026 } from './policies/royalty-2026.js';
import { MOTIVATION_POLICY_2026 } from './policies/motivation-2026.js';

export const POLICIES = Object.freeze({
  [ROYALTY_POLICY_2026.id]: ROYALTY_POLICY_2026,
  [MOTIVATION_POLICY_2026.id]: MOTIVATION_POLICY_2026,
});

export function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// ---------- Роялти ----------

export function royaltyRate(turnover, policy = ROYALTY_POLICY_2026) {
  const amount = positiveNumber(turnover);
  const bracket = policy.brackets.find((item) => amount < item.limit);
  return bracket ? bracket.rate : 0;
}

export function calculateRoyalty(input, policy = ROYALTY_POLICY_2026) {
  const turnover = positiveNumber(input?.turnover);
  const rate = royaltyRate(turnover, policy);
  const royalty = roundMoney(turnover * rate);
  return { policyId: policy.id, turnover, rate, royalty, remainder: roundMoney(turnover - royalty) };
}

// ---------- Мотивация: пакет агента и уровни ----------

function levelFor(levels, amount) {
  let matched = { level: 0, threshold: 0, stipendMonthly: 0 };
  for (const item of levels) {
    if (amount >= item.threshold) matched = { stipendMonthly: 0, ...item };
  }
  return matched;
}

export function packageByTenure(months, status, policy = MOTIVATION_POLICY_2026) {
  if (status === 'trainee') return policy.packages.find((p) => p.id === 'newcomer');
  const normalized = Math.max(0, Math.floor(positiveNumber(months)));
  let matched = policy.packages.find((p) => p.id === 'standard');
  for (const item of policy.packages) {
    if (item.status === 'partner' && normalized >= item.tenureMonths) matched = item;
  }
  return matched;
}

export function packageByPerformance(level, policy = MOTIVATION_POLICY_2026) {
  const normalized = Math.max(1, Math.min(7, Math.floor(Number(level) || 1)));
  let matched = policy.packages.find((p) => p.id === 'standard');
  for (const item of policy.packages) {
    if (item.performanceLevel !== null && normalized >= item.performanceLevel) matched = item;
  }
  return matched;
}

// Пакет по результату полугодия (Dom2 / career-engine.js → getPerformanceDecision):
// подтверждённый уровень выше прошлого пакета — повышение; ниже — снижение
// ровно на одну ступень (не ниже «Стандарта»); не подтверждён — без изменений.
export function performanceDecision(previousPackageId, halfYearLevel, confirmed, policy = MOTIVATION_POLICY_2026) {
  const standard = policy.packages.find((p) => p.id === 'standard');
  const found = policy.packages.find((p) => p.id === previousPackageId);
  const previous = found && found.status === 'partner' ? found : standard;
  const level = Math.floor(Number(halfYearLevel) || 0);

  if (!confirmed || level < 1 || level > 7) {
    return { package: previous, action: 'hold', reason: 'Результат полугодия не подтверждён — пакет по результатам не изменился.' };
  }
  const target = packageByPerformance(level, policy);
  if (target.rank > previous.rank) {
    return { package: target, action: 'promote', reason: 'Подтверждённый уровень повышает пакет по результатам.' };
  }
  if (target.rank < previous.rank) {
    const rank = Math.max(1, previous.rank - 1);
    return { package: policy.packages[rank], action: 'demote-one-step', reason: 'Результат ниже требований пакета — снижение на одну ступень.' };
  }
  return { package: previous, action: 'hold', reason: 'Подтверждённый уровень соответствует текущему пакету.' };
}

// Итоговый пакет — лучший из «по стажу» и «по результату» (при равенстве — по стажу).
// Стажёр всегда получает пакет «Новичок».
export function calculateMotivation(input, policy = MOTIVATION_POLICY_2026) {
  const status = input?.status === 'trainee' ? 'trainee' : 'partner';
  const quarterDeposits = positiveNumber(input?.quarterDeposits);
  const quarterCommission = positiveNumber(input?.quarterCommission);
  const halfYearCommission = positiveNumber(input?.halfYearCommission);

  const quarter = levelFor(policy.quarterLevels, quarterCommission);
  const halfYear = levelFor(policy.halfYearLevels, halfYearCommission);
  const byTenure = packageByTenure(input?.tenureMonths, status, policy);
  const decision = status === 'trainee'
    ? { package: byTenure, action: 'not-applicable', reason: 'Для стажёра пакет по результатам не применяется.' }
    : performanceDecision(input?.previousPackage, halfYear.level, input?.halfYearConfirmed === true, policy);
  const byPerformance = decision.package;
  const effective = byTenure.rank >= byPerformance.rank ? byTenure : byPerformance;

  const partnershipConfirmed = status !== 'trainee' && quarterDeposits >= policy.partnershipQuarterDeposits;
  const stipendPackage = effective.id === 'standard' || effective.id === 'extended';
  const stipendAvailable = partnershipConfirmed && stipendPackage && quarter.level >= 3;

  return {
    policyId: policy.id,
    status,
    package: { id: effective.id, label: effective.label, floorRate: effective.floorRate, maxRate: effective.maxRate },
    packageSource: effective === byTenure ? 'tenure' : 'performance',
    byTenure: byTenure.label,
    byPerformance: byPerformance.label,
    performanceAction: decision.action,
    performanceReason: decision.reason,
    quarterLevel: quarter.level,
    halfYearLevel: halfYear.level,
    partnershipConfirmed,
    stipendMonthly: stipendAvailable ? quarter.stipendMonthly : 0,
    stipendReason: !partnershipConfirmed
      ? `За квартал меньше ${policy.partnershipQuarterDeposits.toLocaleString('ru-RU')} ₽ задатков — стипендия недоступна.`
      : !stipendPackage
        ? 'Стипендия предусмотрена только для пакетов «Стандарт» и «Расширенный».'
        : stipendAvailable
          ? 'Ежемесячная выплата в следующем квартале по подтверждённому уровню.'
          : 'Результат квартала ниже 3-го уровня, с которого выплачивается стипендия.',
    travelLevelReached: halfYear.level >= policy.travelMinimumHalfYearLevel,
  };
}

export const CALCULATORS = Object.freeze({
  royalty: { title: 'Роялти', policyId: ROYALTY_POLICY_2026.id, run: calculateRoyalty },
  motivation: { title: 'Пакет мотивации агента', policyId: MOTIVATION_POLICY_2026.id, run: calculateMotivation },
});
