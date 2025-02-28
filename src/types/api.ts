import { ExecutionData, ExecutionMode } from './execution';

export interface N8NWorkflowResponse {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a full workflow execution response from n8n API
 */
export interface N8NExecutionResponse {
  id: number;
  data?: ExecutionData;
  finished: boolean;
  mode: ExecutionMode;
  retryOf?: number | null;
  retrySuccessId?: number | null;
  startedAt: string;
  stoppedAt: string;
  workflowId: number;
  waitTill?: string | null;
  customData?: {
    [key: string]: any;
  };
}

/**
 * Response structure when listing executions
 */
export interface N8NExecutionListResponse {
  data: N8NExecutionResponse[];
  nextCursor?: string;
}

/**
 * Standard error response structure
 */
export interface N8NErrorResponse {
  error: string;
}

/**
 * Node information structure from GitHub
 */
export interface NodeInfo {
  name: string;
  displayName: string;
  description: string;
  documentationUrl?: string;
  readmePath?: string;
  readmeContent?: string;
}

/**
 * Response for node listing
 */
export interface NodeListResponse {
  nodes: NodeInfo[];
}
