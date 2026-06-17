/**
 * POST /api/payroll
 * Body: { employer: string; employees: [{ address: string; salary: string }] }
 * Response: { root: string; leaves: string[] }
 *
 * GET /api/payroll?payroll=0x<root>
 * Response: the stored payroll tree for that root (employees + root + employer)
 * GET /api/payroll
 * Response: { payrolls: string[] } — the Merkle roots that have a stored payroll
 *
 * The store is keyed by Merkle root, not by employer: a single employer can run
 * several payrolls at once (one per distinct employee set), each under its own root.
 * The creating employer is kept on the record as metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { buildMerkleTree } from "@/lib/merkle";

const STORE_PATH = path.join(process.cwd(), ".payroll.json");

interface StoredPayroll {
  employer: string;
  root: string;
  leaves: string[];
  employees: { address: string; salary: string }[];
}
type Store = Record<string, StoredPayroll>;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/;

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    // Guard against the legacy single-payroll format ({ root, leaves, employees }).
    // The keyed store is a map; anything with a top-level "root" is the old shape.
    if (parsed && typeof parsed === "object" && !("root" in parsed)) {
      return parsed as Store;
    }
    return {};
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const store = await readStore();
  const root = req.nextUrl.searchParams.get("payroll")?.toLowerCase();

  if (!root) {
    return NextResponse.json({ payrolls: Object.keys(store) });
  }
  if (!ROOT_RE.test(root)) {
    return NextResponse.json({ error: "Invalid payroll root" }, { status: 400 });
  }

  const payroll = store[root];
  if (!payroll) {
    return NextResponse.json({ error: "No payroll for that root" }, { status: 404 });
  }
  return NextResponse.json(payroll);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const employer: unknown = (body as Record<string, unknown>)?.employer;
  const rawEmployees: unknown = (body as Record<string, unknown>)?.employees;

  if (typeof employer !== "string" || !ADDRESS_RE.test(employer)) {
    return NextResponse.json({ error: "Missing or invalid employer address" }, { status: 400 });
  }

  if (!Array.isArray(rawEmployees) || rawEmployees.length === 0 || rawEmployees.length > 5) {
    return NextResponse.json({ error: "Provide 1–5 employees" }, { status: 400 });
  }

  for (const e of rawEmployees) {
    if (!e || typeof e.address !== "string" || !ADDRESS_RE.test(e.address)) {
      return NextResponse.json(
        { error: `Invalid address: ${e?.address}` },
        { status: 400 }
      );
    }
    let sal: bigint;
    try {
      sal = BigInt(e.salary);
    } catch {
      return NextResponse.json(
        { error: `Salary must be an integer for address ${e.address}` },
        { status: 400 }
      );
    }
    if (sal <= BigInt(0)) {
      return NextResponse.json(
        { error: `Salary must be positive for address ${e.address}` },
        { status: 400 }
      );
    }
  }

  const seen = new Set<string>();
  for (const e of rawEmployees) {
    const lower = e.address.toLowerCase();
    if (seen.has(lower)) {
      return NextResponse.json(
        { error: `Duplicate address: ${e.address}` },
        { status: 400 }
      );
    }
    seen.add(lower);
  }

  const employees = rawEmployees.map((e) => ({
    address: e.address,
    salary: BigInt(e.salary),
  }));

  const tree = await buildMerkleTree(employees);

  // Serialise (BigInt-safe) and persist under this payroll's Merkle root.
  const serialised: StoredPayroll = {
    employer: employer.toLowerCase(),
    root: tree.root,
    leaves: tree.leaves,
    employees: tree.employees.map((e) => ({
      address: e.address,
      salary: e.salary.toString(),
    })),
  };

  const store = await readStore();
  store[tree.root.toLowerCase()] = serialised;
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));

  return NextResponse.json({ root: tree.root, leaves: tree.leaves });
}
