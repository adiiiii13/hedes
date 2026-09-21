export interface ProviderInfo {
  name: string;
  staticModels: ModelInfo[];
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;
}

export interface ModelInfo {
  name: string;
  label: string;
  provider: string;
  maxTokenAllowed?: number;
  isCustom?: boolean;
}

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  label?: string;
  enabled: boolean;
  createdAt: number;
}

export interface ProviderSettings {
  [providerName: string]: {
    apiKey?: string;
    baseUrl?: string;
    enabled?: boolean;
  };
}
