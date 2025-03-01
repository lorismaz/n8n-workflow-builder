export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  parameters?: Record<string, any>;
  position: number[] | { x: number; y: number }; // Support both formats: [x, y] or {x, y}
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
  typeVersion?: number;
  webhookId?: string;
  
  // Node execution behavior
  continueOnFail?: boolean; // Deprecated, use onError instead
  onError?: string; // How to handle errors ('stopWorkflow' etc.)
  alwaysOutputData?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  
  // UI display options
  executeOnce?: boolean;
  notesInFlow?: boolean;
  notes?: string;
}

export interface NodeConnection {
  node: string;  // Target node ID
  type: 'main';  // Connection type (n8n uses 'main' for standard connections)
  index: number; // Output index from source node
}

export interface NodeConnections {
  main: NodeConnection[][][]; // Triple-nested array: [output_index][connection_group][connection]
}

export interface WorkflowConnections {
  [sourceNodeName: string]: NodeConnections;
}

export interface WorkflowSettings {
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  saveDataErrorExecution?: 'all' | 'none';
  saveDataSuccessExecution?: 'all' | 'none';
  executionTimeout?: number; // in seconds
  errorWorkflow?: string;
  timezone?: string;
  executionOrder?: string; // v1 is latest for n8n, needed for proper UI rendering
}

export interface WorkflowSpec {
  name: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnections | Record<string, any>; // Allow both our type and raw object
  settings?: WorkflowSettings;
  staticData?: Record<string, any>;
  // The following properties are read-only according to API errors
  // active?: boolean; 
  // tags?: string[];
}
