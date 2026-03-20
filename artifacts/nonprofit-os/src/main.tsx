import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadSavedTheme } from "./components/settings-view";

loadSavedTheme();

createRoot(document.getElementById("root")!).render(<App />);
