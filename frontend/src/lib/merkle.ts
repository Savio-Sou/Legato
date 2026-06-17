/**
 * Merkle tree utilities that match the Noir circuit exactly.
 *
 * Hash function: Pedersen (Barretenberg, hashIndex=0)
 * Tree depth:    3  (8 leaves max, zero-padded)
 * Leaf formula:  pedersen_hash([address_as_field, salary_as_field])
 * Node formula:  pedersen_hash([left, right])
 */

export interface Employee {
  address: string; // checksummed hex, e.g. "0xAbCd..."
  salary: bigint; // wei-denominated pathUSD amount
}

export interface MerkleTree {
  root: string; // 0x-prefixed 32-byte hex
  leaves: string[]; // 8 leaf hashes (0x-prefixed hex)
  employees: Employee[]; // original data (padded to 8 with zero entries)
}

export interface MerklePath {
  leaf: string; // the employee's leaf hash
  leafIndex: number;
  siblings: string[]; // [Field; 3] in circuit
  pathIndices: boolean[]; // [bool; 3]: false = we are left, true = we are right
}

// BarretenbergSync is loaded lazily on the server (Node.js environment only).
// In the browser we import a stub — proof generation uses noir_js instead.
let _bbSync: Awaited<
  ReturnType<typeof import("@aztec/bb.js")["BarretenbergSync"]["initSingleton"]>
> | null = null;

async function getBBSync() {
  if (_bbSync) return _bbSync;
  const { join } = await import("path");
  const { BarretenbergSync } = await import("@aztec/bb.js");
  // Turbopack virtualises __dirname as '/ROOT', breaking bb.js's WASM resolution.
  // process.cwd() is always the real project root, so build the path from there.
  const wasmPath = join(
    process.cwd(),
    "node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz"
  );
  _bbSync = await BarretenbergSync.initSingleton({ wasmPath });
  return _bbSync;
}

/** Convert a bigint field value to a 32-byte big-endian Buffer. */
function fieldToBuffer(value: bigint): Buffer {
  const buf = Buffer.alloc(32, 0);
  const hex = value.toString(16).padStart(64, "0");
  buf.set(Buffer.from(hex, "hex"));
  return buf;
}

/** Convert a 32-byte Uint8Array (or Buffer) to a 0x-prefixed hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Buffer.from(bytes).toString("hex");
}

/** Compute pedersen_hash([a, b]) using Barretenberg, matching Noir stdlib. */
async function pedersenHash(a: bigint, b: bigint): Promise<bigint> {
  const api = await getBBSync();
  const result = api.pedersenHash({
    inputs: [fieldToBuffer(a), fieldToBuffer(b)],
    hashIndex: 0,
  });
  return BigInt("0x" + Buffer.from(result.hash).toString("hex"));
}

/** Convert an employee address (0x hex) to a Field element (bigint). */
function addressToField(addr: string): bigint {
  return BigInt(addr.toLowerCase());
}

/** Compute the leaf hash for a single employee. */
async function computeLeaf(emp: Employee): Promise<bigint> {
  return pedersenHash(addressToField(emp.address), emp.salary);
}

/**
 * Build a depth-3 Merkle tree from up to 8 employees.
 * Empty slots are filled with zero-padded leaves (address=0, salary=0).
 */
export async function buildMerkleTree(employees: Employee[]): Promise<MerkleTree> {
  if (employees.length > 8) throw new Error("Max 8 employees for depth-3 tree");

  // Zero leaf: pedersen_hash([0, 0])
  const zeroLeaf = await pedersenHash(BigInt(0), BigInt(0));

  // Compute leaves (pad to 8)
  const leafValues: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    if (i < employees.length) {
      leafValues.push(await computeLeaf(employees[i]));
    } else {
      leafValues.push(zeroLeaf);
    }
  }

  // Level 1: pair the 8 leaves into 4 nodes
  const level1: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    level1.push(await pedersenHash(leafValues[2 * i], leafValues[2 * i + 1]));
  }

  // Level 2: pair 4 nodes into 2
  const level2: bigint[] = [];
  for (let i = 0; i < 2; i++) {
    level2.push(await pedersenHash(level1[2 * i], level1[2 * i + 1]));
  }

  // Root
  const root = await pedersenHash(level2[0], level2[1]);

  return {
    root: "0x" + root.toString(16).padStart(64, "0"),
    leaves: leafValues.map((v) => "0x" + v.toString(16).padStart(64, "0")),
    employees: [
      ...employees,
      ...Array(8 - employees.length).fill({ address: "0x0000000000000000000000000000000000000000", salary: BigInt(0) }),
    ],
  };
}

/**
 * Return the Merkle path (siblings + path indices) for the employee at `leafIndex`.
 * `leaves` must be the full 8-element leaf array (bigint values).
 */
export async function getMerklePath(
  tree: MerkleTree,
  leafIndex: number
): Promise<MerklePath> {
  // Recompute all levels to get the sibling values
  const leafValues = tree.leaves.map((h) => BigInt(h));

  const level1: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    level1.push(await pedersenHash(leafValues[2 * i], leafValues[2 * i + 1]));
  }

  const level2: bigint[] = [];
  for (let i = 0; i < 2; i++) {
    level2.push(await pedersenHash(level1[2 * i], level1[2 * i + 1]));
  }

  // Path from leaf to root (3 steps for depth-3 tree)
  // Level 0: index among 8 leaves
  // Level 1: index among 4 pairs
  // Level 2: index among 2 pairs of pairs

  const siblings: string[] = [];
  const pathIndices: boolean[] = [];

  // Step 0: leaf level
  const sibIdx0 = leafIndex % 2 === 0 ? leafIndex + 1 : leafIndex - 1;
  siblings.push("0x" + leafValues[sibIdx0].toString(16).padStart(64, "0"));
  pathIndices.push(leafIndex % 2 !== 0); // true if we are the RIGHT child

  // Step 1: level 1
  const pairIdx1 = Math.floor(leafIndex / 2);
  const sibIdx1 = pairIdx1 % 2 === 0 ? pairIdx1 + 1 : pairIdx1 - 1;
  siblings.push("0x" + level1[sibIdx1].toString(16).padStart(64, "0"));
  pathIndices.push(pairIdx1 % 2 !== 0);

  // Step 2: level 2
  const pairIdx2 = Math.floor(leafIndex / 4);
  const sibIdx2 = pairIdx2 % 2 === 0 ? pairIdx2 + 1 : pairIdx2 - 1;
  siblings.push("0x" + level2[sibIdx2].toString(16).padStart(64, "0"));
  pathIndices.push(pairIdx2 % 2 !== 0);

  return {
    leaf: tree.leaves[leafIndex],
    leafIndex,
    siblings,
    pathIndices,
  };
}
