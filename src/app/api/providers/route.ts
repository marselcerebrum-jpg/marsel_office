import { apiUser, handle } from "@/lib/auth";
import { driveEnabled } from "@/lib/drive";
import { availableProviders } from "@/lib/llm";

export const GET = handle(async () => {
  await apiUser();
  return Response.json({ providers: await availableProviders(), driveEnabled: driveEnabled() });
});
