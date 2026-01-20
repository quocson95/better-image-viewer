const { getCurrentWebviewWindow, WebviewWindow } = window.__TAURI__.webviewWindow;
const { invoke, convertFileSrc } = window.__TAURI__.core;
const { shell } = window.__TAURI__;
const { open } = window.__TAURI__.dialog;
const { readDir } = window.__TAURI__.fs;

const webview = getCurrentWebviewWindow();

const img = document.getElementById("imgViewer");
const btnPrev = document.getElementById("prev");
const btnNext = document.getElementById("next");
const printBtn = document.getElementById("printBtn");
const openWithBtn = document.getElementById("openWithBtn");

let icoFrames = [];
let icoIndex = 0;

const icoBar = document.getElementById("icoBar");
const icoPrev = document.getElementById("icoPrev");
const icoNext = document.getElementById("icoNext");
const icoInfo = document.getElementById("icoInfo");

let images = [];
let index = 0;

const gifCanvas = document.getElementById('gifCanvas');
const gifBar = document.getElementById('gifBar');
const ctx = gifCanvas.getContext("2d");
const gifPrev = document.getElementById('gifPrev');
const gifNext = document.getElementById('gifNext');
const gifPlayPause = document.getElementById('gifPlayPause');

const slider  = document.getElementById("slider");
const info    = document.getElementById("info");

let gifReader;
let gifWidth, gifHeight, frameCount;
let currentFrame = 0;
let playing = false;
let timer = null;

let gifLoadToken = 0;

let composited;      // master RGBA buffer
let previous;        // for disposal = 3
let frameDelays = [];

let imageData;

let paused = true;   // true = user-paused
let seekTimer = null;
const SEEK_RESUME_DELAY = 120;

const KEYFRAME_INTERVAL = 10;
const keyframes = new Map();

let isScrubbing = false;
let wasPlayingBeforeScrub = false;

let rotationDegrees = 0;
let scale = 1;
let baseScale = 1;
let translateX = 0;
let translateY = 0;

const MIN_SCALE = 1;     // THIS is the fitted size
const MAX_SCALE = 100;
const ZOOM_SPEED = 0.0015;

let dragging = false;
let lastX = 0;
let lastY = 0;

let isOriginalSize = false;

const imgAmount = document.getElementById('imgAmount');
const zoomValue = document.getElementById('zoomValue');
const imgSize = document.getElementById('imgSize');

const zoomLabel = document.getElementById('zoomLabel');
const imgLabel = document.getElementById('imgLabel');

const originalBtn = document.getElementById('originalSize');

const ZOOM_STEP = 1.25; // 25% per click (adjust if you want)

const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const openWithContextMenu = document.getElementById("openWithContextMenu");

const fileMenuContextMenu = document.getElementById('fileMenuContextMenu');

let openWithImagePath = null;

//const imageSearch = document.getElementById('imageSearch');
const loadingText = document.getElementById("loadingText");
const frame = document.getElementById("middleFrame");
const middleFrame = document.getElementById("middleFrame");

const imgViewerDiv = document.getElementById('imgViewerDiv');

// Store references to open windows keyed by label for control
const imageWindows = new Map();

let currentOpenMenu = null;

// Helper to extract filename from path
function getFileName(path) {
  if (!path) return '';
  return path.split(/[/\\]/).pop();
}

// Helper to get file extension in lowercase
function getExt(path) {
  if (!path) return 'No file selected';
  return path.split(".").pop().toLowerCase();
}

// Open image in a new window with unique label and keep reference
function openImageInNewWindow(imagePath) {
  const label = `image-window-${Date.now()}`;
  const newWindow = new WebviewWindow(label, {
    url: `index.html?image=${imagePath}`,
    width: 800,
    height: 600,
    title: `${getFileName(imagePath)} - Better Image Viewer`
  });

  imageWindows.set(label, newWindow);

  newWindow.once('tauri://close', () => {
    imageWindows.delete(label);
  });

  return label;
}

// Update image dynamically in an existing window by label
function updateImageInWindow(label, newImagePath) {
  const win = imageWindows.get(label);
  if (win) {
    win.emit('update-image', newImagePath);
  } 
  else {
    console.warn(`No window found with label ${label}`);
  }
}

// Get URL query parameter helper
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// On load, if image query param exists, load and display image
window.addEventListener('DOMContentLoaded', async () => {
  const imagePath = getQueryParam('image');
  if (imagePath) {
    if (img) {
      showLoading();
      img.src = convertFileSrc(imagePath);
    }
  }
  //await webview.show();
});

async function showImage() {
  zoomLabel.style.display = 'none';
  imgLabel.style.display = 'none';
  imgSize.textContent = '';
  zoomValue.textContent = '';

  resetGifUI(); 
  showLoading();

  if (!images.length) {
    clearViewer();
    return;
  }

  const path = images[index];
  const ext = getExt(path);

  icoBar.classList.add("hidden");
  icoFrames = [];
  icoIndex = 0;

  gifCanvas.classList.add("hidden");
  gifBar.classList.add("hidden");
  img.classList.remove("hidden");

  if (ext === "ico") {
    showLoading();
    await nextImgFrame(); 
    icoFrames = await invoke("load_ico_frames", { path });
    icoIndex = 0;
    icoBar.classList.remove("hidden");
    showIcoFrame();
  }
  else if (ext === "tif" || ext === "tiff") {
    showLoading();
    const data = await invoke("load_image", { path });
    const blob = new Blob([new Uint8Array(data)], { type: "image/png" });
    img.src = URL.createObjectURL(blob);
  } 
  else if (ext === "gif") {
    showLoading();
    img.classList.add("hidden");
    gifCanvas.classList.remove("hidden");
    icoBar.classList.add("hidden");
    gifBar.classList.remove("hidden");
    await loadGIF(path);
  }
  else {
    img.src = convertFileSrc(path);
  }

  // Apply rotation (which is reset to 0 here)
  img.style.transform = `translate(0px, 0px) scale(1) rotate(${rotationDegrees}deg)`;

  await webview.setTitle(`${getFileName(path)} (${index + 1}/${images.length}) - Better Image Viewer`);
  imgAmount.textContent = `${index + 1}/${images.length}`;
}

