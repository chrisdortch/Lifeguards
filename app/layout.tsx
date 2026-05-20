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

const openingStatusScript = `
(function(){
  var lastState = null;
  var timer = null;
  function niceDate(iso){
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); }
    catch(e){ return iso; }
  }
  function shiftTypeFromText(text){
    return /Morning/i.test(text) ? 'AM' : /Afternoon/i.test(text) ? 'PM' : '';
  }
  function getShift(dateLabel, type){
    if(!lastState || !Array.isArray(lastState.shifts)) return null;
    for(var i=0;i<lastState.shifts.length;i++){
      var s = lastState.shifts[i];
      if(s && s.type === type && niceDate(s.date) === dateLabel) return s;
    }
    return null;
  }
  function makeStatus(button){
    var existing = button.querySelector('.slotStatus');
    if(existing) return existing;
    var el = document.createElement('span');
    el.className = 'slotStatus';
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.marginTop = '5px';
    el.style.width = 'fit-content';
    el.style.borderRadius = '999px';
    el.style.padding = '5px 9px';
    el.style.fontSize = '12px';
    el.style.fontWeight = '950';
    el.style.letterSpacing = '.04em';
    el.style.textTransform = 'uppercase';
    el.style.background = '#fff1f1';
    el.style.color = '#b42318';
    button.appendChild(el);
    return el;
  }
  function restoreButton(button){
    if(button.getAttribute('data-capacity-disabled') === 'true'){
      button.disabled = false;
      button.removeAttribute('data-capacity-disabled');
      button.style.background = '';
      button.style.opacity = '';
      button.style.borderColor = '';
      button.style.color = '';
    }
  }
  function apply(){
    if(!lastState) return;
    var cards = document.querySelectorAll('.shiftCard');
    for(var i=0;i<cards.length;i++){
      var card = cards[i];
      var dateEl = card.querySelector('.dateLine');
      if(!dateEl) continue;
      var dateLabel = (dateEl.textContent || '').trim();
      var buttons = card.querySelectorAll('button.shiftBtn');
      for(var j=0;j<buttons.length;j++){
        var btn = buttons[j];
        var text = btn.textContent || '';
        var type = shiftTypeFromText(text);
        if(!type) continue;
        var shift = getShift(dateLabel, type);
        if(!shift) continue;
        var required = Number(shift.required || 3);
        var assigned = Array.isArray(shift.assignments) ? shift.assignments.length : 0;
        var openings = Math.max(0, required - assigned);
        var status = makeStatus(btn);
        status.textContent = openings > 0 ? (openings + ' opening' + (openings === 1 ? '' : 's') + ' left') : 'Full';
        if(openings <= 0){
          btn.disabled = true;
          btn.setAttribute('data-capacity-disabled','true');
          btn.style.background = '#eef1f2';
          btn.style.opacity = '.62';
          btn.style.borderColor = '#cfd8dc';
          btn.style.color = '#60727d';
        } else {
          restoreButton(btn);
        }
      }
    }
  }
  async function load(){
    try{
      var res = await fetch('/api/state',{cache:'no-store'});
      if(!res.ok) return;
      var data = await res.json();
      lastState = data && data.state ? data.state : data;
      apply();
    }catch(e){}
  }
  function start(){
    load();
    if(timer) clearInterval(timer);
    timer = setInterval(load, 5000);
    var obs = new MutationObserver(function(){ apply(); });
    obs.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: openingStatusScript }} />
      </body>
    </html>
  );
}
