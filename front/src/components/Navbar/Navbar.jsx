import React from "react";
import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="bg-blue-600 p-4 shadow-lg">
      <div className="container mx-auto">
        <Link to="/">
            <button className="text-white font-semibold text-lg">Home</button>
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