function nextImgFrame() {
  return new Promise(requestAnimationFrame);
}

// Initialize images array and index from backend on app start
(async () => {
  const path = await invoke("get_opened_image");
  if (!path) return;

  const [list, startIndex] = await invoke("get_folder_images", {
    currentPath: path
  });

  images = list;
  index = startIndex;

  await showImage();
})();

// Next and previous image handlers
async function nextImage() {
  showLoading();
  if (!images.length) return;
  index = (index + 1) % images.length;
  await showImage();
}

async function prevImage() {
  showLoading();
  if (!images.length) return;
  index = (index - 1 + images.length) % images.length;
  await showImage();
}

btnNext.addEventListener("click", nextImage);
btnPrev.addEventListener("click", prevImage);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") nextImage();
  if (e.key === "ArrowLeft") prevImage();
  if (e.key === "ArrowUp") nextImage();
  if (e.key === "ArrowDown") prevImage();
  if (e.key === "F5") {
    e.preventDefault();
    //reloadCurrentImage();
    location.reload(true); // force hard reload
  }
});

function reloadCurrentImage() {
  const img = document.getElementById("imgViewer");
  if (!img.src) return;

  const originalSrc = img.src.split("?")[0]; // remove previous cache buster if any
  img.src = originalSrc + "?reload=" + Date.now();

  console.log("img reloaded")
}


// Icon frames handling for ICO files
async function showIcoFrame() {
  showLoading();
  await nextImgFrame();

  const frame = icoFrames[icoIndex];

  const blob = new Blob(
    [new Uint8Array(frame.data)],
    { type: "image/png" }
  );

  img.src = URL.createObjectURL(blob);

  icoInfo.textContent = `Frame ${icoIndex + 1} / ${icoFrames.length} — ${frame.width}×${frame.height}`;
}

icoNext.addEventListener("click", async () => {
  icoIndex = (icoIndex + 1) % icoFrames.length;
  await showIcoFrame()
});

icoPrev.addEventListener("click", async () => {
  icoIndex = (icoIndex - 1 + icoFrames.length) % icoFrames.length;
  await showIcoFrame();
});

// --- Open With Context Menu ---

async function showOpenWithMenu(x, y) {
  const path = images[index];
  if (!path) {
    alert("No image loaded.");
    return;
  }
  openWithImagePath = path;
  const apps = await invoke("get_open_with_apps", { path });

  openWithContextMenu.querySelectorAll(".ctx-item.app").forEach(e => e.remove());

  for (const [exe, label, iconBytes] of apps) {
    const item = document.createElement("div");
    item.className = "ctx-item app";
    item.dataset.action = "openWithApp";
    item.dataset.app = exe;

    const iconContainer = document.createElement("div");
    iconContainer.className = "app-icon";

    if (iconBytes && iconBytes.length > 0) {
      const iconUrl = await fixIconColors(iconBytes);
      const imgIcon = document.createElement("img");
      imgIcon.src = iconUrl;
      imgIcon.className = "app-icon-img";
      iconContainer.appendChild(imgIcon);
    } 
    else {
      const fallback = document.createElement("div");
      fallback.className = "app-icon-fallback";
      fallback.textContent = label.charAt(0).toUpperCase();
      iconContainer.appendChild(fallback);
    }

    const textSpan = document.createElement("span");
    textSpan.className = "app-name";
    textSpan.textContent = label;

    item.appendChild(iconContainer);
    item.appendChild(textSpan);

    openWithContextMenu.insertBefore(item, openWithSeparator);
  }

  openWithContextMenu.style.left = `${x}px`;
  openWithContextMenu.style.top = `${y}px`;
  openWithContextMenu.style.display = "block";
}

async function fixIconColors(iconBytes) {
  const uint8Array = new Uint8Array(iconBytes);
  const blob = new Blob([uint8Array], { type: "image/png" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const imgFix = new Image();
    imgFix.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = imgFix.width;
      canvas.height = imgFix.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgFix, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const temp = data[i];
        data[i] = data[i + 2];
        data[i + 2] = temp;
      }

      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob((fixedBlob) => {
        const fixedUrl = URL.createObjectURL(fixedBlob);
        resolve(fixedUrl);
      }, "image/png");
    };
    imgFix.src = url;
  });
}

openWithContextMenu.addEventListener("click", async (e) => {
  e.stopPropagation();
  const item = e.target.closest(".ctx-item");
  if (!item) return;

  const action = item.dataset.action;
  try {
    if (action === "openWithApp") {
      await invoke("open_with_app", {
        app: item.dataset.app,
        path: openWithImagePath,
      });
    }

    if (action === "openWithDialog") {
      await invoke("open_with_dialog", {
        path: openWithImagePath,
      });
    }
  } 
  catch (err) {
    console.error("Error invoking command:", err);
  }

  openWithContextMenu.style.display = "none";
});

document.addEventListener("click", (e) => {
  if (!openWithContextMenu.contains(e.target)) {
    openWithContextMenu.style.display = "none";
  }
  if (!fileMenuContextMenu.contains(e.target)) {
    fileMenuContextMenu.style.display = "none";
  }
});

openWithBtn.addEventListener("click", (e) => {
  e.stopPropagation();

  // If already open → close it
  if (openWithContextMenu.style.display === "block") {
    openWithContextMenu.style.display = "none";
    return;
  }

  // Otherwise open it
  const rect = e.currentTarget.getBoundingClientRect();
  showOpenWithMenu(0, rect.bottom);
});

// --- Print Button ---

printBtn.addEventListener('click', async () => {
  if (!images.length) {
    alert("No image loaded.");
    return;
  }

  const filePath = images[index];

  await invoke('open_native_print_dialog', { path: filePath }).catch(console.error);
});

// --- Image Search ---

/* imageSearch.addEventListener('click', async () => {
  await shell.open('https://images.google.com/');
}); */

// --- Open current image in new window ---

