import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Exora could not find its application root.");

createRoot(root).render(<App />);
