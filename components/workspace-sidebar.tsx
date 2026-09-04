"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import Link from "next/link";
import { ChevronDown, LogOut, Menu, MoreHorizontal, Pencil, Plus, PlugZap, Send, Trash2, UserCircle, X } from "lucide-react";
import { signOutCurrentUser } from "@/lib/auth/firebase-client";

const LOGO="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";

type Chat={id:string;title:string;created_at?:string;updated_at?:string};

export function WorkspaceSidebar({user}:{user:User}){
  const [chats,setChats]=useState<Chat[]>([]);
  const [side,setSide]=useState(true);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [profile,setProfile]=useState(false);
  const [menu,setMenu]=useState<string|null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState("");

  useEffect(()=>{
    let alive=true;
    const load=async()=>{
      try{
        const token=await user.getIdToken();
        const r=await fetch("/api/chats",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
        if(!r.ok)return;
        const d=await r.json();
        if(alive)setChats(Array.isArray(d.chats)?d.chats:[]);
      }catch{}
    };
    void load();
    return()=>{alive=false};
  },[user]);

  const fresh=()=>{setMenu(null);setMobileOpen(false)};
  const filtered=chats.filter(c=>c.title.toLowerCase().includes(search.toLowerCase()));
  const name=user.displayName||user.email?.split("@")[0]||"User";

  return <>
    <div className={`fixed inset-0 z-30 bg-black/20 transition-opacity md:hidden ${mobileOpen?"opacity-100":"pointer-events-none opacity-0"}`} onClick={()=>setMobileOpen(false)}/>
    <aside data-sanmine-workspace-sidebar className={`${mobileOpen?"flex":"hidden"} fixed inset-y-0 left-0 z-40 w-[78vw] max-w-[310px] shrink-0 flex-col border-r border-[var(--line)] bg-[#f2f1ed] p-3 shadow-xl md:static md:flex md:shadow-none ${side?"md:w-[270px]":"md:w-[72px]"}`}>
      <div className={`flex items-center pb-5 ${side?"justify-between px-2":"justify-center"}`}>
        {side?<Link href="/" onClick={fresh} className="flex items-center gap-2.5"><img src={LOGO} alt="Sanmine Space" className="h-7 w-7 rounded-md object-cover"/><span className="text-[15px] font-semibold">Sanmine Space</span></Link>:null}
        <button onClick={()=>setSide(v=>!v)} className="grid h-8 w-8 place-items-center rounded-lg text-[#5f5b54] hover:bg-black/5" aria-label={side?"Collapse sidebar":"Expand sidebar"}><span className="text-lg">{side?"‹":"›"}</span></button>
      </div>
      <Link href="/" onClick={fresh} className={`flex items-center rounded-lg py-2.5 text-sm font-medium hover:bg-black/5 ${side?"gap-2 px-3":"justify-center"}`}><Plus size={17}/>{side&&"New chat"}</Link>
      {side&&<>
        <Link href="/plugins" onClick={()=>setMobileOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg py-2.5 px-3 text-sm font-medium hover:bg-black/5"><PlugZap size={17}/>Plugins</Link>
        <Link href="/campaigns" onClick={()=>setMobileOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg py-2.5 px-3 text-sm font-medium hover:bg-black/5"><Send size={17}/>Campaigns</Link>
      </>}
      {side&&<div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-[.13em] text-[#99958c]"><span>Recent</span><button onClick={()=>setSearchOpen(v=>!v)} className="rounded-md p-1 hover:bg-black/5" aria-label="Search chats">{searchOpen?"×":"⌕"}</button></div>
        {searchOpen&&<div className="mt-2 rounded-lg border border-[#ddd9d1] bg-white px-2.5"><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chats" className="w-full bg-transparent py-2 text-xs outline-none"/></div>}
        <div className="mt-2 space-y-0.5">{filtered.slice(0,30).map(c=><div key={c.id} className="group relative flex rounded-lg hover:bg-black/5"><Link href={`/chat/${c.id}`} onClick={()=>setMobileOpen(false)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px]">{c.title||"New chat"}</Link><button onClick={()=>setMenu(menu===c.id?null:c.id)} className="mr-1 grid h-7 w-7 shrink-0 place-items-center self-center rounded-md text-[#77736b] hover:bg-black/10" aria-label="Chat options"><MoreHorizontal size={17}/></button>{menu===c.id&&<div className="absolute right-1 top-9 z-50 w-40 rounded-xl border border-[#e3dfd7] bg-white p-1.5 shadow-xl"><button onClick={()=>setMenu(null)} className="flex w-full gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-black/5"><Pencil size={14}/>Rename</button><button onClick={()=>{setMenu(null)}} className="flex w-full gap-2 rounded-lg px-2.5 py-2 text-sm text-[#9a5549] hover:bg-[#fff5f2]"><Trash2 size={14}/>Delete</button></div>}</div>)}{!filtered.length&&<div className="px-3 py-2 text-xs text-[#aaa69d]">No recent chats yet.</div>}</div>
      </div>}
      <div className="relative mt-3 shrink-0 border-t border-[var(--line)] pt-3">
        {profile&&<div className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-50 rounded-xl border bg-white p-2 shadow-xl"><div className="flex gap-3 px-2 py-2">{user.photoURL?<img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover"/>:<div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e4e1d9]"><UserCircle size={19}/></div>}<div className="min-w-0"><div className="truncate text-sm font-semibold">{name}</div><div className="truncate text-xs text-[#858178]">{user.email}</div></div></div><button onClick={async()=>{setProfile(false);await signOutCurrentUser()}} className="mt-1 flex w-full gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-black/5"><LogOut size={15}/>Log out</button></div>}
        <button onClick={()=>setProfile(v=>!v)} className={`flex w-full items-center rounded-xl py-2.5 ${side?"gap-3 px-2":"justify-center"}`}>{user.photoURL?<img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover"/>:<div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e4e1d9]"><UserCircle size={19}/></div>}{side&&<div className="min-w-0 text-left"><div className="truncate text-[13px] font-medium">{name}</div><div className="truncate text-[11px] text-[#949087]">{user.email}</div></div>}</button>
      </div>
    </aside>
  </>;
}