/* document.getElementById("openInNewWindow").addEventListener("click", () => {
  if (!images.length) return;

  const currentImagePath = images[index];
  console.log("Opening in new window:", currentImagePath);
  openImageInNewWindow(currentImagePath);
});
 */

// --- FILE SELECTOR ---


async function openFileSelect() {
  const selected = await open({
    multiple: false,
    filters: [
      { 
        name: "Image", 
        extensions: [
          "png","jpeg","jpg","gif","bmp","ico","tif","tiff","avif",
          "webp","cur","svg","jfif"
        ] 
      }
    ]
  });

  if (!selected) return;

  const path = Array.isArray(selected) ? selected[0] : selected;

  // --- KEY POINT: Update backend stored path ---
  await invoke("set_opened_image", { path });

  // --- Regenerate folder list based on new path ---
  const [list, startIndex] = await invoke("get_folder_images", {
    currentPath: path
  });

  images = list;
  index = startIndex;

  // --- Finally display the image ---
  await showImage();
}

async function openFolderSelect() {
  const selected = await open({ 
    multiple: false, 
    directory: true 
  });
  
  if (!selected) return;
  
  const folderPath = Array.isArray(selected) ? selected[0] : selected;
  
  // read folder with new API
  const files = await readDir(folderPath);
  
  const allowed = [
    "png", "jpeg", "jpg", "gif", "bmp", "ico", "tif", "tiff",
    "avif", "webp", "cur", "svg", "jfif"
  ];
  
  const imageFiles = files
    .filter(entry => !entry.isDirectory)
    .filter(entry => {
      const ext = entry.name.split(".").pop().toLowerCase();
      return allowed.includes(ext);
    })
    .map(entry => {
      // Construct full path properly
      // Remove any trailing slashes from folderPath
      const cleanFolder = folderPath.replace(/[\\/]+$/, '');
      // Use forward slash for consistency (Tauri handles this)
      return `${cleanFolder}/${entry.name}`;
    });
  
  if (imageFiles.length === 0) {
    console.warn("No images in folder");
    return;
  }
  
  const firstImage = imageFiles[0];
  
  // update backend opened path
  try {
    await invoke("set_opened_image", { path: firstImage });
  } 
  catch (error) {
    console.error("Error calling set_opened_image:", error);
    return;
  }
  
  // update images list
  try {
    const [list, startIndex] = await invoke("get_folder_images", { 
      currentPath: firstImage 
    });
    
    images = list;
    index = startIndex;
    
    // show UI image
    await showImage();
  } 
  catch (error) {
    console.error("Error calling get_folder_images:", error);
  }
}

function showLoading() {
  loadingText.classList.add("visible");
  img.classList.add("loading");
}

function hideLoading() {
  loadingText.classList.remove("visible");
  img.classList.remove("loading");
}

img.addEventListener("load", hideLoading);
img.addEventListener("error", hideLoading);

// -------------------- NEW GIF SYSTEM ----------------------

gifPlayPause.onclick = () => playing ? pause() : play();

gifPrev.onclick = () => {
  pause();
  const target = (currentFrame - 1 + frameCount) % frameCount;
  resetAndDecodeTo(target);
};

gifNext.onclick = () => {
  pause();
  const target = (currentFrame + 1) % frameCount;
  resetAndDecodeTo(target);
};

