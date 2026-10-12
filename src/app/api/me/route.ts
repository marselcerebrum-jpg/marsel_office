import { apiUser, handle } from "@/lib/auth";

export const GET = handle(async () => Response.json({ user: await apiUser() }));
