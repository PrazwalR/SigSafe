export { SignatureGuard } from "./SignatureGuard.js";
export type { SignatureGuardProps } from "./SignatureGuard.js";
export { useDecode } from "./useDecode.js";
export type { UseDecodeResult } from "./useDecode.js";

// Re-export the essentials from core so consumers can type a single import.
export { decode, Action, RiskLevel, InputType } from "@sigsafe/core";
export type { DecodedIntent, RiskFlag, DecodeOptions, Confidence } from "@sigsafe/core";
