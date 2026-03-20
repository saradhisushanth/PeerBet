export interface ServerToClientEvents {
  matchUpdate: (data: MatchUpdatePayload) => void;
  betPlaced: (data: BetPlacedPayload) => void;
  betRemoved: (data: BetRemovedPayload) => void;
  betSettled: (data: BetSettledPayload) => void;
  leaderboardUpdate: (data: LeaderboardEntry[]) => void;
  upsetAlert: (data: UpsetAlertPayload) => void;
  walletTopUp: (data: WalletTopUpPayload) => void;
}

export interface WalletTopUpPayload {
  amount: number;
  newBalance: number;
  newPrizePoolContribution: number;
}

export interface BetRemovedPayload {
  matchId: string;
  userId: string;
  username: string;
  amount: number;
  teamShortName: string;
}

export interface UpsetAlertPayload {
  matchId: string;
  winnerTeamId: string;
  message: string;
}

export interface ClientToServerEvents {
  joinMatch: (matchId: string) => void;
  leaveMatch: (matchId: string) => void;
}

export interface MatchUpdatePayload {
  matchId: string;
  status: string;
  winnerTeamId?: string;
  /** ISO datetimes when admin updates schedule (broadcast so all clients update without refresh) */
  startTime?: string;
  tossTime?: string | null;
}

export interface BetPlacedPayload {
  matchId: string;
  userId: string;
  selectedTeamId: string;
  amount: number;
  insured?: boolean;
}

export interface BetSettledPayload {
  betId: string;
  userId: string;
  result: "WIN" | "LOSS";
  payout: number;
  insuredRefund?: number;
  streakBonus?: number;
  soloBonus?: number;
  soloByeRefund?: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalWins: number;
  totalLosses: number;
  profit: number;
  underdogBonus: number;
  rank: number | null;
}

export interface PlaceBetPayload {
  matchId: string;
  selectedTeamId: string;
  amount: number;
  insured?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
