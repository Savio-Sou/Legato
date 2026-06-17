/**
 * In-browser proof generation for the shielded pool (NoirJS + @aztec/bb.js UltraHonk, evm target).
 *
 *  - proveDeposit:  binds the public deposited `value` to the note commitment (pool soundness).
 *  - proveWithdraw: membership + nullifier + partial-withdrawal join-split (pays `publicAmount`,
 *                   re-commits the remainder as a change note owned by the spender).
 */
import { toHex32, poseidon } from "./crypto";
import { computeCommitment, computeNullifier, randomBlinding } from "./notes";
import type { MerkleProof } from "./merkle";
import type { ShieldedKey } from "./keys";

export type ProofStatus =
  | { stage: "loading" }
  | { stage: "executing_witness" }
  | { stage: "generating_proof" }
  | { stage: "done" }
  | { stage: "error"; message: string };

type Hex = `0x${string}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
const _circuits: Record<string, any> = {};
const _backends: Record<string, import("@aztec/bb.js").UltraHonkBackend> = {};

async function loadBackend(name: string) {
  const { UltraHonkBackend, Barretenberg } = await import("@aztec/bb.js");
  if (!_circuits[name]) {
    _circuits[name] = await fetch(`/${name}.json`).then((r) => r.json());
  }
  if (!_backends[name]) {
    // Single thread: the origin is not cross-origin-isolated (no SharedArrayBuffer).
    const api = await Barretenberg.new({ threads: 1 });
    _backends[name] = new UltraHonkBackend(_circuits[name].bytecode as string, api);
  }
  return { circuit: _circuits[name], backend: _backends[name] };
}

async function prove(
  name: string,
  inputs: Record<string, unknown>,
  onStatus?: (s: ProofStatus) => void,
): Promise<{ proof: Hex; publicInputs: Hex[] }> {
  const emit = (s: ProofStatus) => onStatus?.(s);
  try {
    emit({ stage: "loading" });
    const { Noir } = await import("@noir-lang/noir_js");
    const { circuit, backend } = await loadBackend(name);
    const noir = new Noir(circuit as ConstructorParameters<typeof Noir>[0]);

    emit({ stage: "executing_witness" });
    const { witness } = await noir.execute(inputs as Parameters<typeof noir.execute>[0]);

    emit({ stage: "generating_proof" });
    const { proof, publicInputs } = await backend.generateProof(witness, { verifierTarget: "evm" });

    // Browser: no Node Buffer — format bytes by hand.
    const bytesToHex = (bytes: Uint8Array) => {
      let h = "";
      for (const b of bytes) h += b.toString(16).padStart(2, "0");
      return h;
    };

    emit({ stage: "done" });
    return {
      proof: ("0x" + bytesToHex(proof)) as Hex,
      publicInputs: publicInputs.map((pi) =>
        toHex32(typeof pi === "string" ? BigInt(pi) : BigInt("0x" + bytesToHex(pi))),
      ),
    };
  } catch (err) {
    emit({ stage: "error", message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export interface DepositProof {
  proof: Hex;
  publicInputs: Hex[]; // [value, commitment]
  commitment: bigint;
}

/** Prove a deposit note commits exactly `value` for owner `pk` under random `blinding`. */
export async function proveDeposit(
  value: bigint,
  pk: bigint,
  blinding: bigint,
  onStatus?: (s: ProofStatus) => void,
): Promise<DepositProof> {
  const commitment = await computeCommitment(value, pk, blinding);
  const { proof, publicInputs } = await prove(
    "deposit",
    { value: toHex32(value), commitment: toHex32(commitment), pk: toHex32(pk), blinding: toHex32(blinding) },
    onStatus,
  );
  return { proof, publicInputs, commitment };
}

export interface WithdrawProof {
  proof: Hex;
  publicInputs: Hex[]; // [root, nullifier, recipient, publicAmount, newCommitment]
  changeValue: bigint;
  changeBlinding: bigint;
  newCommitment: bigint;
}

/** Prove a partial withdrawal: pay `publicAmount` to `recipient`, re-commit the remainder. */
export async function proveWithdraw(
  key: ShieldedKey,
  note: { value: bigint; blinding: bigint },
  merkle: MerkleProof,
  publicAmount: bigint,
  recipient: string,
  onStatus?: (s: ProofStatus) => void,
): Promise<WithdrawProof> {
  const commitment = await computeCommitment(note.value, key.pk, note.blinding);
  const nullifier = await computeNullifier(key.sk, commitment);
  const changeValue = note.value - publicAmount;
  const changeBlinding = randomBlinding();
  const newCommitment = await poseidon([changeValue, key.pk, changeBlinding]);
  const recipientField = BigInt(recipient);

  const { proof, publicInputs } = await prove(
    "withdraw",
    {
      root: toHex32(merkle.root),
      nullifier: toHex32(nullifier),
      recipient: toHex32(recipientField),
      public_amount: toHex32(publicAmount),
      new_commitment: toHex32(newCommitment),
      value: toHex32(note.value),
      blinding: toHex32(note.blinding),
      sk: toHex32(key.sk),
      merkle_path: merkle.siblings.map((s) => toHex32(s)),
      path_indices: merkle.pathIndices,
      change_value: toHex32(changeValue),
      change_blinding: toHex32(changeBlinding),
    },
    onStatus,
  );

  return { proof, publicInputs, changeValue, changeBlinding, newCommitment };
}
