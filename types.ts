
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface WalletEntry {
  id: string;
  address: string;
  privateKey: string;
  mnemonic: string;
  balance: string;
  timestamp: number;
  network: string;
}

export interface NodeStatus {
  connected: boolean;
  blockNumber: number | null;
  latency: number | null;
  rpcUrl: string;
  chainId: number | null;
  gasPrice?: string;
}

export interface SecurityReport {
  score: number;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendations: string[];
  probabilityPercentage?: string;
  timeToCollision?: string;
  entropyEfficiency?: number;
  quantumResonance?: number;
}

export interface BlockInfo {
  number: number;
  hash: string;
  timestamp: number;
  gasUsed: string;
}

export interface SpinnerData {
  id: string | number;
  mutationName: string;
  reasoning: string;
  p5Code: string;
  totalTokens?: number;
  generationTimeMs?: number;
  tokensPerSecond?: number | string;
  tpsHistory: number[];
}

export interface CandidateState {
  data: SpinnerData | null;
  buffer: string;
  tpsHistory: number[];
}
