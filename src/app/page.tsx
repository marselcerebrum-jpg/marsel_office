import { OfficeApp } from "@/components/office/OfficeApp";
import { getAgents, getDivisions, getRunbooks } from "@/lib/agents-server";

export const dynamic = "force-dynamic";

export default function Home() {
  return <OfficeApp agents={getAgents()} divisions={getDivisions()} runbooks={getRunbooks()} />;
}
