import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_BASE } from './project-dir.server.ts';
import { getStoragePaths } from './runtime.server.ts';
import { memoryTerms } from '../engine/memory.ts';
import { extractFrontmatterAndBody } from './yaml-parser.ts';

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  status: 'installed' | 'draft' | 'recommended';
  enabled: boolean;
  permissions?: string[];
  compatibility?: string[];
  sourceRunId?: string;
  revision?: number;
}

export interface HedesSkill extends SkillMetadata {
  instructions: string;
}

const base = getStoragePaths().skills;
const legacyBase = path.join(PROJECTS_BASE, '.hedes-skills');

export const RECOMMENDED_SKILLS: HedesSkill[] = [
  {
    name: 'debugging',
    description: 'Investigate a failing app using evidence and reproduce the error before editing.',
    status: 'recommended',
    enabled: true,
    instructions:
      '1. Reproduce the reported failure and capture the exact error.\n2. Trace the failing path to the smallest responsible code.\n3. Change the cause, then rerun the same reproduction.\n4. Run relevant typecheck or tests and report remaining limits.',
  },
  {
    name: 'code-review',
    description: 'Review changes for correctness, security, and regressions.',
    status: 'recommended',
    enabled: true,
    instructions:
      'Read the diff and its callers. Prioritize concrete defects by impact. Cite file and line for each finding. Verify each claim against code or a small reproduction. State remaining test gaps.',
  },
  {
    name: 'accessible-ui',
    description: 'Improve UI text, color contrast, keyboard use, and readable states.',
    status: 'recommended',
    enabled: true,
    instructions:
      'Inspect existing layout and preserve user requested structure. Use readable type sizes and contrast. Check focus states, labels, keyboard navigation, loading, empty, and error states. Test a narrow viewport and reduced motion when feasible.',
  },
  {
    name: 'project-memory',
    description: 'Capture concise durable decisions and reusable project knowledge.',
    status: 'recommended',
    enabled: true,
    instructions:
      'Record only explicit user preferences and verified project facts. Keep each memory short and searchable. Update an existing fact when it changes. Do not store credentials, transient details, or unverified claims.',
  },
];

export function validateSkillName(name: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error('Use a lowercase, hyphenated skill name');
  }
  return name;
}

/**
 * Parses SKILL.md using robust YAML frontmatter parser.
 */
export function parseSkillSource(source: string, fallbackName: string): HedesSkill {
  const { frontmatter, body } = extractFrontmatterAndBody(source);

  const name = validateSkillName(String(frontmatter.name || fallbackName));
  const description = String(frontmatter.description || '').trim();
  if (!description) {
    throw new Error('Skill description is required');
  }

  return {
    name,
    description: description.slice(0, 1000),
    status: (frontmatter.status as any) || 'installed',
    enabled: frontmatter.enabled !== false,
    version: frontmatter.version ? String(frontmatter.version) : '1.0.0',
    revision: Number(frontmatter.revision) || 1,
    permissions: Array.isArray(frontmatter.permissions) ? frontmatter.permissions : [],
    compatibility: Array.isArray(frontmatter.compatibility) ? frontmatter.compatibility : ['all'],
    sourceRunId: frontmatter.sourceRunId ? String(frontmatter.sourceRunId) : undefined,
    instructions: body.slice(0, 15000),
  };
}

/**
 * List all installed and draft skills.
 */
export async function listSkills(): Promise<HedesSkill[]> {
  const readFromDir = async (dir: string): Promise<HedesSkill[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const result: HedesSkill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
      try {
        const filePath = path.join(dir, entry.name, 'SKILL.md');
        const content = await fs.readFile(filePath, 'utf8');
        result.push(parseSkillSource(content, entry.name));
      } catch (error) {
        console.warn(`Skipping invalid skill ${entry.name}:`, error);
      }
    }
    return result;
  };

  const primarySkills = await readFromDir(base);
  const existingNames = new Set(primarySkills.map((s) => s.name));
  const legacySkills = await readFromDir(legacyBase);

  for (const s of legacySkills) {
    if (!existingNames.has(s.name)) {
      primarySkills.push(s);
      existingNames.add(s.name);
    }
  }

  return primarySkills;
}

/**
 * Save an installed or updated skill, preserving history for rollback.
 */
