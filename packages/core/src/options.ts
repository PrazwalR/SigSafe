export interface DecodeOptions {
  chainId?: number;
  rpcUrl?: string;
  offline?: boolean;
  customBlocklist?: string[];
}

export interface ResolvedOptions extends DecodeOptions {
  chainId: number;
  offline: boolean;
  /**
   * Whether the caller passed an explicit chainId. The chain-mismatch rule only
   * fires when this is true — otherwise the default (1) would false-positive on
   * every L2 payload.
   */
  chainIdExplicit: boolean;
}
