# CDL Map Veto System

A real-time Call of Duty League map veto system with OBS overlay support.

## Features

- **CDL-accurate veto format** (Black Ops 6 2024-25 season rules, Best of 5)
- **Live admin panel** to run the veto step-by-step and update scores
- **OBS overlay** with transparent background for streaming
- **Real-time updates** via WebSocket — overlay syncs instantly
- **Persistent state** — reloads after server restart
- **Customizable** team names, colors, and map pool

## CDL Veto Format (Best of 5)

| Step | Action | Team | Mode | Result |
|------|--------|------|------|--------|
| 1–4 | Ban ×4 | Alternating (T1,T2,T1,T2) | Hardpoint | 2 HP maps remain |
| 5 | Pick | Team 2 | Hardpoint | → **Game 1** map |
| Auto | — | — | Hardpoint | → **Game 4** map (remaining) |
| 6–9 | Ban ×4 | Alternating (T2,T1,T2,T1) | Search & Destroy | 2 SnD maps remain |
| 10 | Pick | Team 1 | Search & Destroy | → **Game 2** map |
| Auto | — | — | Search & Destroy | → **Game 5** map (remaining) |
| 11–12 | Ban ×2 | T1, T2 | Control | 1 Control map remains |
| Auto | — | — | Control | → **Game 3** map |

*Team 1 = coin flip winner with veto advantage*

## Default Map Pool (BO6)

- **Hardpoint**: Babylon, Hacienda, Infection, Protocol, Rewind, Skyline
- **Search & Destroy**: Babylon, Hacienda, Infection, Protocol, Rewind, Skyline
- **Control**: Babylon, Hacienda, Protocol

## Setup

```bash
npm install
npm start
```

Server runs on **http://localhost:3000**

## URLs

| Page | URL | Purpose |
|------|-----|---------|
| Admin Panel | http://localhost:3000/admin.html | Control veto & scores |
| OBS Overlay | http://localhost:3000/overlay.html | Add to OBS as browser source |

## OBS Setup

1. In OBS, add a **Browser Source**
2. URL: `http://localhost:3000/overlay.html`
3. Width: `1920`, Height: `1080`
4. Check **"Shutdown source when not visible"** *(optional)*
5. Check **"Refresh browser when scene becomes active"** *(optional)*
6. The background is **transparent** — place over your game capture

## Usage

1. Open the admin panel at `/admin.html`
2. Set team names and colors in the sidebar
3. Optionally edit the map pool
4. Click **Start Veto Process**
5. Follow the prompts — click maps to ban/pick
6. Switch to the **Series Scores** tab to update game results
7. Click team name buttons to mark game winners
