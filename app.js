/*
 * File: app.js
 * Project: campus-store-status-site
 * File Created: Monday, 9th February 2026 10:04:40 PM
 * Author: Zabdiel Addo
 * Email: zabdiel.addo@ashesi.edu.gh
 * Version: 1.0.0
 * Brief: <<brief>>
 * -----
 * Last Modified: Monday, 9th February 2026 10:05:16 PM
 * Modified By: Zabdiel Addo
 * -----
 * Copyright ©2026 Zabdiel Addo
 */


const API_BASE = "https://script.google.com/macros/s/AKfycbz0yaGJBsyY2wzcXOvkii9bGqwm3k5VO17x5amhCzBzx6VQEzfr1CEpyXgadH-okGTJ/exec";

// how long before we consider it "unknown/offline"
const OFFLINE_SECONDS_DEFAULT = 180; // 3 minutes (good for Wi-Fi powered version)

function fmtAgo(secondsAgo){
  if (secondsAgo < 10) return "just now";
  if (secondsAgo < 60) return `${secondsAgo} seconds ago`;
  const mins = Math.floor(secondsAgo/60);
  if (mins < 60) return `${mins} minute${mins===1?"":"s"} ago`;
  const hrs = Math.floor(mins/60);
  return `${hrs} hour${hrs===1?"":"s"} ago`;
}

function statusColor(isOpen, lastSeenEpoch, offlineSeconds){
  const now = Math.floor(Date.now()/1000);
  const age = lastSeenEpoch ? (now - lastSeenEpoch) : 999999;
  if (!lastSeenEpoch || age > offlineSeconds) return "yellow";
  return isOpen ? "green" : "red";
}

function statusText(isOpen, color){
  if (color === "yellow") return "Unknown";
  return isOpen ? "Open" : "Closed";
}

async function fetchJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ---------- All Stores Page ----------
async function renderAllStores(){
  const listEl = document.getElementById("storesList");
  if (!listEl) return;

  listEl.innerHTML = `<div class="card">Loading stores…</div>`;

  try{
    const data = await fetchJson(`${API_BASE}?action=all`);
    const stores = data.stores || [];

    // If you want to force 2 demo cards even before data exists:
    // you can add defaults here. But since your sheet is updating, this will show real data.

    listEl.innerHTML = stores.map(s => {
      const offlineSeconds = OFFLINE_SECONDS_DEFAULT;
      const color = statusColor(s.is_open, s.last_seen_epoch, offlineSeconds);
      const now = Math.floor(Date.now()/1000);
      const age = s.last_seen_epoch ? (now - s.last_seen_epoch) : 999999;

      return `
        <a class="link" href="store.html?store_id=${encodeURIComponent(s.store_id)}">
          <div class="card">
            <div class="row">
              <div>
                <div class="title">${escapeHtml(prettyName(s.store_id))}</div>
                <div class="pill">
                  <span class="dot ${color}"></span>
                  <span>${statusText(s.is_open, color)}</span>
                </div>
              </div>
              <div class="chev">›</div>
            </div>
            <div class="sub">Last updated: ${color==="yellow" ? fmtAgo(age) : fmtAgo(age)}</div>
          </div>
        </a>
      `;
    }).join("");

    if (stores.length === 0){
      listEl.innerHTML = `<div class="card">No stores yet. Add a row in the <b>stores</b> sheet or POST an update from the ESP32.</div>`;
    }

  }catch(err){
    listEl.innerHTML = `<div class="card">Failed to load stores. ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Store Page ----------
async function renderStorePage(){
  const rootEl = document.getElementById("storeRoot");
  if (!rootEl) return;

  const params = new URLSearchParams(window.location.search);
  const storeId = params.get("store_id");

  if (!storeId){
    rootEl.innerHTML = `<div class="card">Missing store_id in URL.</div>`;
    return;
  }

  rootEl.innerHTML = `<div class="card">Loading store…</div>`;

  try{
    const statusData = await fetchJson(`${API_BASE}?action=status&store_id=${encodeURIComponent(storeId)}`);
    const store = statusData.store;

    // For now: same offline threshold for all stores
    // Later: you can set a longer threshold for battery/SIM store (e.g. 6 hours)
    const offlineSeconds = OFFLINE_SECONDS_DEFAULT;

    const color = statusColor(store.is_open, store.last_seen_epoch, offlineSeconds);
    const now = Math.floor(Date.now()/1000);
    const age = store.last_seen_epoch ? (now - store.last_seen_epoch) : 999999;

    const eventsData = await fetchJson(`${API_BASE}?action=events&store_id=${encodeURIComponent(storeId)}&limit=10`);
    const events = eventsData.events || [];

    rootEl.innerHTML = `
      <div class="center">
        <div style="font-size:26px;font-weight:800;margin-top:4px;">${escapeHtml(prettyName(store.store_id))}</div>
        <div class="bigStatus ${color}">${color==="green" ? "✓" : (color==="red" ? "×" : "!")}</div>
        <div style="font-size:18px;font-weight:800;margin-top:2px;">
          ${escapeHtml(statusText(store.is_open, color))}
        </div>
        <div style="color:var(--muted);margin-top:6px;">
          ${color==="yellow" ? "Internet/device down, status unknown." : (store.is_open ? "This store is currently open." : "This store is currently closed.")}
        </div>
        <div class="badge">
          <span class="dot ${color}"></span>
          <span>Last updated: ${fmtAgo(age)}</span>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="row">
          <div class="sectionTitle">RECENT ACTIVITY</div>
          <div style="color:var(--muted);font-size:12px;">Last entries</div>
        </div>

        ${events.length === 0 ? `<div class="sub">No events logged yet.</div>` : `
          <div class="activity" style="margin-top:10px;">
            <div class="timeline">
              <div class="line"></div>
            </div>
            <div class="event">
              ${events.slice().reverse().map(ev => {
                const c = (ev.event_type === "OPEN") ? "green" : "red";
                return `
                  <div class="eventItem">
                    <div class="pill">
                      <span class="dot ${c}"></span>
                      <b>${escapeHtml(capitalize(ev.event_type.toLowerCase()))}</b>
                    </div>
                    <div class="when">${escapeHtml(epochToLocal(ev.timestamp_epoch))}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `}
      </div>

      <div class="footer">Status provided directly by store</div>
    `;

  }catch(err){
    rootEl.innerHTML = `<div class="card">Failed to load store. ${escapeHtml(err.message)}</div>`;
  }
}

function prettyName(storeId){
  // simple mapping for nicer names
  const map = {
    "essentials": "Essentials",
    "aunty_caro": "Aunty Caro",
    "aunty caro": "Aunty Caro",
    "auntycaro": "Aunty Caro"
  };
  return map[storeId.toLowerCase()] || storeId;
}

function epochToLocal(epoch){
  if (!epoch) return "Unknown time";
  const d = new Date(epoch * 1000);
  return d.toLocaleString();
}

function capitalize(s){
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Auto refresh every 10s for “real-time feel”
function taskAutoRefresh(){
  const isIndex = !!document.getElementById("storesList");
  const isStore = !!document.getElementById("storeRoot");
  if (isIndex) renderAllStores();
  if (isStore) renderStorePage();
}

document.addEventListener("DOMContentLoaded", () => {
  taskAutoRefresh();
  setInterval(taskAutoRefresh, 10000);
});
