import yauzl from 'yauzl';

/** Enforce limits while inflating, rather than after allocating attacker-controlled output. */
export function readBoundedZip(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(error || new Error('Invalid ZIP')); return; }
      const files = new Map<string, Buffer>();
      let total = 0;
      let count = 0;
      const fail = (error: Error) => { zip.close(); reject(error); };
      zip.on('error', fail);
      zip.on('end', () => resolve(files));
      zip.on('entry', entry => {
        const name = entry.fileName;
        if (++count > 50001 || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
          fail(new Error('Unsafe ZIP path or excessive entry count')); return;
        }
        if (name.endsWith('/')) { zip.readEntry(); return; }
        const limit = name === 'manifest.json' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
        if (files.has(name) || entry.uncompressedSize > limit || total + entry.uncompressedSize > 500 * 1024 * 1024) {
          fail(new Error('Duplicate ZIP entry or expanded size exceeds safety limit')); return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail(error || new Error('Invalid ZIP stream')); return; }
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length; total += chunk.length;
            if (size > limit || total > 500 * 1024 * 1024) {
              stream.destroy(new Error('Backup expanded size exceeds safety limit')); return;
            }
            chunks.push(chunk);
          });
          stream.on('end', () => { files.set(name, Buffer.concat(chunks, size)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}
