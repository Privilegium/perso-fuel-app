"use client";
import { useLayoutEffect } from "react";

export function finishLaunch() {
  document.getElementById("app-launch-loader")?.remove();
}
export function LaunchReady() {
  useLayoutEffect(finishLaunch, []);
  return null;
}
