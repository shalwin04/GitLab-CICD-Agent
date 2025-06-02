// src/context/AuthProvider.tsx
import * as React from "react";
import type { ReactNode } from "react";
import { AuthContext } from "./authContext";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = React.useState<string | null>(
    localStorage.getItem("accessToken")
  );
  React.useEffect(() => {
    const storedToken = localStorage.getItem("accessToken");
    if (storedToken) setToken(storedToken);
  }, []);

  return (
    <AuthContext.Provider value={{ token, setToken }}>
      {children}
    </AuthContext.Provider>
  );
};
