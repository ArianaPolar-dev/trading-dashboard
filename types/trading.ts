export type OperationType = 'trade' | 'deposit' | 'withdraw';

export interface Trade {
  id: string;
  date: string;
  amount: number;
  level: number;
  result: 'win' | 'loss';
  payout: number;
}

export interface BalanceMovement {
  id: string;
  date: string;
  type: 'deposit' | 'withdraw';
  amount: number;
}

export interface AppState {
  startingBalance: number;
  baseBet: number;
  maxLevel: number;
  reservedForLevel4: number;
  payout: number;
  trades: Trade[];
  movements: BalanceMovement[];
  retiroPct?: number;
  semaforoPct?: number;
  semaforoDias?: number;
}
