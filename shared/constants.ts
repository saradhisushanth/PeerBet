/** Fallback admin username when `ADMIN_USERNAME` is unset in `.env` (server + Vite client both prefer env). */
export const ADMIN_USERNAME = "Prem18";

/** Username length bounds (register UI; align with server auth if validated there). */
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 24;

/** Minimum stake per bet (entry fee per match, in rupees). */
export const MIN_STAKE = 50;

/** Maximum stake per bet (coins). Stops unrealistic or abusive inputs. */
export const MAX_STAKE = 10_000;

/** Balance below this shows "in the red" / consider topping up message (display only). */
export const LOW_BALANCE_THRESHOLD = 200;

/** Deduction per consecutive missed match (from 2nd miss onward). 1st miss = no deduction. */
export const MISSED_MATCH_PENALTY = 50;

/** Bet insurance: flat cost (coins) and refund % of stake when bet loses. */
export const INSURANCE_COST = 200;
export const INSURANCE_REFUND_PERCENT = 50;

/**
 * Underdog = side with lower **total stake** (not player count). If stakes tie, away is the underdog side.
 * Winners on the underdog side multiply **base profit** by `underdogProfitMultiplier(homeStake, awayStake)`:
 * equal stakes → this constant; else `1 + UNDERDOG_RATIO_BLEND × (ratio − 1) / ratio`, ratio = max/min.
 */
export const EQUAL_STAKE_UNDERDOG_MULTIPLIER = 1.1;
/** Blend `k` in dynamic multiplier: 1 + k × (ratio − 1) / ratio when stakes are unequal. */
export const UNDERDOG_RATIO_BLEND = 0.5;

/** Streak bonus (coins) for consecutive wins: 2→100, 3→200, 4→400, 5→800. */
export const STREAK_BONUS: Record<number, number> = {
  2: 100,
  3: 200,
  4: 400,
  5: 800,
};

/** Solo participant (only one player bet on the match): win bonus = stake × this multiplier (e.g. 2 = double the stake). */
export const SOLO_WIN_BONUS_MULTIPLIER = 2;
/** Solo participant loses: refund this % of stake ("bye" – no full penalty). Leaderboard not counted as a loss. */
export const SOLO_LOSS_REFUND_PERCENT = 50;

/** When match has no explicit toss time, betting closes this many minutes before match start. */
export const TOSS_DEFAULT_MINUTES_BEFORE_MATCH = 30;

/** Tournament prize distribution: share of prize pool by rank (1st, 2nd, 3rd, 4th, 5th). Percent. */
export const PRIZE_DISTRIBUTION_PERCENT = [40, 25, 15, 10, 5] as const;
/** House / rollover share of prize pool (percent). */
export const HOUSE_CUT_PERCENT = 5;
