import { getProvider, type ChatMessage } from "@/lib/ai/provider";
import { sql } from "@/lib/db/neon";
import { sendGmailMessage } from "@/lib/email/gmail";
import { createApproval, ensureProductionSchema } from "@/lib/agent/production";
import type { AgentTool } from "@/lib/agent/tools/types";

type Target = { name: string; country?: string; subscribers?: string | number; total_views?: string | number; niche?: string; channel_url?: string; description?: string };
type TavilyResult = { title?: string; url?: string; content?: string };
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function connectionMessage(language: string) { const messages: Record<string,string> = { hi:"Proposal bhejne se pehle Plugins page par jaakar Gmail connect karo. Gmail sending active hai; Outlook sending available nahi hai.", bn:"Proposal পাঠানোর আগে Plugins পেজে গিয়ে Gmail connect করুন। Gmail sending active; Outlook sending এখনও available নয়।", es:"Antes de enviar, conecta Gmail desde Plugins. Gmail está activo; Outlook todavía no está disponible.", fr:"Avant l'envoi, connectez Gmail depuis Plugins. Gmail est actif ; Outlook n'est pas encore disponible.", zh:"发送前请在 Plugins 页面连接 Gmail。目前已启用 Gmail，Outlook 暂不可用。", ja:"送信前に Plugins で Gmail を接続してください。現在 Gmail が有効で、Outlook は利用できません。", ko:"전송 전에 Plugins에서 Gmail을 연결해 주세요. 현재 Gmail이 활성화되어 있고 Outlook은 사용할 수 없습니다.", en:"Before sending, connect Gmail from the Plugins page. Gmail sending is active; Outlook sending is not available yet." }; return messages[language] || messages.en; }
function extractBusinessEmails(text: string) { const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []; return [...new Set(emails.map(x=>x.toLowerCase()))].filter(email=>!/example\.com|sentry|wixpress|cloudflare|noreply|no-reply|support@|privacy@|legal@|abuse@/i.test(email)); }
async function findContact(name: string) { const apiKey=process.env.TAVILY_API_KEY?.trim(); if(!apiKey) return {status:"not_configured",email:null,sources:[]}; const queries=[`"${name}" YouTube business email contact`,`"${name}" creator email sponsorship contact`,`"${name}" YouTube "@" email`]; const sources:{title:string;url:string;snippet:string}[]=[]; const emails:string[]=[]; for(const query of queries){ const response=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:apiKey,query,max_results:5,search_depth:"advanced",include_answer:false,include_raw_content:true}),cache:"no-store"}); if(!response.ok) continue; const data=await response.json() as {results?:TavilyResult[]}; for(const result of data.results??[]){const title=clean(result.title)||"Untitled source";const url=clean(result.url);const snippet=clean(result.content);sources.push({title,url,snippet});emails.push(...extractBusinessEmails(`${title}\n${url}\n${snippet}`));} if(emails.length) break; } return {status:"success",email:emails[0]??null,emails:[...new Set(emails)],sources:sources.slice(0,8)}; }

export const sendProposalOutreachTool: AgentTool = {
  name:"send_proposal_outreach",
  description:"For an explicit request to send proposals, verify Gmail, research public business contact emails, personalize the proposal from supplied evidence, and send only after a separate user approval. Never guess an address.",
  parameters:{type:"object",properties:{user_id:{type:"string"},targets:{type:"array",items:{type:"object",properties:{name:{type:"string"},country:{type:"string"},subscribers:{type:"string"},total_views:{type:"string"},niche:{type:"string"},channel_url:{type:"string"},description:{type:"string"}},required:["name"]}},offer:{type:"string"},sender_name:{type:"string"},user_language:{type:"string"}},required:["targets","offer"]},
  execute:async(args)=>{
    const userId=clean(args.user_id); const targets=Array.isArray(args.targets)?(args.targets as Target[]).slice(0,20):[]; const offer=clean(args.offer); const senderName=clean(args.sender_name)||"Samine AI Agent"; const language=clean(args.user_language)||"en";
    if(!userId)return{status:"error",message:"Authenticated user context is missing."}; if(!targets.length)return{status:"error",message:"No prospects were supplied."}; if(!offer)return{status:"error",message:"An offer is required."};
    const connections=await sql`SELECT id, provider, email FROM email_connections WHERE user_id=${userId} ORDER BY updated_at DESC`;
    const gmail=connections.find(row=>String((row as any).provider)==="google") as {id:string;provider:string;email:string}|undefined;
    const microsoft=connections.find(row=>String((row as any).provider)==="microsoft") as {id:string;provider:string;email:string}|undefined;
    if(!gmail&&!microsoft)return{status:"needs_connection",sent_count:0,skipped_count:0,failed_count:0,connected_providers:[],message:connectionMessage(language)};
    if(!gmail)return{status:"provider_unavailable",sent_count:0,skipped_count:0,failed_count:0,connected_providers:["microsoft"],message:"Outlook sending is not enabled. Connect Gmail from Plugins."};
    await ensureProductionSchema();
    const approval=await createApproval(userId,null,"send_proposal_outreach",{targets,offer,senderName,language,gmailConnectionId:gmail.id});
    return {status:"approval_required",approval_id:String(approval.id),approval_status:"pending",provider:"google",sender:gmail.email,target_count:targets.length,message:"The outreach is prepared for review. No email has been sent. Approve this action to continue."};
  }
};
