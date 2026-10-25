import React from "react";
import { createRoot } from "react-dom/client";
import { GameApp } from "./game/GameApp.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(<GameApp />);
