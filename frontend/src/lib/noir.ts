/**
 * In-browser ZK proof generation using @noir-lang/noir_js + @aztec/bb.js.
 *
 * Loads the compiled circuit artifact from /payroll.json, executes the witness,
 * and generates an UltraHonk proof. The returned `proof` and `publicInputs` are
 * formatted for the PayrollManager.claim() call.
 */

import type { MerklePath } from "./merkle";

export interface ProofResult {
  /** Raw proof bytes as a hex string (0x-prefixed) */
  proof: `0x${string}`;
  /** Public inputs as bytes32 hex strings: [root, employee_address, salary_amount] */
  publicInputs: [`0x${string}`, `0x${string}`, `0x${string}`];
}

export type ProofStatus =
  | { stage: "loading" }
  | { stage: "executing_witness" }
  | { stage: "generating_proof" }
  | { stage: "done"; result: ProofResult }
  | { stage: "error"; message: string };

let _cachedCircuit: Record<string, unknown> | null = null;
let _cachedBackend: import("@aztec/bb.js").UltraHonkBackend | null = null;

function toField(value: bigint | string): string {
  const n = typeof value === "string" ? BigInt(value) : value;
  return "0x" + n.toString(16).padStart(64, "0");
}

function fieldToBytes32(hex: string): `0x${string}` {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return ("0x" + clean.padStart(64, "0")) as `0x${string}`;
}

/**
 * Convert raw bytes to a hex string. Runs in the browser, where Node's
 * `Buffer` is not available, so we format the Uint8Array by hand.
 */
function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Generate a ZK proof that `employee.address` with `salary` is a member of
 * the payroll Merkle tree.
 *
 * @param employeeAddress - The employee's Ethereum address (0x hex)
 * @param salary          - The employee's salary as a bigint (pathUSD, 18 decimals)
 * @param merkleRoot      - The on-chain Merkle root (bytes32 hex)
 * @param path            - The Merkle path from the server API
 * @param onStatus        - Optional progress callback
 */
export async function generatePayrollProof(
  employeeAddress: string,
  salary: bigint,
  merkleRoot: string,
  path: MerklePath,
  onStatus?: (status: ProofStatus) => void
): Promise<ProofResult> {
  const emit = (s: ProofStatus) => onStatus?.(s);

  try {
    emit({ stage: "loading" });
    const [{ Noir }, { UltraHonkBackend, Barretenberg }] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js"),
    ]);

    if (!_cachedCircuit) {
      _cachedCircuit = await fetch("/payroll.json").then((r) => r.json());
    }
    const circuit = _cachedCircuit!;

    if (!_cachedBackend) {
      // UltraHonkBackend needs a Barretenberg WASM api instance. We force a
      // single thread because the dev/prod origin is not cross-origin-isolated
      // (no SharedArrayBuffer), so multi-threaded WASM is unavailable.
      const api = await Barretenberg.new({ threads: 1 });
      _cachedBackend = new UltraHonkBackend(circuit.bytecode as string, api);
    }
    const backend = _cachedBackend;
    const noir = new Noir(circuit as ConstructorParameters<typeof Noir>[0]);

    // Format inputs to match the circuit signature:
    //   root: pub Field, employee_address: pub Field, salary_amount: pub Field,
    //   merkle_path: [Field; 3], path_indices: [bool; 3]
    const inputs = {
      root: toField(BigInt(merkleRoot)),
      employee_address: toField(BigInt(employeeAddress)),
      salary_amount: toField(salary),
      merkle_path: path.siblings.map((s) => toField(BigInt(s))),
      path_indices: path.pathIndices,
    };

    emit({ stage: "executing_witness" });
    const { witness } = await noir.execute(inputs);

    emit({ stage: "generating_proof" });
    // 'evm' target uses the keccak transcript so the proof verifies against the
    // generated Solidity HonkVerifier on-chain.
    const { proof, publicInputs } = await backend.generateProof(witness, {
      verifierTarget: "evm",
    });

    // Encode proof as hex
    const proofHex = ("0x" + bytesToHex(proof)) as `0x${string}`;

    // publicInputs from generateProof are in the same order as the circuit's
    // public parameters: [root, employee_address, salary_amount]
    const pubInputsFormatted = publicInputs.map((pi) =>
      fieldToBytes32(typeof pi === "string" ? pi : bytesToHex(pi))
    ) as [`0x${string}`, `0x${string}`, `0x${string}`];

    const result: ProofResult = { proof: proofHex, publicInputs: pubInputsFormatted };
    emit({ stage: "done", result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ stage: "error", message });
    throw err;
  }
}
