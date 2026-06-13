import type { Address, Hex } from "viem";

export interface DecodedIntent {
  summary: string;
  action: Action;
  risk: RiskLevel;
  flags: RiskFlag[];
  inputType: InputType;
  details: IntentDetails;
  raw: string;
  chainId?: number;
}

export enum Action {
  TOKEN_TRANSFER = "TOKEN_TRANSFER",
  TOKEN_APPROVAL = "TOKEN_APPROVAL",
  PERMIT = "PERMIT",
  SET_APPROVAL_FOR_ALL = "SET_APPROVAL_FOR_ALL",
  SWAP = "SWAP",
  DELEGATION = "DELEGATION",
  OWNERSHIP_TRANSFER = "OWNERSHIP_TRANSFER",
  CONTRACT_CALL = "CONTRACT_CALL",
  CONTRACT_DEPLOY = "CONTRACT_DEPLOY",
  NATIVE_TRANSFER = "NATIVE_TRANSFER",
  UNKNOWN = "UNKNOWN",
}

export enum RiskLevel {
  SAFE = "SAFE",
  INFO = "INFO",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
}

export interface RiskFlag {
  id: string;
  severity: RiskLevel;
  title: string;
  message: string;
  advice?: string;
  /**
   * How sure the engine is this flag is a true positive. Lets consumers tune
   * thresholds (e.g. a bot blocks only high-confidence CRITICAL) instead of
   * treating every flag equally — the main defence against alert fatigue.
   */
  confidence?: Confidence;
}

export type Confidence = "low" | "medium" | "high";

export enum InputType {
  RAW_TRANSACTION = "RAW_TRANSACTION",
  CALLDATA = "CALLDATA",
  EIP712_TYPED = "EIP712_TYPED",
  PERSONAL_SIGN = "PERSONAL_SIGN",
  EIP7702_AUTH = "EIP7702_AUTH",
}

export type IntentDetails =
  | ApprovalDetails
  | TransferDetails
  | PermitDetails
  | DelegationDetails
  | SwapDetails
  | GenericCallDetails
  | RawDetails;

export interface TokenInfo {
  address: Address;
  symbol?: string;
  name?: string;
  decimals?: number;
}

export interface ApprovalDetails {
  kind: "approval";
  token: TokenInfo;
  spender: Address;
  spenderLabel?: string;
  amount: bigint;
  isUnlimited: boolean;
  spenderIsEoa?: boolean;
  spenderHasCode?: boolean;
}

export interface TransferDetails {
  kind: "transfer";
  token: TokenInfo | "native";
  recipient: Address;
  amount: bigint;
}

export interface PermitDetails {
  kind: "permit";
  standard: "eip2612" | "dai" | "permit2";
  token: TokenInfo;
  owner: Address;
  spender: Address;
  spenderLabel?: string;
  amount: bigint;
  isUnlimited: boolean;
  deadline: bigint;
  nonce: bigint;
  spenderIsEoa?: boolean;
  spenderHasCode?: boolean;
  /** EIP-712 domain.verifyingContract — for permit2 this is the Permit2 contract, not the token. */
  verifyingContract?: Address;
  /** EIP-712 domain.name — used to detect token impersonation ("USD Coin" on a fake contract). */
  domainName?: string;
}

export interface DelegationDetails {
  kind: "delegation";
  authority: Address;
  delegateTo: Address;
  delegateLabel?: string;
  chainId: number;
  nonce: bigint;
  /** True once an RPC confirmed the delegate target has contract code. */
  delegateHasCode?: boolean;
}

export interface SwapDetails {
  kind: "swap";
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: bigint;
  minOut: bigint;
  router: Address;
  routerLabel?: string;
}

export interface GenericCallDetails {
  kind: "call";
  to?: Address;
  toLabel?: string;
  value: bigint;
  selector: Hex;
  functionSignature?: string;
  decodedArgs?: Record<string, unknown>;
}

export interface RawDetails {
  kind: "raw";
  to?: Address;
  value?: bigint;
  data?: Hex;
}

export type PartialIntent = Omit<DecodedIntent, "summary" | "risk" | "flags">;
