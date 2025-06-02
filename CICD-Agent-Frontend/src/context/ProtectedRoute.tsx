import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import React from "react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();

  if (!token) {
    // Not authenticated — redirect to login
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
