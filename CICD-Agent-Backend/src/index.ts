import express from "express";
import type { Request, Response, RequestHandler } from "express";
import cors from "cors";
import fetch from "node-fetch"; // or use `undici` in newer Node.js versions
import dotenv from "dotenv";

dotenv.config();

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID!;
const GITLAB_CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET!;

const app = express();
const router = express.Router();
const PORT = 4000;

app.use(cors());
app.use(express.json());

interface OAuthCallbackBody {
  code: string;
}

interface GitLabOAuthResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

const oauthCallbackHandler: RequestHandler<{}, any, OAuthCallbackBody> = async (
  req,
  res
) => {
  const { code } = req.body;
  const redirectUri = "http://localhost:5173/oauth/callback";

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  const params = new URLSearchParams({
    client_id: GITLAB_CLIENT_ID,
    client_secret: GITLAB_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  try {
    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    console.log("Sending token exchange with:", {
      client_id: GITLAB_CLIENT_ID,
      client_secret: GITLAB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    });
    

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `GitLab token fetch failed: ${response.status} - ${errorText}`
      );
      res.status(500).json({ error: "Failed to retrieve token from GitLab" });
      return;
    }

    const data = (await response.json()) as GitLabOAuthResponse;

    if (data.error) {
      res.status(400).json({ error: data.error_description });
      return;
    }

    res.status(200).json(data);
    return;
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    console.error("Unknown error occurred");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

router.post("/oauth/callback", oauthCallbackHandler);

app.use("/api", router);

app.listen(PORT, () => {
  console.log(`OAuth server listening at http://localhost:${PORT}`);
});
