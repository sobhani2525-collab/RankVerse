import { NextRequest } from "next/server";
import { forwardToAdmin } from "@/lib/admin-proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

const handler = async (request: NextRequest, { params }: Ctx) => forwardToAdmin(request, "contact-messages", (await params).path);

export const GET = handler;
export const PATCH = handler;
