// utils/exchangeGitLabToken.ts
import fetch from "node-fetch";
import type { GitLabOAuthResponse } from "../types.js";

export async function exchangeGitlabToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<GitLabOAuthResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://gitlab.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitLab token fetch failed: ${response.status} - ${errorText}`
    );
  }

  return (await response.json()) as GitLabOAuthResponse;
}
