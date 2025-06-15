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
  ListMyProjectsSchema,
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

// Enhanced session management with proper token handling
interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  connected: boolean;
  gitlabToken: string; // Required GitLab token for this session
  createdAt: number;
}

const sessions = new Map<string, SessionInfo>();

const GITLAB_API_URL =
  process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";

// Context for current request session
interface RequestContext {
  sessionId?: string;
  gitlabToken?: string;
}

// JSON-RPC request interface
interface JsonRpcRequest {
  jsonrpc: string;
  method?: string;
  params?: any;
  id?: string | number | null;
}

// Request-scoped context using AsyncLocalStorage-like pattern
let currentContext: RequestContext = {};

// Helper function to get token from current session context
function getTokenFromContext(): string {
  if (currentContext.gitlabToken) {
    return currentContext.gitlabToken;
  }

  if (currentContext.sessionId) {
    const session = sessions.get(currentContext.sessionId);
    if (session?.gitlabToken) {
      return session.gitlabToken;
    }
  }

  throw new Error(
    "GitLab access token not available in current session context"
  );
}

// Helper function to extract token from various sources
function extractGitlabToken(req: Request): string | null {
  return (
    (req.headers["x-gitlab-token"] as string) ||
    (req.headers["gitlab-token"] as string) ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
    req.body?.gitlab_token ||
    null
  );
}

// Validate GitLab token by making a test API call
async function validateGitlabToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${GITLAB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error("Token validation error:", error);
    return false;
  }
}

// Modified GitLab API functions to use context-aware token
async function forkProject(
  projectId: string,
  namespace?: string
): Promise<GitLabFork> {
  const token = getTokenFromContext();
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(
    projectId
  )}/fork`;
  const queryParams = namespace
    ? `?namespace=${encodeURIComponent(namespace)}`
    : "";

  const response = await fetch(url + queryParams, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
  }

  return GitLabForkSchema.parse(await response.json());
}

async function createBranch(
  projectId: string,
  options: z.infer<typeof CreateBranchOptionsSchema>
): Promise<GitLabReference> {
  const token = getTokenFromContext();
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/repository/branches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: options.name,
        ref: options.ref,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
  }

  return GitLabReferenceSchema.parse(await response.json());
}

async function getFileContents(
  projectId: string,
  filePath: string,
  ref?: string
): Promise<GitLabContent> {
  const token = getTokenFromContext();
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
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
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
  const token = getTokenFromContext();
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
  }

  return GitLabIssueSchema.parse(await response.json());
}

async function createMergeRequest(
  projectId: string,
  options: z.infer<typeof CreateMergeRequestOptionsSchema>
): Promise<GitLabMergeRequest> {
  const token = getTokenFromContext();
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/merge_requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
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
  const token = getTokenFromContext();
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
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
  }

  return GitLabCreateUpdateFileResponseSchema.parse(await response.json());
}

async function createCommit(
  projectId: string,
  message: string,
  branch: string,
  actions: FileOperation[]
): Promise<GitLabCommit> {
  const token = getTokenFromContext();
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/repository/commits`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
  }

  return GitLabCommitSchema.parse(await response.json());
}

