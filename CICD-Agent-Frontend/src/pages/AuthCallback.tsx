import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../context/useAuth";

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const { setToken } = useAuth();

  useEffect(() => {
    if (code) {
      fetch("http://localhost:4000/api/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.access_token) {
            localStorage.setItem("accessToken", data.access_token);
            setToken(data.access_token);
            window.location.href = "/chat";
          }
        });
    }
  }, [code, setToken]);

  return <div className="text-white">Authenticating...</div>;
};

export default AuthCallback;