function stopGifPlayback() {
  playing = false;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function step() {
  if (!gifReader || frameCount === 0) return;
  decodeFrame(currentFrame, true); // dispose old frame
  currentFrame = (currentFrame + 1) % frameCount;
  decodeFrame(currentFrame, false); // show new frame
  draw();
  if (playing) {
    timer = setTimeout(step, frameDelays[currentFrame]);
  }
}

function play() {
  if (playing) return;
  //updateEQSliderFill(slider);
  playing = true;
  paused = false;
  gifPlayPause.textContent = "⏸";
  timer = setTimeout(step, frameDelays[currentFrame]);
}

function pause() {
  //updateEQSliderFill(slider);
  playing = false;
  paused = true;
  gifPlayPause.textContent = "▶";
  clearTimeout(timer);
}

slider.oninput = e => {
    if (paused) {
      pause();
    }
    resetAndDecodeTo(+e.target.value);
    if (!paused) {
      play();
    }
};

// ---- LOAD GIF -------------------------------------------------

async function loadGIF(path) {
  const token = ++gifLoadToken;
  const url = convertFileSrc(path);
  const res = await fetch(url);
  if (token !== gifLoadToken) return;
  const buf = await res.arrayBuffer();
  if (token !== gifLoadToken) return;

  gifReader = new GifReader(new Uint8Array(buf));

  gifWidth = gifReader.width;
  gifHeight = gifReader.height;
  imgLabel.style.display = 'block';
  imgSize.textContent = `${gifWidth} × ${gifHeight}`;

  computeBaseScaleForGIF();

  frameCount = gifReader.numFrames();

  currentFrame = 0;
  paused = true;

  keyframes.clear();

  //gifCanvas.width = gifWidth;
  //gifCanvas.height = gifHeight;
  gifCanvas.width = middleFrame.clientWidth;
  gifCanvas.height = middleFrame.clientHeight;

  slider.min = 0;
  slider.max = frameCount - 1;
  slider.step = 1;
  slider.value = 0;

  updateEQSliderFill(slider);

  composited = new Uint8Array(gifWidth * gifHeight * 4);
  composited.fill(0);

  keyframes.set(0, composited.slice());

  imageData = ctx.createImageData(gifWidth, gifHeight);

  frameDelays = [];

  for (let i = 0; i < frameCount; i++) {
    frameDelays.push(gifReader.frameInfo(i).delay * 10 || 100);
  }

  resetAndDecodeTo(0);
  hideLoading();
  play();
}

function computeBaseScaleForGIF() {
  const frame = document.getElementById("middleFrame");

  const fw = frame.clientWidth;
  const fh = frame.clientHeight;

  if (!gifWidth || !gifHeight) return;

  // compute scale so GIF fits inside frame
  const scaleX = fw / gifWidth;
  const scaleY = fh / gifHeight;

  scale = 1;
  translateX = 0;
  translateY = 0;
  rotationDegrees = 0;

  updateTransform();
}

window.addEventListener("resize", () => {
  if (!gifReader) return;
  gifCanvas.width = middleFrame.clientWidth;
  gifCanvas.height = middleFrame.clientHeight;
});


// ---- FRAME DECODING ------------------------------------------

let offscreenCanvas = document.createElement("canvas");
let offscreenCtx = offscreenCanvas.getContext("2d");

function clearRect(info) {
  for (let y = info.y; y < info.y + info.height; y++) {
    for (let x = info.x; x < info.x + info.width; x++) {
      const idx = (y * gifWidth + x) * 4;
      composited[idx + 3] = 0;
    }
  }
}

function decodeFrame(i, applyDisposal = true) {
  const info = gifReader.frameInfo(i);

  if (info.disposal === 3) {
    previous = composited.slice();
  }

  gifReader.decodeAndBlitFrameRGBA(i, composited);

  // apply disposal ONLY if requested
  if (applyDisposal) {
    if (info.disposal === 2) {
      clearRect(info);
    } 
    else if (info.disposal === 3 && previous) {
      composited.set(previous);
    }
  }

  if (i % KEYFRAME_INTERVAL === 0) {
    keyframes.set(i, composited.slice());
  }
}

/* function draw() {
  if (currentFrame > frameCount - 1) {
    currentFrame = frameCount - 1;
  }
  imageData.data.set(composited);
  ctx.putImageData(imageData, 0, 0);
  slider.value = currentFrame;
  info.textContent = `Frame: ${currentFrame + 1}/${frameCount}`;

  updateEQSliderFill(slider);
} */
function draw() {
  if (currentFrame > frameCount - 1) {
    currentFrame = frameCount - 1;
  }

  // copy decoded pixels → imageData
  imageData.data.set(composited);

  // update offscreen buffer
  offscreenCanvas.width = gifWidth;
  offscreenCanvas.height = gifHeight;
  offscreenCtx.putImageData(imageData, 0, 0);

  // render with transforms
  renderGifFrame(offscreenCanvas);

  slider.value = currentFrame;
  info.textContent = `Frame: ${currentFrame + 1}/${frameCount}`;

  updateEQSliderFill(slider);
}

function renderGifFrame(source) {
  const canvas = gifCanvas;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  // Move origin to center of canvas
  ctx.translate(canvas.width / 2, canvas.height / 2);

  // Apply viewer transforms
  ctx.translate(translateX, translateY);
  ctx.scale(scale, scale);
  ctx.rotate(rotationDegrees * Math.PI / 180);

  // Draw centered
  ctx.drawImage(
    source,
    -gifWidth / 2,
    -gifHeight / 2
  );

  ctx.restore();
}


function resetAndDecodeTo(target) {
  let start = 0;
  for (const k of keyframes.keys()) {
    if (k <= target && k > start) start = k;
  }

  if (keyframes.has(start)) {
    composited.set(keyframes.get(start));
  } 
  else {
    composited.fill(0);
    keyframes.set(0, composited.slice());
  }

  previous = null;

  for (let i = start + 1; i < target; i++) {
    decodeFrame(i, true);
  }

  decodeFrame(target, false);

  currentFrame = target;
  draw();
}


function updateEQSliderFill(slider) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const val = Number(slider.value);

  if (max <= min) {
    slider.style.background = "#5e5e5eff";
    return;
  }

  const percent = ((val - min) / (max - min)) * 100;

  slider.style.background = `
    linear-gradient(
      to right,
      #ee2727ff ${percent}%,
      #5e5e5eff ${percent}%
    )
  `;
}

slider.addEventListener("input", () => {
  updateEQSliderFill(slider);
});

function resetGifUI() {
  // Stop playback completely
  stopGifPlayback();

  // Kill decoder state
  gifReader = null;
  frameCount = 0;
  currentFrame = 0;
  paused = true;

  keyframes.clear();
  frameDelays = [];

  composited = null;
  previous = null;
  imageData = null;

  // Clear canvas visually
  ctx.clearRect(0, 0, gifCanvas.width, gifCanvas.height);

  // Shrink canvas so browser drops backing store
  gifCanvas.width = 1;
  gifCanvas.height = 1;

  // Reset slider + info
  slider.min = 0;
  slider.max = 0;
  slider.value = 0;
  slider.style.background = "#5e5e5eff";
  info.textContent = "Frame: 0/0";
}

// ------------------------- ZOOM AND DRAG ------------------------

function getActiveViewer() {
  const img = document.getElementById("imgViewer");
  const canvas = document.getElementById("gifCanvas");
  //console.log("img",img.classList.contains("hidden"))
  //console.log("canvas",canvas.classList.contains("hidden"))
  // the one that is NOT hidden is the active viewer
  if (!img.classList.contains("hidden")) return img;
  if (!canvas.classList.contains("hidden")) return canvas;

  return null;
}

img.addEventListener("load", computeBaseScale);

// Mouse wheel zoom in the middleFrame

imgViewerDiv.addEventListener("wheel", e => {
  if (inGridMode) return;  // <-- Do not block wheel scroll!
  //if (!img.src) return;
  e.preventDefault();

  const rect = imgViewerDiv.getBoundingClientRect();

  // mouse position relative to frame center
  const mx = e.clientX - rect.left - rect.width / 2;
  const my = e.clientY - rect.top  - rect.height / 2;

  // image-local coords BEFORE scaling
  const ix = (mx - translateX) / scale;
  const iy = (my - translateY) / scale;

  let newScale = scale * (1 - e.deltaY * ZOOM_SPEED);
  newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

  if (newScale === scale) return;

  // keep pixel under cursor stable
  translateX = mx - ix * newScale;
  translateY = my - iy * newScale;

  scale = newScale;
  updateTransform();
}, { passive: false });

// ---Click + drag pan----

img.addEventListener("mousedown", e => {
  if (e.button !== 0) return;
  if (scale === 1) return;

  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  img.classList.add("dragging");
});

window.addEventListener("mousemove", e => {
  if (!dragging) return;

  translateX += e.clientX - lastX;
  translateY += e.clientY - lastY;

  lastX = e.clientX;
  lastY = e.clientY;

  updateTransform();
});

