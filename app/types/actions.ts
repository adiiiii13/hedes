export type ActionType = 'file' | 'shell' | 'start';

export interface ActionAlert {
  type: 'preview' | 'terminal' | 'action';
  title: string;
  description: string;
  content?: string;
  source?: string;
}

export interface HedesActionData {
  type: ActionType;
  content: string;
  filePath?: string;
}

export interface HedesAction extends HedesActionData {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  error?: string;
}

export interface FileAction extends HedesAction {
  type: 'file';
  filePath: string;
}

export interface ShellAction extends HedesAction {
  type: 'shell';
}

// Backward compatibility aliases
export type BoltActionData = HedesActionData;
export type BoltAction = HedesAction;
