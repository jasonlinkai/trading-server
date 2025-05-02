export interface Position {
  symbol: string;
  size: number;
  notional: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  unrealisedPnl: number;
  timestamp: string;
  _hasPosition: boolean;
}