import { createRoot } from "react-dom/client";
import App from "./App";
import "../index.css";
import { loadSavedTheme } from "@/features/settings/settings-view";

loadSavedTheme();

createRoot(document.getElementById("root")!).render(<App />);
