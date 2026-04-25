/**
 * Application Entry Point
 *
 * React 18 createRoot API for concurrent mode.
 * Renders the App component into the #root DOM element.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