window.addEventListener("mouseup", () => {
  dragging = false;
  img.classList.remove("dragging");
});

function resetView() {
  scale = 1;
  translateX = 0;
  translateY = 0;
  updateTransform();
}

img.addEventListener("load", resetView);

img.addEventListener("load", () => {
  scale = 1;
  translateX = 0;
  translateY = 0;
  isOriginalSize = false;

  originalBtn.title = "Original Size";
  originalBtn.innerHTML = originalSizeIcon;

  updateTransform();

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  imgLabel.style.display = 'block';
  imgSize.textContent = `${w} × ${h}`;

});


// ------------- ORIGINAL SIZE ---------------------

const originalSizeIcon = `
<svg class="barIconSvg" viewBox="0 -960 960 960">
  <path d="M800-640v-80h-80q-17 0-28.5-11.5T680-760q0-17 11.5-28.5T720-800h80q33 0 56.5 23.5T880-720v80q0 17-11.5 28.5T840-600q-17 0-28.5-11.5T800-640Zm-720 0v-80q0-33 23.5-56.5T160-800h80q17 0 28.5 11.5T280-760q0 17-11.5 28.5T240-720h-80v80q0 17-11.5 28.5T120-600q-17 0-28.5-11.5T80-640Zm720 480h-80q-17 0-28.5-11.5T680-200q0-17 11.5-28.5T720-240h80v-80q0-17 11.5-28.5T840-360q17 0 28.5 11.5T880-320v80q0 33-23.5 56.5T800-160Zm-640 0q-33 0-56.5-23.5T80-240v-80q0-17 11.5-28.5T120-360q17 0 28.5 11.5T160-320v80h80q17 0 28.5 11.5T280-200q0 17-11.5 28.5T240-160h-80Zm80-240v-160q0-33 23.5-56.5T320-640h320q33 0 56.5 23.5T720-560v160q0 33-23.5 56.5T640-320H320q-33 0-56.5-23.5T240-400Zm80 0h320v-160H320v160Zm0 0v-160 160Z"/>
</svg> `;

const fitScreen = `
<svg class="barIconSvg" viewBox="0 -960 960 960">
  <path d="M240-240h-80q-17 0-28.5-11.5T120-280q0-17 11.5-28.5T160-320h120q17 0 28.5 11.5T320-280v120q0 17-11.5 28.5T280-120q-17 0-28.5-11.5T240-160v-80Zm480 0v80q0 17-11.5 28.5T680-120q-17 0-28.5-11.5T640-160v-120q0-17 11.5-28.5T680-320h120q17 0 28.5 11.5T840-280q0 17-11.5 28.5T800-240h-80ZM240-720v-80q0-17 11.5-28.5T280-840q17 0 28.5 11.5T320-800v120q0 17-11.5 28.5T280-640H160q-17 0-28.5-11.5T120-680q0-17 11.5-28.5T160-720h80Zm480 0h80q17 0 28.5 11.5T840-680q0 17-11.5 28.5T800-640H680q-17 0-28.5-11.5T640-680v-120q0-17 11.5-28.5T680-840q17 0 28.5 11.5T720-800v80Z"/>
</svg>`;

originalBtn.innerHTML = originalSizeIcon;

function getOriginalScale() {
  // rendered size from CSS (fit)
  const fittedWidth = img.clientWidth;
  const fittedHeight = img.clientHeight;

  // real image size
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;

  // scale needed to reach 1:1 pixels
  return Math.min(
    naturalWidth / fittedWidth,
    naturalHeight / fittedHeight
  );
}
/* function getOriginalScale() {
  const imgVisible = !img.classList.contains("hidden");
  const gifVisible = !gifCanvas.classList.contains("hidden");

  if (imgVisible) {
    // normal image
    const fittedWidth = img.clientWidth;
    const fittedHeight = img.clientHeight;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    return Math.min(
      naturalWidth / fittedWidth,
      naturalHeight / fittedHeight
    );
  }

  if (gifVisible && gifReader) {
    // GIF: compare canvas fit size and gifWidth/gifHeight
    const fittedWidth = gifCanvas.clientWidth;
    const fittedHeight = gifCanvas.clientHeight;

    return Math.min(
      gifWidth / fittedWidth,
      gifHeight / fittedHeight
    );
  }

  return 1;
} */

originalBtn.addEventListener("click", () => {
  if (!img.src) return;

  if (!isOriginalSize) {
    // ➜ original size
    scale = getOriginalScale();
    translateX = 0;
    translateY = 0;
    isOriginalSize = true;

    originalBtn.title = "Fit to window";
    originalBtn.innerHTML = fitScreen;
  } 
  else {
    // ➜ fit
    scale = 1;
    translateX = 0;
    translateY = 0;
    isOriginalSize = false;

    originalBtn.title = "Original Size";
    originalBtn.innerHTML = originalSizeIcon;
  }

  updateTransform();
});

// ---------- ZOOM -------------

function zoomCentered(factor) {
  let newScale = scale * factor;
  newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

  if (newScale === scale) return;

  scale = newScale;
  isOriginalSize = false;
  originalBtn.title = "Original Size";
  originalBtn.innerHTML = fitScreen;

  updateTransform();
}


zoomInBtn.addEventListener("click", () => {
  if (!img.src) return;
  zoomRelative(ZOOM_STEP);
});

zoomOutBtn.addEventListener("click", () => {
  if (!img.src) return;
  zoomRelative(1 / ZOOM_STEP);
});


function zoomRelative(factor) {
  let newScale = scale * factor;
  newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

  if (newScale === scale) return;

  const ratio = newScale / scale;

  // 🔑 preserve current view direction
  translateX *= ratio;
  translateY *= ratio;

  scale = newScale;

  // exit original-size mode if active
  if (isOriginalSize) {
    isOriginalSize = false;
    originalBtn.title = "Original Size";
    originalBtn.innerHTML = fitScreen;
  }

  updateTransform();
}

// --------------- DELETE BTN -----------------

let deleting = false;

const deleteBtn = document.getElementById("deleteBtn");

