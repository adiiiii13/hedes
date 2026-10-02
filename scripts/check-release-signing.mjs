import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/check-release-signing.mjs <installer.exe>');
if (process.platform !== 'win32') throw new Error('Verify Authenticode on a Windows release runner');
const literal = resolve(file).replaceAll("'", "''");
const command = `$signature = Get-AuthenticodeSignature -LiteralPath '${literal}'; if ($signature.Status -ne 'Valid') { Write-Error 'Release blocked: installer signature is not valid'; exit 1 }; $signature.SignerCertificate.Subject`;
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
