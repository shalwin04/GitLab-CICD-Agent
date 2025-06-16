import express from "express";
import type { RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { exchangeGitlabToken } from "./utils/exchangeGitlabToken.js";
import { v4 as uuidv4 } from "uuid";
import { chatAgent } from "./agents/chatAgent.js"; // Import the agent factory
import { ChatSession } from "./types.js";

dotenv.config();

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID!;
const GITLAB_CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET!;
const REDIRECT_URI = "http://localhost:5173/oauth/callback";

// Debug environment variables
console.log("Environment check:");
console.log("- GITLAB_CLIENT_ID:", GITLAB_CLIENT_ID ? "✓ Set" : "✗ Missing");
console.log(
  "- GITLAB_CLIENT_SECRET:",
  GITLAB_CLIENT_SECRET ? "✓ Set" : "✗ Missing"
);
console.log("- REDIRECT_URI:", REDIRECT_URI);

const app = express();
const router = express.Router();
const PORT = 4000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// Store active sessions with tokens and agents

const activeSessions = new Map<string, ChatSession>();

// Track used authorization codes to prevent reuse
const usedCodes = new Set<string>();

const oauthCallbackHandler: RequestHandler = async (req, res) => {
  const { code } = req.body;

  console.log("OAuth callback received:");
  console.log(
    "- Code (first 10 chars):",
    code ? code.substring(0, 10) + "..." : "MISSING"
  );

  if (!code) {
    console.error("Missing authorization code");
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  if (usedCodes.has(code)) {
    console.warn(
      "Authorization code already used:",
      code.substring(0, 10) + "..."
    );
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code has already been used",
    });
    return;
  }

  usedCodes.add(code);

  try {
    const data = await exchangeGitlabToken(
      GITLAB_CLIENT_ID,
      GITLAB_CLIENT_SECRET,
      code,
      REDIRECT_URI
    );

    console.log("Token exchange result:", {
      success: !!data.access_token,
      hasError: !!data.error,
      error: data.error,
    });

    if (data.error) {
      console.error("GitLab OAuth error:", data.error_description);
      res.status(400).json({
        error: data.error,
        error_description: data.error_description,
      });
      return;
    }

    const sessionId = uuidv4();

    // Initialize chat agent with the token
    try {
      console.log("🔄 Initializing chat agent for session:", sessionId);
      const { agent, mcpClient } = await chatAgent(data.access_token!);

      // Store the session
      activeSessions.set(sessionId, {
        token: data.access_token as any,
        agent,
        mcpClient,
        createdAt: new Date(),
      });

      console.log(
        "✅ Chat agent initialized successfully for session:",
        sessionId
      );
    } catch (agentError) {
      console.error("❌ Failed to initialize chat agent:", agentError);
      // Continue without failing the OAuth flow
    }

    res.status(200).json({ ...data, sessionId });
  } catch (err) {
    usedCodes.delete(code);
    console.error("OAuth Callback Error:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err instanceof Error ? err.message : "Unknown error",
    });
    return;
  }
};

// Chat endpoint
const chatHandler: RequestHandler = async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    res.status(400).json({
      error: "Missing sessionId or message",
    });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      error: "Session not found or expired. Please re-authenticate.",
    });
    return;
  }

  try {
    console.log(`🔄 Processing chat request for session: ${sessionId}`);
    console.log(`📝 Message: ${message.substring(0, 100)}...`);

    const result = await session.agent.invoke({
      messages: message,
    });

    const response = result.messages[result.messages.length - 1].content;

    console.log(`✅ Chat response generated for session: ${sessionId}`);

    res.json({
      response,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Chat processing error:", error);
    res.status(500).json({
      error: "Failed to process chat request",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Session status endpoint
const sessionStatusHandler: RequestHandler = async (req, res) => {
  const { sessionId } = req.params;

  const session = activeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      error: "Session not found",
    });
    return;
  }

  res.json({
    sessionId,
    isActive: true,
    createdAt: session.createdAt,
    hasAgent: !!session.agent,
  });
};

// Cleanup session endpoint
const cleanupSessionHandler: RequestHandler = async (req, res) => {
  const { sessionId } = req.params;

  const session = activeSessions.get(sessionId);
  if (session) {
    // Close MCP client if it exists
    if (session.mcpClient) {
      try {
        session.mcpClient.close();
        console.log(`🧹 Cleaned up MCP client for session: ${sessionId}`);
      } catch (error) {
        console.warn(`⚠️  Error cleaning up MCP client: ${error}`);
      }
    }

    activeSessions.delete(sessionId);
    console.log(`🗑️  Session ${sessionId} deleted`);
  }

  res.json({ success: true });
};

// Clean up old sessions periodically
setInterval(() => {
  const now = new Date();
  const expiredSessions: string[] = [];

  for (const [sessionId, session] of activeSessions.entries()) {
    const ageInMinutes =
      (now.getTime() - session.createdAt.getTime()) / (1000 * 60);

    // Expire sessions after 30 minutes of inactivity
    if (ageInMinutes > 30) {
      expiredSessions.push(sessionId);
    }
  }

  for (const sessionId of expiredSessions) {
    const session = activeSessions.get(sessionId);
    if (session?.mcpClient) {
      try {
        session.mcpClient.close();
      } catch (error) {
        console.warn(`Error closing expired session ${sessionId}:`, error);
      }
    }
    activeSessions.delete(sessionId);
  }

  if (expiredSessions.length > 0) {
    console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
  }

  // Clean up used codes
  if (usedCodes.size > 1000) {
    usedCodes.clear();
    console.log("Cleared used authorization codes cache");
  }
}, 60000); // Clean every minute

// Routes
router.get("/test", (req, res) => {
  res.json({
    message: "OAuth server is running",
    redirectUri: REDIRECT_URI,
    clientId: GITLAB_CLIENT_ID ? "Set" : "Missing",
    activeSessions: activeSessions.size,
  });
});

router.post("/oauth/callback", oauthCallbackHandler);
router.post("/chat", chatHandler);
router.get("/session/:sessionId/status", sessionStatusHandler);
router.delete("/session/:sessionId", cleanupSessionHandler);

app.use("/api", router);

// Graceful shutdown
const gracefulShutdown = () => {
  console.log("🛑 Shutting down gracefully...");

  // Clean up all active sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.mcpClient) {
      try {
        session.mcpClient.close();
      } catch (error) {
        console.warn(
          `Error closing session ${sessionId} during shutdown:`,
          error
        );
      }
    }
  }

  activeSessions.clear();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

app.listen(PORT, () => {
  console.log(`OAuth server listening at http://localhost:${PORT}`);
  console.log("Available endpoints:");
  console.log("- POST /api/oauth/callback");
  console.log("- POST /api/chat");
  console.log("- GET /api/session/:sessionId/status");
  console.log("- DELETE /api/session/:sessionId");
});

export { activeSessions };
