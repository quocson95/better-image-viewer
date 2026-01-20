//import { open } from '@tauri-apps/plugin-dialog';
// when using `"withGlobalTauri": true`, you may use
const { open } = window.__TAURI__.dialog;
const { invoke } = window.__TAURI__.core;

const greetInputEl = document.querySelector("#greet-input");
const greetMsgEl = document.querySelector("#greet-msg");

window.addEventListener("DOMContentLoaded", async () => {
  document.querySelector("#greet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    greetMsgEl.textContent = await selectFile();
  });
});

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

async function selectFile() {
  // Open a dialog
  const file = await open({
    multiple: false,
    directory: false,
  });

  return file;
};