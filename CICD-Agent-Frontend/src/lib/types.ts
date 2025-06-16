// types.ts - Frontend types to match backend interfaces

export interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "agent";
  timestamp: string;
}

export interface OAuthCallbackResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  sessionId: string;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  timestamp: string;
}

export interface SessionStatusResponse {
  sessionId: string;
  isActive: boolean;
  createdAt: string;
  hasAgent: boolean;
}

export interface ApiError {
  error: string;
  error_description?: string;
  details?: string;
}
