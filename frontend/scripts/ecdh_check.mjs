// Derisking 2: BabyJubJub ECDH + Poseidon stream-cipher note encryption round-trip.
// This encryption is ENTIRELY off-chain (never in-circuit, never in Solidity), so it only
// needs to round-trip in JS. Scheme:
//   employer (sender) has employee pubkey P = sk*G
//   ephemeral e, E = e*G ; shared = e*P  (== sk*E, what the employee recomputes)
//   k = H2(shared.x, shared.y)
//   ct0 = value    + H2(k,0)   ; ct1 = blinding + H2(k,1)   (mod p)
//   tag = H2(k,2)              (ownership-detection)
// Employee: shared' = sk*E ; k' = H2(shared'.x, shared'.y) ; if H2(k',2)==tag → mine.
import { buildBabyjub, buildPoseidon } from "circomlibjs";

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (x) => ((x % P) + P) % P;

const babyJub = await buildBabyjub();
const poseidon = await buildPoseidon();
const F = babyJub.F;

// field element (babyjub repr) -> bigint
const toBig = (x) => BigInt(F.toString(x));
// poseidon(...) -> bigint
const H = (arr) => BigInt(poseidon.F.toString(poseidon(arr)));

function pubFromSecret(sk) {
  return babyJub.mulPointEscalar(babyJub.Base8, sk); // [x, y]
}
function ecdh(scalar, point) {
  const s = babyJub.mulPointEscalar(point, scalar);
  return [toBig(s[0]), toBig(s[1])];
}

function encrypt(recipientPub, value, blinding, ephScalar) {
  const E = pubFromSecret(ephScalar);
  const shared = ecdh(ephScalar, recipientPub);
  const k = H([shared[0], shared[1]]);
  return {
    E: [toBig(E[0]), toBig(E[1])],
    ct0: mod(value + H([k, 0n])),
    ct1: mod(blinding + H([k, 1n])),
    tag: H([k, 2n]),
  };
}

function tryDecrypt(sk, payload) {
  const shared = ecdh(sk, [F.e(payload.E[0]), F.e(payload.E[1])]);
  const k = H([shared[0], shared[1]]);
  if (H([k, 2n]) !== payload.tag) return null; // not mine
  return {
    value: mod(payload.ct0 - H([k, 0n])),
    blinding: mod(payload.ct1 - H([k, 1n])),
  };
}

// --- round trip ---
const aliceSk = 1234567890123456789n;
const alicePub = pubFromSecret(aliceSk).map(toBig);
const bobSk = 9876543210987654321n; // an unrelated user

const value = 4200_000000n; // 4200 pathUSD @ 6 decimals
const blinding = 111222333444555666n;
const ephScalar = 555555555555555555n;

const payload = encrypt([F.e(alicePub[0]), F.e(alicePub[1])], value, blinding, ephScalar);

const aliceResult = tryDecrypt(aliceSk, payload);
const bobResult = tryDecrypt(bobSk, payload);

console.log("alice decrypts:", aliceResult);
console.log("bob (wrong key) decrypts:", bobResult);

const ok =
  aliceResult &&
  aliceResult.value === value &&
  aliceResult.blinding === blinding &&
  bobResult === null;

console.log(ok ? "PASS ✅ round-trip ok, wrong key rejected" : "FAIL ❌");
process.exit(ok ? 0 : 1);
