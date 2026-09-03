"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sanmine-cookie-consent-v1";

type Consent = "accepted" | "rejected" | "customized";

export function CookieConsent(){
  const [visible,setVisible]=useState(false);
  const [customizing,setCustomizing]=useState(false);
  const [analytics,setAnalytics]=useState(false);

  useEffect(()=>{
    try{
      setVisible(!window.localStorage.getItem(STORAGE_KEY));
    }catch{
      setVisible(true);
    }
  },[]);

  const save=(consent:Consent)=>{
    try{
      window.localStorage.setItem(STORAGE_KEY,JSON.stringify({consent,analytics,updatedAt:new Date().toISOString()}));
    }catch{}
    setVisible(false);
    setCustomizing(false);
  };

  if(!visible)return null;

  return <>
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4">
      <section role="dialog" aria-label="Cookie settings" className="mx-auto max-w-[560px] rounded-[16px] border border-[#383838] bg-[#171717] p-4 text-[#f5f5f5] shadow-[0_20px_70px_rgba(0,0,0,.28)] sm:p-5">
        <h2 className="text-[20px] font-medium tracking-[-.025em]">Cookie settings</h2>
        <p className="mt-2 text-[14px] leading-[1.55] text-[#bdbdb7]">
          We use cookies to deliver and improve our services, analyze site usage, and, if you agree, to personalize your experience. Read our <a href="/privacy" className="underline underline-offset-2 hover:text-white">Privacy Policy</a> and <a href="/terms" className="underline underline-offset-2 hover:text-white">Terms & Conditions</a>.
        </p>
        <button type="button" onClick={()=>setCustomizing(v=>!v)} className="mt-4 w-full rounded-[10px] bg-[#303030] px-4 py-2.5 text-[15px] font-medium transition hover:bg-[#393939]">{customizing?"Close cookie preferences":"Customize Cookie Settings"}</button>
        {customizing&&<div className="mt-3 rounded-[10px] border border-[#3a3a3a] bg-[#202020] p-3.5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div><p className="font-medium">Necessary cookies</p><p className="mt-0.5 text-xs text-[#a9a9a3]">Always enabled for basic site functionality.</p></div>
            <span className="rounded-full border border-[#4b4b4b] px-2.5 py-1 text-[11px] text-[#c9c9c3]">Required</span>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 border-t border-[#353535] pt-3">
            <div><p className="font-medium">Analytics cookies</p><p className="mt-0.5 text-xs text-[#a9a9a3]">Help us understand product and landing-page usage.</p></div>
            <input type="checkbox" checked={analytics} onChange={e=>setAnalytics(e.target.checked)} className="h-4 w-4 accent-white" />
          </label>
          <button type="button" onClick={()=>save("customized")} className="mt-3 w-full rounded-[10px] bg-white px-4 py-2.5 text-sm font-medium text-[#171717] transition hover:bg-[#eee]">Save preferences</button>
        </div>}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={()=>save("rejected")} className="rounded-[10px] bg-[#303030] px-4 py-2.5 text-[15px] font-medium transition hover:bg-[#393939]">Reject All Cookies</button>
          <button type="button" onClick={()=>save("accepted")} className="rounded-[10px] bg-white px-4 py-2.5 text-[15px] font-medium text-[#171717] transition hover:bg-[#eee]">Accept All Cookies</button>
        </div>
      </section>
    </div>
  </>;
}
