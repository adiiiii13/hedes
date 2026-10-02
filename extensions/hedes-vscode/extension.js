const vscode = require('vscode');

let statusBarItem;
let bridgeCheckInterval;

function getBridgeUrl() {
  const config = vscode.workspace.getConfiguration('hedes');
  return config.get('bridgeUrl', 'http://127.0.0.1:4200/api/local/vscode');
}

function getProjectId() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return 'default-project';
  return folders[0].name.toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 80);
}

async function sendDiagnostics() {
  const bridgeUrl = getBridgeUrl();
  const projectId = getProjectId();
  const allDiagnostics = vscode.languages.getDiagnostics();
  const formatted = [];

  for (const [uri, diags] of allDiagnostics) {
    if (!diags || diags.length === 0) continue;
    const relPath = vscode.workspace.asRelativePath(uri);
    for (const d of diags) {
      formatted.push({
        file: relPath,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error'
          : d.severity === vscode.DiagnosticSeverity.Warning ? 'warning'
          : d.severity === vscode.DiagnosticSeverity.Information ? 'info' : 'hint',
        message: d.message,
        source: d.source || 'vscode',
      });
    }
  }

  const activeEditor = vscode.window.activeTextEditor;
  const activeFile = activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : undefined;
  const cursor = activeEditor ? {
    line: activeEditor.selection.active.line + 1,
    column: activeEditor.selection.active.character + 1,
  } : undefined;

  try {
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'report-diagnostics',
        projectId,
        diagnostics: formatted.slice(0, 100),
        activeFile,
        cursor,
      }),
    });
    if (res.ok) {
      updateStatusBar(true, formatted.length);
    } else {
      updateStatusBar(false);
    }
  } catch {
    updateStatusBar(false);
  }
}

function updateStatusBar(connected, diagCount = 0) {
  if (!statusBarItem) return;
  if (connected) {
    statusBarItem.text = `$(check) Hedes (${diagCount} issues)`;
    statusBarItem.tooltip = `Connected to Hedes Studio. Forwarded ${diagCount} diagnostics.`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(plug) Hedes (Offline)`;
    statusBarItem.tooltip = 'Hedes Studio is not running or bridge unreachable at ' + getBridgeUrl();
  }
  statusBarItem.show();
}

async function checkBridgeStatus() {
  const bridgeUrl = getBridgeUrl();
  try {
    const res = await fetch(bridgeUrl, { method: 'GET' });
    if (res.ok) {
      updateStatusBar(true);
    } else {
      updateStatusBar(false);
    }
  } catch {
    updateStatusBar(false);
  }
}

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'hedes.openStudio';
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('hedes.openStudio', () => {
      vscode.env.openExternal(vscode.Uri.parse('http://127.0.0.1:4200'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('hedes.sendDiagnostics', async () => {
      await sendDiagnostics();
      vscode.window.showInformationMessage('Diagnostics forwarded to Hedes Studio.');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async () => {
      const config = vscode.workspace.getConfiguration('hedes');
      if (config.get('autoSyncDiagnostics', true)) {
        await sendDiagnostics();
      }
    })
  );

  void checkBridgeStatus();
  bridgeCheckInterval = setInterval(checkBridgeStatus, 30000);
}

function deactivate() {
  if (bridgeCheckInterval) clearInterval(bridgeCheckInterval);
}

module.exports = {
  activate,
  deactivate,
};
