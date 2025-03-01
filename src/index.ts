#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema 
} from './sdk-schemas';
import * as n8nApi from './services/n8nApi';
import { marked } from 'marked';
import { WorkflowBuilder } from './services/workflowBuilder';
import { validateWorkflowSpec } from './utils/validation';
import { WorkflowSettings } from './types/workflow';

console.log("ListToolsRequestSchema:", ListToolsRequestSchema);
console.log("CallToolRequestSchema:", CallToolRequestSchema);

if (!ListToolsRequestSchema) {
  console.error("ListToolsRequestSchema is undefined!");
}

if (!CallToolRequestSchema) {
  console.error("CallToolRequestSchema is undefined!");
}

class N8NWorkflowServer {
  private server: InstanceType<typeof Server>;

  constructor() {
    this.server = new Server(
      { name: 'n8n-workflow-builder', version: '0.3.0' },
      { capabilities: { tools: {}, resources: {} } }
    );
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.server.onerror = (error: any) => console.error('[MCP Error]', error);
  }

  private setupResourceHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      console.log("listResources handler invoked");
      return {
        resources: [
          {
            uri: '/workflows',
            name: 'Workflows List',
            description: 'List of all available workflows',
            mimeType: 'application/json'
          },
          {
            uri: '/execution-stats',
            name: 'Execution Statistics',
            description: 'Summary statistics of workflow executions',
            mimeType: 'application/json'
          },
          {
            uri: '/nodes',
            name: 'n8n Nodes',
            description: 'List of all available n8n nodes from GitHub',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // List resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      console.log("listResourceTemplates handler invoked");
      return {
        templates: [
          {
            uriTemplate: '/workflows/{id}',
            name: 'Workflow Details',
            description: 'Details of a specific workflow',
            mimeType: 'application/json',
            parameters: [
              {
                name: 'id',
                description: 'The ID of the workflow',
                required: true
              }
            ]
          },
          {
            uriTemplate: '/executions/{id}',
            name: 'Execution Details',
            description: 'Details of a specific execution',
            mimeType: 'application/json',
            parameters: [
              {
                name: 'id',
                description: 'The ID of the execution',
                required: true
              }
            ]
          },
          {
            uriTemplate: '/nodes/{name}',
            name: 'Node Details',
            description: 'Details and documentation for a specific n8n node',
            mimeType: 'application/json',
            parameters: [
              {
                name: 'name',
                description: 'The name of the node',
                required: true
              }
            ]
          }
        ]
      };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      console.log(`readResource handler invoked for URI: ${uri}`);
      
      // Static resources
      if (uri === '/workflows') {
        const workflows = await n8nApi.listWorkflows();
        return {
          contents: [{
            type: 'text',
            text: JSON.stringify(workflows, null, 2),
            mimeType: 'application/json',
            uri: '/workflows'
          }]
        };
      }
      
      if (uri === '/execution-stats') {
        try {
          const executions = await n8nApi.listExecutions({ limit: 100 });
          
          // Calculate statistics
          const total = executions.data.length;
          const succeeded = executions.data.filter(exec => exec.finished && exec.mode !== 'error').length;
          const failed = executions.data.filter(exec => exec.mode === 'error').length;
          const waiting = executions.data.filter(exec => !exec.finished).length;
          
          // Calculate average execution time for finished executions
          let totalTimeMs = 0;
          let finishedCount = 0;
          for (const exec of executions.data) {
            if (exec.finished && exec.startedAt && exec.stoppedAt) {
              const startTime = new Date(exec.startedAt).getTime();
              const endTime = new Date(exec.stoppedAt).getTime();
              totalTimeMs += (endTime - startTime);
              finishedCount++;
            }
          }
          
          const avgExecutionTimeMs = finishedCount > 0 ? totalTimeMs / finishedCount : 0;
          const avgExecutionTime = `${(avgExecutionTimeMs / 1000).toFixed(2)}s`;
          
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify({
                total,
                succeeded,
                failed,
                waiting,
                avgExecutionTime
              }, null, 2),
              mimeType: 'application/json',
              uri: '/execution-stats'
            }]
          };
        } catch (error) {
          console.error('Error generating execution stats:', error);
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify({
                total: 0,
                succeeded: 0,
                failed: 0,
                waiting: 0,
                avgExecutionTime: '0s',
                error: 'Failed to retrieve execution statistics'
              }, null, 2),
              mimeType: 'application/json',
              uri: '/execution-stats'
            }]
          };
        }
      }
      
      // Provide a list of all available n8n nodes
      if (uri === '/nodes') {
        try {
          const nodesResponse = await n8nApi.listNodes();
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify(nodesResponse, null, 2),
              mimeType: 'application/json',
              uri: '/nodes'
            }]
          };
        } catch (error) {
          console.error('Error fetching nodes list:', error);
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify({
                nodes: [],
                error: 'Failed to retrieve nodes from GitHub'
              }, null, 2),
              mimeType: 'application/json',
              uri: '/nodes'
            }]
          };
        }
      }
      
      
      // Dynamic resource template matching
      const workflowMatch = uri.match(/^\/workflows\/(.+)$/);
      if (workflowMatch) {
        const id = workflowMatch[1];
        try {
          const workflow = await n8nApi.getWorkflow(id);
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify(workflow, null, 2),
              mimeType: 'application/json',
              uri: uri
            }]
          };
        } catch (error) {
          throw new McpError(ErrorCode.InvalidParams, `Workflow with ID ${id} not found`);
        }
      }
      
      const executionMatch = uri.match(/^\/executions\/(.+)$/);
      if (executionMatch) {
        const id = parseInt(executionMatch[1], 10);
        if (isNaN(id)) {
          throw new McpError(ErrorCode.InvalidParams, 'Execution ID must be a number');
        }
        
        try {
          const execution = await n8nApi.getExecution(id, true);
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify(execution, null, 2),
              mimeType: 'application/json',
              uri: uri
            }]
          };
        } catch (error) {
          throw new McpError(ErrorCode.InvalidParams, `Execution with ID ${id} not found`);
        }
      }
      
      // Get details for a specific node
      const nodeMatch = uri.match(/^\/nodes\/(.+)$/);
      if (nodeMatch) {
        const nodeName = nodeMatch[1];
        
        try {
          // Get detailed node information
          const nodeInfo = await n8nApi.getNodeInfo(nodeName);
          
          
          return {
            contents: [{
              type: 'text',
              text: JSON.stringify(nodeInfo, null, 2),
              mimeType: 'application/json',
              uri: uri
            }]
          };
        } catch (error) {
          console.error(`Error fetching node info for ${nodeName}:`, error);
          throw new McpError(ErrorCode.InvalidParams, `Node with name ${nodeName} not found or could not be fetched`);
        }
      }
      
      throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
    });
  }

  private setupToolHandlers() {
    // Register available tools using the local schemas and return an array of tool definitions.
    this.server.setRequestHandler(ListToolsRequestSchema, async (req: any) => {
      console.log("listTools handler invoked with request:", req);
      return {
        tools: [
          // Workflow Tools
          {
            name: 'list_workflows',
            enabled: true,
            description: 'List all workflows from n8n',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'create_workflow',
            enabled: true,
            description: 'Create a new workflow in n8n. Node types must include full prefix (e.g., "n8n-nodes-base.webhook", not just "webhook"). Do not include "tags" or "active" properties as they are read-only.',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { 
                        type: 'string',
                        description: 'Full node type identifier including namespace (e.g., "n8n-nodes-base.webhook")'
                      },
                      name: { type: 'string' },
                      parameters: { type: 'object' },
                      position: {
                        type: 'array',
                        items: { type: 'number' },
                        description: 'Node position as [x, y] coordinates'
                      }
                    },
                    required: ['type', 'name']
                  }
                },
                connections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      source: { type: 'string' },
                      target: { type: 'string' },
                      sourceOutput: { type: 'number', default: 0 },
                      targetInput: { type: 'number', default: 0 }
                    },
                    required: ['source', 'target']
                  }
                },
                settings: {
                  type: 'object',
                  properties: {
                    saveExecutionProgress: { type: 'boolean' },
                    saveManualExecutions: { type: 'boolean' }
                  }
                }
              },
              required: ['nodes']
            }
          },
          {
            name: 'get_workflow',
            enabled: true,
            description: 'Get a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id']
            }
          },
          {
            name: 'update_workflow',
            enabled: true,
            description: 'Update an existing workflow',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                nodes: { type: 'array' },
                connections: { type: 'array' }
              },
              required: ['id', 'nodes']
            }
          },
          {
            name: 'delete_workflow',
            enabled: true,
            description: 'Delete a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id']
            }
          },
          {
            name: 'activate_workflow',
            enabled: true,
            description: 'Activate a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id']
            }
          },
          {
            name: 'deactivate_workflow',
            enabled: true,
            description: 'Deactivate a workflow by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id']
            }
          },
          
          // Node Tools
          {
            name: 'list_nodes',
            enabled: true,
            description: 'List all available n8n nodes from GitHub',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_node_info',
            enabled: true,
            description: 'Get detailed information and documentation for a specific n8n node',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              },
              required: ['name']
            }
          },
          
          // Execution Tools
          {
            name: 'list_executions',
            enabled: true,
            description: 'List all executions from n8n with optional filters',
            inputSchema: {
              type: 'object',
              properties: {
                includeData: { type: 'boolean' },
                status: { 
                  type: 'string',
                  enum: ['error', 'success', 'waiting']
                },
                workflowId: { type: 'string' },
                projectId: { type: 'string' },
                limit: { type: 'number' },
                cursor: { type: 'string' }
              }
            }
          },
          {
            name: 'get_execution',
            enabled: true,
            description: 'Get details of a specific execution by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                includeData: { type: 'boolean' }
              },
              required: ['id']
            }
          },
          {
            name: 'delete_execution',
            enabled: true,
            description: 'Delete an execution by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number' }
              },
              required: ['id']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      console.log("callTool handler invoked with request:", request);
      
      try {
        const { name, arguments: args } = request.params;
        
        switch (name) {
          // Workflow Tools
          case 'list_workflows':
            const workflows = await n8nApi.listWorkflows();
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(workflows, null, 2) 
              }]
            };
            
          case 'create_workflow':
            if (!args.name) {
              args.name = 'New Workflow';
            }
            
            // Use WorkflowBuilder to create the workflow
            const builder = new WorkflowBuilder();
            
            // Set workflow name
            builder.setName(args.name);
            
            // Add settings if provided, merging with defaults
            // Ensure executionOrder is set to 'v1' for proper UI rendering
            const defaultSettings: WorkflowSettings = {
              saveExecutionProgress: true,
              saveManualExecutions: true,
              saveDataErrorExecution: 'all',
              saveDataSuccessExecution: 'none',
              executionOrder: 'v1'
            };
            
            if (args.settings) {
              // Keep executionOrder as v1 even if user tries to override it
              const mergedSettings: WorkflowSettings = { 
                ...defaultSettings, 
                ...args.settings, 
                executionOrder: 'v1' 
              };
              builder.setSettings(mergedSettings);
            } else {
              builder.setSettings(defaultSettings);
            }
            
            // Add all nodes to the workflow
            const nodesMap = new Map();
            let lastX = 100;
            const baseY = 240;
            
            for (const nodeData of args.nodes) {
              // If position not specified, calculate it to ensure proper spacing
              let position;
              if (!nodeData.position) {
                position = [lastX, baseY];
                lastX += 200; // Ensure nodes have proper spacing
              } else {
                position = nodeData.position;
              }
              
              const node = builder.addNode({
                type: nodeData.type,
                name: nodeData.name,
                parameters: nodeData.parameters || {},
                position: position,
                typeVersion: nodeData.typeVersion || 1,
                disabled: nodeData.disabled || false
              });
              nodesMap.set(nodeData.name, node);
            }
            
            // Add connections to builder (we'll override the format later)
            if (args.connections && Array.isArray(args.connections)) {
              for (const conn of args.connections) {
                const sourceNode = nodesMap.get(conn.source);
                const targetNode = nodesMap.get(conn.target);
                
                if (sourceNode && targetNode) {
                  builder.connectNodes(
                    sourceNode.id, 
                    targetNode.id,
                    conn.sourceOutput || 0
                  );
                } else {
                  console.warn(`Could not find nodes for connection: ${conn.source} -> ${conn.target}`);
                }
              }
            }
            
            // Export the workflow specification
            const workflowSpec = builder.exportWorkflow();
            
            // Override connection format to match the correct n8n format
            if (args.connections && Array.isArray(args.connections)) {
              // Create a proper connections structure: { "NodeName": { "main": [ [{...}] ] } }
              const connectionStructure: Record<string, any> = {};
              
              for (const conn of args.connections) {
                if (!connectionStructure[conn.source]) {
                  // Initialize the structure for this source node
                  connectionStructure[conn.source] = {
                    main: []
                  };
                }
                
                // Create arrays for each output index
                const outputIndex = conn.sourceOutput || 0;
                
                // Make sure we have enough arrays for this output index
                while (connectionStructure[conn.source].main.length <= outputIndex) {
                  connectionStructure[conn.source].main.push([]);
                }
                
                // Add this connection to the appropriate output index array
                connectionStructure[conn.source].main[outputIndex].push({
                  node: conn.target,
                  type: 'main',
                  index: conn.targetInput || 0
                });
              }
              
              // Replace the connections in the workflow spec
              workflowSpec.connections = connectionStructure;
            }
            
            console.log('Creating workflow with spec:', JSON.stringify(workflowSpec, null, 2));
            
            // Create the workflow in n8n
            try {
              const createdWorkflow = await n8nApi.createWorkflow(workflowSpec);
              return {
                content: [{ 
                  type: 'text', 
                  text: JSON.stringify(createdWorkflow, null, 2) 
                }]
              };
            } catch (error) {
              console.error('Error creating workflow:', error);
              
              // Log detailed error if available
              if (error instanceof Error) {
                console.error('Error details:', error.message);
                if ('response' in error && error.response) {
                  // @ts-ignore
                  console.error('Response data:', error.response.data);
                }
              }
              
              throw new McpError(ErrorCode.InternalError, 
                `Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`);
            }
            
          case 'get_workflow':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
            }
            
            const workflow = await n8nApi.getWorkflow(args.id);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(workflow, null, 2) 
              }]
            };
            
          case 'update_workflow':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
            }
            
            const updatedWorkflowSpec = validateWorkflowSpec({
              nodes: args.nodes as any[],
              connections: args.connections || []
            });
            
            const updatedWorkflow = await n8nApi.updateWorkflow(args.id, updatedWorkflowSpec);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(updatedWorkflow, null, 2) 
              }]
            };
            
          case 'delete_workflow':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
            }
            
            const deleteResult = await n8nApi.deleteWorkflow(args.id);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(deleteResult, null, 2) 
              }]
            };
            
          case 'activate_workflow':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
            }
            
            const activatedWorkflow = await n8nApi.activateWorkflow(args.id);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(activatedWorkflow, null, 2) 
              }]
            };
            
          case 'deactivate_workflow':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Workflow ID is required');
            }
            
            const deactivatedWorkflow = await n8nApi.deactivateWorkflow(args.id);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(deactivatedWorkflow, null, 2) 
              }]
            };
          
          // Execution Tools
          case 'list_executions':
            const executions = await n8nApi.listExecutions({
              includeData: args.includeData,
              status: args.status,
              workflowId: args.workflowId,
              projectId: args.projectId,
              limit: args.limit,
              cursor: args.cursor
            });
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(executions, null, 2) 
              }]
            };
            
          case 'get_execution':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Execution ID is required');
            }
            
            const execution = await n8nApi.getExecution(args.id, args.includeData);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(execution, null, 2) 
              }]
            };
            
          case 'delete_execution':
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Execution ID is required');
            }
            
            const deletedExecution = await n8nApi.deleteExecution(args.id);
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(deletedExecution, null, 2) 
              }]
            };
            
          // Node Tools
          case 'list_nodes':
            const nodes = await n8nApi.listNodes();
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(nodes, null, 2) 
              }]
            };
            
          case 'get_node_info':
            if (!args.name) {
              throw new McpError(ErrorCode.InvalidParams, 'Node name is required');
            }
            
            const nodeInfo = await n8nApi.getNodeInfo(args.name);
            
            
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify(nodeInfo, null, 2) 
              }]
            };
            
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error('Error handling tool call:', error);
        
        if (error instanceof McpError) {
          throw error;
        }
        
        return {
          content: [{ 
            type: 'text', 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('N8N Workflow Builder MCP server running on stdio');
  }
}

const server = new N8NWorkflowServer();
server.run().catch(console.error);
