// circomlibjs ships no type declarations; we only use buildPoseidon / buildBabyjub
// and access their results dynamically (see src/lib/crypto.ts).
declare module "circomlibjs" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function buildPoseidon(): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function buildBabyjub(): Promise<any>;
}
