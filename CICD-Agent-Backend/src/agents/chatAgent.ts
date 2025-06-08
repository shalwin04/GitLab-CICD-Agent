import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY!;
const GITLAB_TOKEN = process.env.GITLAB_TOKEN!;
const MCP_SERVER_URL = "http://localhost:3001/mcp";

// Simplified MCP Client that handles SSE responses
class SimpleMCPClient {
  private sessionId: string | null = null;
  private baseHeaders: Record<string, string>;
  private requestId = 1;

  constructor(gitlabToken: string) {
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

async function initializeAgent() {
  let mcpClient: SimpleMCPClient | null = null;

  try {
    // 1. Initialize MCP client
    mcpClient = new SimpleMCPClient(GITLAB_TOKEN);
    await mcpClient.initialize();

    // 2. List available tools from server
    console.log("🔄 Listing available tools...");
    const toolsList = await mcpClient.listTools();
    console.log(
      "✅ Available tools:",
      toolsList.tools?.map((t: any) => t.name) || []
    );

    // 3. Create LangChain tools
    const tools = createLangChainTools(mcpClient);

    // 4. Setup LangGraph Agent
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash-exp",
      apiKey: API_KEY,
      temperature: 0,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a helpful assistant that can interact with GitLab repositories using the provided tools.
        
Available GitLab operations:
- search_repositories: Search for GitLab repositories
- get_file_contents: Get contents of files from repositories
- create_repository: Create new repositories
- create_issue: Create issues in repositories
- create_or_update_file: Create or update files in repositories
- push_files: Push multiple files in a single commit
- create_merge_request: Create merge requests
- fork_repository: Fork repositories
- create_branch: Create new branches

When using these tools, always provide clear and structured responses to the user.
For project IDs, you can use either the numeric ID or the URL-encoded project path (e.g., "group%2Fproject").`,
      ],
      ["human", "{messages}"],
    ]);

    const agent = createReactAgent({
      llm: model,
      prompt,
      tools,
    });

    console.log("🚀 Agent initialized successfully!");
    return { agent, mcpClient };
  } catch (error) {
    if (mcpClient) {
      mcpClient.close();
    }
    console.error("❌ Error initializing agent:", error);
    throw error;
  }
}

// Test function
async function testAgent(agent: any) {
  try {
    console.log("\n🔄 Testing agent with a simple query...");

    const result = await agent.invoke({
      messages:
        "What tools do you have available for GitLab operations? Please list them with brief descriptions.",
    });

    console.log("✅ Agent response:");
    console.log(result.messages[result.messages.length - 1].content);
  } catch (error) {
    console.error("❌ Error testing agent:", error);
  }
}

// Interactive query function
async function runInteractiveSession(agent: any) {
  const readline = await import("readline");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  console.log("\n🎯 Interactive GitLab Agent Session Started!");
  console.log("💡 You can ask me to:");
  console.log("   - Search for repositories");
  console.log("   - Get file contents");
  console.log("   - Create repositories, issues, or merge requests");
  console.log("   - Push files or create branches");
  console.log("   - Type 'exit' or 'quit' to end the session\n");

  while (true) {
    try {
      const userInput = await askQuestion(
        "🤖 How can I help you with GitLab? "
      );

      if (
        userInput.toLowerCase() === "exit" ||
        userInput.toLowerCase() === "quit"
      ) {
        console.log("👋 Goodbye!");
        break;
      }

      if (!userInput.trim()) {
        console.log("Please enter a valid question or command.");
        continue;
      }

      console.log("\n🔄 Processing your request...");

      const result = await agent.invoke({
        messages: userInput,
      });

      console.log("\n✅ Response:");
      console.log("─".repeat(50));
      console.log(result.messages[result.messages.length - 1].content);
      console.log("─".repeat(50) + "\n");
    } catch (error) {
      console.error("❌ Error processing request:", error);
      console.log("Please try again with a different request.\n");
    }
  }

  rl.close();
}

// Main execution
async function main() {
  let mcpClient: SimpleMCPClient | null = null;

  try {
    const { agent, mcpClient: client } = await initializeAgent();
    mcpClient = client;

    await testAgent(agent);

    console.log(
      "\n🎉 Setup complete! You can now use the agent for GitLab operations."
    );

    // Start interactive session
    await runInteractiveSession(agent);
  } catch (error) {
    console.error("💥 Fatal error:", error);
    if (mcpClient) {
      mcpClient.close();
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (mcpClient) {
      console.log("🧹 Cleaning up MCP client...");
      mcpClient.close();
    }
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down...");
  process.exit(0);
});

// Run the application
main();
