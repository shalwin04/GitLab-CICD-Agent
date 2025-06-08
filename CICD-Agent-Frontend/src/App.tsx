import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import Chat from "./pages/Chat";
import AuthCallback from "./pages/AuthCallback";
// import ProtectedRoute from "./context/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/oauth/callback" element={<AuthCallback />} />
      <Route path="/chat" element={<Chat />} />
      {/* <Route path="*" element={<NotFound />} /> */}
    </Routes>
  );
}

export default App;
