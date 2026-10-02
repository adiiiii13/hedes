import { spawn, type ChildProcess } from 'node:child_process';
import { BrowserWindow, ipcMain } from 'electron';

const active = new Map<number, ChildProcess>();
let trustedOrigin = '';

function runPowerShell(windowId: number, script: string): Promise<string> {
  active.get(windowId)?.kill();
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
  active.set(windowId, child);
  return new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (active.get(windowId) === child) active.delete(windowId);
      if (code === 0) resolve(output.trim());
      else reject(new Error(errors.trim() || `Speech process exited with code ${code ?? 'unknown'}`));
    });
  });
}

function validateVoiceSender(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('Desktop window required');
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('IPC forbidden from subframe');
  }
  if (new URL(event.senderFrame.url).origin !== trustedOrigin) throw new Error('Unauthorized voice IPC origin');
  return window;
}

export function registerVoiceIpc(rendererURL: string): void {
  trustedOrigin = new URL(rendererURL).origin;
  ipcMain.handle('desktop:voiceRecognize', async (event) => {
    const window = validateVoiceSender(event);
    // Quick 5-second window so it never hangs indefinitely
    const script = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $recognizer=New-Object System.Speech.Recognition.SpeechRecognitionEngine; try { $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); $recognizer.SetInputToDefaultAudioDevice(); $result=$recognizer.Recognize([TimeSpan]::FromSeconds(5)); if ($null -ne $result) { [Console]::WriteLine($result.Text) } } finally { $recognizer.Dispose() }`;
    return runPowerShell(window.id, script);
  });
  ipcMain.handle('desktop:voiceSpeak', async (event, rawText: unknown) => {
    const window = validateVoiceSender(event);
    const text = String(rawText || '').slice(0, 650);
    if (!text.trim()) return '';
    const encodedText = Buffer.from(text, 'utf8').toString('base64');
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedText}')); $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.Speak($text); $speaker.Dispose()`;
    return runPowerShell(window.id, script);
  });
  ipcMain.handle('desktop:voiceStop', (event) => {
    const window = validateVoiceSender(event as any);
    active.get(window.id)?.kill();
    active.delete(window.id);
  });
}
