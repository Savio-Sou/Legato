// Computes a valid witness for the withdraw circuit and prints Prover.toml.
// Doubles as the reference implementation for the frontend's merkle.ts / noir.ts logic.
import { buildPoseidon } from "circomlibjs";

const DEPTH = 16;
const poseidon = await buildPoseidon();
const H = (arr) => BigInt(poseidon.F.toString(poseidon(arr)));
const hex = (x) => "0x" + x.toString(16).padStart(64, "0");

// note
const sk = 7n;
const value = 5000n;
const blinding = 42n;
const pk = H([sk]);
const commitment = H([value, pk, blinding]);

// zero subtree cache
const zeros = [0n];
for (let i = 1; i <= DEPTH; i++) zeros.push(H([zeros[i - 1], zeros[i - 1]]));

// leaf at index 0 → siblings are zeros[0..DEPTH-1], all left
let current = commitment;
for (let i = 0; i < DEPTH; i++) current = H([current, zeros[i]]);
const root = current;

// partial withdrawal
const publicAmount = 2000n;
const changeValue = 3000n;
const changeBlinding = 99n;
const newCommitment = H([changeValue, pk, changeBlinding]);
const nullifier = H([sk, commitment]);
const recipient = 0x1234567890123456789012345678901234567890n;

const merklePath = zeros.slice(0, DEPTH).map(hex);
const pathIndices = Array(DEPTH).fill(false);

const toml = `root = "${hex(root)}"
nullifier = "${hex(nullifier)}"
recipient = "${hex(recipient)}"
public_amount = "${publicAmount}"
new_commitment = "${hex(newCommitment)}"
value = "${value}"
blinding = "${blinding}"
sk = "${sk}"
merkle_path = [${merklePath.map((s) => `"${s}"`).join(", ")}]
path_indices = [${pathIndices.join(", ")}]
change_value = "${changeValue}"
change_blinding = "${changeBlinding}"
`;
console.log(toml);
