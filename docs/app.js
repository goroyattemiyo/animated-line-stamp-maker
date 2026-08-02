"use strict";

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_INPUT_PIXELS = 32_000_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const MAX_WIDTH = 320;
const MAX_HEIGHT = 270;

const elements = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  resetButton: document.querySelector("#resetButton"),
  saveState: document.querySelector("#saveState"),
  sourceMeta: document.querySelector("#sourceMeta"),
  fileName: document.querySelector("#fileName"),
  sourceSize: document.querySelector("#sourceSize"),
  cellSize: document.querySelector("#cellSize"),
  sourceZoomLabel: document.querySelector("#sourceZoomLabel"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  emptySource: document.querySelector("#emptySource"),
  previewStage: document.querySelector("#previewStage"),
  previewCanvas: document.querySelector("#previewCanvas"),
  emptyPreview: document.querySelector("#emptyPreview"),
  previewFrameLabel: document.querySelector("#previewFrameLabel"),
  firstFrameButton: document.querySelector("#firstFrameButton"),
  previousFrameButton: document.querySelector("#previousFrameButton"),
  playButton: document.querySelector("#playButton"),
  nextFrameButton: document.querySelector("#nextFrameButton"),
  lastFrameButton: document.querySelector("#lastFrameButton"),
  backgroundSelect: document.querySelector("#backgroundSelect"),
  durationSelect: document.querySelector("#durationSelect"),
  loopSelect: document.querySelector("#loopSelect"),
  metricFrames: document.querySelector("#metricFrames"),
  metricDuration: document.querySelector("#metricDuration"),
  metricTotal: document.querySelector("#metricTotal"),
  metricOutput: document.querySelector("#metricOutput"),
  trimRange: document.querySelector("#trimRange"),
  trimValue: document.querySelector("#trimValue"),
  selectedFrameLabel: document.querySelector("#selectedFrameLabel"),
  offsetLabel: document.querySelector("#offsetLabel"),
  moveUp: document.querySelector("#moveUp"),
  moveLeft: document.querySelector("#moveLeft"),
  moveReset: document.querySelector("#moveReset"),
  moveRight: document.querySelector("#moveRight"),
  moveDown: document.querySelector("#moveDown"),
  reverseButton: document.querySelector("#reverseButton"),
  pingPongButton: document.querySelector("#pingPongButton"),
  restoreFramesButton: document.querySelector("#restoreFramesButton"),
  validationBadge: document.querySelector("#validationBadge"),
  validationList: document.querySelector("#validationList"),
  exportButton: document.querySelector("#exportButton"),
  exportFramesButton: document.querySelector("#exportFramesButton"),
  exportMessage: document.querySelector("#exportMessage"),
  timeline: document.querySelector("#timeline")
};

const state = {
  sourceFile: null,
  sourceBitmap: null,
  sourceBuffer: document.createElement("canvas"),
  sourceHasAlpha: false,
  frames: [],
  selectedIndex: 0,
  previewIndex: 0,
  trimPercent: 6,
  loopDurationMs: 1000,
  loopCount: 4,
  playing: false,
  playTimer: null,
  playedLoops: 0,
  lastExportBytes: null,
  outputWidth: 0,
  outputHeight: 0
};

const controlElements = [
  elements.resetButton,
  elements.firstFrameButton,
  elements.previousFrameButton,
  elements.playButton,
  elements.nextFrameButton,
  elements.lastFrameButton,
  elements.backgroundSelect,
  elements.durationSelect,
  elements.loopSelect,
  elements.trimRange,
  elements.moveUp,
  elements.moveLeft,
  elements.moveReset,
  elements.moveRight,
  elements.moveDown,
  elements.reverseButton,
  elements.pingPongButton,
  elements.restoreFramesButton,
  elements.exportButton,
  elements.exportFramesButton
];

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setControlsEnabled(enabled) {
  for (const element of controlElements) element.disabled = !enabled;
}

function setMessage(message, type = "") {
  elements.exportMessage.textContent = message;
  elements.exportMessage.className = `export-message${type ? ` ${type}` : ""}`;
}

