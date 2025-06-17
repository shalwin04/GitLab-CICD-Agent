import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphState } from "../graph/graphState.js";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY!;
const MCP_SERVER_URL = "https://gitlab-cicd-agent.onrender.com/mcp";

// Simplified MCP Client that handles SSE responses
class SimpleMCPClient {
  private sessionId: string | null = null;
  private baseHeaders: Record<string, string>;
  private requestId = 1;

  constructor(gitlabToken: string) {
    if (!gitlabToken) {
      throw new Error("GitLab token is required");
    }
    this.baseHeaders = {
      "X-GitLab-Token": gitlabToken,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
  }

  async initialize(): Promise<void> {
    console.log("🔄 Initializing MCP session...");

    // Send initialize request
    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: this.baseHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          clientInfo: {
            name: "cicd-agent-backend",
            version: "1.0.0",
          },
        },
        id: this.requestId++,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to initialize MCP session: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    // Get session ID from response headers
    this.sessionId = response.headers.get("mcp-session-id");
    if (!this.sessionId) {
      throw new Error("No session ID returned from server");
    }

    console.log("✅ Session initialized with ID:", this.sessionId);

    // Send initialized notification
    await this.sendNotification("notifications/initialized", {});
    console.log("✅ Initialization complete");
  }

  private async sendNotification(method: string, params: any): Promise<void> {
    if (!this.sessionId) {
      throw new Error("Session not initialized");
    }

    const request = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const requestHeaders = {
      ...this.baseHeaders,
      "mcp-session-id": this.sessionId,
    };

    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(
        `Notification ${method} failed:`,
        response.status,
        response.statusText
      );
      const errorText = await response.text();
      console.warn("Error details:", errorText);
    }
  }

  private parseSSEResponse(text: string): any {
    const lines = text.split("\n");
    let jsonData = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6).trim();
        if (data && data !== "[DONE]") {
          jsonData += data;
        }
      }
    }

    if (jsonData) {
      try {
        return JSON.parse(jsonData);
      } catch (e) {
        console.warn("Failed to parse SSE JSON:", jsonData);
        throw new Error(`Invalid JSON in SSE response: ${jsonData}`);
      }
    }

    throw new Error("No valid JSON found in SSE response");
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.sessionId) {
      throw new Error("Session not initialized");
    }

    const requestId = this.requestId++;

    const request = {
      jsonrpc: "2.0",
      method,
      params,
      id: requestId,
    };

    const requestHeaders = {
      ...this.baseHeaders,
      "mcp-session-id": this.sessionId,
    };

    console.log(`📤 Sending request: ${method}`, params);

    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseText = await response.text();
    console.log("📥 Raw response:", responseText.substring(0, 200) + "...");

    let result;

    // Try to parse as regular JSON first
    try {
      result = JSON.parse(responseText);
    } catch (jsonError) {
      // If that fails, try to parse as SSE
      console.log("📥 Parsing as SSE response...");
      try {
        result = this.parseSSEResponse(responseText);
      } catch (sseError) {
        console.error("Failed to parse both JSON and SSE:", {
          jsonError: jsonError as Error,
          sseError: sseError as Error,
          responseText: responseText.substring(0, 500),
        });
        throw new Error(
          `Unable to parse response: ${responseText.substring(0, 200)}`
        );
      }
    }

    if (result.error) {
      throw new Error(`MCP Error: ${result.error.message}`);
    }

    console.log("📥 Request completed successfully");
    return result.result;
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    return this.sendRequest("tools/call", {
      name,
      arguments: arguments_,
    });
  }

  async listTools(): Promise<any> {
    return this.sendRequest("tools/list", {});
  }

  close(): void {
    if (this.sessionId) {
      // Send close request to server
      fetch(MCP_SERVER_URL, {
        method: "DELETE",
        headers: {
          ...this.baseHeaders,
          "mcp-session-id": this.sessionId,
        },
      }).catch((error) => console.warn("Error closing session:", error));
    }
    this.sessionId = null;
  }
}

