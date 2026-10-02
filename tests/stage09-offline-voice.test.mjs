import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {
  OFFICIAL_WHISPER_MODELS,
  listVoiceModels,
  verifyModelIntegrity,
  checkVoiceCapabilities,
  normalizeAudioPcm,
  transcribeLocalAudio,
  processVoiceCommand,
  setVoicePreferences,
  getWhisperModelsDir,
} from '../app/utils/voice.server.ts';

test('Stage 09: Whisper models catalog defines verified models with MIT license and sha256 checksums', async () => {
  assert.ok(OFFICIAL_WHISPER_MODELS['ggml-base']);
  assert.ok(OFFICIAL_WHISPER_MODELS['ggml-tiny']);
  assert.equal(OFFICIAL_WHISPER_MODELS['ggml-base'].license, 'MIT');
  assert.equal(OFFICIAL_WHISPER_MODELS['ggml-tiny'].license, 'MIT');
  assert.equal(typeof OFFICIAL_WHISPER_MODELS['ggml-base'].sha256, 'string');
  assert.equal(OFFICIAL_WHISPER_MODELS['ggml-base'].sha256.length, 64);
});

test('Stage 09: verifyModelIntegrity rejects corrupted or mismatched model files', async () => {
  const modelsDir = await getWhisperModelsDir();
  const testModelPath = path.join(modelsDir, 'ggml-tiny.bin');

  // Write dummy file that doesn't match official hash
  await fs.writeFile(testModelPath, Buffer.from('corrupted model data'));

  try {
    const result = await verifyModelIntegrity('ggml-tiny');
    assert.equal(result.valid, false, 'Corrupted model data should fail checksum verification');
  } finally {
    await fs.unlink(testModelPath).catch(() => {});
  }
});

test('Stage 09: Voice capabilities report offline TTS, whisper models, and cloud privacy boundary', async () => {
  setVoicePreferences({ retention: false, allowCloud: false });
  const caps = await checkVoiceCapabilities();

  assert.ok(caps.whisperCpp);
  assert.ok(Array.isArray(caps.whisperCpp.availableModels));
  assert.equal(caps.whisperCpp.availableModels.length >= 2, true);
  assert.equal(caps.cloudAudioAllowed, false, 'Cloud audio must be false by default');
  assert.equal(caps.recordingRetention, false, 'Recording retention must be false by default');
  assert.ok(caps.tts);
  assert.ok(Array.isArray(caps.tts.installedVoices));
  assert.equal(caps.tts.offlineVerified, false, 'Detection alone must not claim a speech verification');
});

test('Stage 09: normalizeAudioPcm creates valid WAV PCM and measures audio duration', () => {
  // 16,000 samples of 16-bit audio = 32,000 bytes = 1.0 second
  const rawPcm = Buffer.alloc(32000);
  const { wavBuffer, durationMs } = normalizeAudioPcm(rawPcm);

  assert.equal(wavBuffer.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuffer.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(durationMs, 1000, '32,000 bytes at 16kHz 16-bit mono should equal 1000ms');
});

test('Stage 09: transcribeLocalAudio measures latency vs duration and cleans up temporary audio', async () => {
  const rawPcm = Buffer.alloc(32000); // 1 second of audio
  const mockTranscript = 'नमस्ते HEDES, create a new project';

  const result = await transcribeLocalAudio(rawPcm, {
    mockTranscript,
    language: 'hi',
    retention: false,
  });

  assert.equal(result.text, mockTranscript);
  assert.equal(result.language, 'hi');
  assert.equal(result.offline, true);
  assert.equal(result.provider, 'mock');
  assert.ok(result.latencyMs >= 0);
  assert.equal(result.durationMs, 1000);
  assert.ok(result.realtimeFactor >= 0);
  assert.equal(result.retained, false);
});

test('Stage 09: Voice commands enter task pipeline and require approval for action execution', async () => {
  // Test spoken "run website" without approval
  const unapproved = await processVoiceCommand('Please run website now', 'test-proj', { approved: false });
  assert.equal(unapproved.type, 'action');
  assert.equal(unapproved.intent, 'run_website');
  assert.equal(unapproved.requiresApproval, true);
  assert.equal(unapproved.approved, false);
  assert.equal(unapproved.execution?.status, 'pending_approval');

  // Conversational questions don't require command approval
  const conversational = await processVoiceCommand('What is the weather today?', 'test-proj');
  assert.equal(conversational.type, 'query');
  assert.equal(conversational.requiresApproval, false);
});
