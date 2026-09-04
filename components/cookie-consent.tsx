"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sanmine-cookie-consent-v1";
const LEGAL_KEY = "sanmine-legal-acceptance-v1";

type Consent = "accepted" | "rejected" | "customized";

export function CookieConsent(){
  const [visible,setVisible]=useState(false);
  const [customizing,setCustomizing]=useState(false);
  const [analytics,setAnalytics]=useState(false);
  const [legalAccepted,setLegalAccepted]=useState(false);

  useEffect(()=>{
    try{
      setVisible(!window.localStorage.getItem(STORAGE_KEY));
      setLegalAccepted(Boolean(window.localStorage.getItem(LEGAL_KEY)));
    }catch{
      setVisible(true);
    }
  },[]);

  const save=(consent:Consent)=>{
    if(consent!=="rejected"&&!legalAccepted)return;
    try{
      window.localStorage.setItem(STORAGE_KEY,JSON.stringify({consent,analytics,updatedAt:new Date().toISOString()}));
      if(consent!=="rejected")window.localStorage.setItem(LEGAL_KEY,new Date().toISOString());
    }catch{}
    setVisible(false);
    setCustomizing(false);
  };

  if(!visible)return null;

  return <div className="fixed inset-x-0 bottom-0 z-[100] w-full p-0">
    <section role="dialog" aria-label="Cookie settings" className="min-h-[300px] w-full rounded-t-[14px] border border-b-0 border-[#383838] bg-[#171717] px-4 py-6 text-[#f5f5f5] shadow-[0_20px_70px_rgba(45,42,35,.28)] sm:min-h-[300px] sm:px-5 sm:py-6">
      <h2 className="text-[19px] font-medium tracking-[-.025em]">Cookie settings</h2>
      <p className="mt-1.5 text-[13.5px] leading-[1.45] text-[#bdbdb7]">
        We use cookies to deliver and improve our services, analyze site usage, and, if you agree, to personalize your experience. Read our <a href="/privacy" className="underline underline-offset-2 hover:text-white">Privacy Policy</a> and <a href="/terms" className="underline underline-offset-2 hover:text-white">Terms & Conditions</a>.
      </p>
      <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-[1.4] text-[#d7d7d1]">
        <input type="checkbox" checked={legalAccepted} onChange={e=>setLegalAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-white" />
        <span>I agree to the <a href="/terms" className="underline underline-offset-2 hover:text-white">Terms & Conditions</a> and acknowledge the <a href="/privacy" className="underline underline-offset-2 hover:text-white">Privacy Policy</a>.</span>
      </label>
      <button type="button" onClick={()=>setCustomizing(v=>!v)} className="mt-2.5 w-full rounded-[9px] bg-[#303030] px-4 py-2.5 text-[14px] font-medium transition hover:bg-[#393939]">{customizing?"Close cookie preferences":"Customize Cookie Settings"}</button>
      {customizing&&<div className="mt-2.5 rounded-[9px] border border-[#3a3a3a] bg-[#202020] p-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-medium">Necessary cookies</p><p className="mt-0.5 text-xs text-[#a9a9a3]">Always enabled for basic site functionality.</p></div>
          <span className="rounded-full border border-[#4b4b4b] px-2.5 py-1 text-[11px] text-[#c9c9c3]">Required</span>
        </div>
        <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-4 border-t border-[#353535] pt-2.5">
          <div><p className="font-medium">Analytics cookies</p><p className="mt-0.5 text-xs text-[#a9a9a3]">Help us understand product and landing-page usage.</p></div>
          <input type="checkbox" checked={analytics} onChange={e=>setAnalytics(e.target.checked)} className="h-4 w-4 accent-white" />
        </label>
        <button type="button" onClick={()=>save("customized")} disabled={!legalAccepted} className="mt-2.5 w-full rounded-[9px] bg-white px-4 py-2 text-sm font-medium text-[#171717] transition hover:bg-[#eee] disabled:cursor-not-allowed disabled:opacity-50">Save preferences</button>
      </div>}
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={()=>save("rejected")} className="rounded-[9px] bg-[#303030] px-4 py-2.5 text-[14px] font-medium transition hover:bg-[#393939]">Reject All Cookies</button>
        <button type="button" onClick={()=>save("accepted")} disabled={!legalAccepted} className="rounded-[9px] bg-white px-4 py-2.5 text-[14px] font-medium text-[#171717] transition hover:bg-[#eee] disabled:cursor-not-allowed disabled:opacity-50">Accept All Cookies</button>
      </div>
    </section>
  </div>;
}
