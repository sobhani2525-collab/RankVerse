import { NextRequest } from "next/server";
import { forwardToAdmin } from "@/lib/admin-proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

const forward = async (request: NextRequest, { params }: Ctx) => forwardToAdmin(request, "users", (await params).path);

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
