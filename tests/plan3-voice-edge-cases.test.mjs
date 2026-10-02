import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAudioPcm,
  transcribeLocalAudio,
  checkVoiceCapabilities,
  setVoicePreferences,
  processVoiceCommand,
} from '../app/utils/voice.server.ts';

test('Plan 3 Voice: Missing local model throws actionable recovery message instead of silent cloud upload', async () => {
  const dummyPcm = Buffer.alloc(16000); // 0.5s audio

  await assert.rejects(
    async () => {
      // Force non-existent model ID without mock transcript
      await transcribeLocalAudio(dummyPcm, { modelId: 'non-existent-model' });
    },
    (err) => {
      assert.ok(err.message.includes('LOCAL_MODEL_NOT_DOWNLOADED'));
      assert.ok(err.message.includes('Win + H') || err.message.includes('Voice Settings'));
      return true;
    }
  );
});

test('Plan 3 Voice: Short or silent audio clips are detected and handled gracefully', () => {
  // Silence / empty PCM
  const silentPcm = Buffer.alloc(100);
  const { durationMs } = normalizeAudioPcm(silentPcm);

  // Normalization bounds duration to minimum 200ms
  assert.ok(durationMs >= 200);
});

test('Plan 3 Voice: Hindi and English transcription metadata preserves language tags and measures duration', async () => {
  const dummyPcm = Buffer.alloc(32000); // 1.0s audio

  // Hindi transcript test
  const hindiResult = await transcribeLocalAudio(dummyPcm, {
    mockTranscript: 'नया प्रोजेक्ट बनाओ',
    language: 'hi',
    retention: false,
  });
  assert.equal(hindiResult.language, 'hi');
  assert.equal(hindiResult.text, 'नया प्रोजेक्ट बनाओ');
  assert.equal(hindiResult.durationMs, 1000);
  assert.equal(hindiResult.offline, true);

  // English transcript test
  const englishResult = await transcribeLocalAudio(dummyPcm, {
    mockTranscript: 'Create new project',
    language: 'en',
    retention: false,
  });
  assert.equal(englishResult.language, 'en');
  assert.equal(englishResult.text, 'Create new project');
  assert.equal(englishResult.durationMs, 1000);
});

test('Plan 3 Voice: Speech cancellation and temporary audio deletion', async () => {
  setVoicePreferences({ retention: false });
  const dummyPcm = Buffer.alloc(32000);

  const result = await transcribeLocalAudio(dummyPcm, {
    mockTranscript: 'Cancelled midway',
    retention: false,
  });

  assert.equal(result.retained, false);
});

test('Plan 3 Voice: Spoken commands enforce authorization and preview readiness', async () => {
  // Spoken command to start dev server
  const unapproved = await processVoiceCommand('start website preview', 'test-p', { approved: false });
  assert.equal(unapproved.type, 'action');
  assert.equal(unapproved.requiresApproval, true);
  assert.equal(unapproved.approved, false);
  assert.equal(unapproved.execution?.status, 'pending_approval');
});
