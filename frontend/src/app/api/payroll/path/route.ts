/**
 * GET /api/payroll/path?payroll=0x<root>&address=0x...
 * Returns the Merkle path for the given employee address within the payroll
 * identified by the given Merkle root.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getMerklePath } from "@/lib/merkle";
import type { Employee } from "@/lib/merkle";

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

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("payroll")?.toLowerCase();
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();

  if (!root || !ROOT_RE.test(root)) {
    return NextResponse.json({ error: "Missing or invalid payroll param" }, { status: 400 });
  }
  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Missing or invalid address param" }, { status: 400 });
  }

  let store: Store;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    store = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "No payrolls set" }, { status: 404 });
  }

  const payrollData = store[root];
  if (!payrollData) {
    return NextResponse.json({ error: "No payroll for that root" }, { status: 404 });
  }

  const leafIndex = payrollData.employees.findIndex(
    (e) => e.address.toLowerCase() === address
  );
  if (leafIndex === -1 || leafIndex >= 5) {
    return NextResponse.json({ error: "Address not on this payroll" }, { status: 404 });
  }

  const tree = {
    root: payrollData.root,
    leaves: payrollData.leaves,
    employees: payrollData.employees.map((e) => ({
      address: e.address,
      salary: BigInt(e.salary),
    })) as Employee[],
  };

  const merklePath = await getMerklePath(tree, leafIndex);
  const salary = payrollData.employees[leafIndex].salary;

  return NextResponse.json({
    salary,
    root: payrollData.root,
    leafIndex: merklePath.leafIndex,
    leaf: merklePath.leaf,
    siblings: merklePath.siblings,
    pathIndices: merklePath.pathIndices,
  });
}