function stopPlayback({ keepFrame = true } = {}) {
  if (state.playTimer) window.clearTimeout(state.playTimer);
  state.playTimer = null;
  state.playing = false;
  state.playedLoops = 0;
  elements.playButton.textContent = "▶ 再生";
  if (!keepFrame && state.frames.length) state.previewIndex = 0;
  updateTimelinePlayingState();
}

function resetApp() {
  stopPlayback({ keepFrame: false });
  if (state.sourceBitmap?.close) state.sourceBitmap.close();
  state.sourceFile = null;
  state.sourceBitmap = null;
  state.frames = [];
  state.selectedIndex = 0;
  state.previewIndex = 0;
  state.trimPercent = 6;
  state.loopDurationMs = 1000;
  state.loopCount = 4;
  state.lastExportBytes = null;
  state.outputWidth = 0;
  state.outputHeight = 0;
  elements.fileInput.value = "";
  elements.trimRange.value = "6";
  elements.trimValue.textContent = "6%";
  elements.durationSelect.value = "1000";
  elements.sourceMeta.classList.add("hidden");
  elements.emptySource.classList.remove("hidden");
  elements.emptyPreview.classList.remove("hidden");
  elements.sourceCanvas.getContext("2d").clearRect(0, 0, elements.sourceCanvas.width, elements.sourceCanvas.height);
  elements.previewCanvas.getContext("2d").clearRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);
  elements.timeline.innerHTML = '<div class="timeline-empty">画像を読み込むと8フレームが並びます</div>';
  elements.saveState.textContent = "画像未読込";
  elements.previewFrameLabel.textContent = "- / -";
  elements.selectedFrameLabel.textContent = "未選択";
  elements.offsetLabel.textContent = "X 0px / Y 0px";
  elements.metricFrames.textContent = "0";
  elements.metricDuration.textContent = "0.0秒";
  elements.metricTotal.textContent = "0.0秒";
  elements.metricOutput.textContent = "-";
  elements.validationBadge.textContent = "待機";
  elements.validationBadge.className = "validation-badge idle";
  for (const item of elements.validationList.querySelectorAll("li")) item.className = "";
  setControlsEnabled(false);
  setMessage("");
}

async function loadFile(file) {
  stopPlayback();
  setMessage("");

  if (!file) return;
  if (file.size > MAX_INPUT_BYTES) {
    setMessage("50MBを超える画像は読み込めません。", "error");
    return;
  }
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
    setMessage("PNG画像を選択してください。", "error");
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > MAX_INPUT_PIXELS) {
      bitmap.close();
      setMessage("画像の総画素数が大きすぎます。32MP以下にしてください。", "error");
      return;
    }
    if (bitmap.width < 400 || bitmap.height < 200) {
      bitmap.close();
      setMessage("画像が小さすぎます。400×200px以上を推奨します。", "error");
      return;
    }

    if (state.sourceBitmap?.close) state.sourceBitmap.close();
    state.sourceFile = file;
    state.sourceBitmap = bitmap;
    state.sourceHasAlpha = detectAlpha(bitmap);
    restoreOriginalFrames();
    state.lastExportBytes = null;

    drawSourceSheet();
    renderTimeline();
    selectFrame(0, { syncPreview: true });
    updateLoopOptions();
    updateAll();

    elements.fileName.textContent = file.name;
    elements.sourceSize.textContent = `${bitmap.width} × ${bitmap.height}px`;
    elements.cellSize.textContent = `${Math.round(bitmap.width / 4)} × ${Math.round(bitmap.height / 2)}px`;
    elements.sourceMeta.classList.remove("hidden");
    elements.emptySource.classList.add("hidden");
    elements.emptyPreview.classList.add("hidden");
    elements.saveState.textContent = "編集中";
    setControlsEnabled(true);
    elements.exportButton.disabled = !isBasicValid();
    setMessage("画像を8フレームへ分割しました。", "success");
  } catch (error) {
    console.error(error);
    setMessage("PNGを読み込めませんでした。画像ファイルを確認してください。", "error");
  }
}

