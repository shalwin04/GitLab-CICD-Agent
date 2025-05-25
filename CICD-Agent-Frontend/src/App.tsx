import "./App.css";
import { Globe } from "./components/magicui/globe";
import { AnimatedGradientText } from "./components/magicui/animated-gradient-text";
import { ChevronRight } from "lucide-react";
import { cn } from "./lib/utils";
import { AuroraText } from "./components/magicui/aurora-text";
import { ShimmerButton } from "./components/magicui/shimmer-button";
import { InteractiveHoverButton } from "./components/magicui/interactive-hover-button";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { useState } from "react";

function App() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black dark:bg-black">
        <header className="fixed top-0 left-0 z-50 w-full px-6 py-4">
          <div className="mx-auto flex max-w-7xl mt-2 items-center justify-between">
            {/* Logo on the left */}
            <span className="text-2xl font-medium tracking-tight text-white md:text-xl lg:text-2xl">
              Agentic <span> </span>
              <AuroraText>CI/CD</AuroraText>
            </span>
            <div className="flex items-center gap-4">
              <InteractiveHoverButton onClick={() => setLoginOpen(true)}>
                Login
              </InteractiveHoverButton>
              <ShimmerButton
                className="shadow-2xl"
                onClick={() => setSignUpOpen(true)}
              >
                <span className="whitespace-pre-wrap text-center text-sm font-medium leading-none tracking-tight text-white dark:from-white dark:to-slate-900/10 lg:text-lg">
                  Try Now
                </span>
              </ShimmerButton>
            </div>
            <Login open={loginOpen} onOpenChange={setLoginOpen} />
            <SignUp open={signUpOpen} onOpenChange={setSignUpOpen} />
          </div>
        </header>
        <div className="relative w-full h-full max-w-[1000px] max-h-[1000px] flex flex-col items-center justify-center">
          <div className="group relative mb-10 mx-auto flex items-center justify-center rounded-full px-4 py-1.5 shadow-[inset_0_-8px_10px_#8fdfff1f] transition-shadow duration-500 ease-out hover:shadow-[inset_0_-5px_10px_#8fdfff3f] ">
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
            🎉 <hr className="mx-2 h-4 w-px shrink-0 bg-neutral-500" />
            <AnimatedGradientText className="text-sm font-medium">
              Introducing Agentic CI/CD
            </AnimatedGradientText>
            <ChevronRight className="ml-1 size-4 stroke-neutral-500 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5" />
          </div>
          <span className="z-10 mb-48 pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-white to-slate-400/80 bg-clip-text text-center text-5xl font-semibold leading-none text-transparent dark:from-white dark:to-slate-500/20">
            Automate your GitLab CI/CD workflows <br /> using natural language.
          </span>
          <Globe className="top-28 mt-72 w-[90vw] h-[90vw] max-w-[700px] max-h-[700px]" />
          {/* <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_200%,rgba(255,255,255,0.1),transparent)]" /> */}
        </div>
      </div>
    </>
  );
}

export default App;
