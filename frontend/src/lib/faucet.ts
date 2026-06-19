/**
 * Tempo testnet faucet.
 *
 * The chain's own RPC exposes a `tempo_fundAddress` method that tops up an
 * address's *native* balance (what gas is paid from) plus the testnet
 * stablecoins. It needs no captcha, signature, or auth and the RPC is
 * CORS-open, so we can call it straight from the browser — letting the app
 * auto-fund a fresh wallet instead of dead-ending on "insufficient funds for
 * gas". See https://docs.tempo.xyz/quickstart/faucet.
 *
 * We fund *reactively*: a balance check is no use here because Moderato's
 * `eth_getBalance` returns the same sentinel "rich" value for every address —
 * only `eth_sendRawTransaction` enforces the real balance. So we run the tx,
 * and if it fails for lack of gas we fund and retry once.
 */
import type { PublicClient } from "viem";
import { isInsufficientFunds } from "./errors";

// `tempo_fundAddress` returns one tx hash per dispensed token.
type FaucetClient = {
  request(args: { method: "tempo_fundAddress"; params: [string] }): Promise<`0x${string}`[]>;
};

/** Request testnet funds for `address` and wait for them to land on-chain. */
export async function requestFaucetFunds(client: PublicClient, address: `0x${string}`): Promise<void> {
  const hashes = await (client as unknown as FaucetClient).request({
    method: "tempo_fundAddress",
    params: [address],
  });
  // Wait for the funding txs so the follow-up send sees the new balance.
  await Promise.all(hashes.map((hash) => client.waitForTransactionReceipt({ hash })));
}

/**
 * Run `action` (a transaction submit); if it fails purely for lack of gas,
 * top the wallet up from the faucet and retry once. Any other error — and a
 * second gas failure after funding — propagates to the caller's normal error
 * handling, which surfaces the friendly message with the manual faucet link.
 *
 * `onFunding` fires only when a top-up actually happens, so callers can show a
 * "topping up…" state. Wrap *only* the submit, not expensive preceding work
 * (e.g. proof generation), so a retry just re-signs rather than re-proving.
 */
export async function withAutoFunding<T>(
  action: () => Promise<T>,
  opts: { client: PublicClient; address: `0x${string}`; onFunding?: () => void },
): Promise<T> {
  try {
    return await action();
  } catch (e) {
    if (!isInsufficientFunds(e)) throw e;
    opts.onFunding?.();
    await requestFaucetFunds(opts.client, opts.address);
    return await action(); // retry once; a second failure propagates
  }
}
