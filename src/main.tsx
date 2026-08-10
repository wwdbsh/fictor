import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./presentation/App";
import "./presentation/styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("애플리케이션 루트 요소를 찾을 수 없습니다.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
