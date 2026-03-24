import { EQUAL_STAKE_UNDERDOG_MULTIPLIER, UNDERDOG_RATIO_BLEND } from "./constants";

/**
 * Underdog = side with lower total stake. If stakes are equal, away is treated as underdog
 * (for multiplier rules when that side wins).
 */
export function getUnderdogTeamIdByStake(
  homeStake: number,
  awayStake: number,
  homeTeamId: string,
  awayTeamId: string,
): string {
  if (homeStake < awayStake) return homeTeamId;
  if (awayStake < homeStake) return awayTeamId;
  return awayTeamId;
}

/**
 * Multiplier applied to **base profit** when the winning side is the stake underdog.
 * - Equal stakes: 1.1 (away is nominal underdog per rules).
 * - Unequal: 1 + k × (ratio − 1) / ratio, ratio = max/min; if min is 0, use asymptotic limit 1 + k.
 */
export function underdogProfitMultiplier(homeStake: number, awayStake: number): number {
  const max = Math.max(homeStake, awayStake);
  const min = Math.min(homeStake, awayStake);
  if (max === min) return EQUAL_STAKE_UNDERDOG_MULTIPLIER;
  if (min <= 0) return 1 + UNDERDOG_RATIO_BLEND;
  const ratio = max / min;
  return 1 + UNDERDOG_RATIO_BLEND * (ratio - 1) / ratio;
}

/** Base profit from losing pool: (userStake / SW) × SL */
export function baseProfitFromPool(userStake: number, SW: number, SL: number): number {
  if (SW <= 0) return 0;
  return (userStake / SW) * SL;
}

/**
 * Gross payout multiple (payout ÷ stake) if this pick wins, from **raw parimutuel pool ratio only**:
 * `1 + SL/SW` where SW = total stake on the picked side and SL = total on the other side.
 * Same as stake + (stake/SW)×SL per unit stake. No underdog bonus — that is applied only at settlement.
 * (No streak, solo, or insurance.)
 */
export function impliedGrossReturnMultiplierForPick(
  pickedTeamId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeStake: number,
  awayStake: number,
): number {
  if (pickedTeamId !== homeTeamId && pickedTeamId !== awayTeamId) return 1;
  const pickedHome = pickedTeamId === homeTeamId;
  const SW = pickedHome ? homeStake : awayStake;
  const SL = pickedHome ? awayStake : homeStake;
  if (SW <= 0) return 1;
  return 1 + SL / SW;
}

/** Round for API / DB storage (e.g. history “2.35×”). */
export function roundOddsMultiplier(mult: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(mult * f) / f;
}
