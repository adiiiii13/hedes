# HEDES Known Issues & External Blockers

**Release Target:** v1.0.0 Private Beta  
**Date:** October 1, 2026

---

## 1. External Prerequisite Blockers

### 1.1 Authentic Code Signing Certificate (Authenticode)
- **Status:** **BLOCKED FOR PUBLIC DISTRIBUTION**
- **Impact:** The generated installer `dist\hedes-studio-1.0.0-win-x64-setup.exe` is unsigned. When launched on Windows, Microsoft Defender SmartScreen will display an "Unknown Publisher" prompt. Users can click "More info -> Run anyway" to install.
- **Resolution Path:** A public production release requires a valid EV/OV code-signing certificate configured in `electron-builder.yml` (`cscLink` / `cscKeyPassword`).

### 1.2 Physical Android Hardware Testing
- **Status:** **BLOCKED (NO PHYSICAL DEVICE CONNECTED)**
- **Impact:** Android ADB device enumeration (`adb devices`) reported no physical devices attached.
- **Verification Status:** Mobile layout responsiveness, touch-target sizing, and the Termux backend execution adapter are validated in code and tests. Physical on-device audio/TTS validation requires a USB/WiFi connected Android phone running Termux.

### 1.3 Physical Microphone Acoustic Calibration
- **Status:** **REQUIRES USER INTERACTION**
- **Impact:** Offline speech normalization, WAV PCM duration measurement, and fallback cascades pass all automated tests with synthetic and prerecorded audio. Live spoken voice recognition depends on the physical microphone hardware connected to the host machine.

### 1.4 Large GGUF Local Model Downloads
- **Status:** **EXPLICIT USER CONSENT REQUIRED**
- **Impact:** Ollama binary is installed (`C:\Users\adity\AppData\Local\Programs\Ollama\ollama.exe`), but contains 0 pre-downloaded models. The free disk space on C: is ~8.9 GB and free physical RAM is ~5.0 GB. Downloading a 1.5 GB model (e.g. Qwen2.5-Coder) over network was not executed automatically to avoid unconsented bandwidth/disk consumption.
- **Resolution Path:** Users can run `ollama pull qwen2.5-coder:1.5b` or use cloud API keys (Groq, Anthropic, OpenAI) configured in Settings.

---

## 2. Minor Edge-Case Notes

1. **Terminal Process Trees:** On Windows, killing complex spawned process trees relies on `taskkill /pid <pid> /f /t`. If a spawned process acquires administrative locks, taskkill will report access denied.
2. **Web Browser Caching:** When previewing generated web projects, browser aggressive caching can sometimes require clicking the "Reload Frame" button in the Preview toolbar.
