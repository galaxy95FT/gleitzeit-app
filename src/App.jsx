import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kcxclqpkymuxtcvyvcxg.supabase.co";
const SUPABASE_KEY = "sb_publishable_xP5oyCE4LCkVzxw1lSJc7w_7co-cKWu";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TODAY = "2026-04-22";


const WEEKDAYS = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const ENTRY_TYPES = {
  work:    { label: "Arbeit",        bg: "bg-slate-100 text-slate-800" },
  vacation:{ label: "Urlaub",        bg: "bg-emerald-100 text-emerald-800" },
  sick:    { label: "Krankenstand",  bg: "bg-rose-100 text-rose-800" },
  comp:    { label: "Ausgleichstag", bg: "bg-amber-100 text-amber-800" },
  holiday: { label: "Feiertag",      bg: "bg-violet-100 text-violet-800" },
  free:    { label: "Frei",          bg: "bg-sky-100 text-sky-800" },
};

// ─── helpers ────────────────────────────────────────────────────────────────
function parseIso(iso) { const [y,m,d]=iso.split("-").map(Number); return new Date(y,m-1,d); }
function toIso(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function addDays(iso,n) { const d=parseIso(iso); d.setDate(d.getDate()+n); return toIso(d); }
function eachDate(start,end) { const out=[]; let cur=start; while(cur<=end){out.push(cur);cur=addDays(cur,1);} return out; }
function weekdayOf(iso) { return parseIso(iso).getDay(); }
function isWeekday(iso) { const w=weekdayOf(iso); return w>=1&&w<=5; }
function hoursFromRange(start,end) {
  if(!start||!end) return 0;
  const [sh,sm]=start.split(":").map(Number);
  const [eh,em]=end.split(":").map(Number);
  return Math.max(0,(eh*60+em-(sh*60+sm))/60);
}
const TWO_BLOCK_START = "2026-04-22";
function totalWorkHours(e) {
  if(e.date < TWO_BLOCK_START) {
    if(e.start2 && e.end2) return hoursFromRange(e.start, e.end) + hoursFromRange(e.start2, e.end2);
    const h = hoursFromRange(e.start, e.end);
    return h > 6 ? h - 0.5 : h;
  }
  return hoursFromRange(e.start, e.end) + hoursFromRange(e.start2, e.end2);
}
function fh(v) { return `${v.toFixed(2).replace(".",",")} h`; }
function fd(iso) { if(!iso) return ""; const [y,m,d]=iso.split("-"); return `${d}.${m}.${y}`; }
function fs(v) { const r=Math.round(v*100)/100; return `${r>=0?"+":"-"}${Math.abs(r).toFixed(2).replace(".",",")} h`; }

function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,
    f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
    i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,
    m=Math.floor((a+11*h+22*l)/451),
    month=Math.floor((h+l-7*m+114)/31),
    day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}
function holidayMap(year) {
  const easter=easterSunday(year);
  const move=(n)=>{ const d=new Date(easter); d.setDate(d.getDate()+n); return toIso(d); };
  return new Map([
    [`${year}-01-01`,"Neujahr"],[`${year}-01-06`,"Hl. Drei Könige"],
    [move(1),"Ostermontag"],[`${year}-05-01`,"Staatsfeiertag"],
    [move(39),"Christi Himmelfahrt"],[move(50),"Pfingstmontag"],[move(60),"Fronleichnam"],
    [`${year}-08-15`,"Mariä Himmelfahrt"],[`${year}-10-26`,"Nationalfeiertag"],
    [`${year}-11-01`,"Allerheiligen"],[`${year}-12-08`,"Mariä Empfängnis"],
    [`${year}-12-25`,"Christtag"],[`${year}-12-26`,"Stefanitag"],
  ]);
}
function defaultSettings() {
  return { year:2026, annualVacationDays:20, vacationHoursPerDay:8, vacationCarryover:4, scheduledWeekdays:{1:8,2:8,3:8,4:8,5:0}, autoBreakThresholdH:6, autoBreakMinutes:30 };
}
function scheduledHours(date,settings) { return settings.scheduledWeekdays[weekdayOf(date)]??0; }

