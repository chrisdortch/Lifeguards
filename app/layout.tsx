import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./logo-fix.css";

const siteUrl = "https://lifeguards.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Lifeguard Schedule",
  description: "Lifeguard availability, schedule gaps, admin approval, and printable PDF reporting for Serenity Shores pool.",
  openGraph: {
    title: "Lifeguard Schedule",
    description: "Lifeguard shift requests, admin approvals, schedule gaps, and printable reports.",
    url: siteUrl,
    siteName: "Lifeguard Schedule",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Lifeguard Schedule",
    description: "Lifeguard shift requests, admin approvals, schedule gaps, and printable reports."
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#075f76"
};

const leadPreviewScript = `
(function(){
  var state=null;
  var saving=false;
  function same(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();}
  function nice(iso){try{return new Date(iso+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});}catch(e){return iso;}}
  function shiftType(text){return /^AM\b/i.test(text)||/Morning/i.test(text)?'AM':/^PM\b/i.test(text)||/Afternoon/i.test(text)?'PM':'';}
  function openCount(s){return Math.max(0,Number((s&&s.required)||3)-(Array.isArray(s&&s.assignments)?s.assignments.length:0));}
  function long(iso){try{return new Date(iso+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'});}catch(e){return iso;}}
  function csv(v){return '"'+String(v||'').replace(/"/g,'""')+'"';}
  function label(a){return (a&&a.lead?'★ ':'')+String((a&&a.name)||'').trim();}
  function shiftLine(s){var names=(s.assignments||[]).map(label).filter(Boolean).join(', ')||'OPEN';var open=openCount(s);var over=Math.max(0,(s.assignments||[]).length-Number(s.required||3));return names+(over?(' - '+over+' over'):(open?(' - '+open+' needed'):' - Full'));}
  async function load(){try{var r=await fetch('/api/state',{cache:'no-store'});var j=await r.json();state=j.state||j;}catch(e){} apply();}
  async function save(next){var r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:next,replace:true})});var j=await r.json();state=j.state||next;}
  function findShift(dateLabel,type){if(!state||!Array.isArray(state.shifts))return null;return state.shifts.find(function(s){return s&&s.type===type&&nice(s.date)===dateLabel;})||null;}
  function metaFromCell(cell){var day=cell.closest('.adminDay');var dateEl=day&&day.querySelector('.dateLine');var timeEl=cell.querySelector('.cellTime');return{date:dateEl?(dateEl.textContent||'').trim():'',type:timeEl?shiftType(timeEl.textContent||''):''};}
  function starStyle(btn,on){btn.textContent=on?'★':'☆';btn.type='button';btn.className='leadStarNative';btn.setAttribute('aria-label',on?'Remove Lead':'Make Lead');btn.style.cssText='width:28px;height:28px;min-width:28px;border:0;border-radius:999px;display:inline-grid;place-items:center;background:'+(on?'#9a6a10':'#fff')+';color:'+(on?'#fff':'#9a6a10')+';font-size:19px;font-weight:950;line-height:1;box-shadow:inset 0 0 0 2px rgba(154,106,16,.42);margin-left:2px;';}
  function badge(chip,on){var b=chip.querySelector('.leadBadgeNative');if(on){if(!b){b=document.createElement('em');b.className='leadBadgeNative';b.textContent='Lead';b.style.cssText='opacity:1;background:#9a6a10;color:#fff;border-radius:999px;padding:3px 6px;font-weight:950;';var s=chip.querySelector('strong');if(s&&s.nextSibling)chip.insertBefore(b,s.nextSibling);else chip.appendChild(b);}chip.style.boxShadow='0 0 0 3px rgba(215,181,109,.28),0 2px 7px rgba(8,43,60,.08)';}else{if(b)b.remove();chip.style.boxShadow='';}}
  async function toggle(dateLabel,type,name){if(saving)return;saving=true;try{await load();var next=JSON.parse(JSON.stringify(state));(next.shifts||[]).forEach(function(s){if(!s||s.type!==type||nice(s.date)!==dateLabel||!Array.isArray(s.assignments))return;var was=s.assignments.some(function(a){return same(a.name,name)&&a.lead;});s.assignments=s.assignments.map(function(a){return same(a.name,name)?Object.assign({},a,{lead:!was}):Object.assign({},a,{lead:false});});});await save(next);apply();}catch(e){alert('Lead could not be saved. Refresh and try again.');}finally{saving=false;}}
  function applyStars(){document.querySelectorAll('.adminShiftCell').forEach(function(cell){var m=metaFromCell(cell);if(!m.date||!m.type)return;var shift=findShift(m.date,m.type);var assignedWrap=cell.querySelector('.nameWrap');if(!assignedWrap)return;assignedWrap.querySelectorAll('.guardChip').forEach(function(chip){if(!chip.querySelector('.chipAction.remove')||chip.querySelector('.chipAction.add'))return;var strong=chip.querySelector('strong');var name=strong?(strong.textContent||'').trim():'';if(!name)return;var on=!!(shift&&Array.isArray(shift.assignments)&&shift.assignments.some(function(a){return same(a.name,name)&&a.lead;}));var btn=chip.querySelector('.leadStarNative');if(!btn){btn=document.createElement('button');var minus=chip.querySelector('.chipAction.remove');minus.parentNode.insertBefore(btn,minus);btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();toggle(m.date,m.type,name);});}starStyle(btn,on);badge(chip,on);});});}
  function applyOpenings(){if(!state)return;document.querySelectorAll('.shiftCard').forEach(function(card){var d=card.querySelector('.dateLine');if(!d)return;var date=(d.textContent||'').trim();card.querySelectorAll('button.shiftBtn').forEach(function(btn){var type=shiftType(btn.textContent||'');var s=findShift(date,type);if(!s)return;var open=openCount(s);var tag=btn.querySelector('.slotStatusNative');if(!tag){tag=document.createElement('span');tag.className='slotStatusNative';tag.style.cssText='display:inline-flex;width:fit-content;border-radius:999px;padding:5px 9px;margin-top:5px;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;';btn.appendChild(tag);}tag.textContent=open?open+' opening'+(open===1?'':'s')+' left':'Full';tag.style.background=open?'#fff4dc':'#fff1f1';tag.style.color=open?'#7a520c':'#b42318';if(open<=0){btn.disabled=true;btn.style.opacity='.62';btn.style.background='#eef1f2';}});});}
  function applyLeadForLoggedIn(){if(!state)return;var h=[].slice.call(document.querySelectorAll('h2')).map(function(x){return (x.textContent||'').trim();}).find(function(t){return /^Hi,/.test(t);});if(!h)return;var name=h.replace(/^Hi,\s*/,'').trim();document.querySelectorAll('.shiftBtn.approvedOnly').forEach(function(card){var t=card.querySelector('.shiftTitle span:first-child');var text=t?(t.textContent||''):'';var parts=text.split('·');var date=(parts[0]||'').trim();var type=shiftType(text);var s=findShift(date,type);var isLead=!!(s&&s.assignments&&s.assignments.some(function(a){return same(a.name,name)&&a.lead;}));var c=card.querySelector('.leadCalloutNative');if(isLead&&!c){c=document.createElement('span');c.className='leadCalloutNative';c.textContent='★ Lead shift';c.style.cssText='display:inline-flex;width:fit-content;border-radius:999px;background:#9a6a10;color:#fff;padding:6px 10px;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em;';card.appendChild(c);}if(!isLead&&c)c.remove();});}
  function interceptCsv(){if(document.body.dataset.csvLeadNative)return;document.body.dataset.csvLeadNative='1';document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b||(b.textContent||'').trim()!=='Download CSV'||!state)return;var card=b.closest('.card');var ins=card?card.querySelectorAll('input[type="date"]'):document.querySelectorAll('input[type="date"]');if(ins.length<2||!ins[0].value||!ins[1].value)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();var start=ins[0].value,end=ins[1].value,rows={};(state.shifts||[]).forEach(function(s){if(s.date<start||s.date>end)return;if(!rows[s.date])rows[s.date]={date:long(s.date),am:'',pm:'',open:0};if(s.type==='AM')rows[s.date].am=shiftLine(s);else rows[s.date].pm=shiftLine(s);rows[s.date].open+=openCount(s);});var lines=['Serenity Shores Pool Schedule',long(start)+' through '+long(end),'','Date,AM 10-3:30,PM 3:30-10,Open Spots'];Object.keys(rows).sort().forEach(function(k){var r=rows[k];lines.push([r.date,r.am,r.pm,String(r.open)].map(csv).join(','));});var blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='serenity-shores-pool-schedule-'+start+'-to-'+end+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);},true);}
  function apply(){try{applyStars();applyOpenings();applyLeadForLoggedIn();interceptCsv();}catch(e){}}
  function start(){load();setInterval(load,2500);new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: leadPreviewScript }} />
      </body>
    </html>
  );
}
