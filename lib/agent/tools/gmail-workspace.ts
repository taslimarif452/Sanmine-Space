import type { AgentTool } from "@/lib/agent/tools/types";
import { resolveGmailConnection } from "@/lib/email/gmail-sender";
import { decryptToken } from "@/lib/email/oauth";

export const gmailWorkspaceTool: AgentTool = {
  name: "gmail_workspace",
  description: "Read the user's connected Gmail mailbox and create saved Gmail drafts. Use action list, read, or draft. This tool does not send; explicit sending uses the existing send email tool and explicit scheduling uses schedule_gmail.",
  parameters: { type:"object", properties:{ user_id:{type:"string"}, user_email:{type:"string"}, action:{type:"string",enum:["list","read","draft"]}, message_id:{type:"string"}, query:{type:"string"}, to:{type:"string"}, subject:{type:"string"}, body:{type:"string"}, max_results:{type:"number"} }, required:["user_id","action"] },
  execute: async (args) => {
    const uid=String(args.user_id||"").trim(); if(!uid) throw new Error("Authenticated user context is missing.");
    const connection=await resolveGmailConnection(uid,String(args.user_email||"")); if(!connection) return {status:"needs_connection",message:"Gmail is not connected for this signed-in account."};
    const token=decryptToken(String(connection.access_token)); const headers={Authorization:`Bearer ${token}`,Accept:"application/json"}; const action=String(args.action||"");
    if(action==="list") { const q=String(args.query||"").trim(); const max=Math.min(Math.max(Number(args.max_results)||20,1),50); const url=`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}${q?`&q=${encodeURIComponent(q)}`:""}`; const r=await fetch(url,{headers,cache:"no-store"}); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(d.error?.message||"Gmail list failed.")); return {status:"success",messages:d.messages||[],resultSizeEstimate:d.resultSizeEstimate||0}; }
    if(action==="read") { const id=String(args.message_id||"").trim(); if(!id)throw new Error("message_id is required."); const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,{headers,cache:"no-store"}); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(d.error?.message||"Gmail message read failed.")); return {status:"success",message:{id:d.id,threadId:d.threadId,labelIds:d.labelIds,payload:d.payload,snippet:d.snippet,internalDate:d.internalDate}}; }
    if(action==="draft") { const to=String(args.to||"").trim(); const subject=String(args.subject||"").trim(); const body=String(args.body||"").trim(); if(!/^\S+@\S+\.\S+$/.test(to))throw new Error("A valid draft recipient is required."); if(!subject)throw new Error("Draft subject is required."); if(!body)throw new Error("Draft body is required."); const raw=Buffer.from([`To: ${to}`,`Subject: ${subject}`,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","","",body].join("\r\n"),"utf8").toString("base64url"); const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({message:{raw}}),cache:"no-store"}); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(String(d.error?.message||"Gmail draft creation failed.")); return {status:"success",saved:true,draft_id:d.id,message_id:d.message?.id||null}; }
    throw new Error("Unsupported Gmail action.");
  },
};