// Create LangChain tools from MCP tools
function createLangChainTools(mcpClient: SimpleMCPClient) {
  const tools = [
    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("search_repositories", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "search_repositories",
        description: "Search for GitLab repositories",
        schema: z.object({
          search: z.string().describe("Search query"),
          page: z.number().optional().describe("Page number (default: 1)"),
          per_page: z
            .number()
            .optional()
            .describe("Results per page (default: 20)"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("get_file_contents", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "get_file_contents",
        description: "Get contents of a file from a GitLab repository",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          file_path: z.string().describe("Path to the file"),
          ref: z
            .string()
            .optional()
            .describe("Branch or commit reference (default: HEAD)"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("list_my_projects", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "list_my_projects",
        description:
          "List your own GitLab projects that you own or are a member of",
        schema: z.object({
          page: z.number().optional().describe("Page number (default: 1)"),
          per_page: z
            .number()
            .optional()
            .describe("Results per page (default: 20)"),
          owned: z
            .boolean()
            .optional()
            .describe("Only owned projects (default: true)"),
          membership: z
            .boolean()
            .optional()
            .describe("Include member projects (default: false)"),
          starred: z
            .boolean()
            .optional()
            .describe("Include starred projects (default: false)"),
          archived: z
            .boolean()
            .optional()
            .describe("Include archived projects (default: false)"),
          visibility: z
            .enum(["private", "internal", "public"])
            .optional()
            .describe("Filter by visibility"),
          order_by: z
            .enum([
              "id",
              "name",
              "path",
              "created_at",
              "updated_at",
              "last_activity_at",
            ])
            .optional()
            .describe("Order by field"),
          sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("create_repository", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "create_repository",
        description: "Create a new GitLab repository",
        schema: z.object({
          name: z.string().describe("Repository name"),
          description: z.string().optional().describe("Repository description"),
          visibility: z
            .enum(["private", "internal", "public"])
            .optional()
            .describe("Repository visibility"),
          initialize_with_readme: z
            .boolean()
            .optional()
            .describe("Initialize with README"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("create_issue", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "create_issue",
        description: "Create a new issue in a GitLab repository",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          title: z.string().describe("Issue title"),
          description: z.string().optional().describe("Issue description"),
          assignee_ids: z
            .array(z.number())
            .optional()
            .describe("Assignee user IDs"),
          labels: z.array(z.string()).optional().describe("Issue labels"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool(
            "create_or_update_file",
            input
          );
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "create_or_update_file",
        description: "Create or update a file in a GitLab repository",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          file_path: z.string().describe("Path to the file"),
          content: z.string().describe("File content"),
          commit_message: z.string().describe("Commit message"),
          branch: z.string().describe("Branch name"),
          previous_path: z
            .string()
            .optional()
            .describe("Previous file path (for renames)"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("push_files", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "push_files",
        description:
          "Push multiple files to a GitLab repository in a single commit",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          commit_message: z.string().describe("Commit message"),
          branch: z.string().describe("Branch name"),
          files: z
            .array(
              z.object({
                file_path: z.string().describe("Path to the file"),
                content: z.string().describe("File content"),
              })
            )
            .describe("Array of files to push"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool(
            "create_merge_request",
            input
          );
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "create_merge_request",
        description: "Create a new merge request in a GitLab repository",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          title: z.string().describe("Merge request title"),
          description: z
            .string()
            .optional()
            .describe("Merge request description"),
          source_branch: z.string().describe("Source branch name"),
          target_branch: z.string().describe("Target branch name"),
          allow_collaboration: z
            .boolean()
            .optional()
            .describe("Allow collaboration"),
          draft: z.boolean().optional().describe("Create as draft"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("fork_repository", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "fork_repository",
        description:
          "Fork a GitLab repository to your account or specified namespace",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          namespace: z
            .string()
            .optional()
            .describe("Target namespace for the fork"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("create_branch", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "create_branch",
        description: "Create a new branch in a GitLab repository",
        schema: z.object({
          project_id: z.string().describe("GitLab project ID or path"),
          branch: z.string().describe("New branch name"),
          ref: z
            .string()
            .optional()
            .describe("Reference to create branch from (default: HEAD)"),
        }),
      }
    ),
  ];

  return tools;
}

// Factory function to create chat agent with token
export const createChatAgentNode = (gitlabToken: string) => {
  console.log(`🤖 Creating ChatAgent node with GitLab token`);

  return async (
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> => {
    console.log("🤖 ChatAgent node starting...");

    try {
      if (!gitlabToken) {
        throw new Error("GitLab token not provided to ChatAgent node");
      }

      console.log(`🔑 Using GitLab token for MCP client initialization`);

      // Initialize MCP client with the OAuth token
      const mcpClient = new SimpleMCPClient(gitlabToken);
      await mcpClient.initialize();

      // List available tools
      console.log("🔄 Listing available tools...");
      const toolsList = await mcpClient.listTools();
      console.log(
        "✅ Available tools:",
        toolsList.tools?.map((t: any) => t.name) || []
      );

      // Create LangChain tools
      const tools = createLangChainTools(mcpClient);

      // Setup the model
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash-exp",
        apiKey: API_KEY,
        temperature: 0,
      });

      // Create the agent without custom prompt - let it use default
      const agent = createReactAgent({
        llm: model,
        tools,
      });

      // Create the context message with all the state information
      const contextMessage = `You are a GitLab DevOps assistant that executes the final actions based on the plan and code generated by other agents.

Current Context:
- User Request: ${state.userMessage || "No user message provided"}
- Plan: ${state.plans || "No plan provided"}
- Generated Code: ${state.generatedCode || "No code generated"}
- Test Results: ${state.testResults || "No test results available"}

Your task is to execute the necessary GitLab operations using the available tools to fulfill the user's request.
The plan and code have been prepared by other agents, and tests have been run.

Available GitLab operations:
- search_repositories: Search for GitLab repositories
- get_file_contents: Get contents of files from repositories
- create_or_update_file: Create or update files in repositories
- create_merge_request: Create merge requests
- And other GitLab operations...

Execute the plan using the appropriate tools and provide a comprehensive summary of what was accomplished.

Please execute this plan: ${
        state.userMessage || "No specific request provided"
      }`;

      // Execute the agent with proper message format
      const result = await agent.invoke({
        messages: [
          new SystemMessage({
            content:
              "You are a GitLab DevOps assistant that executes actions based on plans and code generated by other agents.",
          }),
          new HumanMessage({
            content: contextMessage,
          }),
        ],
      });

      // Extract the final response
      const lastMessage = result.messages[result.messages.length - 1];
      const finalResponse = lastMessage.content.toString();

      // Clean up
      mcpClient.close();

      console.log("✅ ChatAgent node completed successfully");

      // Return the updated state (clean, no token data)
      return {
        finalResult: finalResponse,
        agentTrace: [...(state.agentTrace || []), "chat"],
      };
    } catch (error) {
      console.error("❌ ChatAgent node error:", error);

      return {
        finalResult: `Error in ChatAgent: ${
          error instanceof Error ? error.message : String(error)
        }`,
        agentTrace: [...(state.agentTrace || []), "chat"],
      };
    }
  };
};

// Export the MCP client class in case it's needed elsewhere
export { SimpleMCPClient };
