# ⚡ Neon Pulse: Cyberpunk Finger-Tracking Arcade Survival

**Neon Pulse** is a high-performance, immersive cyberpunk arcade survival game built using React, TypeScript, Vite, MediaPipe Hand Landmarker, Canvas 2D vector rendering, and real-time procedural audio synthesis.

The player controls a **Neon Energy Core** using their index finger in front of their webcam. By forming advanced hand shapes and gestures, players can deploy protective energy shields, discharge gravity vortexes, trigger screen-clearing nova blasts, and summon spinning dual cyber sabers to survive increasingly difficult waves of corrupted network vectors.

---

## 🎮 Key Features

- **Ultra-Smooth Finger Tracking**: Implements velocity-adaptive alpha smoothing and a mathematical **2D Kalman Filter** (`[x, y, vx, vy]` state vectors) to eliminate sensor jitter and predict positions during brief frame drops.
- **Advanced Gestural Combat System**:
  - 👆 **Point (Normal)**: Focus weapon lasers on targets.
  - 🤏 **Pinch (Thumb + Index)**: Charge and deploy a **Deflector Shield Dome** (overclocks laser fire rate, drains shield energy).
  - 🖐️ **Open Palm**: Discharge a high-impact **Nova Blast** shockwave (clears hazards, knocks back vectors, 8s cooldown).
  - ✊ **Fist (Closed Hand)**: Condense a **Gravity Vortex** (sucks in crystals and slows nearby enemies by 60%).
  - ✌️ **Peace Sign**: Spin dual **Cyber Sabers** (melee laser blades slicing vectors and vaporizing projectiles).
- **Procedural Synthwave Soundtrack**: Powered entirely by the Web Audio API. Synthesizes drum kicks, arpeggios, hi-hats, and bass sequences dynamically. Tempo and sequence complexity scale up automatically as your combo multiplier climbs, and BGM pitches down mathematically during slow-mo events.
- **Dynamic Color Palettes**: Environment grid and player visual glows shift dynamically across four tiers of neon colors (Cyan, Purple, Gold, and Crimson Red) based on combo multipliers.
- **Persistent Upgrades Shop**: Spend collected credits on upgrades like Magnet Collection Radius, Starting Shields, Max integrity, and Fire Rate.
- **Grid Achievements & Diagnostics**: Floating telemetry panels track camera status, tracking FPS, render loop FPS, and landmark coordinate states. Trophy Cabinet tracks persistent unlocked accomplishments.

---

## 🤘 New Additions: Player Agency

- **Proceed Approvals (👍 Thumbs Up / 🤏 Pinch)**: When leveling up, the game pauses combat and prompts the user with an upgrade card. Hold a Thumbs Up gesture for 1.5 seconds to proceed to the next level with a +30 integrity restoration.
- **Safe Quit Gesture (🤘 Horns / Rock On)**: Hold the Horns gesture during gameplay for 2 seconds to initiate self-destruct, which safely ends the run and saves all accumulated credits.

---

## 🛠️ Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **AI Tracking**: Google MediaPipe Tasks-Vision (Hand Landmarker)
- **Rendering**: Canvas 2D API (High-performance object-pooled rendering)
- **Audio**: Web Audio API (Live procedural oscillators and filter sequencers)
- **Icons**: Lucide React
- **Hosting Config**: Netlify and Vercel ready

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v16.0.0 or higher)
- A working webcam

### 1. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 2. Run Local Development Server
Start the Vite local development server on port 3000:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Production Build
Create an optimized production bundle:
```bash
npm run build
```

---

## 🚀 Deployment

### Netlify (Automatic Setup)
This project is configured with a `netlify.toml` file in the root. 
1. Push your repository to GitHub.
2. Link the repository to Netlify. Netlify will read the configs and automatically deploy using:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
   - **Redirect Rule**: Redirects `/*` to `/index.html` (for client-side routing fallback).

### Vercel (Automatic Setup)
This project contains a `vercel.json` configuration file in the root.
1. Import your project into Vercel from your GitHub repository.
2. Vercel automatically detects Vite configurations and builds the output using the `dist` directory. The rewrite rule preserves routing for any SPA routers.
