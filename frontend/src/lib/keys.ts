/**
 * Shielded-key management.
 *
 * Each user has a single spend secret `sk`. From it we derive:
 *   - pk = Poseidon(sk)          — the commitment "owner pubkey"
 *   - a BabyJubJub keypair       — for off-chain ECDH note encryption
 *
 * WebAuthn/passkey signatures are non-deterministic and the connector exposes no PRF, so we do NOT
 * derive keys from signatures:
 *   - Dev connector: sk = Poseidon(devPrivateKey) — deterministic, reproducible across test runs.
 *   - Passkey:       a locally-generated sk persisted in localStorage, registered on-chain.
 *                    CAVEAT: clearing browser storage loses sk → unspent notes are unrecoverable.
 */
import { poseidon, mulBase, clampScalar, mod, randomFieldElement, type Point } from "./crypto";

export interface ShieldedKey {
  sk: bigint; // spend secret
  pk: bigint; // = Poseidon(sk), used in note commitments
  encScalar: bigint; // BabyJubJub private scalar (note decryption)
  encPub: Point; // BabyJubJub public key (employers encrypt notes to this)
}

const STORAGE_PREFIX = "legato.shieldedKey.";

async function deriveFromSeed(sk: bigint): Promise<ShieldedKey> {
  const pk = await poseidon([sk]);
  const encScalar = await clampScalar(await poseidon([sk, 0n]));
  const encPub = await mulBase(encScalar);
  return { sk, pk, encScalar, encPub };
}

/** Load (or, for passkeys, create + persist) the connected account's shielded key. */
export async function getShieldedKey(address: string): Promise<ShieldedKey> {
  const devKey = process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY;
  if (devKey) {
    return deriveFromSeed(await poseidon([mod(BigInt(devKey))]));
  }

  const storageKey = STORAGE_PREFIX + address.toLowerCase();
  let sk: bigint;
  const existing =
    typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
  if (existing) {
    sk = BigInt(existing);
  } else {
    sk = randomFieldElement();
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, sk.toString());
  }
  return deriveFromSeed(sk);
}

/** The on-chain registry tuple for `registerKey(pk, encX, encY)`. */
export function registryArgs(key: ShieldedKey): [bigint, bigint, bigint] {
  return [key.pk, key.encPub[0], key.encPub[1]];
}