deleteBtn.addEventListener("click", async () => {
  if (!images.length) return;

  const path = images[index];
  const fileName = getFileName(path);

  const confirmed = await confirmDlg(`Send "${fileName}" to the Recycle Bin?`);
  if (!confirmed) return;

  deleting = true; // 🔑 important

  try {
    await invoke("trash_file", { path });

    images.splice(index, 1);

    if (images.length === 0) {
      clearViewer();
      return;
    }

    if (index >= images.length) {
      index = images.length - 1;
    }

    await showImage();
  } catch (err) {
    console.error("Trash failed:", err);
  } 
  finally {
    deleting = false;
  }
});

document.addEventListener("keydown", (e) => {
  if (confirmDialogOpen) return;

  const tag = e.target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return;

  if (e.key === "Delete") {
    e.preventDefault();
    deleteBtn.click();
  }
});



// IF NO IMAGE LEFT
function clearViewer() {
  img.src = "";
  img.style.transform = "translate(0px, 0px) scale(1)";
  img.classList.add("hidden");
  gifCanvas.classList.add("hidden");
  gifBar.classList.add("hidden");
}

img.addEventListener("error", () => {
  if (deleting) return;

  if (deleting) {
    console.log("Ignoring img error during delete");
    return;
  }

  console.warn("Image failed to load, skipping");

  if (images.length > 0) {
    images.splice(index, 1);

    if (index >= images.length) {
      index = images.length - 1;
    }

    showImage();
  } 
  else {
    clearViewer();
  }
});

document.addEventListener("keydown", (e) => {
  // Ignore if user is typing in an input / textarea
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  if (e.key === "Delete") {
    e.preventDefault();
    deleteBtn.click();
  }
});

// ----------- CONFIRM DLG ---------------

let confirmDialogOpen = false;

function confirmDlg(message) {
  return new Promise((resolve) => {
    confirmDialogOpen = true;

    const dlg = document.getElementById('confirmDlg');
    const text = document.getElementById('confirmText');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    const closeBtn = document.getElementById('confirmDlgCloseBtn');

    text.textContent = message;
    dlg.style.display = 'block';

    // 🔑 focus OK button
    requestAnimationFrame(() => ok.focus());

    let finished = false;

    const cleanup = (result) => {
      if (finished) return;
      finished = true;

      confirmDialogOpen = false;
      dlg.style.display = 'none';

      ok.onclick = null;
      cancel.onclick = null;
      closeBtn.onclick = null;

      document.removeEventListener('keydown', keyHandler);

      resolve(result);
    };

    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
    closeBtn.onclick = () => cleanup(false);

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(true);
      }
      
    };

    document.addEventListener('keydown', keyHandler);
  });
}

// ------------ ROTATE IMAGE -------------------

const rotateLeftBtn = document.getElementById("rotateLeft");
const rotateRightBtn = document.getElementById("rotateRight");

function updateTransform() {
  clampTranslation();
  img.style.transform = `
    translate(${translateX}px, ${translateY}px)
    scale(${scale})
    rotate(${rotationDegrees}deg)
  `;
  let z = getTrueZoomPercent();
  if (z) {
    zoomLabel.style.display = 'block';
    zoomValue.textContent = z + "%";
  }
}

function getTrueZoomPercent() {
  const fittedScale = getOriginalScale();
  return Math.round((scale / fittedScale) * 100);
}

function clampTranslation() {
  const fw = frame.clientWidth;
  const fh = frame.clientHeight;

  const iw = img.clientWidth * scale;
  const ih = img.clientHeight * scale;

  const maxX = Math.max(0, (iw - fw) / 2);
  const maxY = Math.max(0, (ih - fh) / 2);

  translateX = Math.min(maxX, Math.max(-maxX, translateX));
  translateY = Math.min(maxY, Math.max(-maxY, translateY));
}

function computeBaseScale() {
  const cw = frame.clientWidth;
  const ch = frame.clientHeight;

  let iw = img.naturalWidth;
  let ih = img.naturalHeight;

  if (rotationDegrees % 180 !== 0) {
    [iw, ih] = [ih, iw];
  }

  baseScale = Math.min(cw / iw, ch / ih);

  scale = baseScale;
  translateX = 0;
  translateY = 0;

  updateTransform();
}


rotateLeftBtn.addEventListener("click", () => {
  if (!img.src) return;

  rotationDegrees = (rotationDegrees - 90 + 360) % 360;

  // reset pan on rotate (Windows behavior)
  translateX = 0;
  translateY = 0;

  computeBaseScale(); // 🔑 refit AFTER rotation
});

rotateRightBtn.addEventListener("click", () => {
  if (!img.src) return;

  rotationDegrees = (rotationDegrees + 90) % 360;

  translateX = 0;
  translateY = 0;

  computeBaseScale();
});

// ----------- FILE MENU -------------

document.getElementById("fileMenuContextMenu").addEventListener("click", async (e) => {
  e.stopPropagation(); // ⬅️ THIS IS THE KEY

  const item = e.target.closest(".ctx-item");
  if (!item) return;

  const action = item.dataset.action;
  const currentFilePath = images[index];
  const fileName = getFileName(currentFilePath);

  try {
      switch (action) {
        case "openFile":
          openFileSelect();
          break;

        case "openFolder":
          openFolderSelect();
          break;

        case "save":
          //await invoke("save_file", { path: currentFilePath });
          break;

        case "saveAs":
          //await invoke("save_file_as", { path: currentFilePath });
          break;

        case "saveCopy":
          
          break;

        case "setWallpaper":
          if (!currentFilePath) {
            alert("No image loaded.");
            return;
          }
          closeAllMenus();
          const confirmed = await confirmDlg(`Set "${fileName}" as Desktop Background Image?`);
          if (!confirmed) return;
          await invoke("set_desktop_background", { path: currentFilePath });
          break;

        case "openExplorer":
          if (!currentFilePath) {
            alert("No image loaded.");
            return;
          }
          await invoke("open_in_explorer", { path: currentFilePath });
          break;

        case "renameFile":
          if (!currentFilePath) {
            alert("No image loaded.");
            return;
          }
          inputDlg.style.display = 'block';
          break;

        case "properties":
          if (!currentFilePath) {
            alert("No image loaded.");
            return;
          }
          await invoke('show_file_properties', { path: currentFilePath });
          break;

        case "imageInfo":
          if (!currentFilePath) {
            alert("No image loaded.");
            return;
          }
          await fillImageInfo(currentFilePath);
          break;
      }
    } 
    catch (err) {
      console.error(err);
    }

  closeAllMenus(); // ✅ use the centralized closer
});

