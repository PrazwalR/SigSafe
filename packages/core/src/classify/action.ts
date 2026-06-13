import { maxUint256, type Address, type Hex } from "viem";
import { Action, type InputType } from "../types.js";
import type { IntentDetails, PartialIntent } from "../types.js";
import { isUnlimitedAmount } from "../util/amount.js";
import { SEL } from "../registry/selectors.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export interface ClassifyInput {
  to?: Address;
  value: bigint;
  selector: Hex;
  functionSignature?: string;
  args?: readonly unknown[];
  chainId: number;
  inputType: InputType;
  raw: string;
}

export function classifyAction(c: ClassifyInput): PartialIntent {
  const sel = c.selector.toLowerCase();
  const args = c.args ?? [];
  const tokenAddress = c.to ?? ZERO_ADDRESS;

  const wrap = (action: Action, details: IntentDetails): PartialIntent => ({
    action,
    inputType: c.inputType,
    chainId: c.chainId,
    details,
    raw: c.raw,
  });
  const addr = (i: number): Address => (typeof args[i] === "string" ? (args[i] as Address) : ZERO_ADDRESS);
  const big = (i: number): bigint => (typeof args[i] === "bigint" ? (args[i] as bigint) : 0n);
  const bool = (i: number): boolean => args[i] === true;
  const call = (decodedArgs?: Record<string, unknown>): IntentDetails => ({
    kind: "call",
    to: c.to,
    value: c.value,
    selector: c.selector,
    functionSignature: c.functionSignature,
    decodedArgs,
  });

  switch (sel) {
    case SEL.approve:
    case SEL.increaseAllowance: {
      const amount = big(1);
      return wrap(Action.TOKEN_APPROVAL, {
        kind: "approval",
        token: { address: tokenAddress },
        spender: addr(0),
        amount,
        isUnlimited: isUnlimitedAmount(amount, "erc20"),
      });
    }
    case SEL.permit2Approve: {
      const amount = big(2);
      return wrap(Action.TOKEN_APPROVAL, {
        kind: "approval",
        token: { address: addr(0) },
        spender: addr(1),
        amount,
        isUnlimited: isUnlimitedAmount(amount, "permit2"),
      });
    }
    case SEL.transfer:
      return wrap(Action.TOKEN_TRANSFER, {
        kind: "transfer",
        token: { address: tokenAddress },
        recipient: addr(0),
        amount: big(1),
      });
    case SEL.transferFrom:
      return wrap(Action.TOKEN_TRANSFER, {
        kind: "transfer",
        token: { address: tokenAddress },
        recipient: addr(1),
        amount: big(2),
      });
    case SEL.safeTransferFrom721:
    case SEL.safeTransferFrom721Data:
      return wrap(Action.TOKEN_TRANSFER, {
        kind: "transfer",
        token: { address: tokenAddress },
        recipient: addr(1),
        amount: big(2),
      });
    case SEL.safeTransferFrom1155:
      return wrap(Action.TOKEN_TRANSFER, {
        kind: "transfer",
        token: { address: tokenAddress },
        recipient: addr(1),
        amount: big(3),
      });
    case SEL.setApprovalForAll: {
      const approved = bool(1);
      return wrap(Action.SET_APPROVAL_FOR_ALL, {
        kind: "approval",
        token: { address: tokenAddress },
        spender: addr(0),
        amount: approved ? maxUint256 : 0n,
        isUnlimited: approved,
      });
    }
    case SEL.transferOwnership:
      return wrap(Action.OWNERSHIP_TRANSFER, call({ newOwner: addr(0) }));
    case SEL.renounceOwnership:
      return wrap(Action.OWNERSHIP_TRANSFER, call({}));
    case SEL.permit2612: {
      const amount = big(2);
      return wrap(Action.PERMIT, {
        kind: "permit",
        standard: "eip2612",
        token: { address: tokenAddress },
        owner: addr(0),
        spender: addr(1),
        amount,
        isUnlimited: isUnlimitedAmount(amount, "eip2612"),
        deadline: big(3),
        nonce: 0n,
      });
    }
    case SEL.permitDai: {
      const allowed = bool(4);
      return wrap(Action.PERMIT, {
        kind: "permit",
        standard: "dai",
        token: { address: tokenAddress },
        owner: addr(0),
        spender: addr(1),
        amount: allowed ? maxUint256 : 0n,
        isUnlimited: allowed,
        deadline: big(3),
        nonce: big(2),
      });
    }
    case SEL.upgradeTo:
    case SEL.upgradeToAndCall:
      return wrap(Action.CONTRACT_CALL, call({ newImplementation: addr(0) }));
    default:
      return wrap(Action.CONTRACT_CALL, call());
  }
}
