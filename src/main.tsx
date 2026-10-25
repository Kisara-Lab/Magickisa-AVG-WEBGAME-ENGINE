import { createRoot } from "react-dom/client";
import { GameApp } from "./game/GameApp";
import "./styles.css";
import "./restored.css";
createRoot(document.getElementById("root")!).render(<GameApp />);