function closeAllMenus() {
  document.querySelectorAll(".context-menu2").forEach(menu => {
    menu.style.display = "none";
  });
  currentOpenMenu = null;
}
const fileBtn = document.getElementById("fileMenuBtn");
const fileMenu = document.getElementById("fileMenuContextMenu");

fileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (fileMenu.style.display === 'none' || fileMenu.style.display === '') {
    const rect = fileBtn.getBoundingClientRect();
    fileMenu.style.left = `${rect.left}px`;
    fileMenu.style.top = `${rect.bottom + 4}px`;
    fileMenu.style.display = "block";
  }
  else {
    fileMenu.style.display = 'none';
  }
});

// --------- INPUT DLG ----------

const inputDlg = document.getElementById('inputDlg');
const inputOk = document.getElementById('inputOk');
const inputCancel = document.getElementById('inputCancel');
const inputDlgInput = document.getElementById('inputDlgInput');
const inputDlgCloseBtn = document.getElementById('inputDlgCloseBtn');

inputOk.addEventListener('click', async function (event) {
  inputDlg.style.display = 'none';
  const name =  inputDlgInput.value;
  if (name) {
    await invoke("rename_file", { path: currentFilePath, newName: name });
  }
});

inputDlgCloseBtn.addEventListener('click', function (event) {
  inputDlg.style.display = 'none';
});

inputCancel.addEventListener('click', function (event) {
  inputDlg.style.display = 'none';
});

// -------------- GRID VIEW -----------

const thumbCache = new Map(); // key: filePath, value: <div class="thumbWrapper">

const gridViewBtn = document.getElementById("gridViewBtn");
const gridView = document.getElementById("gridView");
const gridContainer = document.getElementById("gridContainer");

let inGridMode = false;

gridViewBtn.addEventListener("click", () => {
  if (!images.length) return;

  if (inGridMode) {
    exitGridMode();
  } 
  else {
    enterGridMode();
  }
});

function enterGridMode() {
  inGridMode = true;
  // hide single view UI
  img.classList.add("hidden");
  gifCanvas.classList.add("hidden");
  gifBar.classList.add("hidden");
  icoBar.classList.add("hidden");
  loadingText.classList.remove("visible");

  gridView.classList.remove("hidden");

  populateGrid();
}

async function populateGrid() {
  gridContainer.innerHTML = "";

  for (let i = 0; i < images.length; i++) {
    const path = images[i];
    const ext = getExt(path);

    let wrap;

    // REUSE FROM CACHE IF EXISTS
    if (thumbCache.has(path)) {
      wrap = thumbCache.get(path);
      wrap.dataset.index = i; // keep index updated
      gridContainer.appendChild(wrap);
      continue;
    }

    // CREATE NEW WRAPPER
    wrap = document.createElement("div");
    wrap.className = "thumbWrapper";
    wrap.dataset.index = i;

    const thumb = document.createElement("img");
    thumb.className = "gridThumb";
    wrap.appendChild(thumb);

    // LOAD IMAGE (TIFF OR NORMAL)
    if (ext === "tif" || ext === "tiff") {
      try {
        const data = await invoke("load_image", { path });
        const blob = new Blob([new Uint8Array(data)], { type: "image/png" });

        // Store blob URL so we don't generate it again
        const blobURL = URL.createObjectURL(blob);
        thumb.src = blobURL;

        // Cache the blob URL for possible cleanup later
        wrap.dataset.blob = blobURL;

      } catch (err) {
        console.error("TIFF thumbnail failed:", err);
        thumb.src = "";
      }
    } 
    else {
      thumb.src = convertFileSrc(path);
    }

    // SET TITLE (hover tooltip)
    const fileName = path.split(/[/\\]/).pop();
    wrap.title = fileName;

    // CLICK HANDLER
    wrap.addEventListener("click", () => {
      index = i;
      exitGridMode();
      showImage();
    });

    // STORE IN CACHE + APPEND
    thumbCache.set(path, wrap);
    gridContainer.appendChild(wrap);
  }

  // OPTIONAL: clean orphaned cache entries  
  for (const cachedPath of thumbCache.keys()) {
    if (!images.includes(cachedPath)) {
      // release blob URLs if TIFF cached
      const oldWrap = thumbCache.get(cachedPath);
      if (oldWrap.dataset.blob) {
        URL.revokeObjectURL(oldWrap.dataset.blob);
      }
      thumbCache.delete(cachedPath);
    }
  }
}

function exitGridMode() {
  inGridMode = false;
  gridView.classList.add("hidden");
  img.classList.remove("hidden");
  showImage();
}

document.addEventListener("keydown", e => {
  if (e.key.toLowerCase() === "g") {
    gridViewBtn.click();
  }
});

document.getElementById("closeImgInfo").onclick =
document.getElementById("imgInfoCloseBtn").onclick = () => {
  document.getElementById("imgInfoDlg").style.display = "none";
};

