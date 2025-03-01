import { WorkflowSpec, WorkflowConnections, WorkflowNode, WorkflowSettings, ConnectionItem, NodeConnection } from '../types/workflow';
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

  // Validate connections format - support both formats:
  // 1. Object format: { main: { "Node1": [{ node: "Node2", type: "main", index: 0 }] } }
  // 2. Array format: { main: [{ node: "Jira", type: "main", index: 0 }] }
  let normalizedConnections: WorkflowConnections = { main: {} };
  let useDirectArray = false;

  // Handle different connection formats
  if (input.connections) {
    // If connections main property is an array (direct format from curl example)
    if (input.connections.main && Array.isArray(input.connections.main)) {
      normalizedConnections = input.connections as WorkflowConnections;
      useDirectArray = true;
    }
    // If connections main property is an object (traditional format)
    else if (input.connections.main && typeof input.connections.main === 'object' && !Array.isArray(input.connections.main)) {
      normalizedConnections = input.connections as WorkflowConnections;
      useDirectArray = false;
    }
    // If connections is an array of simple source/target connections (old format)
    else if (Array.isArray(input.connections)) {
      // Decide which format to use - we'll use the object format by default
      const connections: ConnectionItem = {};
      
      // Convert old format to new format
      input.connections.forEach((conn: any) => {
        if (!conn.source || !conn.target) {
          throw new McpError(ErrorCode.InvalidParams, 'Connection must have source and target properties');
        }

        // Find the source and target nodes by ID or name
        let sourceNode = normalizedNodes.find(n => n.id === conn.source);
        let targetNode = normalizedNodes.find(n => n.id === conn.target);
        
        // If we can't find by ID, try to find by name
        if (!sourceNode) {
          sourceNode = normalizedNodes.find(n => n.name === conn.source);
        }
        
        if (!targetNode) {
          targetNode = normalizedNodes.find(n => n.name === conn.target);
        }

        if (!sourceNode || !targetNode) {
          console.warn(`Connection error: Cannot find nodes for connection from ${conn.source} to ${conn.target}`);
          // Skip this connection instead of throwing an error
          return;
        }

        // Initialize connections for this source if needed
        if (!connections[sourceNode.name]) {
          connections[sourceNode.name] = [];
        }

        // Add the connection
        connections[sourceNode.name].push({
          node: targetNode.name,
          type: 'main',
          index: conn.sourceOutput || 0
        });
      });
      
      normalizedConnections = { main: connections };
    }
    // If the connection structure is invalid
    else if (typeof input.connections !== 'object') {
      throw new McpError(ErrorCode.InvalidParams, 'Workflow connections must be an object with a "main" property or an array');
    }
  }
  
  // Always convert to object mapping format for n8n UI compatibility
  if (useDirectArray && normalizedConnections.main && Array.isArray(normalizedConnections.main)) {
    // Convert from array format to object format
    const arrayFormat = normalizedConnections.main as NodeConnection[];
    const connections: ConnectionItem = {};
    
    // For each connection in the array, we need to find the source node
    // This is problematic because the array format doesn't include source info
    // Best we can do is try to infer from the node list or use a default
    
    // Since we can't reliably get the source node from this format,
    // create a default source "Start" node if we have any connections
    if (arrayFormat.length > 0 && normalizedNodes.length > 0) {
      // Find a likely source node - either first node or one named "Start"/"Trigger"
      const sourceNode = normalizedNodes.find(n => 
        n.name === "Start" || n.name === "Trigger" || n.type.includes("trigger")
      ) || normalizedNodes[0];
      
      connections[sourceNode.name] = arrayFormat;
    }
    
    normalizedConnections = { main: connections };
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
