import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_BASE, validateProjectId, assertProjectPathSafe } from '~/utils/project-dir.server';
import { atomicWriteFile, contentRevision } from '~/utils/atomic-write.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';

export interface DiskProjectMetadata {
  revision?: number;
  id: string;
  title: string;
  model?: string;
  provider?: string;
  createdAt: number;
  updatedAt: number;
  fileCount?: number;
  stack?: string;
  messages?: any[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    await fs.mkdir(PROJECTS_BASE, { recursive: true });
    const entries = await fs.readdir(PROJECTS_BASE, { withFileTypes: true });
    const projectDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

    const projects: DiskProjectMetadata[] = [];

    for (const dir of projectDirs) {
      const dirPath = path.join(PROJECTS_BASE, dir.name);
      try {
        const stat = await fs.stat(dirPath);
        const metaPath = path.join(dirPath, '.hedes_project.json');
        
        let title = dir.name;
        let model = 'Universal';
        let provider = 'Hedes';
        let createdAt = stat.birthtimeMs || stat.mtimeMs;
        let updatedAt = stat.mtimeMs;
        let stack = 'Web';
        let messages: any[] = [];
        let revision = 1;

        // Check if saved .hedes_project.json exists
        try {
          const metaContent = await fs.readFile(metaPath, 'utf-8');
          const meta = JSON.parse(metaContent);
          if (meta.title) title = meta.title;
          if (meta.model) model = meta.model;
          if (meta.provider) provider = meta.provider;
          if (meta.createdAt) createdAt = meta.createdAt;
          if (meta.updatedAt) updatedAt = Math.max(updatedAt, meta.updatedAt);
          if (meta.messages) messages = meta.messages;
          if (Number.isInteger(meta.revision)) revision = meta.revision;
        } catch {
          // If no meta file, infer from project files
          try {
            const pkgPath = path.join(dirPath, 'package.json');
            const pkgContent = await fs.readFile(pkgPath, 'utf-8');
            const pkg = JSON.parse(pkgContent);
            if (pkg.name) title = pkg.name;
            if (pkg.description) title = `${pkg.name} — ${pkg.description}`;
            stack = 'React / Node';
          } catch {
            try {
              const pubspecPath = path.join(dirPath, 'pubspec.yaml');
              const pubspecContent = await fs.readFile(pubspecPath, 'utf-8');
              const nameMatch = pubspecContent.match(/name:\s*([^\r\n]+)/);
              if (nameMatch) title = nameMatch[1].trim();
              stack = 'Flutter / Dart';
            } catch {}
          }
        }

        // Count project files
        let fileCount = 0;
        try {
          const subEntries = await fs.readdir(dirPath);
          fileCount = subEntries.filter((f) => f !== 'node_modules' && f !== '.git').length;
        } catch {}

        projects.push({
          revision,
          id: dir.name,
          title,
          model,
          provider,
          createdAt,
          updatedAt,
          fileCount,
          stack,
          messages,
        });
      } catch (err) {
        console.warn(`Could not read project directory ${dir.name}:`, err);
      }
    }

    // Sort newest first
    projects.sort((a, b) => b.updatedAt - a.updatedAt);

    return json({ projects });
  } catch (err: any) {
    console.error('Failed to list disk projects:', err);
    return json({ error: err.message, projects: [] }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { chatId, title, messages, model, provider, expectedRevision } = body;

    if (!chatId) {
      return json({ error: 'chatId is required' }, { status: 400 });
    }

    const projectId = validateProjectId(chatId);
    const projectDir = path.join(PROJECTS_BASE, projectId);
    await assertProjectPathSafe(PROJECTS_BASE, projectDir);
    await fs.mkdir(projectDir, { recursive: true });

    const metaPath = path.join(projectDir, '.hedes_project.json');
    await assertProjectPathSafe(projectDir, metaPath);
    const original = await fs.readFile(metaPath, 'utf-8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    const existingMeta = original === null ? {} : JSON.parse(original);
    const existingRevision = typeof existingMeta.revision === 'number' ? existingMeta.revision : 1;

    // Stale write rejection: if client sent an expectedRevision that is older than existingRevision
    if (typeof expectedRevision === 'number' && expectedRevision !== existingRevision) {
      return json(
        {
          error: 'Stale revision conflict: project was modified concurrently',
          currentRevision: existingRevision,
        },
        { status: 409 }
      );
    }

    // Dirty check: if title, model, provider and messages are identical, avoid unnecessary disk writes and timestamp updates
    const isTitleEqual = (title || existingMeta.title) === existingMeta.title;
    const isModelEqual = (model || existingMeta.model) === existingMeta.model;
    const isProviderEqual = (provider || existingMeta.provider) === existingMeta.provider;
    const isMessagesEqual = JSON.stringify(messages || []) === JSON.stringify(existingMeta.messages || []);

    if (isTitleEqual && isModelEqual && isProviderEqual && isMessagesEqual && existingMeta.updatedAt) {
      return json({
        success: true,
        unchanged: true,
        project: existingMeta,
        revision: existingRevision,
        savedAt: existingMeta.updatedAt,
      });
    }

    const nextRevision = existingRevision + 1;
    const updatedMeta = {
      ...existingMeta,
      id: projectId,
      title: title || existingMeta.title || projectId,
      messages: messages || existingMeta.messages || [],
      model: model || existingMeta.model,
      provider: provider || existingMeta.provider,
      revision: nextRevision,
      updatedAt: Date.now(),
      createdAt: existingMeta.createdAt || Date.now(),
    };

    // Atomic write pipeline: write to unique temp file, sync to disk, backup previous, then atomic rename
    const backupFile = path.join(projectDir, '.hedes_project.json.bak');
    await assertProjectPathSafe(projectDir, backupFile);
    await atomicWriteFile(metaPath, JSON.stringify(updatedMeta, null, 2), original === null ? null : contentRevision(original));
    if (original !== null) await atomicWriteFile(backupFile, original);

    return json({
      success: true,
      project: updatedMeta,
      revision: nextRevision,
      savedAt: updatedMeta.updatedAt,
    });
  } catch (err: any) {
    console.error('Failed to save project metadata on disk:', err);
    return json({ error: err.message }, { status: /revision conflict/i.test(err.message) ? 409 : 500 });
  }
}
