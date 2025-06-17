import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Authenticating...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    // Create a unique key for this authentication attempt
    const attemptKey = `auth_attempt_${code}`;

    // Check if we've already processed this code
    if (code && sessionStorage.getItem(attemptKey)) {
      console.log("Code already processed, redirecting...");
      setStatus("Already processed! Redirecting...");
      setTimeout(() => (window.location.href = "/chat"), 1000);
      return;
    }

    if (error) {
      setStatus(`Authentication failed: ${error}`);
      return;
    }

    if (!code) {
      setStatus("No authorization code received");
      return;
    }

    // Mark this code as being processed
    sessionStorage.setItem(attemptKey, "processing");

    // Process the authentication
    fetch("https://gitlab-cicd-agent-backend.onrender.com/api/oauth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.access_token && data.sessionId) {
          // Store both access token and session ID
          localStorage.setItem("accessToken", data.access_token);
          localStorage.setItem("sessionId", data.sessionId);
          sessionStorage.setItem(attemptKey, "completed");
          setStatus("Success! Redirecting...");
          setTimeout(() => (window.location.href = "/chat"), 1000);
        } else {
          throw new Error(data.error_description || "Authentication failed");
        }
      })
      .catch((error) => {
        console.error("Auth error:", error);
        setStatus(`Authentication failed: ${error.message}`);
        sessionStorage.removeItem(attemptKey);
      });
  }, [searchParams]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <div className="text-xl mb-4">{status}</div>
        {status.includes("failed") && (
          <button
            onClick={() => (window.location.href = "/chat")}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Return to Chat
          </button>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
