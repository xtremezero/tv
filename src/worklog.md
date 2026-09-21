# Project Worklog

---
Task ID: 1
Agent: main (Super Z)
Task: Initialize fullstack environment, plan Pseudo-TV build

Work Log:
- Loaded fullstack-dev skill, ran init script (Next.js 16, React 19, Zustand 5, shadcn/ui)
- Confirmed project structure: single `/` route, port 3000, bun dev server auto-running
- Planned module layout: lib/tv (types, scheduler, store, backup, static-synth, ingest), api/ingest, components/tv

Stage Summary:
- Building pseudo-linear TV app: multi-platform ingestion (YouTube/Vimeo/Dailymotion), interleaved
  scheduling (A1,B1,C1...), weighted scheduling, virtual linear broadcast (epoch-anchored), quarantine
  registry, CRT + static sensory layer, remote-control keybindings, Zustand persistence, SHA-256 backups.

---
Task ID: 2
Agent: main (Super Z)
Task: Implement, verify and harden the Pseudo-TV application

Work Log:
- Implemented lib/tv: types.ts, scheduler.ts (Fisher-Yates, round-robin interleave, weighted matrix,
  epoch-anchored live coordinates, EPG computation), store.ts (zustand persist skipHydration),
  backup.ts (SHA-256 envelope), static-synth.ts (Web Audio white-noise burst), ingest.ts (server proxy)
- /api/ingest route: YouTube playlist scrape (ytInitialData) + Data API v3 key path + single-video
  scrape; Vimeo v2 legacy API (singular path fix: channel/album/group) + oEmbed singles; Dailymotion
  REST; 24h TTL cache; brace-balanced JSON extractor
- Discovered YouTube 2025 lockupViewModel migration; added dual parser (playlistVideoRenderer + lockup)
- Verified ingestion live: YouTube playlist (19 items w/ durations), Vimeo channel staffpicks,
  Dailymotion video/playlist — all returning normalized schemas
- player-adapters.ts: custom YT IFrame API / Vimeo SDK / Dailymotion SDK adapters with same-platform
  hot-swap (loadVideoById/loadVideo/load) and full teardown on platform switch; pending-action queues
- UnifiedPlayer: unified controller, progress throttle, stall watchdog (+ never-started watchdog for
  platform interstitials), imperative seek requests
- UI: PowerCurtain (autoplay gesture), OSD components, EPGGuide, SettingsPanel (channels/playlists/
  shuffle/weight/mode/API key/backup/demo/danger zone), TVClient orchestrator (keybinding matrix,
  digit buffer, drift correction, quarantine flow, snow/static transitions)
- Fixed: react-hooks/refs + set-state-in-effect errors, Vimeo 404 (singular path), NoSignal behind
  power curtain, adapter arg corruption from partial edit
- Browser-verified: power-on, demo load, playback, error 150 quarantine + skip, EPG interleave pattern
  (A1·B1·A2·B2 across 2 playlists), channel hopping wrap-around, digit commit CH002, persistence across
  reloads, settings fetch of real playlist via UI (27 assets), DATA tab, clean console on boot
- ESLint: 0 problems in src. tsc: 0 errors. dev.log: no runtime errors.

Stage Summary:
- App complete and verified end-to-end. Deliverable: Next.js app on `/` (only route), port 3000.
- Note: YouTube embeds inside the sandbox's datacenter browser may show a bot-check interstitial;
  from real user browsers embeds load normally, and the quarantine/watchdog machinery skips dead
  assets either way.

