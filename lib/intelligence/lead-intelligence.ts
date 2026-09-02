import { getProvider, type ChatMessage } from "@/lib/ai/provider";

export type AuditFinding = { key: string; label: string; severity: "high" | "medium" | "low"; detail: string; recommendation: string };

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
}

export async function auditWebsite(url: string) {
  const response = await fetch(url,{headers:{"User-Agent":"SanmineSpaceBot/1.0 (+website-audit)"},redirect:"follow",cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
  const finalUrl=response.url; const html=await response.text(); const text=stripHtml(html); const lower=text.toLowerCase();
  const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/<[^>]+>/g," ").trim();
  const metaDescription=html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim()||"";
  const h1s=[...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>stripHtml(m[1])).filter(Boolean);
  const links=[...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  const findings:AuditFinding[]=[];
  if(!title)findings.push({key:"title",label:"Missing page title",severity:"high",detail:"The homepage does not expose a useful HTML title.",recommendation:"Add a clear, keyword-relevant title describing the business and offer."});
  if(!metaDescription)findings.push({key:"description",label:"Missing meta description",severity:"medium",detail:"Search engines may have less control over the page snippet.",recommendation:"Add a concise 140–160 character description with the core offer."});
  if(h1s.length!==1)findings.push({key:"h1",label:"Weak heading structure",severity:h1s.length===0?"high":"medium",detail:`Detected ${h1s.length} H1 headings.`,recommendation:"Use one descriptive H1 that states the primary customer outcome."});
  const hasCta=/contact|book|quote|demo|get started|schedule|hire|buy|shop/i.test(lower);
  if(!hasCta)findings.push({key:"cta",label:"No obvious conversion CTA",severity:"high",detail:"No strong contact, booking, quote, demo, or action language was detected.",recommendation:"Place one primary CTA above the fold and repeat it near key proof points."});
  const hasProof=/testimonial|case stud|client|portfolio|review/i.test(lower);
  if(!hasProof)findings.push({key:"proof",label:"Limited social proof",severity:"medium",detail:"No obvious testimonial, case study, portfolio, or review signal was found.",recommendation:"Add credible proof such as selected work, testimonials, outcomes, or reviews."});
  const hasContact=/mailto:|contact|email|phone|tel:/i.test(html);
  if(!hasContact)findings.push({key:"contact",label:"Contact path is unclear",severity:"medium",detail:"No obvious contact mechanism was detected in the fetched page.",recommendation:"Add a visible contact method and a simple inquiry form."});
  const hasMobile=/viewport/i.test(html);
  if(!hasMobile)findings.push({key:"mobile",label:"Viewport metadata missing",severity:"low",detail:"A responsive viewport declaration was not detected.",recommendation:"Add the standard responsive viewport metadata."});
  const score=Math.max(0,Math.min(100,100-findings.reduce((sum,f)=>sum+(f.severity==="high"?18:f.severity==="medium"?10:5),0)));
  return {url:finalUrl,title,metaDescription,h1s,linkCount:links.length,text:text.slice(0,8000),score,findings,signals:{hasCta,hasProof,hasContact,hasMobile}};
}

export function scoreLead(input:{subscribers?:number|null;totalViews?:number|null;websiteVerified?:boolean;websiteScore?:number|null;contactConfidence?:number|null;sourceCount?:number;hasEmail?:boolean;hasYoutube?:boolean}) {
  let score=20; const reasons:string[]=[];
  const subs=Number(input.subscribers||0), views=Number(input.totalViews||0);
  if(subs>=1000000){score+=25;reasons.push("Large audience");}else if(subs>=100000){score+=20;reasons.push("Strong audience");}else if(subs>=10000){score+=12;reasons.push("Established audience");}else if(subs>0){score+=5;reasons.push("Has measurable audience");}
  if(views>=10000000){score+=15;reasons.push("High total reach");}else if(views>=1000000){score+=10;reasons.push("Meaningful total reach");}
  if(input.hasYoutube) {score+=5;reasons.push("Creator source verified");}
  if(input.hasEmail){score+=10;reasons.push("Public contact available");}
  if(input.contactConfidence && input.contactConfidence>=80){score+=8;reasons.push("High contact confidence");}else if(input.contactConfidence && input.contactConfidence>=50){score+=4;reasons.push("Moderate contact confidence");}
  if(input.websiteVerified){const ws=Number(input.websiteScore??70);if(ws<55){score+=10;reasons.push("Website has clear improvement opportunities");}else if(ws<75){score+=5;reasons.push("Website has optimization opportunities");}else{score-=5;reasons.push("Website already looks relatively mature");}}else{score+=6;reasons.push("No verified website yet");}
  if((input.sourceCount||0)>=3){score+=3;reasons.push("Multiple independent research sources");}
  return {score:Math.max(0,Math.min(100,score)),reasons};
}

export async function generateAI(prompt:string) {
  const result=await getProvider().chat([{role:"system",content:"You are Sanmine Space's lead-intelligence assistant. Use only supplied evidence. Do not invent facts, metrics, clients, pricing, or guarantees."},{role:"user",content:prompt}] as ChatMessage[]);
  if(!result.text) throw new Error("AI generation returned an empty response.");
  return result.text.trim();
}
