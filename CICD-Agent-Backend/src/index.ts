// index.ts
import express from "express";
import type { RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { exchangeGitlabToken } from "./utils/exchangeGitlabToken.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID!;
const GITLAB_CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET!;

const app = express();
const router = express.Router();
const PORT = 4000;

app.use(cors());
app.use(express.json());

const oauthCallbackHandler: RequestHandler = async (req, res) => {
  const { code } = req.body;
  const redirectUri = "http://localhost:5173/oauth/callback";

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    const data = await exchangeGitlabToken(
      GITLAB_CLIENT_ID,
      GITLAB_CLIENT_SECRET,
      code,
      redirectUri
    );

    if (data.error) {
      res.status(400).json({ error: data.error_description });
      return;
    }

    // Session handling (optional)
    const sessionId = uuidv4();

    // (Optional) send token to MCP
    await fetch("http://localhost:3001/store-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({ token: data.access_token }),
    });

    res.status(200).json({ ...data, sessionId });
  } catch (err) {
    console.error("OAuth Callback Error:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

router.post("/oauth/callback", oauthCallbackHandler);

app.use("/api", router);

app.listen(PORT, () => {
  console.log(`OAuth server listening at http://localhost:${PORT}`);
});
