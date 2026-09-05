"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowUp, Copy, Loader2, Square } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ChatLoadingSkeleton } from "@/components/loading-skeleton";

type Source={title:string;url:string;snippet?:string;domain?:string};
type Metadata={kind?:string;mode?:string;durationMs?:number;eventCount?:number;toolCount?:number;sources?:unknown[]};
type Message={id?:string;role:"user"|"assistant";content:string;sources?:Source[];metadata?:Metadata;created_at?:string};
type Chat={id:string;title:string;created_at:string;updated_at:string};
type Event={type?:string;name?:string;toolCallId?:string;result?:unknown};
type StreamPacket={type?:string;event?:Event;delta?:string;response?:string;events?:Event[];chatId?:string|null;metadata?:Metadata;error?:string};

const CACHE="v5";
const rkey=(u:string)=>`sanmine:${CACHE}:recent:${u}`;
const ckey=(u:string,c:string)=>`sanmine:${CACHE}:chat:${u}:${c}`;
const BRAND_LOGO="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";
function read<T>(k:string):T|null{try{return typeof window==="undefined"?null:JSON.parse(localStorage.getItem(k)||"null")}catch{return null}}
function write(k:string,v:unknown){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function favicon(domain:string){return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
function cleanSource(x:any):Source|null{try{const u=new URL(String(x?.url||""));if(!/^https?:$/.test(u.protocol))return null;return {title:String(x?.title||"Web source").slice(0,180),url:u.toString(),domain:u.hostname.replace(/^www\./,""),snippet:x?.snippet?String(x.snippet).replace(/\s+/g," ").slice(0,240):undefined}}catch{return null}}
function collectSources(events:Event[]){const map=new Map<string,Source>();for(const e of events||[]){if(e.type!=="tool_result"||!e.result||typeof e.result!=="object")continue;const r=e.result as any;if(Array.isArray(r.results))for(const item of r.results){const s=cleanSource(item);if(s)map.set(s.url,s)}const s=cleanSource(r);if(s)map.set(s.url,s)}return [...map.values()].slice(0,12)}
function statusFor(name?:string){if(name==="search_web")return ["searching","Searching the web"];if(name==="open_page")return ["opening","Opening source"];if(name==="website_analyze")return ["analyzing","Analyzing website"];if(name?.includes("youtube"))return ["youtube","Searching YouTube"];if(name==="generate_proposal")return ["proposal","Generating proposal"];if(name==="generate_outreach_email")return ["email","Writing email"];if(name==="send_proposal_outreach")return ["sending","Preparing outreach"];return ["researching","Working on it"]}
function SourceCards({items}:{items:Source[]}){if(!items.length)return null;return <div className="mt-5"><div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#969188]">Sources</div><div className="grid gap-2 sm:grid-cols-2">{items.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="group flex min-w-0 items-center gap-2 px-0 py-1 transition"><img src={favicon(s.domain||new URL(s.url).hostname)} alt="" className="h-5 w-5 shrink-0 rounded-sm"/><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-[#37352f]">{s.title}</span><span className="block truncate text-[11px] text-[#98948b]">{s.domain}</span></span></a>)}</div></div>}
function Progress({status,steps}:{status:string;steps:string[]}){if(!status&&!steps.length)return null;return <span className="mb-3 inline-flex items-center gap-2 text-[13px] text-[#77736b]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"/>{status||steps.at(-1)||"Thinking"}<Loader2 size={13} className="animate-spin"/></span>}
function Composer({value,setValue,onSubmit,onStop,loading}:{value:string;setValue:(v:string)=>void;onSubmit:()=>void;onStop:()=>void;loading:boolean}){const ref=useRef<HTMLTextAreaElement>(null);useEffect(()=>{const el=ref.current;if(!el)return;el.style.height="auto";el.style.height=`${Math.min(el.scrollHeight,190)}px`},[value]);return <div className="relative rounded-[22px] border border-[#dcd9d1] bg-[#FFFFFF] p-2 shadow-sm"><textarea ref={ref} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(loading)onStop();else onSubmit()}}} placeholder="Message Sanmine Space..." rows={1} disabled={loading} className="min-h-[48px] max-h-[190px] w-full resize-none overflow-auto border-0 bg-transparent px-3 py-2.5 pr-12 text-[15px] leading-6 outline-none disabled:opacity-70"/><button aria-label={loading?"Stop generating":"Send message"} onClick={loading?onStop:onSubmit} disabled={!loading&&!value.trim()} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-[#282721] text-white transition disabled:opacity-30">{loading?<Square size={14} fill="currentColor"/>:<ArrowUp size={17}/>}</button></div>}

export default function Home(){
  const user=useAuthUser();
  const router=useRouter();
  const params=useParams<{id?:string}>();
  const routeChatId=typeof params?.id==="string"?params.id:null;
  const [text,setText]=useState(""); const [msgs,setMsgs]=useState<Message[]>([]); const [chats,setChats]=useState<Chat[]>([]); const [active,setActive]=useState<string|null>(routeChatId);
  const [loading,setLoading]=useState(false); const [loadingChat,setLoadingChat]=useState(false);
  const [status,setStatus]=useState(""); const [steps,setSteps]=useState<string[]>([]); const [error,setError]=useState("");
  const scrollRef=useRef<HTMLDivElement>(null); const followRef=useRef(true); const abortRef=useRef<AbortController|null>(null);
  const [copied,setCopied]=useState<number|null>(null);

  const scrollLatest=(behavior:ScrollBehavior="smooth")=>{const el=scrollRef.current;if(!el)return;el.scrollTo({top:el.scrollHeight,behavior});followRef.current=true};
  const onScroll=()=>{const el=scrollRef.current;if(!el)return;const d=el.scrollHeight-el.scrollTop-el.clientHeight;followRef.current=d<140};
  const loadChats=async(bg=false)=>{if(!user)return;const cache=read<Chat[]>(rkey(user.uid));if(cache&&!bg)setChats(cache);try{const t=await user.getIdToken(),r=await fetch("/api/chats",{headers:{Authorization:`Bearer ${t}`},cache:"no-store"});if(!r.ok)return;const d=await r.json();const xs=Array.isArray(d.chats)?d.chats:[];setChats(xs);write(rkey(user.uid),xs)}catch{}};
  const openChat=async(id:string)=>{if(loading||loadingChat||!user)return;setActive(id);router.push(`/chat/${id}`,{scroll:false});setError("");const cache=read<Message[]>(ckey(user.uid,id));if(cache)setMsgs(cache);else setMsgs([]);setLoadingChat(!cache);try{const t=await user.getIdToken(),r=await fetch(`/api/chats/${id}`,{headers:{Authorization:`Bearer ${t}`},cache:"no-store"});if(!r.ok)throw new Error("Unable to load this chat.");const d=await r.json();const xs=Array.isArray(d.messages)?d.messages.map((m:any)=>{const md=m.metadata&&typeof m.metadata==="object"?m.metadata:{};const persistedSources=Array.isArray(md.sources)?md.sources.map(cleanSource).filter(Boolean) as Source[]:[];return {id:String(m.id||""),role:m.role==="assistant"?"assistant":"user",content:String(m.content||""),metadata:md,sources:persistedSources}}):[];setMsgs(xs);write(ckey(user.uid,id),xs)}catch(e){setError(e instanceof Error?e.message:"Unable to load this chat.")}finally{setLoadingChat(false)}};
  useEffect(()=>{if(!user)return;void loadChats()},[user]);
  useEffect(()=>{if(!user||!routeChatId)return;if(active===routeChatId&&msgs.length)return;void openChat(routeChatId)},[user,routeChatId]);
  useEffect(()=>{if(msgs.length&&active)requestAnimationFrame(()=>scrollLatest("auto"))},[active]);
  useEffect(()=>{if(followRef.current)requestAnimationFrame(()=>scrollLatest("auto"))},[msgs,loading,status]);

  const fresh=()=>{if(loading)abortRef.current?.abort();router.push("/",{scroll:false});setActive(null);setMsgs([]);setText("");setError("");setStatus("");setSteps([]);followRef.current=true};
  const stop=()=>{abortRef.current?.abort();setStatus("Stopping");};

  const send=async(q:string,base:Message[],chatId:string|null)=>{
    if(!user||!q.trim())return;
    setLoading(true);setStatus("Thinking");setSteps([]);setError("");followRef.current=true;requestAnimationFrame(()=>scrollLatest("smooth"));
    const controller=new AbortController();abortRef.current=controller;let answer="",streamed="",events:Event[]=[],id=chatId;
    try{
      const token=await user.getIdToken();
      const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({message:q,history:base.map(m=>({role:m.role,content:m.content})),chatId}),signal:controller.signal});
      if(!r.ok){const raw=await r.text();let msg=`Chat request failed (${r.status}).`;try{msg=JSON.parse(raw).error||msg}catch{}throw new Error(msg)}
      const reader=r.body?.getReader();if(!reader)throw new Error("No response stream.");const decoder=new TextDecoder();let buffer="";
      const consume=(line:string)=>{
        if(!line.trim())return;
        let d:StreamPacket;
        try{d=JSON.parse(line)}catch{return}
        if(d.type==="chat"&&d.chatId){id=d.chatId;setActive(id);window.history.replaceState(window.history.state,"",`/chat/${id}`);const now=new Date().toISOString();setChats(xs=>{const withoutPending=xs.filter(c=>!c.id.startsWith("pending-"));if(withoutPending.some(c=>c.id===id))return withoutPending;const n=[{id:id!,title:q.slice(0,120),created_at:now,updated_at:now},...withoutPending];write(rkey(user.uid),n);return n});}
        if(d.type==="event"&&d.event){const e=d.event;events.push(e);if(e.type==="thinking")setStatus(e.name==="tool_test"?"Checking available tools":"Thinking");if(e.type==="tool_start"){const [,label]=statusFor(e.name);setStatus(label);setSteps(s=>[...s,label].slice(-6));}if(e.type==="tool_result")setStatus("Thinking");}
        if(d.type==="delta"&&d.delta){streamed+=d.delta;setStatus("Writing answer");const next:Message[]=[...base,{role:"user",content:q},{role:"assistant",content:streamed}];setMsgs(next);}
        if(d.type==="done"){answer=d.response||streamed;events=d.events||events;}
        if(d.type==="error")throw new Error(d.error||"Chat failed.");
      };
      while(true){const x=await reader.read();if(x.done)break;buffer+=decoder.decode(x.value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()||"";for(const line of lines)consume(line)}
      buffer+=decoder.decode();if(buffer.trim())consume(buffer);
      if(!answer)answer=streamed;if(!answer)throw new Error("The AI completed without a usable answer.");
      const src=collectSources(events);const metadata:Metadata={kind:"chat_response",durationMs:0,eventCount:events.length,toolCount:events.filter(e=>e.type==="tool_start").length,sources:src};
      const final=[...base,{role:"user" as const,content:q},{role:"assistant" as const,content:answer,sources:src,metadata}];setMsgs(final);if(id)write(ckey(user.uid,id),final);void loadChats(true);
    }catch(e){if((e as Error)?.name==="AbortError"){setError("Generation stopped.");if(streamed){const final=[...base,{role:"user" as const,content:q},{role:"assistant" as const,content:streamed}];setMsgs(final);if(id)write(ckey(user.uid,id),final)}}else setError(e instanceof Error?e.message:"Something went wrong.")}
    finally{abortRef.current=null;setLoading(false);setStatus("");setSteps([]);}
  };

  const submit=()=>{const q=text.trim();if(!q||loading||loadingChat||!user)return;const base=msgs;setMsgs([...base,{role:"user" as const,content:q}]);setText("");if(!active){const now=new Date().toISOString();const pending:Chat={id:`pending-${Date.now()}`,title:q.slice(0,120),created_at:now,updated_at:now};setChats(xs=>{const n=[pending,...xs];write(rkey(user.uid),n);return n});}void send(q,base,active)};
  const copyMessage=async(index:number)=>{try{await navigator.clipboard.writeText(msgs[index].content);setCopied(index);setTimeout(()=>setCopied(null),1400)}catch{}};
  void copyMessage;
  void fresh;

  const templateMessages=["Research this topic and give me the key findings.","Help me plan and organize this task step by step.","Find the best options for what I am looking for.","Analyze this information and give me a clear summary."];
  const isNew=!active&&!msgs.length;

  const openMobileSidebar=()=>{window.dispatchEvent(new CustomEvent("sanmine:open-sidebar"));};

  return <div className="relative flex h-full min-h-0 bg-[var(--bg)]">
    <button type="button" onClick={openMobileSidebar} aria-label="Open sidebar" title="Open sidebar" className="absolute left-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-lg bg-[var(--bg)]/90 text-[#37352f] shadow-sm backdrop-blur-sm md:hidden">
      <span className="flex flex-col items-start gap-[5px]" aria-hidden="true">
        <span className="block h-[2px] w-[19px] rounded-full bg-current" />
        <span className="block h-[2px] w-[13px] rounded-full bg-current" />
      </span>
    </button>
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col justify-end">
          {loadingChat?<ChatLoadingSkeleton/>:msgs.map((m,i)=><div key={m.id||i} className="mb-5"><div className={m.role==="user"?"ml-auto max-w-[78%] rounded-2xl bg-white px-4 py-3 text-[15px] text-[#37352f]":"max-w-[90%]"}>{m.role==="assistant"?<ChatMarkdown content={m.content}/>:m.content}</div>{m.role==="assistant"&&m.sources?<SourceCards items={m.sources}/>:null}</div>)}
          {error?<div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>:null}
          {loading?<Progress status={status} steps={steps}/>:null}
        </div>
      </div>
      <div className={`mx-auto w-full max-w-[900px] px-4 ${isNew?"pb-[20vh] md:pb-[16vh]":"pb-6"} md:px-8`}>
        {isNew?<div className="mb-4 flex items-center justify-center gap-3 px-1"><img src={BRAND_LOGO} alt="Sanmine Space" className="h-10 w-10 shrink-0 rounded-xl object-cover"/><div className="font-serif text-[34px] font-medium leading-none tracking-[-.045em] text-[#282721]">Let's noodle</div></div>:null}
        <Composer value={text} setValue={setText} onSubmit={submit} onStop={stop} loading={loading}/>
        {isNew?<div className="mt-3 grid grid-cols-2 gap-2">{templateMessages.map(t=><button key={t} type="button" onClick={()=>setText(t)} className="min-w-0 rounded-xl border border-[#e2dfd8] bg-white px-3 py-2.5 text-left text-[13px] leading-5 text-[#5f5b53]">{t}</button>)}</div>:null}
      </div>
    </div>
  </div>;
}
