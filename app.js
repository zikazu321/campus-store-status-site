// ==========================
// app.js (Supabase Realtime, NO POLLING)
// Works on GitHub Pages
// ==========================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ========= CONFIG ========= */
const SUPABASE_URL = "https://uvxvckcgfncmcydmilvk.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eHZja2NnZm5jbWN5ZG1pbHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyOTcsImV4cCI6MjA4NjczMTI5N30.8tc1hkpc2TrkzXXFbm4oWa-nl6svYcNbl7-GhxpU9Gw";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ========= HELPERS ========= */
function prettyName(id) {
  const map = {
    essentials: "Essentials",
    aunty_caro: "Aunty Caro",
  };
  return map[(id || "").toLowerCase()] || id;
}

function colorFor(store) {
  return store.is_open ? "green" : "red";
}

function textFor(store) {
  return store.is_open ? "Open" : "Closed";
}

function fmtAgo(ts) {
  if (!ts) return "Unknown";

  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (Number.isNaN(sec)) return "Unknown";

  if (sec < 10) return "just now";
  if (sec < 60) return `${sec} seconds ago`;

  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;

  const h = Math.floor(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ========= UI (All Stores) ========= */
function cardHtml(s) {
  const color = colorFor(s);

  return `
    <a class="link" href="store.html?store_id=${encodeURIComponent(s.store_id)}">
      <div class="card" id="store-${escapeHtml(s.store_id)}">
        <div class="row">
          <div>
            <div class="title">${escapeHtml(prettyName(s.store_id))}</div>
            <div class="pill">
              <span class="dot ${color}"></span>
              <span>${escapeHtml(textFor(s))}</span>
            </div>
          </div>
          <div class="chev">›</div>
        </div>
        <div class="sub">Last updated: ${escapeHtml(fmtAgo(s.last_seen))}</div>
      </div>
    </a>
  `;
}

function patchStoreCard(s) {
  const el = document.getElementById(`store-${s.store_id}`);
  if (!el) return;

  const color = colorFor(s);

  const dot = el.querySelector(".dot");
  const text = el.querySelector(".pill span:last-child");
  const sub = el.querySelector(".sub");

  if (dot) dot.className = `dot ${color}`;
  if (text) text.textContent = textFor(s);
  if (sub) sub.textContent = `Last updated: ${fmtAgo(s.last_seen)}`;
}

/* ========= PAGE: All Stores ========= */
async function renderAllStores() {
  const el = document.getElementById("storesList");
  if (!el) return;

  // Show a single stable “loading” card once (no repeated flicker)
  el.innerHTML = `<div class="card">Loading stores…</div>`;

  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Supabase error (stores):", error);
    el.innerHTML = `<div class="card">Error loading stores: ${escapeHtml(
      error.message
    )}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = `<div class="card">No stores found in database.</div>`;
    return;
  }

  el.innerHTML = data.map((s) => cardHtml(s)).join("");
}

/* ========= PAGE: Store Detail ========= */
async function renderStorePage() {
  const root = document.getElementById("storeRoot");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const storeId = params.get("store_id");

  if (!storeId) {
    root.innerHTML = `<div class="card">Missing store_id in URL.</div>`;
    return;
  }

  root.innerHTML = `<div class="card">Loading store…</div>`;

  const { data: store, error } = await supabase
    .from("stores")
    .select("*")
    .eq("store_id", storeId)
    .single();

  if (error) {
    console.error("Supabase error (store single):", error);
    root.innerHTML = `<div class="card">Error loading store: ${escapeHtml(
      error.message
    )}</div>`;
    return;
  }

  drawStorePage(store);
  await loadRecentEvents(storeId);
  subscribeStoreEvents(storeId);
  subscribeStoreRow(storeId);
}

function drawStorePage(store) {
  const root = document.getElementById("storeRoot");
  const color = colorFor(store);

  root.innerHTML = `
    <div class="center">
      <div style="font-size:26px;font-weight:800;margin-top:4px;">
        ${escapeHtml(prettyName(store.store_id))}
      </div>

      <div class="bigStatus ${color}">
        ${color === "green" ? "✓" : "×"}
      </div>

      <div style="font-size:18px;font-weight:800;margin-top:2px;">
        ${escapeHtml(textFor(store))}
      </div>

      <div class="badge">
        <span class="dot ${color}"></span>
        <span>Last updated: ${escapeHtml(fmtAgo(store.last_seen))}</span>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="row">
        <div class="sectionTitle">RECENT ACTIVITY</div>
        <div style="color:var(--muted);font-size:12px;">Latest</div>
      </div>
      <div id="eventList" style="margin-top:10px;"></div>
    </div>

    <div class="footer">Status provided directly by store</div>
  `;
}

async function loadRecentEvents(storeId) {
  const list = document.getElementById("eventList");
  if (!list) return;

  const { data, error } = await supabase
    .from("store_events")
    .select("*")
    .eq("store_id", storeId)
    .order("ts", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Supabase error (events):", error);
    list.innerHTML = `<div class="sub">Error loading events: ${escapeHtml(
      error.message
    )}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="sub">No events yet.</div>`;
    return;
  }

  list.innerHTML = data.map(eventHtml).join("");
}

function eventHtml(ev) {
  const c = ev.event_type === "OPEN" ? "green" : "red";
  return `
    <div class="eventItem">
      <div class="pill">
        <span class="dot ${c}"></span>
        <b>${escapeHtml(ev.event_type)}</b>
      </div>
      <div class="when">${escapeHtml(new Date(ev.ts).toLocaleString())}</div>
    </div>
  `;
}

function prependEvent(ev) {
  const list = document.getElementById("eventList");
  if (!list) return;

  // If list was "No events yet", clear it
  if (list.textContent.includes("No events yet")) list.innerHTML = "";

  list.insertAdjacentHTML("afterbegin", eventHtml(ev));
}

/* ========= REALTIME SUBSCRIPTIONS ========= */

// All-stores realtime updates (index page)
function subscribeAllStores() {
  supabase
    .channel("stores-live-index")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "stores" },
      (payload) => {
        // Only patch if that store card exists on current page
        patchStoreCard(payload.new);
      }
    )
    .subscribe();
}

// Store page: subscribe to store row updates (open/closed changes)
function subscribeStoreRow(storeId) {
  supabase
    .channel(`store-row-${storeId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "stores",
        filter: `store_id=eq.${storeId}`,
      },
      (payload) => {
        // Redraw top section quickly (no full page reload)
        drawStorePage(payload.new);
      }
    )
    .subscribe();
}

// Store page: subscribe to new events
function subscribeStoreEvents(storeId) {
  supabase
    .channel(`store-events-${storeId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "store_events" },
      (payload) => {
        if (payload.new.store_id !== storeId) return;
        prependEvent(payload.new);
      }
    )
    .subscribe();
}

/* ========= INIT ========= */
document.addEventListener("DOMContentLoaded", () => {
  // If we're on index page
  if (document.getElementById("storesList")) {
    renderAllStores();
    subscribeAllStores();
  }

  // If we're on store page
  if (document.getElementById("storeRoot")) {
    renderStorePage();
  }
});
