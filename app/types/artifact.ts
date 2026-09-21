import type { HedesAction } from './actions';

export interface HedesArtifactData {
  id: string;
  title: string;
  type?: string;
  actions?: HedesAction[];
  closed?: boolean;
}

// Backward compatibility alias
export type BoltArtifactData = HedesArtifactData;
