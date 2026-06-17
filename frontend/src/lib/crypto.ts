/**
 * Shared ZK primitives for the shielded pool — iden3 Poseidon v1 (matching the Noir `poseidon` lib
 * and on-chain poseidon-solidity) plus BabyJubJub for off-chain note ECDH. All hashing goes through
 * circomlibjs so the browser, the Noir circuit, and the Solidity contract agree byte-for-byte
 * (verified by the tri-Poseidon regression vector).
 */

// BN254 scalar field prime (the field Noir/UltraHonk operate in).
export const FIELD_P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const mod = (x: bigint): bigint => ((x % FIELD_P) + FIELD_P) % FIELD_P;

/** Cryptographically-random field element (for secrets and blindings). */
export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return mod(x);
}

export const toHex32 = (x: bigint): `0x${string}` =>
  ("0x" + mod(x).toString(16).padStart(64, "0")) as `0x${string}`;

export const fromHex = (h: string): bigint => BigInt(h);

// Concatenate field elements into a 0x bytes string (32 bytes each) for on-chain payloads.
export const packFields = (xs: bigint[]): `0x${string}` =>
  ("0x" + xs.map((x) => mod(x).toString(16).padStart(64, "0")).join("")) as `0x${string}`;

export const unpackFields = (hex: string, count: number): bigint[] => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: bigint[] = [];
  for (let i = 0; i < count; i++) {
    out.push(BigInt("0x" + clean.slice(i * 64, (i + 1) * 64)));
  }
  return out;
};

// circomlibjs has no types; load lazily and cache (wasm init is async).
/* eslint-disable @typescript-eslint/no-explicit-any */
let _poseidon: any = null;
let _babyjub: any = null;

async function lib() {
  return import("circomlibjs");
}

export async function getPoseidon(): Promise<any> {
  if (!_poseidon) _poseidon = await (await lib()).buildPoseidon();
  return _poseidon;
}

export async function getBabyjub(): Promise<any> {
  if (!_babyjub) _babyjub = await (await lib()).buildBabyjub();
  return _babyjub;
}

/** Poseidon hash of field-element inputs → bigint. Arity must match the Noir `hash_N`. */
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const p = await getPoseidon();
  return BigInt(p.F.toString(p(inputs.map((x) => mod(x)))));
}

// ── BabyJubJub (off-chain note encryption only; never in-circuit) ──────────────

export type Point = [bigint, bigint];

/** Reduce a seed-derived scalar into the prime-order subgroup. */
export async function clampScalar(s: bigint): Promise<bigint> {
  const b = await getBabyjub();
  return mod(s) % BigInt(b.subOrder);
}

/** scalar · Base8 (public key from a private scalar). */
export async function mulBase(scalar: bigint): Promise<Point> {
  const b = await getBabyjub();
  const p = b.mulPointEscalar(b.Base8, scalar);
  return [BigInt(b.F.toString(p[0])), BigInt(b.F.toString(p[1]))];
}

/** scalar · point (ECDH shared secret point). */
export async function mulPoint(scalar: bigint, point: Point): Promise<Point> {
  const b = await getBabyjub();
  const p = b.mulPointEscalar([b.F.e(point[0]), b.F.e(point[1])], scalar);
  return [BigInt(b.F.toString(p[0])), BigInt(b.F.toString(p[1]))];
}
