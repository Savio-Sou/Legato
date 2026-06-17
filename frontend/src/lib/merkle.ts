/**
 * Client-side incremental Merkle tree, byte-identical to the on-chain MerkleTreeWithHistory and the
 * Noir withdraw circuit. The frontend rebuilds the tree by replaying `NewCommitment` events (there is
 * no server), then derives the local Merkle path for its own note. Poseidon via circomlibjs.
 *
 * Empty leaves are ZERO_VALUE = 0; node = Poseidon(left, right); depth = 16 (matches TREE_LEVELS).
 */
import { poseidon } from "./crypto";

export const TREE_DEPTH = 16;
export const ZERO_VALUE = 0n;

export interface MerkleProof {
  leaf: bigint;
  leafIndex: number;
  siblings: bigint[]; // length TREE_DEPTH
  pathIndices: boolean[]; // length TREE_DEPTH (true = this node is the right child)
  root: bigint;
}

let _zeros: bigint[] | null = null;

/** _zeros[i] = root of an all-ZERO_VALUE subtree of height i (i in [0, TREE_DEPTH]). */
export async function zeros(): Promise<bigint[]> {
  if (_zeros) return _zeros;
  const z: bigint[] = [ZERO_VALUE];
  for (let i = 1; i <= TREE_DEPTH; i++) z.push(await poseidon([z[i - 1], z[i - 1]]));
  _zeros = z;
  return z;
}

/** Hash one level up to the next, padding missing siblings with the level's zero node. */
async function nextLevel(level: bigint[], z: bigint[], depth: number): Promise<bigint[]> {
  const out: bigint[] = [];
  const pairs = Math.max(1, Math.ceil(level.length / 2));
  for (let i = 0; i < pairs; i++) {
    const left = level[2 * i] ?? z[depth];
    const right = level[2 * i + 1] ?? z[depth];
    out.push(await poseidon([left, right]));
  }
  return out;
}

/** Root of a fixed-depth tree whose leaves (in insertion order) are `leaves`, rest zero-padded. */
export async function computeRoot(leaves: bigint[]): Promise<bigint> {
  const z = await zeros();
  let level = leaves.length ? leaves.slice() : [ZERO_VALUE];
  for (let d = 0; d < TREE_DEPTH; d++) level = await nextLevel(level, z, d);
  return level[0];
}

/** Merkle inclusion proof for the leaf at `leafIndex` within `leaves` (insertion order). */
export async function merkleProof(leaves: bigint[], leafIndex: number): Promise<MerkleProof> {
  const z = await zeros();
  const siblings: bigint[] = [];
  const pathIndices: boolean[] = [];
  let idx = leafIndex;
  let level = leaves.slice();

  for (let d = 0; d < TREE_DEPTH; d++) {
    const isRight = idx % 2 === 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    siblings.push(level[sibIdx] ?? z[d]);
    pathIndices.push(isRight);
    level = await nextLevel(level, z, d);
    idx = Math.floor(idx / 2);
  }

  return { leaf: leaves[leafIndex], leafIndex, siblings, pathIndices, root: level[0] };
}
