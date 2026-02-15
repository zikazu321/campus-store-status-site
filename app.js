/* ========= CONFIG ========= */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://uvxvckcgfncmcydmilvk.functions.supabase.co/update_store_status";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eHZja2NnZm5jbWN5ZG1pbHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyOTcsImV4cCI6MjA4NjczMTI5N30.8tc1hkpc2TrkzXXFbm4oWa-nl6svYcNbl7-GhxpU9Gw";   // paste anon key here

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ========= HELPERS ========= */

function prettyName(id){
  const map = {
    "essentials":"Essentials",
    "aunty_caro":"Aunty Caro"
  };
  return map[id] || id;
}

function colorFor(store){
  return store.is_open ? "green" : "red";
}

function textFor(store){
  return store.is_open ? "Open" : "Closed";
}

function fmtAgo(ts){
  if(!ts) return "Unknown";

  const sec = Math.floor((Date.now() - new Date(ts))/1000);

  if(sec < 10) return "just now";
  if(sec < 60) return sec+"s ago";

  const m = Math.floor(sec/60);
  if(m < 60) return m+"m ago";

  const h = Math.floor(m/60);
  return h+"h ago";
}

/* ========= ALL STORES PAGE ========= */

async function renderAllStores(){

  const el = document.getElementById("storesList");
  if(!el) return;

  // 🔴 NO loading spinner → immediate empty UI
  const { data } = await supabase
      .from("stores")
      .select("*")
      .order("name");

  if(!data) return;

  el.innerHTML = data.map(s=>cardHtml(s)).join("");
}

function cardHtml(s){

  const color = colorFor(s);

  return `
  <a class="link" href="store.html?store_id=${s.store_id}">
    <div class="card" id="store-${s.store_id}">
      <div class="row">
        <div>
          <div class="title">${prettyName(s.store_id)}</div>
          <div class="pill">
            <span class="dot ${color}"></span>
            <span>${textFor(s)}</span>
          </div>
        </div>
        <div class="chev">›</div>
      </div>
      <div class="sub">Last updated: ${fmtAgo(s.last_seen)}</div>
    </div>
  </a>`;
}

/* ========= PATCH CARD (REALTIME UPDATE) ========= */

function patchStoreCard(s){

  const el = document.getElementById(`store-${s.store_id}`);
  if(!el) return;

  const color = colorFor(s);

  el.querySelector(".dot").className = "dot "+color;
  el.querySelector(".pill span:last-child").textContent = textFor(s);
  el.querySelector(".sub").textContent = "Last updated: "+fmtAgo(s.last_seen);
}

/* ========= STORE PAGE ========= */

async function renderStorePage(){

  const root = document.getElementById("storeRoot");
  if(!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("store_id");
  if(!id) return;

  const { data } = await supabase
        .from("stores")
        .select("*")
        .eq("store_id",id)
        .single();

  if(!data) return;

  drawStorePage(data);

  // realtime events

  supabase.channel("events-"+id)
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"store_events"},
      payload=>{
          if(payload.new.store_id!==id) return;
          prependEvent(payload.new);
      })
    .subscribe();
}

function drawStorePage(s){

  const root = document.getElementById("storeRoot");

  const color = colorFor(s);

  root.innerHTML = `
    <div class="center">
      <div style="font-size:26px;font-weight:800">${prettyName(s.store_id)}</div>
      <div class="bigStatus ${color}">
        ${color==="green"?"✓":"×"}
      </div>
      <div style="font-size:18px;font-weight:800">${textFor(s)}</div>
      <div class="badge">
        <span class="dot ${color}"></span>
        <span>Last updated: ${fmtAgo(s.last_seen)}</span>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="sectionTitle">RECENT ACTIVITY</div>
      <div id="eventList"></div>
    </div>
  `;
}

function prependEvent(ev){

  const list=document.getElementById("eventList");
  if(!list) return;

  const c = ev.event_type==="OPEN"?"green":"red";

  const html=`
    <div class="eventItem">
      <div class="pill">
        <span class="dot ${c}"></span>
        <b>${ev.event_type}</b>
      </div>
      <div class="when">${new Date(ev.ts).toLocaleString()}</div>
    </div>
  `;

  list.insertAdjacentHTML("afterbegin",html);
}

/* ========= REALTIME SUBSCRIPTION ========= */

function startRealtime(){

  supabase
    .channel("stores-live")
    .on("postgres_changes",
        {event:"UPDATE",schema:"public",table:"stores"},
        payload=>{
            console.log("Realtime:",payload.new);
            patchStoreCard(payload.new);
        })
    .subscribe();
}

/* ========= INIT ========= */

document.addEventListener("DOMContentLoaded",()=>{

  renderAllStores();
  renderStorePage();
  startRealtime();

});
