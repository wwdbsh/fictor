import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createTrack1RaceSelection } from "./application";
import { RaceSelectApp } from "./presentation/race-select";
import "./presentation/styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("애플리케이션 루트 요소를 찾을 수 없습니다.");
}

const localStorageAdapter = {
  getItem(key: string) { return window.localStorage.getItem(key); },
  setItem(key: string, value: string) { window.localStorage.setItem(key, value); },
  removeItem(key: string) { window.localStorage.removeItem(key); },
};
const raceSelection = createTrack1RaceSelection({ storage: localStorageAdapter, baseUrl: import.meta.env.BASE_URL });
createRoot(rootElement).render(
  <StrictMode>
    <RaceSelectApp selection={raceSelection} />
  </StrictMode>,
);
