#!/data/data/com.termux/files/usr/bin/bash
# HEDES Studio — Android Termux Setup Script
# Free, local, private mobile setup. Zero cloud dependencies.

set -e

echo "========================================================="
echo "   HEDES STUDIO — ANDROID LOCAL TERMUX INSTALLER"
echo "========================================================="

echo "[1/4] Updating Termux packages..."
pkg update -y

echo "[2/4] Installing Node.js LTS and Python3..."
pkg install -y nodejs-lts python git

echo "[3/4] Initializing Hedes local storage directories..."
mkdir -p "$HOME/.local/share/hedes-studio/projects"
mkdir -p "$HOME/.local/share/hedes-studio/sessions"

echo "[4/4] Setting up execution permissions..."
chmod +x ./android/termux-pty.py
chmod +x ./android/server.mjs

echo "========================================================="
echo "   INSTALLATION COMPLETE!"
echo "========================================================="
echo ""
echo "To start Hedes Studio on your Android device, run:"
echo "   node ./android/server.mjs"
echo ""
echo "Then open Chrome or Firefox and navigate to:"
echo "   http://localhost:5173"
echo "========================================================="
