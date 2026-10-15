import { NextRequest } from "next/server";
import { forwardToAdmin } from "@/lib/admin-proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

// Read-only on purpose: the audit log is append-only, so no write verbs are proxied.
export const GET = async (request: NextRequest, { params }: Ctx) => forwardToAdmin(request, "audit-logs", (await params).path);
