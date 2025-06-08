import React, { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils"; // for conditional classNames
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatedGradientText } from "@/components/magicui/animated-gradient-text";
import { AuroraText } from "@/components/magicui/aurora-text";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { Input } from "@/components/ui/input";
import { FaGitlab } from "react-icons/fa6";
import { FaGoogle } from "react-icons/fa6";

const Chat: React.FC = () => {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const [isGitLabConnected, setIsGitLabConnected] = useState(false);

  useEffect(() => {
    const scrollContainer = document.querySelector(".scroll-area-class");
    scrollContainer?.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: "smooth",
    });
  }, [chatHistory]);

  useEffect(() => {
    const gitlabToken = localStorage.getItem("accessToken");
    if (gitlabToken) {
      setIsGitLabConnected(true);
    }
  }, []);

  const sendMessage = () => {
    if (message.trim()) {
      setChatHistory([...chatHistory, message]);
      setMessage("");
    }
  };

  const connectWithGitLab = () => {
    const clientId = import.meta.env.VITE_GITLAB_CLIENT_ID;
    const redirectUri = "http://localhost:5173/oauth/callback"; // Match backend exactly
    const scope = "read_user api"; // Add 'api' scope for more permissions

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

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-black text-white px-4 py-8">
      <header className="fixed top-0 left-0 z-50 w-full px-6 py-4">
        <div className="mx-auto flex max-w-7xl mt-2 items-center justify-between">
          <span className="text-2xl font-medium tracking-tight text-white">
            Agentic <AuroraText>Chat</AuroraText>
          </span>
          <div className="flex gap-4">
            <ShimmerButton
              onClick={connectWithGitLab}
              className={cn(
                "text-sm px-4 py-2 flex items-center",
                isGitLabConnected && "bg-green-600 hover:bg-green-700"
              )}
              disabled={isGitLabConnected}
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
          </div>
        </div>
      </header>

      <div className="z-10 mb-8 mt-24 text-center text-4xl font-semibold leading-tight text-transparent bg-gradient-to-b from-white to-slate-400/80 bg-clip-text">
        Talk to your CI/CD Agent <br />
        in real-time
      </div>

      <div className="w-full max-w-3xl h-[60vh] rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-lg backdrop-blur-md border border-white/10 flex flex-col">
        <ScrollArea className="flex-1 pr-4 space-y-3 overflow-y-auto">
          {chatHistory.map((msg, index) => (
            <div
              key={index}
              className="bg-slate-700/60 p-3 rounded-md w-fit max-w-full text-sm"
            >
              {msg}
            </div>
          ))}
        </ScrollArea>

        <div className="mt-4 flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Type your message..."
            className="flex-1 bg-slate-800 border-slate-700 text-white"
          />
          <ShimmerButton onClick={sendMessage}>
            <ArrowRight className="h-4 w-4" />
          </ShimmerButton>
        </div>
      </div>

      {/* Optional Banner */}
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
          Your CI/CD AI Agent is listening
        </AnimatedGradientText>
        <ArrowRight className="ml-1 size-4 stroke-neutral-500 group-hover:translate-x-0.5 transition-transform duration-300" />
      </div>
    </div>
  );
};

export default Chat;