function buildSeedEntries(year) {
  const records={};
  // 1-Block mit auto 30min Pause bei >6h (altes System bis 21.04.2026)
  const put=(date,start,end,note)=>{ const h=hoursFromRange(start,end); const actual=h>6?h-0.5:h; records[date]={date,type:"work",start,end,actualHours:actual,note}; };
  // 2-Block ohne auto Pause (neues System ab 22.04.2026)
  const put2=(date,s1,e1,s2,e2,note)=>{ records[date]={date,type:"work",start:s1,end:e1,start2:s2,end2:e2,actualHours:hoursFromRange(s1,e1)+hoursFromRange(s2,e2),note}; };
  const d=(m,day)=>`${year}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  // Krankenstand 05.01–14.01
  eachDate(`${year}-01-05`,`${year}-01-14`).forEach(date=>{ if(isWeekday(date)) records[date]={date,type:"sick",actualHours:0,note:"Krankenstand"}; });

  // Jänner
  put(d(1,15),"08:01","16:46","Import");
  put(d(1,16),"08:09","17:12","Import");
  put(d(1,19),"08:11","17:12","Import");
  put(d(1,20),"08:15","16:45","Import");
  put(d(1,21),"09:37","18:09","Import");
  put(d(1,22),"08:00","16:46","Import");
  put(d(1,26),"08:05","17:12","Import");
  put(d(1,27),"08:11","16:45","Import");
  put2(d(1,28),"09:05","15:20","16:00","18:06","Import"); // lange Pause
  put2(d(1,29),"08:15","11:50","12:45","17:26","Import"); // lange Pause

  // Februar
  put(d(2,2),"08:18","17:10","Import");
  put(d(2,3),"08:44","17:18","Import");
  put(d(2,4),"09:04","18:17","Import");
  put(d(2,5),"08:49","17:25","Import");
  put(d(2,9),"08:04","16:12","Import");
  put(d(2,10),"08:05","17:11","Import");
  put(d(2,11),"09:30","18:18","Import");
  put(d(2,12),"08:33","17:33","Import");
  put(d(2,16),"08:15","16:46","Import");
  put(d(2,17),"08:05","16:36","Import");
  put(d(2,18),"09:35","18:06","Import");
  put(d(2,19),"08:12","16:45","Import");
  put(d(2,23),"08:18","17:01","Import");
  put(d(2,24),"08:11","16:50","Import");
  put(d(2,25),"09:30","18:12","Import");
  put(d(2,26),"08:02","16:40","Import");
  records[d(2,28)]={date:d(2,28),type:"work",start:"08:03",end:"12:04",actualHours:hoursFromRange("08:03","12:04"),note:"Import Sa."};

  // März
  put(d(3,2),"08:15","16:52","Import");
  put(d(3,3),"08:04","16:39","Import");
  put(d(3,4),"09:30","18:06","Import");
  put(d(3,5),"08:17","16:45","Import");
  put(d(3,9),"07:55","16:38","Import");
  put(d(3,10),"08:03","16:35","Import");
  put2(d(3,11),"08:08","12:00","13:30","18:12","Import"); // lange Pause
  put(d(3,12),"08:13","16:44","Import");
  put(d(3,16),"08:31","17:14","Import");
  put(d(3,17),"08:37","17:21","Import");
  put(d(3,18),"08:17","15:49","Import");
  put(d(3,19),"08:06","18:11","Import");
  put(d(3,23),"08:10","16:42","Import");
  put(d(3,24),"08:35","17:10","Import");
  put(d(3,25),"08:11","17:01","Import");
  put(d(3,26),"07:58","17:03","Import");
  put(d(3,30),"08:02","16:44","Import");
  put(d(3,31),"08:00","16:13","Import");

  // April (bis 21.04. altes System)
  put(d(4,1),"08:03","16:34","Import");
  put(d(4,2),"08:32","17:04","Import");
  put(d(4,7),"08:00","16:55","Import");
  put(d(4,8),"08:41","16:43","Import");
  put(d(4,9),"07:56","18:12","Import");
  records[d(4,11)]={date:d(4,11),type:"work",start:"08:00",end:"12:04",actualHours:hoursFromRange("08:00","12:04"),note:"Import Sa."};
  eachDate(`${year}-04-13`,`${year}-04-16`).forEach(date=>{ if(isWeekday(date)) records[date]={date,type:"vacation",actualHours:0,note:"Urlaub"}; });
  records[d(4,20)]={date:d(4,20),type:"comp",actualHours:0,note:"Ausgleichstag"};
  records[d(4,21)]={date:d(4,21),type:"comp",actualHours:0,note:"Ausgleichstag"};
  // Ab 22.04. neues System — 2 Blöcke
  put2(d(4,22),"08:04","13:24","13:55","17:02","Import");
  put2(d(4,23),"07:55","14:12","14:42","16:34","Import");
  records[d(4,27)]={date:d(4,27),type:"vacation",actualHours:0,note:"Urlaub"};
  records[d(4,28)]={date:d(4,28),type:"vacation",actualHours:0,note:"Urlaub"};

  // Geplanter Urlaub August/September
  eachDate(`${year}-08-24`,`${year}-09-04`).forEach(date=>{ if(isWeekday(date)) records[date]={date,type:"vacation",actualHours:0,note:"Geplanter Urlaub"}; });

  return Object.values(records).sort((a,b)=>a.date.localeCompare(b.date));
}

function creditedHours(entry,settings) {
  const sched=scheduledHours(entry.date,settings);
  if(entry.type==="work") return (entry.start&&entry.end)?totalWorkHours(entry):(entry.actualHours??0);
  if(["vacation","sick","comp","holiday"].includes(entry.type)) return sched;
  return 0;
}
function buildDaySummary(settings,entries) {
  const holidays=holidayMap(settings.year);
  const entryMap=new Map(entries.map(e=>[e.date,e]));
  return eachDate(`${settings.year}-01-01`,`${settings.year}-12-31`).map(date=>{
    const autoHol=holidays.has(date)?{date,type:"holiday",actualHours:0,note:holidays.get(date)}:null;
    const entry=entryMap.get(date)??autoHol;
    const scheduled=scheduledHours(date,settings);
    const credited=entry?creditedHours(entry,settings):0;
    return {date,entry,scheduled,credited,delta:credited-scheduled};
  });
}
function monthGrid(year,month) {
  const first=new Date(year,month-1,1),last=new Date(year,month,0);
  const startPad=first.getDay()===0?6:first.getDay()-1;
  const days=[];
  for(let i=0;i<startPad;i++) days.push(null);
  for(let day=1;day<=last.getDate();day++) days.push(`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
  while(days.length%7!==0) days.push(null);
  return days;
}

