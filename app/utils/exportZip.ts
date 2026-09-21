import JSZip from 'jszip';
import { files, activeProjectName } from '~/stores/workspace';

export async function downloadProjectAsZip() {
  let currentFiles = files.get();
  let fileEntries = Object.entries(currentFiles);

  // If in-memory files are empty, fetch directly from local project fs
  if (fileEntries.length === 0) {
    try {
      const { currentChatId } = await import('~/stores/chat');
      const chatId = currentChatId.get();
      const res = await fetch(`/api/local/fs?chatId=${chatId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.files && Object.keys(data.files).length > 0) {
          files.set(data.files);
          currentFiles = data.files;
          fileEntries = Object.entries(currentFiles);
        }
      }
    } catch (err) {
      console.error('Failed to load project files for zip export:', err);
    }
  }

  if (fileEntries.length === 0) {
    alert('No project files to export.');
    return;
  }

  const zip = new JSZip();
  const projName = activeProjectName.get() || 'hedes-project';

  for (const [filePath, content] of fileEntries) {
    if (
      filePath.startsWith('node_modules/') ||
      filePath.startsWith('.git/') ||
      filePath.startsWith('.vite/') ||
      filePath.startsWith('dist/')
    ) {
      continue;
    }
    zip.file(filePath, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
