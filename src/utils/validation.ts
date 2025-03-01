import { WorkflowSpec, WorkflowConnections, WorkflowNode, WorkflowSettings, NodeConnection, NodeConnections } from '../types/workflow';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_POSITION } from './positioning';

/**
 * Validates and normalizes a workflow specification
 * @param input The input workflow specification to validate
 * @returns A normalized workflow specification
 */
export function validateWorkflowSpec(input: any): WorkflowSpec {
  if (!input || typeof input !== 'object') {
    throw new McpError(ErrorCode.InvalidParams, 'Workflow spec must be an object');
  }
  
  if (!Array.isArray(input.nodes)) {
    throw new McpError(ErrorCode.InvalidParams, 'Workflow nodes must be an array');
  }
  
  // Ensure all nodes have required fields
  const normalizedNodes: WorkflowNode[] = input.nodes.map((node: any) => {
    if (typeof node !== 'object') {
      throw new McpError(ErrorCode.InvalidParams, 'Node must be an object');
    }
    
    if (typeof node.type !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Node must have a type property');
    }
    
    if (typeof node.name !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Node must have a name property');
    }
    
    // Ensure node has an ID
    const nodeId = node.id || uuidv4();
    
    // Ensure node has a position and normalize to array format if needed
    let position: number[] | { x: number; y: number };
    if (node.position) {
      position = node.position;
    } else if (Array.isArray(DEFAULT_POSITION)) {
      position = [...DEFAULT_POSITION];
    } else {
      // Convert object format to array format if n8n API prefers it
      position = [DEFAULT_POSITION.x, DEFAULT_POSITION.y];
    }
    
    return {
      id: nodeId,
      type: node.type,
      name: node.name,
      parameters: node.parameters || {},
      position: position,
      credentials: node.credentials,
      typeVersion: node.typeVersion || 1,
      disabled: node.disabled || false,
      webhookId: node.webhookId,
      continueOnFail: node.continueOnFail,
      alwaysOutputData: node.alwaysOutputData,
      retryOnFail: node.retryOnFail
    };
  });

  // Create properly formatted connections based on n8n's UI requirements
  // Format: { "NodeName": { "main": [[{...conn}]] } }
  let normalizedConnections: WorkflowConnections = {};

  // Handle different connection formats
  if (input.connections) {
    // If connections is already in the correct format (per-node)
    if (typeof input.connections === 'object' && !Array.isArray(input.connections)) {
      // If it's already in the correct format, just use it directly
      normalizedConnections = input.connections as WorkflowConnections;
    }
    // If connections is an array of source/target connections (MCP format)
    else if (Array.isArray(input.connections)) {
      // Convert from array format to n8n object format
      
      input.connections.forEach((conn: any) => {
        if (!conn.source || !conn.target) {
          throw new McpError(ErrorCode.InvalidParams, 'Connection must have source and target properties');
        }

        // Find the source and target nodes by ID or name
        let sourceNode = normalizedNodes.find(n => n.id === conn.source || n.name === conn.source);
        let targetNode = normalizedNodes.find(n => n.id === conn.target || n.name === conn.target);

        if (!sourceNode || !targetNode) {
          console.warn(`Connection error: Cannot find nodes for connection from ${conn.source} to ${conn.target}`);
          // Skip this connection instead of throwing an error
          return;
        }

        // Initialize connections structure for this source node if needed
        if (!normalizedConnections[sourceNode.name]) {
          normalizedConnections[sourceNode.name] = {
            main: [[]] // Initialize with one output with empty connections
          };
        }

        // Get output index (default to 0)
        const outputIndex = conn.sourceOutput || 0;
        
        // Make sure we have enough arrays for all output indices
        while (normalizedConnections[sourceNode.name].main.length <= outputIndex) {
          normalizedConnections[sourceNode.name].main.push([]);
        }

        // Add the connection to the appropriate output index
        // Use type assertion to avoid TypeScript errors
        (normalizedConnections[sourceNode.name].main[outputIndex] as any).push({
          node: targetNode.name,
          type: 'main',
          index: conn.targetInput || 0
        });
      });
    }
    // If the connection structure is invalid
    else {
      throw new McpError(ErrorCode.InvalidParams, 'Workflow connections must be an object or an array of source/target connections');
    }
  }

  // Ensure workflow has a name
  const name = input.name || 'New Workflow';
  
  // Ensure we have proper settings with executionOrder: v1
  const settings: WorkflowSettings = input.settings || {
    saveExecutionProgress: true,
    saveManualExecutions: true,
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'none'
  };
  
  // Always set executionOrder to v1 for proper UI rendering
  settings.executionOrder = 'v1';

  // Return the validated and normalized workflow spec
  // Create the workflow spec without the 'active' property and 'tags' properties
  // As they are read-only according to the API errors
  const workflowSpec: WorkflowSpec = {
    name,
    nodes: normalizedNodes,
    connections: normalizedConnections,
    settings
    // Do not include tags property as it is read-only
  };

  return workflowSpec;
}
