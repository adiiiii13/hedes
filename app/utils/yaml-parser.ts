/**
 * Lightweight, robust, zero-dependency YAML Frontmatter Parser
 * Supports key-values, multiline block scalars (| and >), indented wrapped text, arrays, and quotes.
 */

export interface ParsedYaml {
  [key: string]: any;
}

export function parseYamlFrontmatter(frontmatterStr: string): ParsedYaml {
  const lines = frontmatterStr.split(/\r?\n/);
  const result: ParsedYaml = {};

  let currentKey: string | null = null;
  let multilineType: '|' | '>' | 'indented' | null = null;
  let multilineLines: string[] = [];
  let baseIndent = 0;

  function commitMultiline() {
    if (!currentKey) return;
    if (multilineType === '|') {
      result[currentKey] = multilineLines.join('\n').trimEnd();
    } else if (multilineType === '>') {
      result[currentKey] = multilineLines
        .join('\n')
        .split('\n\n')
        .map((p) => p.replace(/\n/g, ' ').trim())
        .join('\n\n')
        .trim();
    } else {
      result[currentKey] = multilineLines.join(' ').trim();
    }
    currentKey = null;
    multilineType = null;
    multilineLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if continuing multiline block
    if (currentKey && (multilineType === '|' || multilineType === '>')) {
      const matchIndent = line.match(/^(\s+)(.*)$/);
      if (matchIndent && matchIndent[1].length >= baseIndent) {
        multilineLines.push(line.slice(baseIndent));
        continue;
      } else if (line.trim() === '') {
        multilineLines.push('');
        continue;
      } else {
        commitMultiline();
      }
    }

    // Check if continuation of an unquoted/indented multiline string
    if (currentKey && multilineType === 'indented') {
      const matchIndent = line.match(/^\s+(.*)$/);
      if (matchIndent && !line.includes(':')) {
        multilineLines.push(matchIndent[1]);
        continue;
      } else {
        commitMultiline();
      }
    }

    // Skip empty lines or comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match top-level key: value
    const matchKey = line.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
    if (matchKey) {
      commitMultiline();
      const key = matchKey[1].trim();
      let val = matchKey[2].trim();

      if (val === '|' || val === '|-') {
        currentKey = key;
        multilineType = '|';
        baseIndent = (line.match(/^(\s*)/)?.[1].length || 0) + 2;
        continue;
      }

      if (val === '>' || val === '>-') {
        currentKey = key;
        multilineType = '>';
        baseIndent = (line.match(/^(\s*)/)?.[1].length || 0) + 2;
        continue;
      }

      // Check inline arrays [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        result[key] = items;
        continue;
      }

      // Unquote strings
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        result[key] = val.slice(1, -1);
        continue;
      }

      // Boolean and Numbers
      if (val === 'true') {
        result[key] = true;
        continue;
      }
      if (val === 'false') {
        result[key] = false;
        continue;
      }
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        result[key] = Number(val);
        continue;
      }

      // If val is empty, it might be followed by indented list or lines
      if (!val) {
        currentKey = key;
        multilineType = 'indented';
        continue;
      }

      // Plain string
      currentKey = key;
      multilineType = 'indented';
      multilineLines = [val];
    }
  }

  commitMultiline();
  return result;
}

/**
 * Extracts YAML frontmatter and body from Markdown text.
 */
export function extractFrontmatterAndBody(source: string): { frontmatter: ParsedYaml; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: source.trim() };
  }

  const frontmatter = parseYamlFrontmatter(match[1]);
  return { frontmatter, body: match[2].trim() };
}
