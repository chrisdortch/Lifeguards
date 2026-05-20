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

const scheduleEnhancementScript = `
(function(){
  var lastState = null;
  var timer = null;
  var savingLead = false;

  function niceDate(iso){
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); }
    catch(e){ return iso; }
  }
  function longDate(iso){
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'}); }
    catch(e){ return iso; }
  }
  function sameName(a,b){ return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  function csvSafe(value){ return '"' + String(value || '').replace(/"/g,'""') + '"'; }
  function assignmentLabel(a){
    var name = String((a && a.name) || '').trim();
    return a && a.lead ? '★ ' + name : name;
  }
  function openCount(shift){
    var required = Number((shift && shift.required) || 3);
    var assigned = Array.isArray(shift && shift.assignments) ? shift.assignments.length : 0;
    return Math.max(0, required - assigned);
  }
  function overCount(shift){
    var required = Number((shift && shift.required) || 3);
    var assigned = Array.isArray(shift && shift.assignments) ? shift.assignments.length : 0;
    return Math.max(0, assigned - required);
  }
  function guardList(shift){
    var assignments = Array.isArray(shift && shift.assignments) ? shift.assignments : [];
    var names = assignments.map(assignmentLabel).filter(Boolean);
    return names.length ? names.join(', ') : 'OPEN';
  }
  function shiftText(shift){
    if(!shift) return 'OPEN - 3 needed';
    var needed = openCount(shift);
    var over = overCount(shift);
    return guardList(shift) + (over > 0 ? ' - ' + over + ' over' : needed > 0 ? ' - ' + needed + ' needed' : ' - Full');
  }
  function shiftTypeFromText(text){
    return /Morning/i.test(text) || /^AM\b/i.test(text) ? 'AM' : /Afternoon/i.test(text) || /^PM\b/i.test(text) ? 'PM' : '';
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
    button.appendChild(el);
    return el;
  }
  function setButtonFull(button){
    button.disabled = true;
    button.setAttribute('data-capacity-disabled','true');
    button.style.background = '#eef1f2';
    button.style.opacity = '.62';
    button.style.borderColor = '#cfd8dc';
    button.style.color = '#60727d';
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
  function applyOpeningStatus(){
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
        var openings = openCount(shift);
        var status = makeStatus(btn);
        status.textContent = openings > 0 ? openings + ' opening' + (openings === 1 ? '' : 's') + ' left' : 'Full';
        status.style.background = openings > 0 ? '#fff4dc' : '#fff1f1';
        status.style.color = openings > 0 ? '#7a520c' : '#b42318';
        if(openings <= 0){ setButtonFull(btn); } else { restoreButton(btn); }
      }
    }
  }
  function getAdminCellMeta(cell){
    var day = cell.closest('.adminDay');
    var dateEl = day && day.querySelector('.dateLine');
    var timeEl = cell.querySelector('.cellTime');
    var dateLabel = dateEl ? (dateEl.textContent || '').trim() : '';
    var type = timeEl ? shiftTypeFromText((timeEl.textContent || '').trim()) : '';
    return { dateLabel: dateLabel, type: type };
  }
  function styleStarButton(btn, active){
    btn.textContent = active ? '★' : '☆';
    btn.title = active ? 'Remove Lead from this shift' : 'Make Lead for this shift';
    btn.setAttribute('aria-label', btn.title || 'Lead star');
    btn.style.width = '28px';
    btn.style.height = '28px';
    btn.style.border = '0';
    btn.style.borderRadius = '999px';
    btn.style.display = 'inline-grid';
    btn.style.placeItems = 'center';
    btn.style.background = active ? '#9a6a10' : '#fff';
    btn.style.color = active ? '#fff' : '#9a6a10';
    btn.style.fontSize = '18px';
    btn.style.lineHeight = '1';
    btn.style.fontWeight = '950';
    btn.style.boxShadow = 'inset 0 0 0 1px rgba(154,106,16,.25)';
  }
  function ensureLeadBadge(chip, active){
    var badge = chip.querySelector('.leadBadgeInjected');
    if(active){
      if(!badge){
        badge = document.createElement('em');
        badge.className = 'leadBadgeInjected';
        badge.textContent = '★ Lead';
        badge.style.fontStyle = 'normal';
        badge.style.fontSize = '10px';
        badge.style.textTransform = 'uppercase';
        badge.style.letterSpacing = '.04em';
        badge.style.background = '#9a6a10';
        badge.style.color = '#fff';
        badge.style.opacity = '1';
        badge.style.borderRadius = '999px';
        badge.style.padding = '3px 6px';
        var strong = chip.querySelector('strong');
        if(strong && strong.parentNode) strong.parentNode.insertBefore(badge, strong.nextSibling);
        else chip.appendChild(badge);
      }
      chip.style.boxShadow = '0 0 0 3px rgba(215,181,109,.22),0 2px 7px rgba(8,43,60,.08)';
    } else {
      if(badge) badge.remove();
      chip.style.boxShadow = '';
    }
  }
  async function fetchFreshState(){
    var res = await fetch('/api/state',{cache:'no-store'});
    if(!res.ok) throw new Error('state');
    var data = await res.json();
    lastState = data && data.state ? data.state : data;
    return lastState;
  }
  async function saveFreshState(next){
    var res = await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:next,replace:true})});
    if(!res.ok) throw new Error('save');
    var data = await res.json();
    lastState = data && data.state ? data.state : next;
    return lastState;
  }
  async function toggleLead(dateLabel, type, guardName){
    if(savingLead) return;
    savingLead = true;
    try{
      var state = JSON.parse(JSON.stringify(await fetchFreshState()));
      if(!Array.isArray(state.shifts)) return;
      for(var i=0;i<state.shifts.length;i++){
        var s = state.shifts[i];
        if(!s || s.type !== type || niceDate(s.date) !== dateLabel || !Array.isArray(s.assignments)) continue;
        var wasLead = false;
        for(var j=0;j<s.assignments.length;j++){
          if(sameName(s.assignments[j].name, guardName) && s.assignments[j].lead) wasLead = true;
        }
        for(var k=0;k<s.assignments.length;k++){
          if(sameName(s.assignments[k].name, guardName)) s.assignments[k].lead = !wasLead;
          else s.assignments[k].lead = false;
        }
      }
      await saveFreshState(state);
      applyAll();
    } catch(e){
      alert('Lead could not be saved. Refresh and try again.');
    } finally {
      savingLead = false;
    }
  }
  function applyAdminLeadControls(){
    if(!lastState) return;
    var cells = document.querySelectorAll('.adminShiftCell');
    for(var i=0;i<cells.length;i++){
      var cell = cells[i];
      var meta = getAdminCellMeta(cell);
      if(!meta.dateLabel || !meta.type) continue;
      var shift = getShift(meta.dateLabel, meta.type);
      if(!shift) continue;
      var wrap = cell.querySelector(':scope > .nameWrap') || cell.querySelector('.nameWrap');
      if(!wrap) continue;
      var chips = wrap.querySelectorAll('.guardChip');
      for(var j=0;j<chips.length;j++){
        var chip = chips[j];
        if(chip.querySelector('.chipAction.add')) continue;
        var strong = chip.querySelector('strong');
        var guardName = strong ? (strong.textContent || '').trim() : '';
        if(!guardName) continue;
        var assignment = null;
        var assignments = Array.isArray(shift.assignments) ? shift.assignments : [];
        for(var a=0;a<assignments.length;a++) if(sameName(assignments[a].name, guardName)) assignment = assignments[a];
        var active = !!(assignment && assignment.lead);
        var star = chip.querySelector('.leadStarInjected');
        if(!star){
          star = document.createElement('button');
          star.type = 'button';
          star.className = 'leadStarInjected';
          star.addEventListener('click', (function(dateLabel,type,guardName){
            return function(ev){ ev.preventDefault(); ev.stopPropagation(); toggleLead(dateLabel,type,guardName); };
          })(meta.dateLabel,meta.type,guardName));
          var remove = chip.querySelector('.chipAction.remove');
          if(remove && remove.parentNode) remove.parentNode.insertBefore(star, remove);
          else chip.appendChild(star);
        }
        styleStarButton(star, active);
        ensureLeadBadge(chip, active);
      }
    }
  }
  function currentLoggedInName(){
    var h2s = document.querySelectorAll('h2');
    for(var i=0;i<h2s.length;i++){
      var text = (h2s[i].textContent || '').trim();
      if(/^Hi,\s*/.test(text)) return text.replace(/^Hi,\s*/, '').trim();
    }
    return '';
  }
  function applyApprovedLeadBadges(){
    if(!lastState) return;
    var guardName = currentLoggedInName();
    if(!guardName) return;
    var cards = document.querySelectorAll('.shiftBtn.approvedOnly');
    for(var i=0;i<cards.length;i++){
      var card = cards[i];
      var title = card.querySelector('.shiftTitle');
      var text = title ? (title.textContent || '') : '';
      var type = shiftTypeFromText(text);
      var dateLabel = text.split('·')[0] ? text.split('·')[0].trim() : '';
      var shift = getShift(dateLabel, type);
      var isLead = false;
      if(shift && Array.isArray(shift.assignments)){
        for(var j=0;j<shift.assignments.length;j++){
          if(sameName(shift.assignments[j].name, guardName) && shift.assignments[j].lead) isLead = true;
        }
      }
      var callout = card.querySelector('.leadCalloutInjected');
      if(isLead){
        card.style.background = '#fff8df';
        card.style.borderColor = 'rgba(154,106,16,.34)';
        if(!callout){
          callout = document.createElement('span');
          callout.className = 'leadCalloutInjected';
          callout.textContent = '★ Lead shift';
          callout.style.display = 'inline-flex';
          callout.style.width = 'fit-content';
          callout.style.borderRadius = '999px';
          callout.style.background = '#9a6a10';
          callout.style.color = '#fff';
          callout.style.padding = '6px 10px';
          callout.style.fontSize = '11px';
          callout.style.fontWeight = '950';
          callout.style.textTransform = 'uppercase';
          callout.style.letterSpacing = '.06em';
          card.appendChild(callout);
        }
        var meta = card.querySelector('.shiftMeta');
        if(meta && !/^★/.test(meta.textContent || '')) meta.textContent = '★ You are Lead for this shift. ' + (meta.textContent || '');
      } else {
        if(callout) callout.remove();
      }
    }
  }
  function exportCsvFromLiveState(card){
    if(!lastState || !Array.isArray(lastState.shifts)) return false;
    var inputs = card ? card.querySelectorAll('input[type="date"]') : document.querySelectorAll('input[type="date"]');
    if(inputs.length < 2) return false;
    var start = inputs[0].value;
    var end = inputs[1].value;
    if(!start || !end) return false;
    var byDate = {};
    for(var i=0;i<lastState.shifts.length;i++){
      var s = lastState.shifts[i];
      if(!s || s.date < start || s.date > end) continue;
      if(!byDate[s.date]) byDate[s.date] = {dateIso:s.date,date:longDate(s.date),am:'',pm:'',open:0};
      if(s.type === 'AM') byDate[s.date].am = shiftText(s);
      else byDate[s.date].pm = shiftText(s);
      byDate[s.date].open += openCount(s);
    }
    var keys = Object.keys(byDate).sort();
    var lines = ['Serenity Shores Pool Schedule', longDate(start) + ' through ' + longDate(end), '', 'Date,AM 10-3:30,PM 3:30-10,Open Spots'];
    for(var k=0;k<keys.length;k++){
      var r = byDate[keys[k]];
      lines.push([r.date,r.am,r.pm,String(r.open)].map(csvSafe).join(','));
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'serenity-shores-pool-schedule-' + start + '-to-' + end + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  }
  function attachCsvInterceptor(){
    if(document.body.getAttribute('data-lead-csv-interceptor') === 'true') return;
    document.body.setAttribute('data-lead-csv-interceptor','true');
    document.addEventListener('click', function(ev){
      var target = ev.target;
      var btn = target && target.closest ? target.closest('button') : null;
      if(!btn || (btn.textContent || '').trim() !== 'Download CSV') return;
      var card = btn.closest('.card');
      if(exportCsvFromLiveState(card)){
        ev.preventDefault();
        ev.stopPropagation();
        if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      }
    }, true);
  }
  function applyAll(){
    applyOpeningStatus();
    applyAdminLeadControls();
    applyApprovedLeadBadges();
    attachCsvInterceptor();
  }
  async function load(){
    try{
      await fetchFreshState();
      applyAll();
    }catch(e){}
  }
  function start(){
    load();
    if(timer) clearInterval(timer);
    timer = setInterval(load, 5000);
    var obs = new MutationObserver(function(){ applyAll(); });
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
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: scheduleEnhancementScript }} />
      </body>
    </html>
  );
}
