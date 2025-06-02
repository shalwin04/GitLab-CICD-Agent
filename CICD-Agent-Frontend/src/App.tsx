import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import Chat from "./pages/Chat";
import AuthCallback from "./pages/AuthCallback";
// import ProtectedRoute from "./context/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/chat"
        element={
          // <ProtectedRoute>
          //   <Chat />
          // </ProtectedRoute>
          <Chat />
        }
      />
      <Route path="/auth/callback" element={<AuthCallback />} />
      {/* <Route path="*" element={<NotFound />} /> */}
    </Routes>
  );
}

export default App;
