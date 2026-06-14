import type { InputType } from "./types.js";

export interface DecodeOptions {
  chainId?: number;
  rpcUrl?: string;
  offline?: boolean;
  customBlocklist?: string[];
  /**
   * Force how the input is interpreted, bypassing auto-detection. The calling
   * wallet always knows the signing method, and a hex-encoded personal_sign
   * message is byte-indistinguishable from calldata — pass the method here
   * (e.g. InputType.PERSONAL_SIGN) so it is never mis-decoded as a contract call.
   */
  inputType?: InputType;
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
