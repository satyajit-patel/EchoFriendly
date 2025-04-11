import { GoogleGeminiEffectDemo } from "./components/BackgroundLines/GoogleGeminiEffectDemo";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import Home from "./components/Home/Home"
import { useEffect } from "react";
import axios from "axios";

const AppContent = () => {
  const location = useLocation();

  useEffect(() => {
    const VITE_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
    const wakeUpSidd = async () => {
      const response = await axios.get(`${VITE_BACKEND_URL}/ping`);
      console.log(response.data);
    }
    wakeUpSidd();
  }, []);
  
  return (
    <>
      {location.pathname !== "/" && <Navbar />}
      <Routes>
        <Route path="/" element={<GoogleGeminiEffectDemo />} />
        <Route path="/Home" element={<Home />} />
      </Routes>
    </>
  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
