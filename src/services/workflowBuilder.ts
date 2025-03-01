import { 
  WorkflowSpec, 
  WorkflowNode, 
  WorkflowConnections, 
  NodeConnection,
  NodeConnections,
  WorkflowSettings
} from '../types/workflow';
import { 
  calculateNextPosition, 
  calculateBranchPosition, 
  DEFAULT_POSITION 
} from '../utils/positioning';
import { v4 as uuidv4 } from 'uuid';

/**
 * Builder class for creating n8n workflows programmatically
 */
export class WorkflowBuilder {
  private nodes: WorkflowNode[] = [];
  private connections: Record<string, any> = {};
  private useDirectConnectionsArray: boolean = false; // Flag to use array instead of object for connections (deprecated - causing issues)
  private nextPosition = { ...DEFAULT_POSITION };
  private workflowName: string = 'New Workflow';
  private workflowSettings: WorkflowSettings = {
    saveExecutionProgress: true,
    saveManualExecutions: true,
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'none',
    executionOrder: 'v1' // Use the latest execution order for proper UI rendering
  };
  private workflowActive: boolean = false;
  private workflowTags: string[] = [];

  /**
   * Set the workflow name
   * @param name The name for the workflow
   * @returns The builder instance for method chaining
   */
  setName(name: string): WorkflowBuilder {
    this.workflowName = name;
    return this;
  }

  /**
   * Configure workflow settings
   * @param settings The settings to apply
   * @returns The builder instance for method chaining
   */
  setSettings(settings: WorkflowSettings): WorkflowBuilder {
    this.workflowSettings = { ...this.workflowSettings, ...settings };
    return this;
  }

  /**
   * Set workflow active status
   * Note: This won't have effect during workflow creation as 'active' is a read-only property.
   * To activate a workflow, use the n8nApi.activateWorkflow() method after creation.
   * @param active Whether the workflow should be active
   * @returns The builder instance for method chaining
   * @deprecated Use n8nApi.activateWorkflow() instead after creating the workflow
   */
  setActive(active: boolean): WorkflowBuilder {
    console.warn("'active' is a read-only property during workflow creation. " +
      "Use n8nApi.activateWorkflow() after creating the workflow instead.");
    this.workflowActive = active;
    return this;
  }

  /**
   * Set workflow tags
   * @param tags Array of tag IDs to assign to the workflow
   * @returns The builder instance for method chaining
   */
  setTags(tags: string[]): WorkflowBuilder {
    this.workflowTags = [...tags];
    return this;
  }
  
  /**
   * Set the connection format to use direct array instead of object mapping
   * DEPRECATED: This method is kept for backward compatibility but will always use
   * the object mapping format since the array format causes issues in the n8n UI.
   * 
   * @param useDirectArray Ignored, will always use object mapping
   * @returns The builder instance for method chaining
   */
  setConnectionFormat(useDirectArray: boolean): WorkflowBuilder {
    // Force object mapping format
    this.useDirectConnectionsArray = false;
    this.connections = {}; // Will be built per node in the correct format
    
    console.warn("Array format for connections is not supported by n8n UI. Using object mapping format instead.");
    
    return this;
  }

  /**
   * Reset the next position to the default starting position
   * @returns The builder instance for method chaining
   */
  resetPosition(): WorkflowBuilder {
    this.nextPosition = { ...DEFAULT_POSITION };
    return this;
  }

  /**
   * Add a trigger node to start the workflow
   * @param type The type of trigger node
   * @param name The name of the node
   * @param parameters Optional parameters for the node
   * @param credentials Optional credentials for the node
   * @returns The added node
   */
  addTrigger(
    type: string, 
    name: string,
    parameters: Record<string, any> = {},
    credentials?: Record<string, { id: string; name: string }>
  ): WorkflowNode {
    // For triggers, use default start position
    // Using array format for position since n8n API seems to prefer it
    const position = [DEFAULT_POSITION.x, DEFAULT_POSITION.y];
    this.nextPosition = calculateNextPosition(DEFAULT_POSITION);
    
    return this.addNode({
      id: uuidv4(),
      name,
      type,
      parameters,
      position,
      credentials,
      typeVersion: 1
    });
  }

  /**
   * Add a regular node to the workflow
   * @param type The type of node
   * @param name The name of the node
   * @param parameters Optional parameters for the node
   * @param credentials Optional credentials for the node
   * @param position Optional position for manual placement
   * @returns The added node
   */
  addNode(
    nodeData: Partial<WorkflowNode> & { type: string; name: string; }
  ): WorkflowNode {
    // Create position in array format for n8n API compatibility
    let position: number[] | { x: number; y: number };
    
    if (nodeData.position) {
      position = nodeData.position;
    } else {
      // Convert to array format for API compatibility
      position = [this.nextPosition.x, this.nextPosition.y];
    }
    
    const node: WorkflowNode = {
      id: nodeData.id || uuidv4(),
      type: nodeData.type,
      name: nodeData.name,
      parameters: nodeData.parameters || {},
      position: position,
      typeVersion: nodeData.typeVersion || 1,
      credentials: nodeData.credentials
    };

    // If position was not explicitly provided, update the next position
    if (!nodeData.position) {
      this.nextPosition = calculateNextPosition(this.nextPosition);
    }

    this.nodes.push(node);
    return node;
  }