function detectAlpha(bitmap) {
  const canvas = state.sourceBuffer;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) return true;
  }
  return false;
}

function makeFrame(sourceIndex, sourceFrame = null) {
  return {
    id: uid(),
    sourceIndex,
    offsetX: sourceFrame?.offsetX ?? 0,
    offsetY: sourceFrame?.offsetY ?? 0
  };
}

function restoreOriginalFrames() {
  state.frames = Array.from({ length: 8 }, (_, index) => makeFrame(index));
  state.selectedIndex = 0;
  state.previewIndex = 0;
}

function getCellRect(sourceIndex) {
  const bitmap = state.sourceBitmap;
  const row = Math.floor(sourceIndex / 4);
  const column = sourceIndex % 4;
  const x0 = Math.round(bitmap.width * column / 4);
  const x1 = Math.round(bitmap.width * (column + 1) / 4);
  const y0 = Math.round(bitmap.height * row / 2);
  const y1 = Math.round(bitmap.height * (row + 1) / 2);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function getTrimmedRect(frame) {
  const cell = getCellRect(frame.sourceIndex);
  const trim = Math.round(Math.min(cell.width, cell.height) * state.trimPercent / 100);
  return {
    x: cell.x + trim,
    y: cell.y + trim,
    width: Math.max(1, cell.width - trim * 2),
    height: Math.max(1, cell.height - trim * 2)
  };
}

function toEven(value, maximum) {
  let next = Math.max(2, Math.min(maximum, Math.round(value)));
  if (next % 2 !== 0) next = next === maximum ? next - 1 : next + 1;
  return Math.max(2, next);
}

function calculateOutputSize() {
  if (!state.frames.length) return { width: 0, height: 0 };
  const rect = getTrimmedRect(state.frames[0]);
  const scale = Math.min(MAX_WIDTH / rect.width, MAX_HEIGHT / rect.height);
  return {
    width: toEven(rect.width * scale, MAX_WIDTH),
    height: toEven(rect.height * scale, MAX_HEIGHT)
  };
}

function drawSourceSheet() {
  const bitmap = state.sourceBitmap;
  const canvas = elements.sourceCanvas;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);

  context.save();
  context.strokeStyle = "#42d3a0";
  context.lineWidth = Math.max(2, bitmap.width / 700);
  context.setLineDash([Math.max(8, bitmap.width / 120), Math.max(6, bitmap.width / 170)]);
  for (let column = 1; column < 4; column += 1) {
    const x = Math.round(bitmap.width * column / 4);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, bitmap.height);
    context.stroke();
  }
  const y = Math.round(bitmap.height / 2);
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(bitmap.width, y);
  context.stroke();
  context.restore();

  const displayedWidth = Math.min(canvas.clientWidth || bitmap.width, bitmap.width);
  elements.sourceZoomLabel.textContent = `${Math.max(1, Math.round(displayedWidth / bitmap.width * 100))}%`;
}