async function searchProjects(
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<GitLabSearchResponse> {
  const token = getTokenFromContext();
  const url = new URL(`${GITLAB_API_URL}/projects`);
  url.searchParams.append("search", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
  }

  const projects = await response.json();
  return GitLabSearchResponseSchema.parse({
    count: parseInt(response.headers.get("X-Total") || "0"),
    items: projects,
  });
}

async function listMyProjects(
  options: z.infer<typeof ListMyProjectsSchema> = {}
): Promise<GitLabSearchResponse> {
  const token = getTokenFromContext();
  const url = new URL(`${GITLAB_API_URL}/projects`);

  // Default to owned projects only
  url.searchParams.append("owned", (options.owned ?? true).toString());

  if (options.page) url.searchParams.append("page", options.page.toString());
  if (options.per_page)
    url.searchParams.append("per_page", options.per_page.toString());
  if (options.membership)
    url.searchParams.append("membership", options.membership.toString());
  if (options.starred)
    url.searchParams.append("starred", options.starred.toString());
  if (options.archived !== undefined)
    url.searchParams.append("archived", options.archived.toString());
  if (options.visibility)
    url.searchParams.append("visibility", options.visibility);
  if (options.order_by) url.searchParams.append("order_by", options.order_by);
  if (options.sort) url.searchParams.append("sort", options.sort);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
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
  const token = getTokenFromContext();
  const response = await fetch(`${GITLAB_API_URL}/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
    const errorText = await response.text();
    throw new Error(`GitLab API error (${response.status}): ${errorText}`);
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
        name: "list_my_projects",
        description: "List your own GitLab projects",
        inputSchema: zodToJsonSchema(ListMyProjectsSchema),
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

      case "list_my_projects": {
        const args = ListMyProjectsSchema.parse(request.params.arguments);
        const results = await listMyProjects(args);
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

// Clean up inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > TIMEOUT) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      try {
        session.transport.close();
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
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
      mcpVersion: "0.5.1",
    });
  });

  // GET /sessions - List active sessions (for debugging)
  app.get("/sessions", (_, res) => {
    const sessionList = Array.from(sessions.entries()).map(([id, info]) => ({
      id,
      lastActivity: new Date(info.lastActivity).toISOString(),
      createdAt: new Date(info.createdAt).toISOString(),
      connected: info.connected,
      hasToken: !!info.gitlabToken,
    }));
    res.json({ sessions: sessionList, total: sessions.size });
  });

  // POST /mcp — handle MCP JSON-RPC requests (init + ongoing)
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const gitlabToken = extractGitlabToken(req);

    try {
      let sessionInfo: SessionInfo;

      // Cast req.body to JsonRpcRequest to access id property
      const jsonRpcBody = req.body as JsonRpcRequest;

      if (sessionId && sessions.has(sessionId)) {
        // Existing session - update activity and validate token
        sessionInfo = sessions.get(sessionId)!;
        sessionInfo.lastActivity = Date.now();

        // If a new token is provided, validate and update it
        if (gitlabToken && gitlabToken !== sessionInfo.gitlabToken) {
          const isValidToken = await validateGitlabToken(gitlabToken);
          if (!isValidToken) {
            res.status(401).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Invalid GitLab access token provided",
              },
              id: jsonRpcBody?.id || null,
            });
            return;
          }
          sessionInfo.gitlabToken = gitlabToken;
          console.log(`Updated token for session: ${sessionId}`);
        }
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session initialization
        if (!gitlabToken) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "GitLab access token is required for session initialization. Provide it via 'X-GitLab-Token', 'GitLab-Token', 'Authorization: Bearer <token>' header, or 'gitlab_token' in request body.",
            },
            id: jsonRpcBody?.id || null,
          });
          return;
        }

        // Validate the token before creating session
        const isValidToken = await validateGitlabToken(gitlabToken);
        if (!isValidToken) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Invalid GitLab access token provided",
            },
            id: jsonRpcBody?.id || null,
          });
          return;
        }

        // Create new transport and session
        const newSessionId = randomUUID(); // Generate session ID upfront
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sessionId) => {
            console.log(
              `New session initialized: ${sessionId} with valid token`
            );
          },
        });

        const now = Date.now();
        sessionInfo = {
          transport,
          lastActivity: now,
          createdAt: now,
          connected: true,
          gitlabToken,
        };

        // Setup cleanup on close
        transport.onclose = () => {
          console.log(`Session closed: ${newSessionId}`);
          sessions.delete(newSessionId);
        };

        // Connect transport to MCP server
        await server.connect(transport);

        // Store session with the known ID
        sessions.set(newSessionId, sessionInfo);

        // Set the session ID in response headers
        res.setHeader("mcp-session-id", newSessionId);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              "Bad Request: No valid session ID provided or not an initialize request",
          },
          id: jsonRpcBody?.id || null,
        });
        return;
      }

      // Set up request context for this request
      currentContext = {
        sessionId: sessionInfo.transport.sessionId,
        gitlabToken: sessionInfo.gitlabToken,
      };

      // Handle the JSON-RPC request
      await sessionInfo.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      const jsonRpcBody = req.body as JsonRpcRequest;
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : String(error),
        },
        id: jsonRpcBody?.id || null,
      });
    } finally {
      // Clean up request context
      currentContext = {};
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

    // Setup SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "X-Accel-Buffering": "no",
    });

    // Send initial SSE comment
    res.write(": SSE connection established\n\n");

    // Keep-alive mechanism
    const keepAliveInterval = setInterval(() => {
      if (!res.destroyed) {
        res.write(": keep-alive\n\n");
      }
    }, 30000);

    // Update session info
    sessionInfo.lastActivity = Date.now();
    sessionInfo.connected = true;

    // Set up request context for SSE
    currentContext = {
      sessionId: sessionId,
      gitlabToken: sessionInfo.gitlabToken,
    };

    // Cleanup function
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      currentContext = {};

      if (!res.destroyed) {
        res.end();
      }

      console.log(`SSE connection cleaned up for session: ${sessionId}`);
    };

    // Handle client disconnect
    req.on("close", cleanup);
    req.on("error", (error) => {
      console.error(`SSE request error for session ${sessionId}:`, error);
      cleanup();
    });
    res.on("error", (error) => {
      console.error(`SSE response error for session ${sessionId}:`, error);
      cleanup();
    });

    // Handle the SSE request
    try {
      await sessionInfo.transport.handleRequest(req, res);
    } catch (error) {
      console.error(`SSE handling error for session ${sessionId}:`, error);
      cleanup();
    }
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
      // Set up request context for cleanup
      currentContext = {
        sessionId: sessionId,
        gitlabToken: sessionInfo.gitlabToken,
      };

      await sessionInfo.transport.handleRequest(req, res);
      sessions.delete(sessionId);
      console.log(`Session manually closed: ${sessionId}`);
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      res.status(500).json({ error: "Error closing session" });
    } finally {
      currentContext = {};
    }
  });

  // Error handling middleware
  app.use(
    (error: Error, req: Request, res: Response, next: express.NextFunction) => {
      console.error("Express error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal server error",
          message: error.message,
        });
      }
    }
  );

  // Start server
  const PORT = process.env.PORT || 3001;
  const server_instance = app.listen(PORT, () => {
    console.log(`🌐 GitLab MCP Server running at http://localhost:${PORT}`);
    console.log(`💓 Health check at http://localhost:${PORT}/health`);
    console.log(`📊 Sessions info at http://localhost:${PORT}/sessions`);
    console.log(`📡 MCP endpoints at http://localhost:${PORT}/mcp`);
    console.log(
      `🔑 Send GitLab tokens via 'X-GitLab-Token' header or 'Authorization: Bearer <token>'`
    );
    console.log(`🔒 Tokens are validated and stored securely per session`);
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log("\n🛑 Shutting down server...");

    // Close all active sessions
    const sessionPromises = Array.from(sessions.entries()).map(
      async ([sessionId, sessionInfo]) => {
        try {
          console.log(`Closing session: ${sessionId}`);
          sessionInfo.transport.close();
        } catch (error) {
          console.error(`Error closing session ${sessionId}:`, error);
        }
      }
    );

    Promise.all(sessionPromises).finally(() => {
      sessions.clear();
      server_instance.close(() => {
        console.log("✅ Server shut down gracefully");
        process.exit(0);
      });
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.log("⚠️  Force closing server after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}

runServer().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