  /**
   * Add multiple node branches from a single node
   * @param sourceNodeId ID of the source node
   * @param branchTypes Array of branch node configurations
   * @returns Array of created branch nodes
   */
  addBranches(
    sourceNodeId: string,
    branchTypes: Array<{ type: string; name: string; parameters?: Record<string, any>; credentials?: Record<string, { id: string; name: string }> }>
  ): WorkflowNode[] {
    // Find source node position
    const sourceNode = this.nodes.find(node => node.id === sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Source node with ID ${sourceNodeId} not found`);
    }

    const branchNodes: WorkflowNode[] = [];
    
    // Calculate branch positions and create nodes
    branchTypes.forEach((branchConfig, index) => {
      // Get branch position and convert to array format
      let sourcePos: { x: number; y: number };
      
      if (Array.isArray(sourceNode.position)) {
        sourcePos = { x: sourceNode.position[0], y: sourceNode.position[1] };
      } else {
        sourcePos = sourceNode.position as { x: number; y: number };
      }
      
      const posObj = calculateBranchPosition(
        sourcePos,
        index,
        branchTypes.length
      );
      
      const position = [posObj.x, posObj.y];
      
      const branchNode = this.addNode({
        type: branchConfig.type,
        name: branchConfig.name,
        parameters: branchConfig.parameters || {},
        credentials: branchConfig.credentials,
        position
      });
      
      branchNodes.push(branchNode);
      
      // Connect source to this branch
      this.connectNodes(sourceNode.id, branchNode.id, 0);
    });
    
    return branchNodes;
  }

  /**
   * Connect two nodes in the workflow
   * @param sourceNodeId ID of the source node
   * @param targetNodeId ID of the target node
   * @param outputIndex Index of the output from the source node (default: 0)
   * @returns The builder instance for method chaining
   */
  connectNodes(
    sourceNodeId: string,
    targetNodeId: string,
    outputIndex: number = 0
  ): WorkflowBuilder {
    // Verify both nodes exist
    const sourceExists = this.nodes.some(node => node.id === sourceNodeId);
    const targetExists = this.nodes.some(node => node.id === targetNodeId);
    
    if (!sourceExists || !targetExists) {
      throw new Error('Cannot connect nodes: one or both nodes do not exist');
    }
    
    // Get the source and target nodes
    const sourceNode = this.nodes.find(node => node.id === sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Source node ${sourceNodeId} not found`);
    }
    
    const targetNode = this.nodes.find(node => node.id === targetNodeId);
    if (!targetNode) {
      throw new Error(`Target node ${targetNodeId} not found`);
    }

    // Create the connection using the target node's name (not ID)
    // This is critical for n8n UI rendering
    const connection: NodeConnection = {
      node: targetNode.name,
      type: 'main',
      index: outputIndex
    };
    
    // Create the correct connection structure for n8n UI
    // Format: { "NodeName": { "main": [ [{...connections}] ] } }
    
    // Initialize structure for this source node if needed
    if (!this.connections[sourceNode.name]) {
      this.connections[sourceNode.name] = {
        main: [[]] // Initialize with one output port with empty connections
      };
    } else if (!this.connections[sourceNode.name].main) {
      this.connections[sourceNode.name].main = [[]];
    }
    
    // Make sure we have enough arrays for the requested output index
    while (this.connections[sourceNode.name].main.length <= outputIndex) {
      this.connections[sourceNode.name].main.push([]);
    }
    
    // Add the connection to the proper output port
    this.connections[sourceNode.name].main[outputIndex].push(connection);
    
    return this;
  }

  /**
   * Generate the final workflow specification
   * @returns Complete workflow specification ready for the n8n API
   */
  exportWorkflow(): WorkflowSpec {
    // Support for static data if needed by advanced workflows
    const staticData = { lastId: 1 };
    
    // Don't include 'active' or 'tags' properties when creating the workflow
    // API errors indicate these are read-only properties
    return {
      name: this.workflowName,
      nodes: this.nodes,
      connections: this.connections,
      settings: this.workflowSettings,
      staticData: staticData
      // tags property removed as it causes a 400 error
    };
  }

  /**
   * Clear all nodes and connections to start building a new workflow
   * @returns The builder instance for method chaining
   */
  clear(): WorkflowBuilder {
    this.nodes = [];
    this.connections = {}; // Empty object - connections will be built per node
    this.nextPosition = { ...DEFAULT_POSITION };
    return this;
  }
}
