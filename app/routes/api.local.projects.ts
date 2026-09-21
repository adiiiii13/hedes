import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_BASE } from '~/utils/project-dir.server';

export interface DiskProjectMetadata {
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
  try {
    await fs.mkdir(PROJECTS_BASE, { recursive: true });
    const entries = await fs.readdir(PROJECTS_BASE, { withFileTypes: true });
    const projectDirs = entries.filter((e) => e.isDirectory());

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
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { chatId, title, messages, model, provider } = body;

    if (!chatId) {
      return json({ error: 'chatId is required' }, { status: 400 });
    }

    const projectDir = path.join(PROJECTS_BASE, path.basename(chatId));
    await fs.mkdir(projectDir, { recursive: true });

    const metaPath = path.join(projectDir, '.hedes_project.json');
    const existingMeta = await fs.readFile(metaPath, 'utf-8').then(JSON.parse).catch(() => ({}));

    const updatedMeta = {
      ...existingMeta,
      id: chatId,
      title: title || existingMeta.title || chatId,
      messages: messages || existingMeta.messages || [],
      model: model || existingMeta.model,
      provider: provider || existingMeta.provider,
      updatedAt: Date.now(),
      createdAt: existingMeta.createdAt || Date.now(),
    };

    await fs.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2), 'utf-8');

    return json({ success: true, project: updatedMeta });
  } catch (err: any) {
    console.error('Failed to save project metadata on disk:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
