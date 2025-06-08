import express from "express";
import type { RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { exchangeGitlabToken } from "./utils/exchangeGitlabToken.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID!;
const GITLAB_CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET!;
const REDIRECT_URI = "http://localhost:5173/oauth/callback"; // Centralized

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
    origin: ["http://localhost:5173"], // Explicit CORS
    credentials: true,
  })
);
app.use(express.json());

// Add this to your backend index.ts

// Track used authorization codes to prevent reuse
const usedCodes = new Set<string>();

const oauthCallbackHandler: RequestHandler = async (req, res) => {
  const { code } = req.body;

  console.log("OAuth callback received:");
  console.log(
    "- Code (first 10 chars):",
    code ? code.substring(0, 10) + "..." : "MISSING"
  );
  console.log("- Full request body:", req.body);

  if (!code) {
    console.error("Missing authorization code");
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  // Check if code has already been used
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

  // Mark code as used immediately
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

    // Session handling (optional)
    const sessionId = uuidv4();

    // Send token to MCP (with error handling)
    try {
      await fetch("http://localhost:3001/store-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({ token: data.access_token }),
      });
    } catch (mcpError) {
      console.warn("Failed to send token to MCP:", mcpError);
      // Don't fail the whole request if MCP is down
    }

    res.status(200).json({ ...data, sessionId });
  } catch (err) {
    // Remove code from used set on error so it can be retried
    usedCodes.delete(code);

    console.error("OAuth Callback Error:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err instanceof Error ? err.message : "Unknown error",
    });
    return;
  }
};

// Clean up old codes periodically (optional)
setInterval(() => {
  if (usedCodes.size > 1000) {
    usedCodes.clear();
    console.log("Cleared used authorization codes cache");
  }
}, 60000); // Clean every minute

// Add a test endpoint
router.get("/test", (req, res) => {
  res.json({
    message: "OAuth server is running",
    redirectUri: REDIRECT_URI,
    clientId: GITLAB_CLIENT_ID ? "Set" : "Missing",
  });
});

router.post("/oauth/callback", oauthCallbackHandler);

app.use("/api", router);

app.listen(PORT, () => {
  console.log(`OAuth server listening at http://localhost:${PORT}`);
});