// ─── Progress bar: Soll vs Ist ──────────────────────────────────────────────
function YearProgress({ soll, ist, label }) {
  const pct = soll > 0 ? Math.min(100, (ist / soll) * 100) : 0;
  const over = ist > soll;
  const color = over ? "bg-emerald-500" : pct > 80 ? "bg-blue-500" : "bg-blue-400";
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
        <span className="text-sm">
          <span className="text-slate-400 font-normal">Ist </span><span className={`font-bold ${over ? "text-emerald-600" : "text-slate-700"}`}>{fh(ist)}</span>
          <span className="text-slate-300 mx-1">·</span>
          <span className="text-slate-400 font-normal">Soll </span><span className="font-bold text-slate-500">{fh(soll)}</span>
        </span>
      </div>
      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{pct.toFixed(0)} % erreicht</span>
        <span>{over ? `+${fh(ist-soll)} über Soll` : `noch ${fh(soll-ist)}`}</span>
      </div>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function Stat({title,value,subtitle,color}) {
  const c = color || "text-slate-800";
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${c}`}>{value}</p>
      {subtitle&&<p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
}


// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [settings,setSettings]   = useState(defaultSettings);
  const [entries,setEntries]     = useState([]);
  const [loading,setLoading]     = useState(true);
  const [saving,setSaving]       = useState(false);
  const [liveClock,setLiveClock] = useState(null);
  const [pauseClock,setPauseClock] = useState(null);
  const [newEntry,setNewEntry]   = useState({date:TODAY,type:"work",start:"08:00",end:"12:00",start2:"12:30",end2:"16:00",note:""});
  const [activeTab,setActiveTab] = useState("dashboard");
  const [isEditing,setIsEditing] = useState(false);
  const [listFilter,setListFilter] = useState({work:true,sick:true,comp:false,vacation:false,holiday:false,free:false});
  const [listLimit,setListLimit] = useState(50);
  const seedLoaded = useRef(false);

  // ── Supabase: laden ───────────────────────────────────────────────────────
  useEffect(()=>{
    async function loadAll() {
      setLoading(true);
      const { data: sData } = await supabase.from("settings").select("*").eq("id",1).single();
      if(sData) setSettings({ year:sData.year, annualVacationDays:sData.annual_vacation_days, vacationHoursPerDay:sData.vacation_hours_per_day, vacationCarryover:sData.vacation_carryover, autoBreakThresholdH:sData.auto_break_threshold_h, autoBreakMinutes:sData.auto_break_minutes, scheduledWeekdays:sData.scheduled_weekdays });
      const { data: eData } = await supabase.from("entries").select("*").order("date");
      if(eData && eData.length > 0) {
        setEntries(eData.map(r=>({ date:r.date, type:r.type, start:r.start, end:r.end, start2:r.start2, end2:r.end2, actualHours:r.actual_hours, manualBreakMin:r.manual_break_min, note:r.note })));
      } else if(!seedLoaded.current) {
        seedLoaded.current = true;
        const seed = buildSeedEntries(2026);
        setEntries(seed);
        await supabase.from("entries").upsert(seed.map(e=>({ date:e.date, type:e.type, start:e.start||null, end:e.end||null, start2:e.start2||null, end2:e.end2||null, actual_hours:e.actualHours||0, manual_break_min:e.manualBreakMin||null, note:e.note||null })));
      }
      setLoading(false);
    }
    loadAll();
  },[]);

  const saveSettings = useCallback(async (s) => {
    await supabase.from("settings").upsert({ id:1, year:s.year, annual_vacation_days:s.annualVacationDays, vacation_hours_per_day:s.vacationHoursPerDay, vacation_carryover:s.vacationCarryover, auto_break_threshold_h:s.autoBreakThresholdH, auto_break_minutes:s.autoBreakMinutes, scheduled_weekdays:s.scheduledWeekdays });
  },[]);

  const handleSetSettings = useCallback((updater) => {
    setSettings(prev => { const next = typeof updater === "function" ? updater(prev) : updater; saveSettings(next); return next; });
  },[saveSettings]);

  const summary       = useMemo(()=>buildDaySummary(settings,entries),[settings,entries]);
  const byDate        = useMemo(()=>new Map(entries.map(e=>[e.date,e])),[entries]);
  const holidayLookup = useMemo(()=>holidayMap(settings.year),[settings.year]);
  const summaryByDate = useMemo(()=>new Map(summary.map(d=>[d.date,d])),[summary]);

  const stats = useMemo(()=>{
    const past=summary.filter(d=>d.date<=TODAY);
    const allScheduled=summary.reduce((s,d)=>s+d.scheduled,0);
    const elapsedScheduled=past.reduce((s,d)=>s+d.scheduled,0);
    const elapsedCredited=past.reduce((s,d)=>s+d.credited,0);
    const vacationTaken=entries.filter(e=>e.type==="vacation"&&scheduledHours(e.date,settings)>0).length;
    const sickTaken=entries.filter(e=>e.type==="sick"&&scheduledHours(e.date,settings)>0).length;
    const compTaken=entries.filter(e=>e.type==="comp"&&scheduledHours(e.date,settings)>0).length;
    const holidayTaken=summary.filter(d=>d.entry?.type==="holiday").length;
    return {allScheduled,elapsedScheduled,elapsedCredited,
      flexNow:elapsedCredited-elapsedScheduled,
      vacationTaken,sickTaken,compTaken,holidayTaken,
      vacationRemaining:Math.max(0,(settings.annualVacationDays+(settings.vacationCarryover||0))-vacationTaken)};
  },[summary,entries,settings]);

  const monthlyOverview = useMemo(()=>Array.from({length:12},(_,i)=>{
    const month=i+1;
    const days=summary.filter(d=>parseIso(d.date).getMonth()+1===month&&d.date<=TODAY);
    const scheduled=days.reduce((s,d)=>s+d.scheduled,0);
    const credited=days.reduce((s,d)=>s+d.credited,0);
    return {month,label:new Date(settings.year,i,1).toLocaleDateString("de-AT",{month:"long"}),
      scheduled,credited,delta:credited-scheduled};
  }),[summary,settings.year]);

  const recent = useMemo(()=>[...summary.filter(d=>d.entry).map(d=>d.entry)].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,listLimit),[summary,listLimit]);

  const today      = summary.find(d=>d.date===TODAY);
  const todayEntry = byDate.get(TODAY)??today?.entry??null;
  const todayDelta = (today?.credited??0)-(today?.scheduled??0);

  const addOrUpdateEntry=async()=>{
    const actualHours=newEntry.type==="work"?totalWorkHours(newEntry):0;
    const entry={...newEntry,actualHours};
    setEntries(cur=>[...cur.filter(e=>e.date!==entry.date),entry].sort((a,b)=>a.date.localeCompare(b.date)));
    setSaving(true);
    await supabase.from("entries").upsert({
      date:entry.date, type:entry.type, start:entry.start||null, end:entry.end||null,
      start2:entry.start2||null, end2:entry.end2||null, actual_hours:entry.actualHours||0,
      manual_break_min:entry.manualBreakMin||null, note:entry.note||null,
    });
    setSaving(false);
  };
  const deleteEntry=async(date)=>{
    setEntries(cur=>cur.filter(e=>e.date!==date));
    await supabase.from("entries").delete().eq("date",date);
  };
  const handlePauseStart=()=>{ const n=new Date(); const t=String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0"); setPauseClock({start:t,accumulatedMin:newEntry.manualBreakMin||0}); };
  const handlePauseEnd=()=>{ if(!pauseClock) return; const n=new Date(); const [ph,pm]=pauseClock.start.split(":").map(Number); const diffMin=Math.max(0,(n.getHours()*60+n.getMinutes())-(ph*60+pm)); const totalMin=(pauseClock.accumulatedMin||0)+diffMin; setNewEntry(v=>({...v,manualBreakMin:totalMin})); setPauseClock(null); };
  const resetDemo=async()=>{
    const s=defaultSettings(); setSettings(s); setLiveClock(null);
    const seed=buildSeedEntries(2026); setEntries(seed);
    await supabase.from("entries").delete().neq("date","");
    await supabase.from("entries").upsert(seed.map(e=>({
      date:e.date, type:e.type, start:e.start||null, end:e.end||null,
      start2:e.start2||null, end2:e.end2||null, actual_hours:e.actualHours||0,
      manual_break_min:e.manualBreakMin||null, note:e.note||null,
    })));
    await saveSettings(s);
  };
  const nowHHMM=()=>{ const n=new Date(); return String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0"); };
  const handleClockIn=()=>{
    const t=nowHHMM();
    if(!liveClock) { setLiveClock({date:TODAY,start:t,phase:1}); }
    else if(liveClock.phase===2) { setLiveClock({...liveClock,start2:t,phase:3}); }
  };
  const handleClockOut=async()=>{
    if(!liveClock) return;
    const t=nowHHMM();
    if(liveClock.phase===1) { setLiveClock({...liveClock,end:t,phase:2}); }
    else if(liveClock.phase===3) {
      const entry={date:liveClock.date,type:"work",start:liveClock.start,end:liveClock.end,start2:liveClock.start2,end2:t,actualHours:hoursFromRange(liveClock.start,liveClock.end)+hoursFromRange(liveClock.start2,t),note:"Kommt/Geht"};
      setEntries(cur=>[...cur.filter(e=>e.date!==entry.date),entry].sort((a,b)=>a.date.localeCompare(b.date)));
      setLiveClock(null);
      await supabase.from("entries").upsert({
        date:entry.date, type:entry.type, start:entry.start||null, end:entry.end||null,
        start2:entry.start2||null, end2:entry.end2||null, actual_hours:entry.actualHours||0,
        manual_break_min:null, note:entry.note||null,
      });
    }
  };

  const tabs=[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"erfassung",label:"✏️ Erfassung"},
    {id:"aktuell",label:"📅 2026"},
    {id:"liste",label:"📋 Einträge"},
    {id:"urlaub",label:"🌴 Urlaub"},
    {id:"regeln",label:"⚙️ Regeln"},
  ];

  if(loading) return (<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center space-y-3"><div className="text-4xl">⏱</div><p className="text-slate-600 font-medium">Daten werden geladen...</p></div></div>);
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-5xl space-y-4">

        {/* Header */}
        <div className="bg-white rounded-3xl p-5 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Gleitzeit 2026</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-800">Zeiterfassung</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleClockIn} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors">⏱ Kommt</button>
            <button onClick={handleClockOut} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300 transition-colors">🏁 Geht</button>
            <button onClick={resetDemo} className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-sm hover:bg-slate-50 transition-colors">Reset</button>
            {saving&&<span className="text-xs text-slate-400 animate-pulse">Speichert...</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex overflow-x-auto border-b border-slate-100">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab===t.id?"border-b-2 border-slate-800 text-slate-800 bg-slate-50":"text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">

            {/* ── DASHBOARD ─────────────────────────────────────────── */}
            {activeTab==="dashboard"&&(
              <>
                {/* Year progress bar — Soll vs Ist */}
                <div className="grid gap-4 md:grid-cols-2">
                  <YearProgress
                    label="Jahresfortschritt"
                    soll={stats.elapsedScheduled}
                    ist={stats.elapsedCredited}
                  />
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
                    <span className="text-xs text-slate-400 uppercase tracking-wide">Gleitzeitsaldo heute</span>
                    <p className={`text-3xl font-black ${stats.flexNow>=0?"text-emerald-600":"text-rose-600"}`}>{fs(stats.flexNow)}</p>
                  </div>
                </div>

                {/* Monatliche Fortschrittsbalken */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-600 mb-3">Monate 2026 — Soll vs. Ist</h3>
                  <div className="space-y-2">
                    {[...monthlyOverview].filter(m=>m.scheduled>0).reverse().map(m=>{
                      const pct = m.scheduled>0 ? Math.min(100,(m.credited/m.scheduled)*100) : 0;
                      const over = m.credited > m.scheduled;
                      const barColor = m.credited===0 ? "bg-slate-200" : over ? "bg-emerald-400" : "bg-blue-400";
                      return (
                        <div key={m.month} className="grid items-center gap-2" style={{gridTemplateColumns:"80px 1fr 90px"}}>
                          <span className="text-xs text-slate-500 text-right pr-2">{m.label}</span>
                          <div className="h-5 bg-slate-100 rounded-full overflow-hidden relative">
                            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{width:`${pct}%`}}/>
                            {m.scheduled>0&&<span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-600 mix-blend-multiply">{fh(m.credited)}</span>}
                          </div>
                          <span className={`text-xs font-semibold text-right ${m.delta>=0?"text-emerald-700":"text-rose-700"}`}>{fs(m.delta)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                    <p className="text-xs text-emerald-600 font-medium">Urlaub offen</p>
                    <p className="text-2xl font-black text-emerald-800 mt-1">{stats.vacationRemaining}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">von {settings.annualVacationDays} Tagen</p>
                  </div>
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                    <p className="text-xs text-rose-600 font-medium">Krankenstand</p>
                    <p className="text-2xl font-black text-rose-800 mt-1">{stats.sickTaken}</p>
                    <p className="text-xs text-rose-600 mt-0.5">Tage heuer</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <p className="text-xs text-amber-600 font-medium">Heute {todayDelta>=0?"im Plus":"offen"}</p>
                    <p className={`text-2xl font-black mt-1 ${todayDelta>=0?"text-emerald-700":"text-rose-700"}`}>{fh(Math.abs(todayDelta))}</p>
                    <p className="text-xs text-amber-600 mt-0.5">{todayEntry?ENTRY_TYPES[todayEntry.type].label:"Kein Eintrag"}</p>
                  </div>
                  <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
                    <p className="text-xs text-violet-600 font-medium">Feiertage</p>
                    <p className="text-2xl font-black text-violet-800 mt-1">{stats.holidayTaken}</p>
                    <p className="text-xs text-violet-600 mt-0.5">automatisch</p>
                  </div>
                </div>

                {/* Kommt/Geht status */}
                {liveClock&&(
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-blue-800">⏱ Arbeitszeit läuft</p>
                      <p className="text-xs text-blue-600 mt-0.5">{liveClock.phase===1?"Vormittag seit "+liveClock.start:liveClock.phase===2?"Pause seit "+liveClock.end:"Nachmittag seit "+liveClock.start2}</p>
                    </div>
                    <button onClick={handleClockOut} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">🏁 Geht</button>
                  </div>
                )}
              </>
            )}

            {/* ── ERFASSUNG ─────────────────────────────────────────── */}
            {activeTab==="erfassung"&&(
              <div className="grid gap-5 md:grid-cols-3">
                <div className="md:col-span-2 space-y-4">
                  <h2 className="font-semibold text-slate-700">{isEditing?"Eintrag bearbeiten":"Neuer Eintrag"}</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><label className="text-xs text-slate-500 mb-1 block">Datum</label><input type="date" value={newEntry.date} onChange={e=>setNewEntry(v=>({...v,date:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/></div>
                    <div><label className="text-xs text-slate-500 mb-1 block">Typ</label><select value={newEntry.type} onChange={e=>setNewEntry(v=>({...v,type:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">{Object.entries(ENTRY_TYPES).filter(([k])=>k!=="holiday").map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</select></div>
                  </div>
                  {newEntry.type==="work"&&(
                    <>
                      {newEntry.date < TWO_BLOCK_START ? (
                        <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">1 Block + 30 min Pause (altes System)</p>
                          <div className="grid gap-3 grid-cols-2">
                            <div><label className="text-xs text-slate-500 mb-1 block">Kommt</label><input type="time" value={newEntry.start||""} onChange={e=>setNewEntry(v=>({...v,start:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"/></div>
                            <div><label className="text-xs text-slate-500 mb-1 block">Geht</label><input type="time" value={newEntry.end||""} onChange={e=>setNewEntry(v=>({...v,end:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"/></div>
                          </div>
                          {newEntry.start&&newEntry.end&&(
                            <div className="text-xs bg-white rounded-lg px-3 py-2 flex justify-between border border-slate-200">
                              <span className="text-slate-500">Brutto: {fh(hoursFromRange(newEntry.start,newEntry.end))} &nbsp;·&nbsp; Pause: 30 min</span>
                              <span className="font-bold text-slate-800">= {fh(hoursFromRange(newEntry.start,newEntry.end)>6?hoursFromRange(newEntry.start,newEntry.end)-0.5:hoursFromRange(newEntry.start,newEntry.end))}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Block 1 — Vormittag</p>
                          <div className="grid gap-3 grid-cols-2">
                            <div><label className="text-xs text-slate-500 mb-1 block">Kommt</label><input type="time" value={newEntry.start||""} onChange={e=>setNewEntry(v=>({...v,start:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"/></div>
                            <div><label className="text-xs text-slate-500 mb-1 block">Geht (Pause Start)</label><input type="time" value={newEntry.end||""} onChange={e=>setNewEntry(v=>({...v,end:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"/></div>
                          </div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Block 2 — Nachmittag</p>
                          <div className="grid gap-3 grid-cols-2">
                            <div><label className="text-xs text-slate-500 mb-1 block">Kommt (Pause Ende)</label><input type="time" value={newEntry.start2||""} onChange={e=>setNewEntry(v=>({...v,start2:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"/></div>
                            <div><label className="text-xs text-slate-500 mb-1 block">Geht</label><input type="time" value={newEntry.end2||""} onChange={e=>setNewEntry(v=>({...v,end2:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"/></div>
                          </div>
                          {newEntry.start&&newEntry.end&&newEntry.start2&&newEntry.end2&&(
                            <div className="text-xs bg-white rounded-lg px-3 py-2 flex justify-between border border-slate-200">
                              <span className="text-slate-500">Block 1: <strong className="text-slate-700">{fh(hoursFromRange(newEntry.start,newEntry.end))}</strong> &nbsp;·&nbsp; Block 2: <strong className="text-slate-700">{fh(hoursFromRange(newEntry.start2,newEntry.end2))}</strong></span>
                              <span className="font-bold text-slate-800">= {fh(hoursFromRange(newEntry.start,newEntry.end)+hoursFromRange(newEntry.start2,newEntry.end2))}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <div><label className="text-xs text-slate-500 mb-1 block">Notiz</label><input value={newEntry.note} onChange={e=>setNewEntry(v=>({...v,note:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/></div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={()=>{addOrUpdateEntry();setIsEditing(false);}} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700">{isEditing?"Änderung speichern":"Eintrag speichern"}</button>
                    {isEditing&&<button onClick={()=>{setNewEntry({date:TODAY,type:"work",start:"08:00",end:"12:00",start2:"12:30",end2:"16:00",note:""});setIsEditing(false);}} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Abbrechen</button>}
                    {byDate.has(newEntry.date)&&<button onClick={()=>deleteEntry(newEntry.date)} className="px-4 py-2 border border-rose-200 text-rose-600 rounded-xl text-sm hover:bg-rose-50">Löschen</button>}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 text-sm">
                  <p className="font-semibold text-slate-700">Heute</p>
                  <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500">Soll</span><span className="font-medium">{fh(today?.scheduled??0)}</span></div>
                  <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500">Status</span><span className="font-medium">{todayEntry?ENTRY_TYPES[todayEntry.type].label:"Kein Eintrag"}</span></div>
                  <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500">{todayDelta>=0?"Im Plus":"Offen"}</span><span className={`font-semibold ${todayDelta>=0?"text-emerald-700":"text-rose-700"}`}>{fh(Math.abs(todayDelta))}</span></div>
                  <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-500">Stempel-Phase</span><span className="font-medium text-xs">{!liveClock?"Nicht aktiv":liveClock.phase===1?"1 — Vormittag läuft":liveClock.phase===2?"2 — Pause (seit "+liveClock.end+")":"3 — Nachmittag läuft"}</span></div>
                  {liveClock&&<div className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">{liveClock.phase===1?"Klick Geht wenn Pause beginnt":liveClock.phase===2?"Klick Kommt wenn Pause endet":"Klick Geht wenn Feierabend"}</div>}
                </div>
              </div>
            )}

            {/* ── 2026 ──────────────────────────────────────────────── */}
            {activeTab==="aktuell"&&(
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Stat title="Soll bis heute"  value={fh(stats.elapsedScheduled)}/>
                  <Stat title="Ist bis heute"   value={fh(stats.elapsedCredited)}/>
                  <Stat title="Saldo 2026"       value={fs(stats.flexNow)} color={stats.flexNow>=0?"text-emerald-700":"text-rose-700"}/>
                </div>
                <YearProgress label="Fortschritt bis heute" soll={stats.elapsedScheduled} ist={stats.elapsedCredited}/>
                <div className="grid gap-3 md:grid-cols-3">
                  {monthlyOverview.map(m=>(
                    <div key={m.month} className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-xs text-slate-500">{m.label}</p>
                      <p className={`text-xl font-bold mt-1 ${m.delta>=0?"text-emerald-700":"text-rose-700"}`}>{fs(m.delta)}</p>
                      <p className="text-xs text-slate-400 mt-1">Soll {fh(m.scheduled)} · Ist {fh(m.credited)}</p>
                      {m.scheduled>0&&(
                        <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${m.credited>=m.scheduled?"bg-emerald-400":"bg-blue-400"}`} style={{width:`${Math.min(100,m.scheduled>0?(m.credited/m.scheduled)*100:0)}%`}}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-700 mb-3">Kalender 2026</h3>
                  <div className="space-y-5">
                    {monthlyOverview.map(month=>{
                      const cells=monthGrid(settings.year,month.month);
                      return (
                        <div key={month.month}>
                          <p className="text-sm font-medium text-slate-600 mb-2">{month.label}</p>
                          <div className="grid grid-cols-7 gap-1 text-xs text-center text-slate-400 mb-1">
                            {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d=><div key={d}>{d}</div>)}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {cells.map((iso,idx)=>{
                              if(!iso) return <div key={idx} className="h-8 rounded-lg"/>;
                              const day=summaryByDate.get(iso);
                              const isHol=holidayLookup.has(iso);
                              const et=day?.entry?.type;
                              let cls="h-8 rounded-lg text-xs flex items-center justify-center border font-medium ";
                              if(isHol) cls+="bg-violet-100 text-violet-700 border-violet-200";
                              else if(et==="vacation") cls+="bg-emerald-100 text-emerald-700 border-emerald-200";
                              else if(et==="sick") cls+="bg-rose-100 text-rose-700 border-rose-200";
                              else if(et==="comp") cls+="bg-amber-100 text-amber-700 border-amber-200";
                              else if(et==="work") cls+="bg-slate-100 text-slate-600 border-slate-200";
                              else cls+="bg-white text-slate-300 border-slate-100";
                              return <div key={iso} className={cls} title={holidayLookup.get(iso)||ENTRY_TYPES[et]?.label||""}>{Number(iso.slice(-2))}</div>;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}


            {/* ── EINTRÄGE ──────────────────────────────────────────── */}
            {activeTab==="liste"&&(
              <div className="space-y-4">
                {/* Filter toggles */}
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-slate-400 mr-1">Anzeigen:</span>
                  {Object.entries({work:"Arbeit",sick:"Krankenstand",comp:"Ausgleichstag",vacation:"Urlaub",holiday:"Feiertag",free:"Frei"}).map(([key,label])=>{
                    const active=listFilter[key];
                    const colors={work:"bg-slate-700 text-white border-slate-700",sick:"bg-rose-500 text-white border-rose-500",comp:"bg-amber-500 text-white border-amber-500",vacation:"bg-emerald-500 text-white border-emerald-500",holiday:"bg-violet-500 text-white border-violet-500",free:"bg-sky-500 text-white border-sky-500"};
                    const inactive="bg-white text-slate-400 border-slate-200";
                    return (
                      <button key={key} onClick={()=>setListFilter(f=>({...f,[key]:!f[key]}))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${active?colors[key]:inactive}`}>
                        <span>{active?"☑":"☐"}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                  </div>
                  <select value={listLimit} onChange={e=>setListLimit(Number(e.target.value))} className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value={10}>10 Einträge</option>
                    <option value={25}>25 Einträge</option>
                    <option value={50}>50 Einträge</option>
                    <option value={100}>100 Einträge</option>
                    <option value={9999}>Alle</option>
                  </select>
                </div>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        <th className="pb-2 pr-3 font-medium">Datum</th>
                        <th className="pb-2 pr-3 font-medium">Tag</th>
                        <th className="pb-2 pr-3 font-medium">Typ</th>
                        <th className="pb-2 pr-3 font-medium">Ist</th>
                        <th className="pb-2 pr-3 font-medium">Soll</th>
                        <th className="pb-2 pr-3 font-medium">Saldo</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.filter(e=>listFilter[e.type]).map(entry=>{
                        const sched=scheduledHours(entry.date,settings);
                        const cred=creditedHours(entry,settings);
                        const delta=cred-sched;
                        return (
                          <tr key={entry.date} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="py-2 pr-3 font-mono text-xs text-slate-600">{fd(entry.date)}</td>
                            <td className="py-2 pr-3 text-slate-500">{WEEKDAYS[weekdayOf(entry.date)]}</td>
                            <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENTRY_TYPES[entry.type].bg}`}>{ENTRY_TYPES[entry.type].label}</span></td>
                            <td className="py-2 pr-3 text-slate-700">{fh(cred)}</td>
                            <td className="py-2 pr-3 text-slate-500">{fh(sched)}</td>
                            <td className={`py-2 pr-3 font-semibold ${delta>=0?"text-emerald-700":"text-rose-700"}`}>{fs(delta)}</td>
                            <td className="py-2">
                              <button onClick={()=>{setNewEntry({date:entry.date,type:entry.type,start:entry.start||"08:00",end:entry.end||"12:00",start2:entry.start2||"12:30",end2:entry.end2||"16:00",note:entry.note||""});setIsEditing(true);setActiveTab("erfassung");}}
                                className="text-slate-400 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded-lg text-xs hover:bg-slate-50 transition-colors">✏️</button>
                            </td>
                          </tr>
                        );
                      })}
                      {recent.filter(e=>listFilter[e.type]).length===0&&(
                        <tr><td colSpan="7" className="py-6 text-center text-sm text-slate-400">Keine Einträge für die gewählten Filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── URLAUB ────────────────────────────────────────────── */}
            {activeTab==="urlaub"&&(
              <div className="space-y-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Urlaubsjahr {settings.year}</p>
                {/* Urlaub Hauptkarte */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-emerald-900 text-lg">🌴 Urlaub {settings.year}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Jahresurlaub + Übertrag vom Vorjahr</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-emerald-800">{stats.vacationRemaining}</p>
                      <p className="text-xs text-emerald-600">Tage offen</p>
                    </div>
                  </div>
                  {/* Fortschrittsbalken */}
                  <div className="h-3 bg-emerald-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{width:`${Math.min(100,(stats.vacationTaken/(settings.annualVacationDays+(settings.vacationCarryover||0)))*100)}%`}}/>
                  </div>
                  {/* Aufschlüsselung */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white rounded-xl p-3">
                      <p className="text-lg font-bold text-emerald-800">{settings.annualVacationDays}</p>
                      <p className="text-xs text-emerald-600">Jahresurlaub</p>
                    </div>
                    <div className="bg-white rounded-xl p-3">
                      <p className="text-lg font-bold text-blue-700">{settings.vacationCarryover||0}</p>
                      <p className="text-xs text-blue-600">Übertrag Vorjahr</p>
                    </div>
                    <div className="bg-white rounded-xl p-3">
                      <p className="text-lg font-bold text-rose-700">{stats.vacationTaken}</p>
                      <p className="text-xs text-rose-600">Verbraucht</p>
                    </div>
                  </div>
                  {/* Stunden */}
                  <div className="bg-white rounded-xl p-3 text-xs text-slate-500 flex justify-between">
                    <span>Gesamt verfügbar: <strong className="text-slate-700">{settings.annualVacationDays+(settings.vacationCarryover||0)} Tage</strong></span>
                    <span>= <strong className="text-slate-700">{fh((settings.annualVacationDays+(settings.vacationCarryover||0))*(settings.vacationHoursPerDay||8))}</strong></span>
                  </div>
                </div>
                {/* Andere Abwesenheiten */}
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4"><p className="font-semibold text-rose-900 mb-1">🤒 Krankenstand</p><p className="text-2xl font-black text-rose-800">{stats.sickTaken}</p><p className="text-xs text-rose-600 mt-0.5">Erfasste Tage</p></div>
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><p className="font-semibold text-amber-900 mb-1">🔄 Ausgleichstage</p><p className="text-2xl font-black text-amber-800">{stats.compTaken}</p><p className="text-xs text-amber-600 mt-0.5">Erfasste Tage</p></div>
                  <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4"><p className="font-semibold text-violet-900 mb-1">🎉 Feiertage</p><p className="text-2xl font-black text-violet-800">{stats.holidayTaken}</p><p className="text-xs text-violet-600 mt-0.5">Automatisch erkannt</p></div>
                </div>
              </div>
            )}

            {/* ── REGELN ────────────────────────────────────────────── */}
            {activeTab==="regeln"&&(
              <div className="space-y-6 max-w-sm">
                <div className="space-y-4">
                  <h2 className="font-semibold text-slate-700">Wochenverteilung</h2>
                  {[1,2,3,4,5].map(wd=>(
                    <div key={wd} className="flex items-center gap-4">
                      <span className="w-8 text-sm text-slate-500">{["Mo","Di","Mi","Do","Fr"][wd-1]}</span>
                      <input type="number" step="0.5" value={settings.scheduledWeekdays[wd]}
                        onChange={e=>handleSetSettings(s=>({...s,scheduledWeekdays:{...s.scheduledWeekdays,[wd]:Number(e.target.value)}}))}
                        className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
                      <span className="text-sm text-slate-400">h</span>
                    </div>
                  ))}
                  <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
                    Summe: <strong>{fh(Object.values(settings.scheduledWeekdays).reduce((s,v)=>s+Number(v||0),0))}</strong>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <h2 className="font-semibold text-slate-700">Urlaubsregelung</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-36">Jahresurlaub</span>
                    <input type="number" step="1" min="0" value={settings.annualVacationDays}
                      onChange={e=>handleSetSettings(s=>({...s,annualVacationDays:Number(e.target.value)}))}
                      className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
                    <span className="text-sm text-slate-400">Tage</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-36">Stunden pro Tag</span>
                    <input type="number" step="0.5" min="0" value={settings.vacationHoursPerDay||8}
                      onChange={e=>handleSetSettings(s=>({...s,vacationHoursPerDay:Number(e.target.value)}))}
                      className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
                    <span className="text-sm text-slate-400">h</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-36">Übertrag Vorjahr</span>
                    <input type="number" step="1" min="0" value={settings.vacationCarryover||0}
                      onChange={e=>handleSetSettings(s=>({...s,vacationCarryover:Number(e.target.value)}))}
                      className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
                    <span className="text-sm text-slate-400">Tage</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700">
                    Gesamt {settings.year}: <strong>{settings.annualVacationDays+(settings.vacationCarryover||0)} Tage</strong> = <strong>{fh((settings.annualVacationDays+(settings.vacationCarryover||0))*(settings.vacationHoursPerDay||8))}</strong>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <h2 className="font-semibold text-slate-700">Pausenregelung</h2>
                  <p className="text-xs text-slate-400">Standard-Pause wird automatisch abgezogen, wenn keine manuelle Pause erfasst wurde.</p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-36">Automatik ab</span>
                    <input type="number" step="0.5" min="0" value={settings.autoBreakThresholdH}
                      onChange={e=>handleSetSettings(s=>({...s,autoBreakThresholdH:Number(e.target.value)}))}
                      className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
                    <span className="text-sm text-slate-400">h Arbeitszeit</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-36">Pausendauer</span>
                    <input type="number" step="5" min="0" value={settings.autoBreakMinutes}
                      onChange={e=>handleSetSettings(s=>({...s,autoBreakMinutes:Number(e.target.value)}))}
                      className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
                    <span className="text-sm text-slate-400">min</span>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-orange-700">
                    Bei mehr als <strong>{settings.autoBreakThresholdH} h</strong> Arbeitszeit werden automatisch <strong>{settings.autoBreakMinutes} min</strong> Pause abgezogen — es sei denn, du erfasst die Pause manuell.
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