export async function saveSkill(input: Partial<HedesSkill> & { name: string }): Promise<HedesSkill[]> {
  const name = validateSkillName(String(input.name || ''));
  const description = String(input.description || '').trim().slice(0, 1000);
  const instructions = String(input.instructions || '').trim().slice(0, 15000);
  if (!description || !instructions) throw new Error('Description and instructions are required');

  const dir = path.join(base, name);
  const skillFile = path.join(dir, 'SKILL.md');
  const historyDir = path.join(dir, '.history');

  await fs.mkdir(dir, { recursive: true });

  // If previous version exists, archive it for rollback
  let currentRevision = 1;
  try {
    const oldContent = await fs.readFile(skillFile, 'utf8');
    const oldParsed = parseSkillSource(oldContent, name);
    currentRevision = (oldParsed.revision || 1) + 1;

    await fs.mkdir(historyDir, { recursive: true });
    await fs.writeFile(path.join(historyDir, `v${oldParsed.revision || 1}.md`), oldContent, 'utf8');
  } catch {
    // New skill
  }

  const permissionsList = (input.permissions || []).map((p) => `"${p}"`).join(', ');

  const yamlFrontmatter = [
    '---',
    `name: "${name}"`,
    `description: >\n  ${description.replace(/\n/g, '\n  ')}`,
    `status: "${input.status || 'installed'}"`,
    `enabled: ${input.enabled !== false}`,
    `revision: ${currentRevision}`,
    `version: "${input.version || '1.0.0'}"`,
    input.permissions && input.permissions.length > 0 ? `permissions: [${permissionsList}]` : 'permissions: []',
    input.sourceRunId ? `sourceRunId: "${input.sourceRunId}"` : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  await fs.writeFile(skillFile, `${yamlFrontmatter}\n\n${instructions}\n`, 'utf8');
  return listSkills();
}

/**
 * Create a skill draft from an AI task outcome.
 * Drafts are saved with status='draft' and enabled=false pending user review.
 */
export async function createSkillDraft(options: {
  name: string;
  description: string;
  instructions: string;
  sourceRunId: string;
  permissions?: string[];
}): Promise<HedesSkill> {
  const name = validateSkillName(options.name);
  await saveSkill({
    name,
    description: options.description,
    instructions: options.instructions,
    status: 'draft',
    enabled: false,
    sourceRunId: options.sourceRunId,
    permissions: options.permissions || [],
  });

  const all = await listSkills();
  const created = all.find((s) => s.name === name);
  if (!created) throw new Error('Failed to retrieve created draft');
  return created;
}

/**
 * Promote an approved skill draft to enabled active status.
 */
export async function promoteSkill(name: string): Promise<HedesSkill> {
  const cleanName = validateSkillName(name);
  const dir = path.join(base, cleanName);
  const skillFile = path.join(dir, 'SKILL.md');

  const content = await fs.readFile(skillFile, 'utf8');
  const parsed = parseSkillSource(content, cleanName);

  await saveSkill({
    ...parsed,
    status: 'installed',
    enabled: true,
  });

  const all = await listSkills();
  const promoted = all.find((s) => s.name === cleanName);
  if (!promoted) throw new Error('Skill not found after promotion');
  return promoted;
}

/**
 * Rollback a skill to a recorded previous revision.
 */
export async function rollbackSkill(name: string, targetRevision: number): Promise<HedesSkill> {
  const cleanName = validateSkillName(name);
  const dir = path.join(base, cleanName);
  const targetHistoryFile = path.join(dir, '.history', `v${targetRevision}.md`);

  const historyContent = await fs.readFile(targetHistoryFile, 'utf8');
  const skillFile = path.join(dir, 'SKILL.md');
  await fs.writeFile(skillFile, historyContent, 'utf8');

  return parseSkillSource(historyContent, cleanName);
}

export async function deleteSkill(name: string): Promise<HedesSkill[]> {
  await fs.rm(path.join(base, validateSkillName(name)), { recursive: true, force: true });
  return listSkills();
}

/**
 * Select skills relevant to user prompt with selection explanation.
 */
export function skillsForPrompt(skills: HedesSkill[], query: string): string {
  const lower = query.toLowerCase();
  const queryTerms = memoryTerms(query);

  const matching = skills
    .filter((skill) => skill.enabled !== false && skill.status !== 'draft')
    .map((skill) => {
      const explicit = lower.includes(`$${skill.name}`) || lower.includes(`@${skill.name}`);
      const descriptionTerms = memoryTerms(`${skill.name} ${skill.description}`);
      const overlap = descriptionTerms.filter((term) => queryTerms.includes(term)).length;
      return { skill, score: explicit ? 100 : overlap, reason: explicit ? 'explicit_mention' : 'keyword_relevance' };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (matching.length === 0) return '';

  return matching
    .map(
      ({ skill, reason }) =>
        `<skill name="${skill.name}" reason="${reason}">\n${skill.instructions}\n</skill>`
    )
    .join('\n');
}
