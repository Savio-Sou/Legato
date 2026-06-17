/**
 * Bridge between on-chain pool state and the local tree/note logic.
 *
 * There is no server: the client rebuilds the commitment tree by replaying `NewCommitment` events,
 * and finds its own spendable note by trial-decrypting each event and checking the nullifier on-chain.
 */
import type { PublicClient } from "viem";
import {
  SHIELDED_POOL_ADDRESS,
  SHIELDED_POOL_ABI,
  POOL_DEPLOY_BLOCK,
} from "./contracts";
import { computeCommitment, computeNullifier, tryDecrypt, type EncryptedPayload } from "./notes";
import { merkleProof, type MerkleProof } from "./merkle";
import { toHex32 } from "./crypto";
import type { ShieldedKey } from "./keys";

export interface OnChainNote {
  leafIndex: number;
  commitment: bigint;
  payload: EncryptedPayload;
}

export interface OwnedNote {
  value: bigint;
  blinding: bigint;
  leafIndex: number;
  commitment: bigint;
  proof: MerkleProof;
}

/** All inserted commitments (deposits + change notes), ordered by leaf index. */
export async function fetchCommitments(client: PublicClient): Promise<OnChainNote[]> {
  const logs = await client.getContractEvents({
    address: SHIELDED_POOL_ADDRESS,
    abi: SHIELDED_POOL_ABI,
    eventName: "NewCommitment",
    fromBlock: POOL_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const notes = logs.map((l) => {
    const a = l.args as {
      commitment: `0x${string}`;
      leafIndex: number;
      ephPubkey: `0x${string}`;
      ciphertext: `0x${string}`;
      tag: `0x${string}`;
    };
    return {
      leafIndex: Number(a.leafIndex),
      commitment: BigInt(a.commitment),
      payload: { ephPubkey: a.ephPubkey, ciphertext: a.ciphertext, tag: a.tag },
    };
  });
  notes.sort((x, y) => x.leafIndex - y.leafIndex);
  return notes;
}

/** Ordered leaf values for tree reconstruction. */
export async function getLeaves(client: PublicClient): Promise<bigint[]> {
  return (await fetchCommitments(client)).map((n) => n.commitment);
}

/**
 * All of the connected user's UNSPENT notes (a shielded balance is the sum of several notes —
 * multiple deposits plus change notes from partial withdrawals). Trial-decrypts every commitment,
 * keeps the ones that are genuinely ours, positive-value, and not yet spent, and attaches each one's
 * Merkle proof against the current tree snapshot. Sorted by value descending (largest first, so a
 * multi-note withdrawal spends the fewest notes). All proofs share the same snapshot root, which the
 * pool's root-history window keeps valid across the sequential withdrawals.
 */
export async function scanForNotes(client: PublicClient, key: ShieldedKey): Promise<OwnedNote[]> {
  const all = await fetchCommitments(client);
  const leaves = all.map((n) => n.commitment);

  const owned: OwnedNote[] = [];
  for (const n of all) {
    const dec = await tryDecrypt(key.encScalar, n.payload);
    if (!dec) continue;
    // Confirm this note is really ours (decrypted value/blinding + our pk → its commitment).
    if ((await computeCommitment(dec.value, key.pk, dec.blinding)) !== n.commitment) continue;
    if (dec.value === 0n) continue; // zero-value change note — nothing to spend
    const nullifier = await computeNullifier(key.sk, n.commitment);
    const spent = (await client.readContract({
      address: SHIELDED_POOL_ADDRESS,
      abi: SHIELDED_POOL_ABI,
      functionName: "isSpent",
      args: [toHex32(nullifier)],
    })) as boolean;
    if (spent) continue;
    owned.push({
      value: dec.value,
      blinding: dec.blinding,
      leafIndex: n.leafIndex,
      commitment: n.commitment,
      proof: await merkleProof(leaves, n.leafIndex),
    });
  }

  owned.sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0));
  return owned;
}

/** Greedy largest-first selection of notes whose values cover `amount`. */
export function selectNotes(notes: OwnedNote[], amount: bigint): OwnedNote[] {
  const picked: OwnedNote[] = [];
  let remaining = amount;
  for (const n of notes) {
    if (remaining <= 0n) break;
    picked.push(n);
    remaining -= n.value;
  }
  return picked;
}

/** Read an employee's registered shielded key (null if they have not registered). */
export async function getRegisteredKey(
  client: PublicClient,
  address: string,
): Promise<{ pk: bigint; encPub: [bigint, bigint] } | null> {
  const res = (await client.readContract({
    address: SHIELDED_POOL_ADDRESS,
    abi: SHIELDED_POOL_ABI,
    functionName: "keys",
    args: [address as `0x${string}`],
  })) as readonly [bigint, bigint, bigint, boolean];
  const [pk, encX, encY, registered] = res;
  if (!registered) return null;
  return { pk, encPub: [encX, encY] };
}
