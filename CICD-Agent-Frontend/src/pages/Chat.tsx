import React, { useState, useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatedGradientText } from "@/components/magicui/animated-gradient-text";
import { AuroraText } from "@/components/magicui/aurora-text";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { Input } from "@/components/ui/input";
import { FaGitlab } from "react-icons/fa6";
import { FaGoogle } from "react-icons/fa6";
import type { ChatMessage } from "@/lib/types";

const Chat: React.FC = () => {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isGitLabConnected, setIsGitLabConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const scrollContainer = document.querySelector(".scroll-area-viewport");
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatHistory]);

  useEffect(() => {
    const gitlabToken = localStorage.getItem("accessToken");
    const storedSessionId = localStorage.getItem("sessionId");

    if (gitlabToken && storedSessionId) {
      setIsGitLabConnected(true);
      setSessionId(storedSessionId);

      // Verify session is still active
      fetch(`https://gitlab-cicd-agent-backend.onrender.com/api/session/${storedSessionId}/status`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.isActive) {
            // Session expired, clear storage
            localStorage.removeItem("accessToken");
            localStorage.removeItem("sessionId");
            setIsGitLabConnected(false);
            setSessionId(null);
          }
        })
        .catch((err) => {
          console.warn("Could not verify session status:", err);
        });
    }
  }, []);

  // Add this debugging version of sendMessage to your Chat component:

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return;

    if (!sessionId) {
      setError("Please connect with GitLab first");
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message.trim(),
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    setChatHistory((prev) => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);
    setError(null);

    console.log("🚀 Sending message:", {
      sessionId,
      message: userMessage.content,
      url: "https://gitlab-cicd-agent-backend.onrender.com/api/chat",
    });

    try {
      const response = await fetch("https://gitlab-cicd-agent-backend.onrender.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: userMessage.content,
        }),
      });

      console.log("📨 Response received:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        url: response.url,
      });

      // Check if the response is actually JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.error("❌ Non-JSON response received:", textResponse);
        throw new Error(
          `Server returned non-JSON response. Status: ${
            response.status
          }. Response: ${textResponse.substring(0, 200)}`
        );
      }

      const data = await response.json();
      console.log("✅ JSON data parsed:", data);

      if (!response.ok) {
        if (response.status === 404) {
          // Session expired
          localStorage.removeItem("accessToken");
          localStorage.removeItem("sessionId");
          setIsGitLabConnected(false);
          setSessionId(null);
          throw new Error("Session expired. Please reconnect with GitLab.");
        }
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        sender: "agent",
        timestamp: data.timestamp,
      };

      setChatHistory((prev) => [...prev, agentMessage]);
    } catch (err) {
      let errorMessage = "An error occurred";

      if (err instanceof TypeError && err.message.includes("fetch")) {
        errorMessage =
          "Cannot connect to server. Make sure the backend is running on localhost:4000";
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      console.error("❌ Chat error:", err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const connectWithGitLab = () => {
    const clientId = import.meta.env.VITE_GITLAB_CLIENT_ID;
    const redirectUri = "https://git-lab-cicd-agent.vercel.app/oauth/callback";
    const scope = "read_user api";

    const url = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${encodeURIComponent(scope)}`;

    console.log("Initiating GitLab OAuth with:", {
      clientId,
      redirectUri,
      scope,
    });

    window.location.href = url;
  };

  const connectWithGoogleCloud = () => {
    window.open(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_ID",
      "_blank"
    );
  };

  const clearChat = () => {
    setChatHistory([]);
    setError(null);
  };

  const disconnect = () => {
    if (sessionId) {
      // Clean up session on server
      fetch(`https://gitlab-cicd-agent-backend.onrender.com/api/session/${sessionId}`, {
        method: "DELETE",
      }).catch((err) => console.warn("Error cleaning up session:", err));
    }

    localStorage.removeItem("accessToken");
    localStorage.removeItem("sessionId");
    setIsGitLabConnected(false);
    setSessionId(null);
    setChatHistory([]);
    setError(null);
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-black text-white px-4 py-8">
      <header className="fixed top-0 left-0 z-50 w-full px-6 py-4">
        <div className="mx-auto flex max-w-7xl mt-2 items-center justify-between">
          <span className="text-2xl font-medium tracking-tight text-white">
            Agentic <AuroraText>Chat</AuroraText>
          </span>
          <div className="flex gap-4">
            <ShimmerButton
              onClick={isGitLabConnected ? disconnect : connectWithGitLab}
              className={cn(
                "text-sm px-4 py-2 flex items-center",
                isGitLabConnected && "bg-green-600 hover:bg-green-700"
              )}
            >
              {isGitLabConnected ? (
                <>
                  <FaGitlab className="mr-2" />
                  Connected ✓
                </>
              ) : (
                <>
                  <FaGitlab className="mr-2" />
                  Connect with GitLab
                </>
              )}
            </ShimmerButton>

            <ShimmerButton
              onClick={connectWithGoogleCloud}
              className="text-sm px-4 py-2"
            >
              <FaGoogle className="mr-2" />
              Connect with Google Cloud
            </ShimmerButton>

            {isGitLabConnected && (
              <ShimmerButton
                onClick={clearChat}
                className="text-sm px-4 py-2 bg-slate-600 hover:bg-slate-700"
              >
                Clear Chat
              </ShimmerButton>
            )}
          </div>
        </div>
      </header>

      <div className="z-10 mb-8 mt-24 text-center text-4xl font-semibold leading-tight text-transparent bg-gradient-to-b from-white to-slate-400/80 bg-clip-text">
        Talk to your CI/CD Agent <br />
        in real-time
      </div>

      <div className="w-full max-w-3xl h-[60vh] rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-lg backdrop-blur-md border border-white/10 flex flex-col">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700/50 rounded-md text-red-200 text-sm">
            {error}
          </div>
        )}

        <ScrollArea className="flex-1 pr-4 overflow-y-auto space-y-3 max-h-[100%]">
          {!isGitLabConnected ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <FaGitlab className="mx-auto mb-4 h-12 w-12" />
                <p>
                  Connect with GitLab to start chatting with your CI/CD agent
                </p>
              </div>
            </div>
          ) : chatHistory.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <p className="mb-2">🤖 Your CI/CD agent is ready!</p>
                <p className="text-sm">
                  Ask me about your GitLab projects, repositories, or CI/CD
                  pipelines.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "p-3 rounded-lg max-w-[80%] text-sm break-words overflow-hidden",
                    msg.sender === "user"
                      ? "bg-blue-600/80 ml-auto text-right"
                      : "bg-slate-700/60 mr-auto"
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                  <div className="text-xs text-slate-300 mt-1 opacity-70">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="bg-slate-700/60 p-3 rounded-lg max-w-[80%] text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Agent is thinking...</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="mt-4 flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={
              isGitLabConnected
                ? "Ask about your GitLab projects, create issues, manage files..."
                : "Connect with GitLab to start chatting"
            }
            disabled={!isGitLabConnected || isLoading}
            className="flex-1 bg-slate-800 border-slate-700 text-white disabled:opacity-50"
          />
          <ShimmerButton
            onClick={sendMessage}
            disabled={!isGitLabConnected || isLoading || !message.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </ShimmerButton>
        </div>
      </div>

      {/* Status Banner */}
      <div className="mt-8 group relative flex items-center justify-center rounded-full px-4 py-1.5 shadow-[inset_0_-8px_10px_#8fdfff1f] transition-shadow duration-500 ease-out hover:shadow-[inset_0_-5px_10px_#8fdfff3f]">
        <span
          className={cn(
            "absolute inset-0 block h-full w-full animate-gradient rounded-[inherit] bg-gradient-to-r from-[#ffaa40]/50 via-[#9c40ff]/50 to-[#ffaa40]/50 bg-[length:300%_100%] p-[1px]"
          )}
          style={{
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "destination-out",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "subtract",
            WebkitClipPath: "padding-box",
          }}
        />
        💬 <hr className="mx-2 h-4 w-px shrink-0 bg-neutral-500" />
        <AnimatedGradientText className="text-sm font-medium">
          {isGitLabConnected
            ? "Your CI/CD AI Agent is ready"
            : "Connect with GitLab to get started"}
        </AnimatedGradientText>
        <ArrowRight className="ml-1 size-4 stroke-neutral-500 group-hover:translate-x-0.5 transition-transform duration-300" />
      </div>
    </div>
  );
};

export default Chat;
