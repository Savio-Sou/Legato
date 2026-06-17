// Tri-Poseidon regression vector (JS leg) — must match Noir `poseidon` lib and
// Solidity poseidon-solidity. Uses circomlibjs (iden3 Poseidon v1), NOT bb.js.
import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();
const F = poseidon.F;

function show(label, arr) {
  const h = poseidon(arr);
  const dec = F.toString(h);
  const hex = "0x" + BigInt(dec).toString(16).padStart(64, "0");
  console.log(`${label} dec=${dec}`);
  console.log(`${label} hex=${hex}`);
}

show("H2(1,2)", [1n, 2n]);
show("H3(1,2,3)", [1n, 2n, 3n]);
