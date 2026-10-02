# HEDES Studio — Android Local Termux Setup Guide

HEDES Studio can run directly on your Android phone using **Termux**. This provides a **local interactive terminal** executing commands inside Termux on your phone hardware—completely independent of any PC or cloud worker.

---

## 1. Prerequisites

1. Install **Termux** from [F-Droid](https://f-droid.org/en/packages/com.termux/) (do not use Google Play Store version as it is deprecated).
2. Open Termux on your phone.

---

## 2. Installation

Inside Termux, run:

```bash
# 1. Update packages and install Git
pkg update -y && pkg install -y git

# 2. Clone or copy Hedes repository
git clone https://github.com/adiiiii13/hedes.git
cd hedes

# 3. Run the automated local setup script
bash ./android/setup-termux.sh
```

---

## 3. Running HEDES on Android

Start the local backend:

```bash
node ./android/server.mjs
```

The output will display:
```
---------------------------------------------------------
   HEDES STUDIO — ANDROID LOCAL TERMUX BACKEND
---------------------------------------------------------
[Runtime] Mode: android-termux
[Storage] Root: /data/data/com.termux/files/home/.local/share/hedes-studio
[Network] Listening: http://127.0.0.1:5173
```

Open your mobile browser (Chrome / Firefox) and go to:
**`http://localhost:5173`**

---

## 4. Key Architecture & Security

- **Strict Loopback Binding:** The server binds strictly to `127.0.0.1`. Other devices on your local Wi-Fi cannot access your phone's terminal or files.
- **Python PTY Bridge:** Uses `android/termux-pty.py` (Python standard library `pty`, `termios`) to give real interactive terminal sessions with job control and Ctrl+C interrupts.
- **Zero Electron Dependencies:** Completely decoupled from desktop Electron binaries.
- **Private Data Storage:** Projects and session data are stored in Termux private home (`~/.local/share/hedes-studio/projects`).
