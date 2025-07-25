// types.ts
export interface GitLabOAuthResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export interface ChatSession {
  token: string;
  // agent: any;
  // mcpClient: any;
  createdAt: Date;
}
