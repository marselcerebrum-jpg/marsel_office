import { OfficeApp } from "@/components/office/OfficeApp";
import { getAgents, getDivisions, getRunbooks } from "@/lib/agents-server";
import { requireUser } from "@/lib/auth";
import { getLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  return <OfficeApp agents={getAgents()} divisions={getDivisions()} runbooks={getRunbooks()} leads={getLeads()} user={user} />;
}
