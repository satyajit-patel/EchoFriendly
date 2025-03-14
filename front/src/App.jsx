import { GoogleGeminiEffectDemo } from "./components/BackgroundLines/GoogleGeminiEffectDemo";
import Home from "./components/Home/Home";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import NewHome from "./components/Home/NewHome"

const AppContent = () => {
  const location = useLocation();
  
  return (
    <>
      {location.pathname !== "/" && <Navbar />}
      <Routes>
        <Route path="/" element={<GoogleGeminiEffectDemo />} />
        {/* <Route path="/Home" element={<Home />} /> */}
        <Route path="/Home" element={<NewHome />} />
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