function clearCanvas(canvas) {
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function drawFrame(frame, canvas, options = {}) {
  if (!state.sourceBitmap) return;
  const rect = getTrimmedRect(frame);
  const output = options.outputSize ?? calculateOutputSize();
  const canvasWidth = options.canvasWidth ?? output.width;
  const canvasHeight = options.canvasHeight ?? output.height;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const scale = Math.min(canvasWidth / rect.width, canvasHeight / rect.height);
  const drawWidth = rect.width * scale;
  const drawHeight = rect.height * scale;
  const baseX = (canvasWidth - drawWidth) / 2;
  const baseY = (canvasHeight - drawHeight) / 2;
  const offsetScaleX = canvasWidth / Math.max(1, output.width);
  const offsetScaleY = canvasHeight / Math.max(1, output.height);

  context.drawImage(
    state.sourceBuffer,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    baseX + frame.offsetX * offsetScaleX,
    baseY + frame.offsetY * offsetScaleY,
    drawWidth,
    drawHeight
  );
}

function renderPreview() {
  if (!state.frames.length) return;
  state.previewIndex = Math.max(0, Math.min(state.previewIndex, state.frames.length - 1));
  const frame = state.frames[state.previewIndex];
  const output = calculateOutputSize();
  state.outputWidth = output.width;
  state.outputHeight = output.height;
  drawFrame(frame, elements.previewCanvas, { outputSize: output });
  elements.previewFrameLabel.textContent = `${state.previewIndex + 1} / ${state.frames.length}`;
  updateTimelinePlayingState();
}

function renderTimeline() {
  if (!state.frames.length) return;
  elements.timeline.innerHTML = "";
  state.frames.forEach((frame, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frame-card";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `フレーム${index + 1}を選択`);

    const canvas = document.createElement("canvas");
    canvas.width = 90;
    canvas.height = 90;
    canvas.className = "checker";
    drawFrame(frame, canvas, { canvasWidth: 90, canvasHeight: 90 });
    button.append(canvas);

    if (index === 0) {
      const badge = document.createElement("span");
      badge.className = "first-badge";
      badge.textContent = "静止表示";
      button.append(badge);
    }

    const footer = document.createElement("footer");
    footer.innerHTML = `<strong>${String(index + 1).padStart(2, "0")}</strong><span>元${frame.sourceIndex + 1}</span>`;
    button.append(footer);
    button.addEventListener("click", () => selectFrame(index, { syncPreview: true }));
    elements.timeline.append(button);
  });
  updateSelectedState();
}

function updateSelectedState() {
  const cards = elements.timeline.querySelectorAll(".frame-card");
  cards.forEach((card, index) => card.classList.toggle("selected", index === state.selectedIndex));
  const frame = state.frames[state.selectedIndex];
  if (!frame) return;
  elements.selectedFrameLabel.textContent = `フレーム ${state.selectedIndex + 1}`;
  elements.offsetLabel.textContent = `X ${frame.offsetX}px / Y ${frame.offsetY}px`;
}

function updateTimelinePlayingState() {
  const cards = elements.timeline.querySelectorAll(".frame-card");
  cards.forEach((card, index) => card.classList.toggle("playing", index === state.previewIndex));
}

function selectFrame(index, { syncPreview = false } = {}) {
  if (!state.frames.length) return;
  stopPlayback();
  state.selectedIndex = Math.max(0, Math.min(index, state.frames.length - 1));
  if (syncPreview) state.previewIndex = state.selectedIndex;
  updateSelectedState();
  renderPreview();
}

function getFrameDurations() {
  const count = state.frames.length;
  if (!count) return [];
  const base = Math.floor(state.loopDurationMs / count);
  const remainder = state.loopDurationMs - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function startPlayback() {
  if (!state.frames.length) return;
  if (state.playing) {
    stopPlayback();
    return;
  }
  state.playing = true;
  state.playedLoops = 0;
  state.previewIndex = 0;
  elements.playButton.textContent = "■ 停止";
  renderPreview();
  scheduleNextFrame();
}

function scheduleNextFrame() {
  if (!state.playing) return;
  const durations = getFrameDurations();
  const delay = durations[state.previewIndex] ?? 100;
  state.playTimer = window.setTimeout(() => {
    if (!state.playing) return;
    if (state.previewIndex >= state.frames.length - 1) {
      state.playedLoops += 1;
      if (state.playedLoops >= state.loopCount) {
        stopPlayback();
        state.previewIndex = state.frames.length - 1;
        renderPreview();
        return;
      }
      state.previewIndex = 0;
    } else {
      state.previewIndex += 1;
    }
    renderPreview();
    scheduleNextFrame();
  }, delay);
}

function navigatePreview(index) {
  stopPlayback();
  state.previewIndex = Math.max(0, Math.min(index, state.frames.length - 1));
  state.selectedIndex = state.previewIndex;
  updateSelectedState();
  renderPreview();
}

function updateLoopOptions() {
  const maxLoops = Math.min(4, Math.floor(4000 / state.loopDurationMs));
  const previous = state.loopCount;
  elements.loopSelect.innerHTML = "";
  for (let count = 1; count <= maxLoops; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = `${count}回`;
    elements.loopSelect.append(option);
  }
  state.loopCount = Math.min(previous, maxLoops);
  if (!state.loopCount) state.loopCount = 1;
  elements.loopSelect.value = String(state.loopCount);
}

function moveSelected(dx, dy) {
  const frame = state.frames[state.selectedIndex];
  if (!frame) return;
  stopPlayback();
  frame.offsetX = Math.max(-40, Math.min(40, frame.offsetX + dx));
  frame.offsetY = Math.max(-40, Math.min(40, frame.offsetY + dy));
  state.previewIndex = state.selectedIndex;
  state.lastExportBytes = null;
  renderTimeline();
  renderPreview();
  updateAll();
}

function setPreviewBackground(value) {
  elements.previewStage.classList.remove("checker", "white", "black", "gray");
  elements.previewStage.classList.add(value);
}

function reverseFrames() {
  stopPlayback();
  state.frames.reverse();
  state.selectedIndex = 0;
  state.previewIndex = 0;
  state.lastExportBytes = null;
  renderTimeline();
  updateAll();
}

function makePingPong() {
  stopPlayback();
  if (state.frames.length > 11) {
    setMessage("往復化すると20フレームを超えるため実行できません。", "error");
    return;
  }
  const tail = state.frames.slice(1, -1).reverse().map(frame => makeFrame(frame.sourceIndex, frame));
  state.frames = [...state.frames, ...tail];
  state.selectedIndex = 0;
  state.previewIndex = 0;
  state.lastExportBytes = null;
  renderTimeline();
  updateAll();
  setMessage(`${state.frames.length}フレームの往復アニメーションにしました。`, "success");
}

function restoreFramesFromButton() {
  stopPlayback();
  restoreOriginalFrames();
  state.lastExportBytes = null;
  renderTimeline();
  updateAll();
  setMessage("元の8フレームへ戻しました。", "success");
}

function updateMetrics() {
  const output = calculateOutputSize();
  state.outputWidth = output.width;
  state.outputHeight = output.height;
  elements.metricFrames.textContent = String(state.frames.length);
  elements.metricDuration.textContent = `${(state.loopDurationMs / 1000).toFixed(1)}秒`;
  elements.metricTotal.textContent = `${(state.loopDurationMs * state.loopCount / 1000).toFixed(1)}秒`;
  elements.metricOutput.textContent = output.width ? `${output.width}×${output.height}` : "-";
}

function setRule(rule, status) {
  const item = elements.validationList.querySelector(`[data-rule="${rule}"]`);
  if (item) item.className = status;
}

function getValidation() {
  const output = calculateOutputSize();
  return {
    frames: state.frames.length >= 5 && state.frames.length <= 20,
    duration: [1000, 2000, 3000, 4000].includes(state.loopDurationMs),
    total: state.loopDurationMs * state.loopCount <= 4000,
    size: output.width > 0 && output.width <= MAX_WIDTH && output.height <= MAX_HEIGHT,
    alpha: state.sourceHasAlpha,
    bytes: state.lastExportBytes == null ? null : state.lastExportBytes <= MAX_OUTPUT_BYTES
  };
}

function isBasicValid() {
  const validation = getValidation();
  return validation.frames && validation.duration && validation.total && validation.size && validation.alpha;
}

function updateValidation() {
  if (!state.frames.length) return;
  const validation = getValidation();
  for (const [rule, result] of Object.entries(validation)) {
    setRule(rule, result == null ? "pending" : result ? "ok" : "error");
  }
  const failures = Object.values(validation).filter(value => value === false).length;
  if (failures > 0) {
    elements.validationBadge.textContent = `${failures}件エラー`;
    elements.validationBadge.className = "validation-badge error";
  } else if (validation.bytes == null) {
    elements.validationBadge.textContent = "出力待ち";
    elements.validationBadge.className = "validation-badge warn";
  } else {
    elements.validationBadge.textContent = "合格";
    elements.validationBadge.className = "validation-badge ok";
  }
  elements.exportButton.disabled = !isBasicValid();
}

function updateAll() {
  if (!state.frames.length) return;
  updateMetrics();
  updateValidation();
  renderPreview();
  updateSelectedState();
}

function renderOutputFrames() {
  const output = calculateOutputSize();
  const buffers = [];
  for (const frame of state.frames) {
    const canvas = document.createElement("canvas");
    drawFrame(frame, canvas, { outputSize: output });
    const imageData = canvas.getContext("2d").getImageData(0, 0, output.width, output.height);
    buffers.push(imageData.data.buffer.slice(0));
  }
  return { ...output, buffers };
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes, start, end) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) crc = table[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function patchLoopCount(buffer, loopCount) {
  const bytes = new Uint8Array(buffer.slice(0));
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const type = String.fromCharCode(bytes[typeOffset], bytes[typeOffset + 1], bytes[typeOffset + 2], bytes[typeOffset + 3]);
    if (type === "acTL" && length >= 8) {
      const dataOffset = offset + 8;
      writeUint32(bytes, dataOffset + 4, loopCount);
      const crcOffset = dataOffset + length;
      writeUint32(bytes, crcOffset, crc32(bytes, typeOffset, crcOffset));
      return bytes.buffer;
    }
    offset += 12 + length;
  }
  throw new Error("APNGのacTLチャンクが見つかりません。");
}

function inspectApng(buffer) {
  const bytes = new Uint8Array(buffer);
  let offset = 8;
  const result = { width: 0, height: 0, frames: 0, loops: null, frameControls: 0 };
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const type = String.fromCharCode(bytes[typeOffset], bytes[typeOffset + 1], bytes[typeOffset + 2], bytes[typeOffset + 3]);
    if (type === "IHDR") {
      result.width = readUint32(bytes, dataOffset);
      result.height = readUint32(bytes, dataOffset + 4);
    } else if (type === "acTL") {
      result.frames = readUint32(bytes, dataOffset);
      result.loops = readUint32(bytes, dataOffset + 4);
    } else if (type === "fcTL") {
      result.frameControls += 1;
    }
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return result;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName() {
  const name = state.sourceFile?.name ?? "animated-stamp";
  return name.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "animated-stamp";
}

async function exportApng() {
  stopPlayback();
  setMessage("APNGを生成しています…");
  elements.exportButton.disabled = true;

  try {
    if (!globalThis.UPNG?.encode) throw new Error("APNGエンコーダを読み込めませんでした。通信状態を確認してください。");
    if (!isBasicValid()) throw new Error("LINE仕様チェックのエラーを修正してください。");

    const rendered = renderOutputFrames();
    const delays = getFrameDurations();
    const encoded = globalThis.UPNG.encode(rendered.buffers, rendered.width, rendered.height, 0, delays);
    const patched = patchLoopCount(encoded, state.loopCount);
    const inspection = inspectApng(patched);

    if (inspection.frames !== state.frames.length || inspection.frameControls !== state.frames.length) {
      throw new Error(`APNG再検査でフレーム数が一致しません（${inspection.frames}/${inspection.frameControls}）。`);
    }
    if (inspection.loops !== state.loopCount) throw new Error("APNG再検査でループ回数が一致しません。");
    if (inspection.width !== rendered.width || inspection.height !== rendered.height) throw new Error("APNG再検査で出力寸法が一致しません。");

    state.lastExportBytes = patched.byteLength;
    updateValidation();
    if (patched.byteLength > MAX_OUTPUT_BYTES) {
      throw new Error(`出力は${formatBytes(patched.byteLength)}で、LINE上限1MBを超えています。`);
    }

    downloadBlob(new Blob([patched], { type: "image/png" }), `${baseName()}-apng.png`);
    elements.saveState.textContent = "APNG出力済み";
    setMessage(`APNGを保存しました（${formatBytes(patched.byteLength)} / ${rendered.width}×${rendered.height}px）。`, "success");
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "APNG生成に失敗しました。", "error");
  } finally {
    elements.exportButton.disabled = !isBasicValid();
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function exportSelectedFrame() {
  if (!state.frames.length) return;
  const frame = state.frames[state.selectedIndex];
  const canvas = document.createElement("canvas");
  drawFrame(frame, canvas, { outputSize: calculateOutputSize() });
  canvas.toBlob(blob => {
    if (!blob) {
      setMessage("PNG生成に失敗しました。", "error");
      return;
    }
    downloadBlob(blob, `${baseName()}-frame-${String(state.selectedIndex + 1).padStart(2, "0")}.png`);
    setMessage(`フレーム${state.selectedIndex + 1}をPNG保存しました。`, "success");
  }, "image/png");
}

elements.fileInput.addEventListener("change", event => loadFile(event.target.files?.[0]));
elements.resetButton.addEventListener("click", resetApp);
elements.playButton.addEventListener("click", startPlayback);
elements.firstFrameButton.addEventListener("click", () => navigatePreview(0));
elements.previousFrameButton.addEventListener("click", () => navigatePreview(state.previewIndex - 1));
elements.nextFrameButton.addEventListener("click", () => navigatePreview(state.previewIndex + 1));
elements.lastFrameButton.addEventListener("click", () => navigatePreview(state.frames.length - 1));
elements.backgroundSelect.addEventListener("change", event => setPreviewBackground(event.target.value));
elements.durationSelect.addEventListener("change", event => {
  stopPlayback();
  state.loopDurationMs = Number(event.target.value);
  state.lastExportBytes = null;
  updateLoopOptions();
  updateAll();
});
elements.loopSelect.addEventListener("change", event => {
  stopPlayback();
  state.loopCount = Number(event.target.value);
  state.lastExportBytes = null;
  updateAll();
});
elements.trimRange.addEventListener("input", event => {
  stopPlayback();
  state.trimPercent = Number(event.target.value);
  state.lastExportBytes = null;
  elements.trimValue.textContent = `${state.trimPercent}%`;
  renderTimeline();
  updateAll();
});
elements.moveUp.addEventListener("click", () => moveSelected(0, -1));
elements.moveLeft.addEventListener("click", () => moveSelected(-1, 0));
elements.moveRight.addEventListener("click", () => moveSelected(1, 0));
elements.moveDown.addEventListener("click", () => moveSelected(0, 1));
elements.moveReset.addEventListener("click", () => {
  const frame = state.frames[state.selectedIndex];
  if (!frame) return;
  frame.offsetX = 0;
  frame.offsetY = 0;
  state.lastExportBytes = null;
  renderTimeline();
  updateAll();
});
elements.reverseButton.addEventListener("click", reverseFrames);
elements.pingPongButton.addEventListener("click", makePingPong);
elements.restoreFramesButton.addEventListener("click", restoreFramesFromButton);
elements.exportButton.addEventListener("click", exportApng);
elements.exportFramesButton.addEventListener("click", exportSelectedFrame);

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    elements.dropZone.classList.add("dragover");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragover");
  });
}
elements.dropZone.addEventListener("drop", event => loadFile(event.dataTransfer?.files?.[0]));

document.addEventListener("keydown", event => {
  if (!state.frames.length) return;
  const tag = document.activeElement?.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
  const multiplier = event.shiftKey ? 10 : 1;
  const moves = {
    ArrowUp: [0, -multiplier],
    ArrowDown: [0, multiplier],
    ArrowLeft: [-multiplier, 0],
    ArrowRight: [multiplier, 0]
  };
  if (moves[event.key]) {
    event.preventDefault();
    moveSelected(...moves[event.key]);
  }
  if (event.code === "Space") {
    event.preventDefault();
    startPlayback();
  }
});

window.addEventListener("beforeunload", event => {
  if (!state.sourceFile) return;
  event.preventDefault();
});

resetApp();
