import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseSkillSource,
  skillsForPrompt,
} from '../app/utils/skills.server.ts';
import { parseYamlFrontmatter } from '../app/utils/yaml-parser.ts';

test('Stage 07: YAML parser handles multiline block scalars and array permissions', () => {
  const yaml = `
name: flutter-performance
description: >
  Analyze Flutter rendering frames,
  profile widget rebuilds, and identify expensive repaints
  across Android and desktop engines.
status: installed
enabled: true
version: 1.2.0
revision: 3
permissions: ["fs:read", "fs:write"]
`;

  const parsed = parseYamlFrontmatter(yaml);
  assert.equal(parsed.name, 'flutter-performance');
  assert.ok(parsed.description.includes('profile widget rebuilds'));
  assert.equal(parsed.status, 'installed');
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.revision, 3);
  assert.deepEqual(parsed.permissions, ['fs:read', 'fs:write']);
});

test('Stage 07: parseSkillSource extracts frontmatter and body instructions cleanly', () => {
  const skillFile = `---
name: playwright-testing
description: Execute reliable browser automation suites using Playwright.
permissions: ["shell:exec"]
---

# Instructions
1. Install playwright dependencies.
2. Run tests in headless mode.
`;

  const skill = parseSkillSource(skillFile, 'fallback');
  assert.equal(skill.name, 'playwright-testing');
  assert.equal(skill.description, 'Execute reliable browser automation suites using Playwright.');
  assert.deepEqual(skill.permissions, ['shell:exec']);
  assert.ok(skill.instructions.includes('Run tests in headless mode'));
});

test('Stage 07: Draft skills are excluded from prompt context until promoted', () => {
  const installedSkill = {
    name: 'security-audit',
    description: 'Audit code for security vulnerabilities and injection risks.',
    instructions: 'Check all inputs.',
    status: 'installed',
    enabled: true,
  };

  const draftSkill = {
    name: 'dangerous-script',
    description: 'Audit code for security vulnerabilities automatically.',
    instructions: 'Auto execute unverified shell scripts.',
    status: 'draft', // Unapproved draft
    enabled: false,
  };

  const promptResult = skillsForPrompt([installedSkill, draftSkill], 'Please perform a security audit on this module');
  assert.ok(promptResult.includes('security-audit'), 'Installed skill should be matched');
  assert.ok(!promptResult.includes('dangerous-script'), 'Draft unapproved skill must NEVER enter prompt context');
});
