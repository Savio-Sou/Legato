/**
 * Notes: commitments, nullifiers, and on-chain encrypted note payloads.
 *
 * commitment = Poseidon(value, pk, blinding)
 * nullifier  = Poseidon(sk, commitment)
 *
 * Encryption (ECDH on BabyJubJub + Poseidon stream cipher), entirely off-chain:
 *   eph (e, E=e·G); shared = e·encPub (recipient recomputes shared = encScalar·E)
 *   k = Poseidon(shared.x, shared.y)
 *   ct0 = value+Poseidon(k,0) ; ct1 = blinding+Poseidon(k,1) ; tag = Poseidon(k,2)
 */
import {
  poseidon,
  mulBase,
  mulPoint,
  clampScalar,
  randomFieldElement,
  mod,
  packFields,
  unpackFields,
  toHex32,
  type Point,
} from "./crypto";

export interface Note {
  value: bigint;
  blinding: bigint;
  pk: bigint;
  leafIndex: number;
  commitment: bigint;
}

export async function computeCommitment(value: bigint, pk: bigint, blinding: bigint): Promise<bigint> {
  return poseidon([value, pk, blinding]);
}

export async function computeNullifier(sk: bigint, commitment: bigint): Promise<bigint> {
  return poseidon([sk, commitment]);
}

export const randomBlinding = randomFieldElement;

/** The encrypted-note payload as it travels on-chain (hex, for the contract call). */
export interface EncryptedPayload {
  ephPubkey: `0x${string}`; // 64 bytes: E.x ‖ E.y
  ciphertext: `0x${string}`; // 64 bytes: ct0 ‖ ct1
  tag: `0x${string}`; // 32 bytes
}

/** Encrypt (value, blinding) to a recipient's BabyJubJub encryption pubkey. */
export async function encryptNote(
  recipientEncPub: Point,
  value: bigint,
  blinding: bigint,
): Promise<EncryptedPayload> {
  const ephScalar = await clampScalar(randomFieldElement());
  const ephPub = await mulBase(ephScalar);
  const shared = await mulPoint(ephScalar, recipientEncPub);
  const k = await poseidon([shared[0], shared[1]]);
  return {
    ephPubkey: packFields([ephPub[0], ephPub[1]]),
    ciphertext: packFields([
      mod(value + (await poseidon([k, 0n]))),
      mod(blinding + (await poseidon([k, 1n]))),
    ]),
    tag: toHex32(await poseidon([k, 2n])),
  };
}

/** Try to decrypt an on-chain payload with our enc scalar; null if the note is not ours. */
export async function tryDecrypt(
  encScalar: bigint,
  payload: EncryptedPayload,
): Promise<{ value: bigint; blinding: bigint } | null> {
  const [ex, ey] = unpackFields(payload.ephPubkey, 2);
  const shared = await mulPoint(encScalar, [ex, ey]);
  const k = await poseidon([shared[0], shared[1]]);
  if ((await poseidon([k, 2n])) !== BigInt(payload.tag)) return null;
  const [ct0, ct1] = unpackFields(payload.ciphertext, 2);
  return {
    value: mod(ct0 - (await poseidon([k, 0n]))),
    blinding: mod(ct1 - (await poseidon([k, 1n]))),
  };
}
