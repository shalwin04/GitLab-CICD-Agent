#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  GitLabForkSchema,
  GitLabReferenceSchema,
  GitLabRepositorySchema,
  GitLabIssueSchema,
  GitLabMergeRequestSchema,
  GitLabContentSchema,
  GitLabCreateUpdateFileResponseSchema,
  GitLabSearchResponseSchema,
  GitLabTreeSchema,
  GitLabCommitSchema,
  CreateRepositoryOptionsSchema,
  CreateIssueOptionsSchema,
  CreateMergeRequestOptionsSchema,
  CreateBranchOptionsSchema,
  CreateOrUpdateFileSchema,
  SearchRepositoriesSchema,
  CreateRepositorySchema,
  GetFileContentsSchema,
  PushFilesSchema,
  CreateIssueSchema,
  CreateMergeRequestSchema,
  ForkRepositorySchema,
  CreateBranchSchema,
  type GitLabFork,
  type GitLabReference,
  type GitLabRepository,
  type GitLabIssue,
  type GitLabMergeRequest,
  type GitLabContent,
  type GitLabCreateUpdateFileResponse,
  type GitLabSearchResponse,
  type GitLabTree,
  type GitLabCommit,
  type FileOperation,
} from "./schemas.js";

const server = new Server(
  {
    name: "gitlab-mcp-server",
    version: "0.5.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const GITLAB_PERSONAL_ACCESS_TOKEN = process.env.GITLAB_PERSONAL_ACCESS_TOKEN;
const GITLAB_API_URL =
  process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";

if (!GITLAB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITLAB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}

// [All your existing GitLab API functions remain the same]
async function forkProject(
  projectId: string,
  namespace?: string
): Promise<GitLabFork> {
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(
    projectId
  )}/fork`;
  const queryParams = namespace
    ? `?namespace=${encodeURIComponent(namespace)}`
    : "";

  const response = await fetch(url + queryParams, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabForkSchema.parse(await response.json());
}

async function createBranch(
  projectId: string,
  options: z.infer<typeof CreateBranchOptionsSchema>
): Promise<GitLabReference> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/repository/branches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: options.name,
        ref: options.ref,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabReferenceSchema.parse(await response.json());
}

async function getFileContents(
  projectId: string,
  filePath: string,
  ref?: string
): Promise<GitLabContent> {
  const encodedPath = encodeURIComponent(filePath);
  let url = `${GITLAB_API_URL}/projects/${encodeURIComponent(
    projectId
  )}/repository/files/${encodedPath}`;
  if (ref) {
    url += `?ref=${encodeURIComponent(ref)}`;
  } else {
    url += "?ref=HEAD";
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  const data = GitLabContentSchema.parse(await response.json());

  if (!Array.isArray(data) && data.content) {
    data.content = Buffer.from(data.content, "base64").toString("utf8");
  }

  return data;
}

async function createIssue(
  projectId: string,
  options: z.infer<typeof CreateIssueOptionsSchema>
): Promise<GitLabIssue> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: options.title,
        description: options.description,
        assignee_ids: options.assignee_ids,
        milestone_id: options.milestone_id,
        labels: options.labels?.join(","),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabIssueSchema.parse(await response.json());
}

async function createMergeRequest(
  projectId: string,
  options: z.infer<typeof CreateMergeRequestOptionsSchema>
): Promise<GitLabMergeRequest> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/merge_requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: options.title,
        description: options.description,
        source_branch: options.source_branch,
        target_branch: options.target_branch,
        allow_collaboration: options.allow_collaboration,
        draft: options.draft,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabMergeRequestSchema.parse(await response.json());
}

async function createOrUpdateFile(
  projectId: string,
  filePath: string,
  content: string,
  commitMessage: string,
  branch: string,
  previousPath?: string
): Promise<GitLabCreateUpdateFileResponse> {
  const encodedPath = encodeURIComponent(filePath);
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(
    projectId
  )}/repository/files/${encodedPath}`;

  const body = {
    branch,
    content,
    commit_message: commitMessage,
    ...(previousPath ? { previous_path: previousPath } : {}),
  };

  // Check if file exists
  let method = "POST";
  try {
    await getFileContents(projectId, filePath, branch);
    method = "PUT";
  } catch (error) {
    // File doesn't exist, use POST
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabCreateUpdateFileResponseSchema.parse(await response.json());
}

async function createTree(
  projectId: string,
  files: FileOperation[],
  ref?: string
): Promise<GitLabTree> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/repository/tree`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: files.map((file) => ({
          file_path: file.path,
          content: file.content,
        })),
        ...(ref ? { ref } : {}),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabTreeSchema.parse(await response.json());
}

async function createCommit(
  projectId: string,
  message: string,
  branch: string,
  actions: FileOperation[]
): Promise<GitLabCommit> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/repository/commits`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch,
        commit_message: message,
        actions: actions.map((action) => ({
          action: "create",
          file_path: action.path,
          content: action.content,
        })),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabCommitSchema.parse(await response.json());
}

async function searchProjects(
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<GitLabSearchResponse> {
  const url = new URL(`${GITLAB_API_URL}/projects`);
  url.searchParams.append("search", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  const projects = await response.json();
  return GitLabSearchResponseSchema.parse({
    count: parseInt(response.headers.get("X-Total") || "0"),
    items: projects,
  });
}

async function createRepository(
  options: z.infer<typeof CreateRepositoryOptionsSchema>
): Promise<GitLabRepository> {
  const response = await fetch(`${GITLAB_API_URL}/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: options.name,
      description: options.description,
      visibility: options.visibility,
      initialize_with_readme: options.initialize_with_readme,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabRepositorySchema.parse(await response.json());
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_or_update_file",
        description: "Create or update a single file in a GitLab project",
        inputSchema: zodToJsonSchema(CreateOrUpdateFileSchema),
      },
      {
        name: "search_repositories",
        description: "Search for GitLab projects",
        inputSchema: zodToJsonSchema(SearchRepositoriesSchema),
      },
      {
        name: "create_repository",
        description: "Create a new GitLab project",
        inputSchema: zodToJsonSchema(CreateRepositorySchema),
      },
      {
        name: "get_file_contents",
        description:
          "Get the contents of a file or directory from a GitLab project",
        inputSchema: zodToJsonSchema(GetFileContentsSchema),
      },
      {
        name: "push_files",
        description:
          "Push multiple files to a GitLab project in a single commit",
        inputSchema: zodToJsonSchema(PushFilesSchema),
      },
      {
        name: "create_issue",
        description: "Create a new issue in a GitLab project",
        inputSchema: zodToJsonSchema(CreateIssueSchema),
      },
      {
        name: "create_merge_request",
        description: "Create a new merge request in a GitLab project",
        inputSchema: zodToJsonSchema(CreateMergeRequestSchema),
      },
      {
        name: "fork_repository",
        description:
          "Fork a GitLab project to your account or specified namespace",
        inputSchema: zodToJsonSchema(ForkRepositorySchema),
      },
      {
        name: "create_branch",
        description: "Create a new branch in a GitLab project",
        inputSchema: zodToJsonSchema(CreateBranchSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "fork_repository": {
        const args = ForkRepositorySchema.parse(request.params.arguments);
        const fork = await forkProject(args.project_id, args.namespace);
        return {
          content: [{ type: "text", text: JSON.stringify(fork, null, 2) }],
        };
      }

      case "create_branch": {
        const args = CreateBranchSchema.parse(request.params.arguments);
        let ref = args.ref;
        if (!ref) {
          ref = "HEAD";
        }

        const branch = await createBranch(args.project_id, {
          name: args.branch,
          ref,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
        };
      }

      case "search_repositories": {
        const args = SearchRepositoriesSchema.parse(request.params.arguments);
        const results = await searchProjects(
          args.search,
          args.page,
          args.per_page
        );
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "create_repository": {
        const args = CreateRepositorySchema.parse(request.params.arguments);
        const repository = await createRepository(args);
        return {
          content: [
            { type: "text", text: JSON.stringify(repository, null, 2) },
          ],
        };
      }

      case "get_file_contents": {
        const args = GetFileContentsSchema.parse(request.params.arguments);
        const contents = await getFileContents(
          args.project_id,
          args.file_path,
          args.ref
        );
        return {
          content: [{ type: "text", text: JSON.stringify(contents, null, 2) }],
        };
      }

      case "create_or_update_file": {
        const args = CreateOrUpdateFileSchema.parse(request.params.arguments);
        const result = await createOrUpdateFile(
          args.project_id,
          args.file_path,
          args.content,
          args.commit_message,
          args.branch,
          args.previous_path
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "push_files": {
        const args = PushFilesSchema.parse(request.params.arguments);
        const result = await createCommit(
          args.project_id,
          args.commit_message,
          args.branch,
          args.files.map((f) => ({ path: f.file_path, content: f.content }))
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_issue": {
        const args = CreateIssueSchema.parse(request.params.arguments);
        const { project_id, ...options } = args;
        const issue = await createIssue(project_id, options);
        return {
          content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
        };
      }

      case "create_merge_request": {
        const args = CreateMergeRequestSchema.parse(request.params.arguments);
        const { project_id, ...options } = args;
        const mergeRequest = await createMergeRequest(project_id, options);
        return {
          content: [
            { type: "text", text: JSON.stringify(mergeRequest, null, 2) },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Session management with proper cleanup following MCP SDK patterns
interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  connected: boolean;
}

const sessions = new Map<string, SessionInfo>();

// Clean up inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > TIMEOUT) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      session.transport.close();
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

async function runServer() {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ["mcp-session-id"],
    })
  );
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      activeSessions: sessions.size,
    });
  });

  // GET /sessions - List active sessions (for debugging)
  app.get("/sessions", (_, res) => {
    const sessionList = Array.from(sessions.entries()).map(([id, info]) => ({
      id,
      lastActivity: new Date(info.lastActivity).toISOString(),
      connected: info.connected,
    }));
    res.json({ sessions: sessionList });
  });

  // POST /mcp — handle MCP JSON-RPC requests (init + ongoing)
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let sessionInfo: SessionInfo;

      if (sessionId && sessions.has(sessionId)) {
        // Reuse existing session
        sessionInfo = sessions.get(sessionId)!;
        sessionInfo.lastActivity = Date.now();
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session init request - create transport
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.log(`New session initialized: ${newSessionId}`);
          },
        });

        sessionInfo = {
          transport,
          lastActivity: Date.now(),
          connected: true,
        };

        // Setup cleanup on close using the proper onclose callback
        transport.onclose = () => {
          if (transport.sessionId) {
            console.log(`Session closed: ${transport.sessionId}`);
            const session = sessions.get(transport.sessionId);
            if (session) {
              session.connected = false;
              sessions.delete(transport.sessionId);
            }
          }
        };

        // Connect transport to MCP server
        await server.connect(transport);

        // Store session after connection
        if (transport.sessionId) {
          sessions.set(transport.sessionId, sessionInfo);
        }
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              "Bad Request: No valid session ID provided or not an initialize request",
          },
          id: req.body?.id || null,
        });
        return;
      }

      // Handle JSON-RPC request
      await sessionInfo.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : String(error),
        },
        id: req.body?.id || null,
      });
    }
  });

  // GET /mcp — SSE notifications, server->client streaming
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        error: "Missing MCP session ID header",
      });
      return;
    }

    const sessionInfo = sessions.get(sessionId);
    if (!sessionInfo) {
      res.status(404).json({
        error: "Invalid MCP session ID",
      });
      return;
    }

    console.log(`SSE connection established for session: ${sessionId}`);

    // Setup SSE headers with proper configuration
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send initial SSE comment to establish connection
    res.write(": SSE connection established\n\n");

    // Keep-alive mechanism
    const keepAliveInterval = setInterval(() => {
      if (!res.destroyed) {
        res.write(": keep-alive\n\n");
      }
    }, 30000); // Send keep-alive every 30 seconds

    // Update session info
    sessionInfo.lastActivity = Date.now();
    sessionInfo.connected = true;

    // Cleanup function
    const cleanup = () => {
      clearInterval(keepAliveInterval);

      if (!res.destroyed) {
        res.end();
      }

      console.log(`SSE connection cleaned up for session: ${sessionId}`);
    };

    // Handle client disconnect
    req.on("close", () => {
      console.log(`Client disconnected from session: ${sessionId}`);
      cleanup();
    });

    req.on("error", (error) => {
      console.error(`SSE request error for session ${sessionId}:`, error);
      cleanup();
    });

    res.on("error", (error) => {
      console.error(`SSE response error for session ${sessionId}:`, error);
      cleanup();
    });

    // Instead of using .on() and .off(), we let the transport handle notifications
    // The transport will automatically send notifications through the SSE connection
    await sessionInfo.transport.handleRequest(req, res);
  });

  // DELETE /mcp — close session
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: "Missing session ID" });
      return;
    }

    const sessionInfo = sessions.get(sessionId);
    if (!sessionInfo) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    try {
      await sessionInfo.transport.handleRequest(req, res);
      sessions.delete(sessionId);
      console.log(`Session manually closed: ${sessionId}`);
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      res.status(500).json({ error: "Error closing session" });
    }
  });

  // Error handling middleware
  app.use((error: Error, req: Request, res: Response, next: Function) => {
    console.error("Express error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  });

  // Start server
  const PORT = process.env.PORT || 3001;
  const server_instance = app.listen(PORT, () => {
    console.log(`🌐 GitLab MCP Server running at http://localhost:${PORT}`);
    console.log(`💓 Health check at http://localhost:${PORT}/health`);
    console.log(`📊 Sessions info at http://localhost:${PORT}/sessions`);
    console.log(`📡 MCP endpoints at http://localhost:${PORT}/mcp`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down server...");

    // Close all active sessions
    for (const [sessionId, sessionInfo] of sessions) {
      console.log(`Closing session: ${sessionId}`);
      sessionInfo.transport.close();
    }
    sessions.clear();

    server_instance.close(() => {
      console.log("✅ Server shut down gracefully");
      process.exit(0);
    });
  });
}

runServer().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
