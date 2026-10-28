import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { hasValidRunToken } from "@/lib/auth";
import { getIncident, getTargetColumns } from "@/lib/database";
import { parseRepairProposal, validateRepairProposal } from "@/lib/repair-validation";
export const maxDuration = 30;
export async function POST(request: Request, context: {params: Promise<{incidentId: string}>}) {
 const correlationId=crypto.randomUUID();
 const reply=(body: unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
 if(!hasValidRunToken(request)) return reply({error:{message:"Unauthorized"}},401);
 const origin=request.headers.get("origin");
 if(origin && origin!==new URL(request.url).origin) return reply({error:{message:"Origin denied"}},403);
 try {
  const {incidentId}=await context.params;
  const body=await request.json();
  if(!/^[0-9a-f-]{36}$/i.test(incidentId) || !["approve","reject","replay"].includes(body.action) ||
   !Number.isInteger(body.version) || !/^[0-9a-f-]{36}$/i.test(body.proposalId) || !/^[a-f0-9]{64}$/.test(body.hash))
   return reply({error:{message:"Invalid action"}},400);
  const repository=`${process.env.GITHUB_OWNER?.trim()}/${process.env.GITHUB_REPOSITORY?.trim()}`.toLowerCase();
  const incident=await getIncident(incidentId,repository);
  const proposal=incident?.proposals.find(p=>p.id===body.proposalId);
  if(!incident || !proposal) return reply({error:{message:"Proposal unavailable"}},404);
  const parsed=parseRepairProposal(proposal.proposal);
  const hash=createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  if(hash!==body.hash || hash!==proposal.proposal_hash || !validateRepairProposal(parsed,await getTargetColumns()).passed)
   return reply({error:{message:"Proposal changed or validation failed. Refresh the incident."}},409);
  const sql=neon(process.env.DATABASE_URL!);
  const result=await sql`SELECT flowmedic_repair_action(${incidentId}::uuid,${repository},${body.proposalId}::uuid,${hash},${body.version}::integer,${body.action},${correlationId}) AS result`;
  return reply({...result[0].result,correlationId});
 } catch(error) {
  const code=error && typeof error==='object' && 'code' in error ? error.code : undefined;
  return reply({error:{message:code==='P0001'||code==='23505' ? "Action stale or already attempted. Refresh the incident." : "Action failed. Check migrations 0003/0004 and refresh."},correlationId},409);
 }
}