async function fillImageInfo(path) {
  const info = await invoke("load_image_metadata", { path });

  document.getElementById("imgInfoDlg").style.display = "block";

  // BASIC INFO
  document.getElementById("imgInfoFileName").textContent = info.file_name;
  document.getElementById("imgInfoFormat").textContent = info.format;
  document.getElementById("imgInfoDimensions").textContent = `${info.width} × ${info.height}`;
  document.getElementById("imgInfoFileSize").textContent = formatBytes(info.file_size);

  // FIXED FIELD NAMES
  document.getElementById("imgInfoColorMode").textContent = info.color_mode;
  document.getElementById("imgInfoBitDepth").textContent = info.bit_depth;
  document.getElementById("imgInfoAlpha").textContent = info.alpha ? "Yes" : "No";

  const ratio = (info.width / info.height).toFixed(3);
  document.getElementById("imgInfoAspect").textContent = ratio;

  document.getElementById("imgInfoOrientation").textContent =
    info.width >= info.height ? "Landscape" : "Portrait";

  // FILE SYSTEM METADATA
  document.getElementById("imgInfoFullPath").textContent = info.full_path;
  document.getElementById("imgInfoCreated").textContent = formatUnix(info.created);
  document.getElementById("imgInfoModified").textContent = formatUnix(info.modified);
  /* document.getElementById("imgInfoReadOnly").textContent = info.read_only ? "Yes" : "No"; */

  // UI-ONLY  
  /* document.getElementById("imgInfoZoom").textContent = currentZoom + "%";
  document.getElementById("imgInfoDisplayedRes").textContent = `${displayWidth} × ${displayHeight}`;
  document.getElementById("imgInfoScaling").textContent = scalingType; */

  // EXIF DATA
  const exifBlock = document.getElementById("imgExifBlock");

  const hasExif =
    info.date_taken ||
    info.camera ||
    info.aperture ||
    info.shutter ||
    info.iso ||
    info.focal ||
    info.color_profile;

  if (hasExif) {
    exifBlock.style.display = "block";

    document.getElementById("imgInfoDateTaken").textContent = info.date_taken || "-";
    document.getElementById("imgInfoCamera").textContent = info.camera || "-";
    document.getElementById("imgInfoAperture").textContent = info.aperture || "-";
    document.getElementById("imgInfoShutter").textContent = info.shutter || "-";
    document.getElementById("imgInfoISO").textContent = info.iso || "-";
    document.getElementById("imgInfoFocal").textContent = info.focal || "-";
    document.getElementById("imgInfoFlash").textContent = info.flash || "-";
    document.getElementById("imgInfoColorProfile").textContent = info.color_profile || "-";
    /* document.getElementById("imgInfoDPI").textContent = "N/A"; */
  } 
  else {
    exifBlock.style.display = "none";
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatUnix(sec) {
  if (!sec || sec === 0) return "-";
  return new Date(sec * 1000).toLocaleString();
}

//DRAG WINDOW SYSTEM------------------------------------

const draggableIds = ['dragImgInfo'];
let draggableElements = [];

draggableIds.forEach((id) => {
    const dragHandle = document.getElementById(id);
    const form = dragHandle.parentElement;
    draggableElements.push({ dragHandle, form });
});

draggableElements.forEach((draggable) => {
    let isDraggingWin = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    draggable.dragHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', dragForm);
    document.addEventListener('mouseup', stopDrag);
    function startDrag(e) {
        isDraggingWin = true;
        dragOffsetX = e.pageX - draggable.form.offsetLeft;
        dragOffsetY = e.pageY - draggable.form.offsetTop;
    }
    function dragForm(e) {
        if (isDraggingWin) {
            draggable.form.style.left = e.pageX - dragOffsetX + 'px';
            draggable.form.style.top = e.pageY - dragOffsetY + 'px';
        }
    }
    function stopDrag() {
        isDraggingWin = false;
    }
});

// ------------ SLIDESHOW -----------------

let slideshowInterval = null;
let slideshowDelay = 4000; // 3 seconds per slide
let slideshowActive = false;

async function startSlideshow() {
  if (slideshowActive) return;
  slideshowActive = true;

  document.getElementById("imgViewerDiv").requestFullscreen();

  const btn = document.getElementById("slideShow");
  btn.classList.add("active");
  btn.title = "Stop slideshow";

  slideshowInterval = setInterval(() => {
    nextImage();
  }, slideshowDelay);

  document.addEventListener("keydown", exitFromInput);
}

function exitFromInput(e) {
  if (!slideshowActive) return;

  // Ignore arrow keys during slideshow
  if (
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.key === "ArrowUp" ||
    e.key === "ArrowDown"
  ) {
    return;
  }

  stopSlideshow();
}

function stopSlideshow() {
  slideshowActive = false;

  clearInterval(slideshowInterval);
  slideshowInterval = null;

  const btn = document.getElementById("slideShow");
  btn.classList.remove("active");
  btn.title = "Slideshow";

  if (document.fullscreenElement) {
    document.exitFullscreen();
  }

  document.removeEventListener("keydown", exitFromInput);
}

function toggleSlideshow() {
  if (!slideshowActive) {
    startSlideshow();
  } 
  else {
    stopSlideshow();
  }
}

document.getElementById("slideShow").addEventListener("click", toggleSlideshow);

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && slideshowActive) {
    stopSlideshow();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }
});

function toggleFullscreen() {
  const viewer = document.getElementById("imgViewerDiv");
  if (!document.fullscreenElement) {
    viewer.requestFullscreen();
  } 
  else {
    document.exitFullscreen();
  }
}

document.addEventListener("keydown", (e) => {
  if (!document.fullscreenElement) return;

  // ignore arrow keys
  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
    return;
  }

  // exit fullscreen for any other key
  document.exitFullscreen();
});

// ---- ABOUT ----

const helpGithub = document.getElementById('helpGithub');
helpGithub.onclick = async () => {
  await shell.open('https://github.com/hudsonpear');
};
const aboutBtn = document.getElementById('aboutBtn');
const aboutWindow = document.getElementById('aboutWindow');
const aboutCloseBtn = document.getElementById('aboutCloseBtn');
const copyIcon = document.getElementById("copyIcon");
const theEmail = document.getElementById("theEmail");

copyIcon.onclick = function() {
  const textToCopy = "coolnewtabpage@gmail.com";
  copyToClipboard(textToCopy);
}
theEmail.onclick = function() {
  const textToCopy = "coolnewtabpage@gmail.com";
  copyToClipboard(textToCopy);
}
aboutBtn.onclick = function() {
  aboutWindow.classList.toggle('hidden');
}
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } 
  catch (err) {}
}

aboutCloseBtn.addEventListener('click', () => {
  aboutWindow.classList.add('hidden');
});