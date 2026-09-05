"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Clock3, Mail, Menu, Pause, Play, Plus, Send, Trash2, X, Check } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { DelayedSkeleton } from "@/components/loading-skeleton";

type Connection={id:string;provider:"google"|"microsoft";email:string;display_name?:string|null};
type Campaign={id:string;name:string,status:string,subject:string,start_at:string,interval_minutes:number,total:number,sent:number,pending:number,failed:number};
type Approval={id:string,recipient:string,subject:string,body:string,status:string,scheduled_at:string|null,sender_email:string,campaign_name?:string|null,error?:string|null};

function CampaignListSkeleton(){return <div className="divide-y divide-[#e8e4dc]">{[0,1,2].map(i=><div key={i} className="flex items-center justify-between gap-4 p-5 sm:p-6"><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-40 animate-pulse rounded bg-[#e9e7e1]"/><div className="h-3 w-56 animate-pulse rounded bg-[#e9e7e1]"/><div className="h-3 w-44 animate-pulse rounded bg-[#e9e7e1]"/></div><div className="h-9 w-24 animate-pulse rounded-lg bg-[#e9e7e1]"/></div>)}</div>}
function ApprovalListSkeleton(){return <div className="divide-y divide-[#e8e4dc]">{[0,1].map(i=><div key={i} className="p-5 sm:p-6"><div className="space-y-2"><div className="h-4 w-52 animate-pulse rounded bg-[#e9e7e1]"/><div className="h-4 w-72 animate-pulse rounded bg-[#e9e7e1]"/><div className="h-16 w-full animate-pulse rounded-lg bg-[#ebe9e3]"/></div></div>)}</div>}

export default function CampaignsPage(){
  const user=useAuthUser();
  const [connections,setConnections]=useState<Connection[]>([]);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({name:"",connectionId:"",subject:"",body:"",recipients:"",startAt:"",intervalMinutes:"60"});
  const gmail=useMemo(()=>connections.filter(x=>x.provider==="google"),[connections]);
  const token=async()=>user?.getIdToken();

  const load=async()=>{
    if(!user)return;
    try{
      const t=await token();
      const [cr,rr]=await Promise.all([
        fetch("/api/campaigns",{headers:{Authorization:`Bearer ${t}`},cache:"no-store"}),
        fetch("/api/email/connections",{headers:{Authorization:`Bearer ${t}`},cache:"no-store"})
      ]);
      const cd=await cr.json(),rd=await rr.json();
      if(!cr.ok)throw new Error(cd.error||"Unable to load campaigns.");
      if(!rr.ok)throw new Error(rd.error||"Unable to load email connections.");
      setCampaigns(cd.campaigns||[]);setApprovals(cd.approvals||[]);setConnections(rd.connections||[]);
      if(!form.connectionId&&rd.connections?.find((x:Connection)=>x.provider==="google"))setForm(f=>({...f,connectionId:rd.connections.find((x:Connection)=>x.provider==="google")?.id||""}));
    }catch(e){setError(e instanceof Error?e.message:"Unable to load campaigns.")}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[user?.uid]);

  const create=async()=>{
    if(!user)return;setBusy("create");setError("");
    try{
      const t=await token();
      const recipients=form.recipients.split(/[\n,]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
      const r=await fetch("/api/campaigns",{method:"POST",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},body:JSON.stringify({...form,intervalMinutes:Number(form.intervalMinutes),recipients})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to create campaign.");
      setOpen(false);setForm(f=>({...f,name:"",subject:"",body:"",recipients:"",startAt:"",intervalMinutes:"60"}));await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to create campaign")}finally{setBusy("")}
  };

  const action=async(path:string,body:unknown,button:string)=>{
    if(!user)return;setBusy(button);setError("");
    try{
      const t=await token();const r=await fetch(path,{method:"PATCH",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Action failed.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Action failed.")}finally{setBusy("")}
  };

  const remove=async(id:string)=>{
    if(!user||!confirm("Delete this campaign and its pending approvals?"))return;setBusy(id);setError("");
    try{const t=await token();const r=await fetch(`/api/campaigns/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${t}`}});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to delete campaign.");await load()}
    catch(e){setError(e instanceof Error?e.message:"Unable to delete campaign")}finally{setBusy("")}
  };

  const approvalAction=async(id:string,actionName:"approve"|"reject"|"send")=>{
    if(!user)return;setBusy(id+actionName);setError("");
    try{const t=await token();const r=await fetch(`/api/approvals/${id}`,{method:"PATCH",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},body:JSON.stringify({action:actionName})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to update approval.");await load()}
    catch(e){setError(e instanceof Error?e.message:"Unable to update approval.")}finally{setBusy("")}
  };

  if(!user)return null;
  const visibleApprovals=approvals.filter(a=>a.status==='pending'||a.status==='approved'||a.status==='failed');

  return <main className="flex h-screen min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
    <WorkspaceSidebar user={user}/>
    <section className="min-w-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e8e5de]/80 bg-[var(--bg)]/95 px-4 backdrop-blur sm:px-7"><button onClick={()=>window.dispatchEvent(new Event("sanmine:open-sidebar"))} className="rounded-lg p-2 text-[#5f5b53] hover:bg-black/5 md:hidden" aria-label="Open sidebar"><Menu size={21}/></button><div className="hidden md:block"/><Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#6d6961] hover:bg-black/5">Back to chat</Link></header>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">Outreach workspace</p><h1 className="font-serif text-5xl tracking-[-.045em] text-[#282721] sm:text-6xl">Campaigns</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#77736a]">Review outreach, approve emails, and manage scheduled campaigns from one focused workspace.</p></div>
          <button onClick={()=>setOpen(true)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#282721] px-4 text-sm font-medium text-white hover:opacity-90"><Plus size={16}/> New campaign</button>
        </div>
        {error&&<div className="mt-7 rounded-xl border border-[#ead6cf] bg-[#fff7f3] px-4 py-3 text-sm text-[#8b5145]">{error}</div>}
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#3d3a34]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#efede7]"><Mail size={15}/></span>Pending approval <span className="text-xs font-normal text-[#99958c]">{visibleApprovals.length}</span></div>
          <div className="divide-y divide-[#e8e4dc] rounded-2xl border border-[#dedbd4] bg-[#fbfaf7] shadow-sm">{loading?<DelayedSkeleton><ApprovalListSkeleton/></DelayedSkeleton>:visibleApprovals.length===0?<div className="px-5 py-10 text-sm text-[#8b877e]">No emails waiting for approval.</div>:visibleApprovals.map(a=><div key={a.id} className="p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#282721]">{a.recipient}</span><span className="rounded-full bg-[#efede7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#77736a]">{a.status}</span>{a.campaign_name&&<span className="text-xs text-[#969188]">{a.campaign_name}</span>}</div><div className="mt-1.5 text-sm font-medium text-[#4b4840]">{a.subject}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6f6b63]">{a.body}</p>{a.error&&<p className="mt-2 text-xs text-[#9b5c50]">{a.error}</p>}</div><div className="flex shrink-0 gap-2">{a.status==='pending'&&<><button onClick={()=>void approvalAction(a.id,"approve")} disabled={!!busy} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9d5cd] bg-white hover:bg-[#f2f0eb] disabled:opacity-40" title="Approve"><Check size={15}/></button><button onClick={()=>void approvalAction(a.id,"reject")} disabled={!!busy} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9d5cd] bg-white hover:bg-[#f2f0eb] disabled:opacity-40" title="Reject"><X size={15}/></button></>}{a.status==='approved'&&<button onClick={()=>void approvalAction(a.id,"send")} disabled={!!busy} className="flex items-center gap-2 rounded-lg bg-[#282721] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"><Send size={13}/>Send now</button>}{a.status==='failed'&&<button onClick={()=>void approvalAction(a.id,"send")} disabled={!!busy} className="flex items-center gap-2 rounded-lg bg-[#282721] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"><Send size={13}/>Retry</button>}</div></div></div>)}</div>
        </section>
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#3d3a34]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#efede7]"><Clock3 size={15}/></span>Campaigns <span className="text-xs font-normal text-[#99958c]">{campaigns.length}</span></div>
          <div className="divide-y divide-[#e8e4dc] rounded-2xl border border-[#dedbd4] bg-[#fbfaf7] shadow-sm">{loading?<DelayedSkeleton><CampaignListSkeleton/></DelayedSkeleton>:campaigns.length===0?<div className="px-5 py-10 text-sm text-[#8b877e]">No campaigns yet. Create one after connecting Gmail in Plugins.</div>:campaigns.map(c=><div key={c.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[#282721]">{c.name}</h3><span className="rounded-full bg-[#efede7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#77736a]">{c.status}</span></div><p className="mt-1 text-xs text-[#8b877e]">{c.sent}/{c.total} sent · {c.pending} pending · every {c.interval_minutes} min</p><p className="mt-1 text-xs text-[#969188]">Starts {new Date(c.start_at).toLocaleString()}</p></div><div className="flex gap-2">{(c.status==='draft'||c.status==='paused')&&<button onClick={()=>void action(`/api/campaigns/${c.id}`,{action:c.status==='draft'?'activate':'resume'},c.id+'a')} disabled={!!busy} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9d5cd] bg-white hover:bg-[#f2f0eb] disabled:opacity-40" title="Activate"><Play size={14}/></button>}{c.status==='active'&&<button onClick={()=>void action(`/api/campaigns/${c.id}`,{action:"pause"},c.id+'p')} disabled={!!busy} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9d5cd] bg-white hover:bg-[#f2f0eb] disabled:opacity-40" title="Pause"><Pause size={14}/></button>}<button onClick={()=>void remove(c.id)} disabled={!!busy} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9d5cd] bg-white hover:bg-[#f2f0eb] disabled:opacity-40" title="Delete"><Trash2 size={14}/></button></div></div>)}</div>
        </section>
      </div>
    </section>
    {open&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#dedbd4] bg-[#fbfaf7] p-5 shadow-xl sm:p-7"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-[#282721]">Create campaign</h2><p className="mt-1 text-xs text-[#8b877e]">All recipients start as pending approval.</p></div><button onClick={()=>setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5"><X size={17}/></button></div><div className="grid gap-4"><Field label="Campaign name"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Founder outreach"/></Field><Field label="Gmail account"><select value={form.connectionId} onChange={e=>setForm({...form,connectionId:e.target.value})}><option value="">Select Gmail</option>{gmail.map(c=><option key={c.id} value={c.id}>{c.email}</option>)}</select>{!gmail.length&&<p className="mt-1 text-xs text-[#9b5c50]">Connect Gmail first in Plugins.</p>}</Field><Field label="Subject"><input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="A quick idea for your team"/></Field><Field label="Email body"><textarea rows={7} value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Write the approved outreach email here..."/></Field><Field label="Recipients"><textarea rows={5} value={form.recipients} onChange={e=>setForm({...form,recipients:e.target.value})} placeholder="one@example.com\ntwo@example.com"/><p className="mt-1 text-xs text-[#969188]">One email per line. Each becomes a separate approval.</p></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Start"><input type="datetime-local" value={form.startAt} onChange={e=>setForm({...form,startAt:e.target.value})}/></Field><Field label="Interval (minutes)"><input type="number" min="60" value={form.intervalMinutes} onChange={e=>setForm({...form,intervalMinutes:e.target.value})}/></Field><div className="flex items-end"><div className="w-full rounded-xl bg-[#efede7] px-3 py-2.5 text-xs leading-5 text-[#77736a]">Approve each email before the worker can send it.</div></div></div><button onClick={()=>void create()} disabled={!!busy||!gmail.length} className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#282721] text-sm font-medium text-white disabled:opacity-40">{busy==='create'?"Creating…":"Create campaign"}</button></div></div></div>}
  </main>;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="campaign-field block"><span className="mb-1.5 block text-xs font-medium text-[#5f5b53]">{label}</span>{children}</label>}
