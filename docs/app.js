"use strict";

const FRAME_COUNT = 8;
const OUTPUT_WIDTH = 320;
const OUTPUT_HEIGHT = 270;
const MAX_BYTES = 1_000_000;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_INPUT_PIXELS = 32_000_000;

const $ = (selector) => document.querySelector(selector);
const elements = {
  appStatus: $("#appStatus"), resetButton: $("#resetButton"), fileInput: $("#fileInput"), dropZone: $("#dropZone"),
  fileMeta: $("#fileMeta"), fileName: $("#fileName"), imageSize: $("#imageSize"), alphaState: $("#alphaState"), cropState: $("#cropState"),
  sourceCanvas: $("#sourceCanvas"), sourceEmpty: $("#sourceEmpty"), previewStage: $("#previewStage"), previewCanvas: $("#previewCanvas"), previewEmpty: $("#previewEmpty"),
  frameCounter: $("#frameCounter"), firstButton: $("#firstButton"), prevButton: $("#prevButton"), playButton: $("#playButton"), nextButton: $("#nextButton"), lastButton: $("#lastButton"),
  backgroundSelect: $("#backgroundSelect"), durationSelect: $("#durationSelect"), loopSelect: $("#loopSelect"), totalDuration: $("#totalDuration"), fileBytes: $("#fileBytes"),
  motionSelect: $("#motionSelect"), motionDescription: $("#motionDescription"), strengthRange: $("#strengthRange"), strengthValue: $("#strengthValue"), scaleRange: $("#scaleRange"), scaleValue: $("#scaleValue"),
  xRange: $("#xRange"), xValue: $("#xValue"), yRange: $("#yRange"), yValue: $("#yValue"), validationBadge: $("#validationBadge"), validationList: $("#validationList"),
  exportButton: $("#exportButton"), saveFrameButton: $("#saveFrameButton"), message: $("#message"), timeline: $("#timeline")
};

const state = {
  file: null, bitmap: null, sourceCanvas: document.createElement("canvas"), bounds: null, inputHasAlpha: false,
  currentFrame: 0, playing: false, timer: null, playedLoops: 0, motion: "bounce", strength: 55,
  scale: 88, offsetX: 0, offsetY: 0, durationMs: 1000, loops: 4, lastBytes: null, frameCanvases: []
};

const descriptions = {
  bounce: "上下に軽く跳ねます。", sway: "左右にゆっくり揺れます。", shake: "小さく素早く震えます。",
  bow: "足元を軸に、ぺこりと傾きます。", pop: "少し縮んでから、ぽよんと戻ります。", float: "上下移動と傾きを組み合わせます。", spin: "中央を軸に1回転します。"
};

const controls = [elements.resetButton, elements.firstButton, elements.prevButton, elements.playButton, elements.nextButton, elements.lastButton,
  elements.backgroundSelect, elements.durationSelect, elements.loopSelect, elements.motionSelect, elements.strengthRange, elements.scaleRange,
  elements.xRange, elements.yRange, elements.exportButton, elements.saveFrameButton];

function setEnabled(enabled) { controls.forEach((control) => { control.disabled = !enabled; }); }
function setMessage(text, type = "") { elements.message.textContent = text; elements.message.className = `message${type ? ` ${type}` : ""}`; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function formatBytes(bytes) { if (bytes == null) return "未生成"; return bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1048576).toFixed(2)}MB`; }

function reset() {
  stopPlayback(false);
  state.bitmap?.close?.();
  Object.assign(state, { file: null, bitmap: null, bounds: null, inputHasAlpha: false, currentFrame: 0, motion: "bounce", strength: 55, scale: 88, offsetX: 0, offsetY: 0, durationMs: 1000, loops: 4, lastBytes: null, frameCanvases: [] });
  elements.fileInput.value = ""; elements.fileMeta.classList.add("hidden"); elements.sourceEmpty.classList.remove("hidden"); elements.previewEmpty.classList.remove("hidden");
  elements.sourceCanvas.getContext("2d").clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT); elements.previewCanvas.getContext("2d").clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  elements.timeline.innerHTML = '<p class="timeline-empty">画像を読み込むと8フレームを生成します</p>';
  elements.motionSelect.value = "bounce"; elements.strengthRange.value = "55"; elements.scaleRange.value = "88"; elements.xRange.value = "0"; elements.yRange.value = "0"; elements.durationSelect.value = "1000";
  elements.strengthValue.textContent = "55"; elements.scaleValue.textContent = "88%"; elements.xValue.textContent = "0"; elements.yValue.textContent = "0"; elements.frameCounter.textContent = "- / 8"; elements.fileBytes.textContent = "未生成";
  elements.cropState.textContent = "未読込"; elements.appStatus.textContent = "画像未読込"; setMessage(""); setEnabled(false); updateLoopOptions(); updateValidation();
}

async function decodePng(file) {
  if (globalThis.createImageBitmap) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try { const image = new Image(); image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}

async function loadFile(file) {
  setMessage("");
  if (!file) return;
  if (file.size > MAX_INPUT_BYTES) return setMessage("50MBを超える画像は読み込めません。", "error");
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) return setMessage("PNG画像を選択してください。", "error");
  try {
    const bitmap = await decodePng(file);
    if (bitmap.width * bitmap.height > MAX_INPUT_PIXELS) { bitmap.close?.(); return setMessage("画像が大きすぎます。32MP以下にしてください。", "error"); }
    state.bitmap?.close?.(); state.file = file; state.bitmap = bitmap; prepareSource(bitmap); state.bounds = detectBounds(); state.inputHasAlpha = state.bounds.hasTransparent;
    state.currentFrame = 0; state.lastBytes = null; elements.fileName.textContent = file.name; elements.imageSize.textContent = `${bitmap.width} × ${bitmap.height}px`;
    elements.alphaState.textContent = state.inputHasAlpha ? "あり" : "なし（出力余白で確保）"; elements.cropState.textContent = state.bounds.empty ? "透明画像" : "透明余白を自動トリミング";
    elements.fileMeta.classList.remove("hidden"); elements.sourceEmpty.classList.add("hidden"); elements.previewEmpty.classList.add("hidden"); elements.appStatus.textContent = "編集中";
    setEnabled(true); updateLoopOptions(); regenerateFrames(); setMessage("1枚のPNGから8フレームを生成しました。", "success");
  } catch (error) { console.error(error); setMessage("PNGを読み込めませんでした。", "error"); }
}

function prepareSource(bitmap) {
  const canvas = state.sourceCanvas; canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0);
}

function detectBounds() {
  const canvas = state.sourceCanvas; const ctx = canvas.getContext("2d", { willReadFrequently: true }); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, hasTransparent = false;
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) { const alpha = data[(y * canvas.width + x) * 4 + 3]; if (alpha < 255) hasTransparent = true; if (alpha > 8) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: canvas.width, height: canvas.height, hasTransparent, empty: true };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, hasTransparent, empty: false };
}

function motionAt(index) {
  const phase = index / FRAME_COUNT; const angle = phase * Math.PI * 2; const s = state.strength / 100;
  let x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, anchor = "center";
  switch (state.motion) {
    case "bounce": y = -Math.abs(Math.sin(angle)) * 30 * s; scaleY = 1 - Math.sin(angle) * .03 * s; break;
    case "sway": x = Math.sin(angle) * 24 * s; rotation = Math.sin(angle) * 8 * s; break;
    case "shake": x = Math.sin(angle * 3) * 11 * s; y = Math.cos(angle * 4) * 5 * s; rotation = Math.sin(angle * 3) * 4 * s; break;
    case "bow": rotation = Math.max(0, Math.sin(angle)) * 18 * s; y = Math.max(0, Math.sin(angle)) * 7 * s; anchor = "bottom"; break;
    case "pop": { const pulse = Math.sin(angle); scaleX = 1 + pulse * .12 * s; scaleY = 1 + pulse * .12 * s; y = -Math.max(0, pulse) * 8 * s; break; }
    case "float": y = Math.sin(angle) * 16 * s; rotation = Math.sin(angle) * 5 * s; x = Math.cos(angle) * 5 * s; break;
    case "spin": rotation = phase * 360 * s; scaleX = scaleY = 1 - Math.sin(angle) * .04; break;
  }
  return { x, y, rotation, scaleX, scaleY, anchor };
}

function drawFrame(index, canvas) {
  canvas.width = OUTPUT_WIDTH; canvas.height = OUTPUT_HEIGHT; const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT); if (!state.bitmap || !state.bounds) return;
  const bounds = state.bounds; const maxW = OUTPUT_WIDTH - 16; const maxH = OUTPUT_HEIGHT - 16; const fit = Math.min(maxW / bounds.width, maxH / bounds.height); const baseScale = fit * (state.scale / 100);
  const width = bounds.width * baseScale; const height = bounds.height * baseScale; const motion = motionAt(index); const anchorX = OUTPUT_WIDTH / 2 + state.offsetX + motion.x; const anchorY = (motion.anchor === "bottom" ? OUTPUT_HEIGHT / 2 + height / 2 : OUTPUT_HEIGHT / 2) + state.offsetY + motion.y;
  ctx.save(); ctx.translate(anchorX, anchorY); ctx.rotate(motion.rotation * Math.PI / 180); ctx.scale(motion.scaleX, motion.scaleY);
  const drawX = -width / 2; const drawY = motion.anchor === "bottom" ? -height : -height / 2;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(state.sourceCanvas, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, width, height); ctx.restore();
}

function regenerateFrames() {
  if (!state.bitmap) return;
  state.frameCanvases = Array.from({ length: FRAME_COUNT }, (_, index) => { const canvas = document.createElement("canvas"); drawFrame(index, canvas); return canvas; });
  drawFrame(0, elements.sourceCanvas); renderTimeline(); renderCurrent(); state.lastBytes = null; elements.fileBytes.textContent = "未生成"; updateValidation();
}

function renderCurrent() {
  if (!state.frameCanvases.length) return; state.currentFrame = clamp(state.currentFrame, 0, FRAME_COUNT - 1); const ctx = elements.previewCanvas.getContext("2d"); ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT); ctx.drawImage(state.frameCanvases[state.currentFrame], 0, 0); elements.frameCounter.textContent = `${state.currentFrame + 1} / 8`; updateTimelineState();
}

function renderTimeline() {
  elements.timeline.innerHTML = "";
  state.frameCanvases.forEach((frame, index) => { const button = document.createElement("button"); button.type = "button"; button.className = "frame-button"; button.dataset.index = String(index); const canvas = document.createElement("canvas"); canvas.width = OUTPUT_WIDTH; canvas.height = OUTPUT_HEIGHT; canvas.getContext("2d").drawImage(frame, 0, 0); const label = document.createElement("span"); label.textContent = `Frame ${index + 1}`; button.append(canvas, label); button.addEventListener("click", () => { stopPlayback(); state.currentFrame = index; renderCurrent(); }); elements.timeline.append(button); });
  updateTimelineState();
}

function updateTimelineState() { elements.timeline.querySelectorAll(".frame-button").forEach((button, index) => { button.classList.toggle("selected", index === state.currentFrame && !state.playing); button.classList.toggle("playing", index === state.currentFrame && state.playing); }); }

function frameDelay() { return Math.max(20, Math.round(state.durationMs / FRAME_COUNT)); }
function startPlayback() { if (!state.bitmap) return; if (state.playing) return stopPlayback(); state.playing = true; state.playedLoops = 0; state.currentFrame = 0; elements.playButton.textContent = "■ 停止"; tick(); }
function tick() { if (!state.playing) return; renderCurrent(); state.timer = window.setTimeout(() => { state.currentFrame += 1; if (state.currentFrame >= FRAME_COUNT) { state.currentFrame = 0; state.playedLoops += 1; if (state.playedLoops >= state.loops) { stopPlayback(false); return; } } tick(); }, frameDelay()); }
function stopPlayback(keepFrame = true) { if (state.timer) clearTimeout(state.timer); state.timer = null; state.playing = false; state.playedLoops = 0; elements.playButton.textContent = "▶ 再生"; if (!keepFrame && state.bitmap) state.currentFrame = 0; if (state.bitmap) renderCurrent(); }

function updateLoopOptions() {
  const maxLoops = Math.max(1, Math.floor(4000 / state.durationMs)); const previous = state.loops; elements.loopSelect.innerHTML = "";
  for (let i = 1; i <= Math.min(4, maxLoops); i += 1) { const option = document.createElement("option"); option.value = String(i); option.textContent = `${i}回`; elements.loopSelect.append(option); }
  state.loops = Math.min(previous, Math.min(4, maxLoops)); elements.loopSelect.value = String(state.loops); elements.totalDuration.textContent = `${(state.durationMs * state.loops / 1000).toFixed(1)}秒`; updateValidation();
}

function setRule(name, status) { const item = elements.validationList.querySelector(`[data-rule="${name}"]`); if (item) item.className = status; }
function updateValidation() {
  const loaded = Boolean(state.bitmap); const totalOk = state.durationMs * state.loops <= 4000; const bytesKnown = state.lastBytes != null; const bytesOk = !bytesKnown || state.lastBytes <= MAX_BYTES;
  setRule("loaded", loaded ? "ok" : ""); setRule("frames", loaded ? "ok" : ""); setRule("duration", loaded ? "ok" : ""); setRule("total", loaded && totalOk ? "ok" : loaded ? "error" : ""); setRule("size", loaded ? "ok" : ""); setRule("alpha", loaded ? "ok" : ""); setRule("bytes", !loaded ? "" : bytesKnown ? (bytesOk ? "ok" : "error") : "pending");
  if (!loaded) { elements.validationBadge.textContent = "待機"; elements.validationBadge.className = "badge idle"; elements.exportButton.disabled = true; return; }
  if (!totalOk || (bytesKnown && !bytesOk)) { elements.validationBadge.textContent = "要修正"; elements.validationBadge.className = "badge error"; }
  else if (!bytesKnown) { elements.validationBadge.textContent = "出力前"; elements.validationBadge.className = "badge warn"; }
  else { elements.validationBadge.textContent = "合格"; elements.validationBadge.className = "badge ok"; }
  elements.exportButton.disabled = !totalOk;
}

function canvasImageData(canvas) { return canvas.getContext("2d").getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT).data; }
async function deflate(bytes) { if (!globalThis.CompressionStream) throw new Error("このブラウザはAPNG圧縮に対応していません。最新版ChromeまたはEdgeを使用してください。"); const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate")); return new Uint8Array(await new Response(stream).arrayBuffer()); }
function u32(value) { return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]); }
function u16(value) { return new Uint8Array([(value >>> 8) & 255, value & 255]); }
function concat(parts) { const length = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(length); let offset = 0; parts.forEach((part) => { out.set(part, offset); offset += part.length; }); return out; }
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
function crc32(bytes) { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data = new Uint8Array()) { const typeBytes = new TextEncoder().encode(type); return concat([u32(data.length), typeBytes, data, u32(crc32(concat([typeBytes, data])))]); }
function scanlines(rgba) { const stride = OUTPUT_WIDTH * 4; const raw = new Uint8Array((stride + 1) * OUTPUT_HEIGHT); for (let y = 0; y < OUTPUT_HEIGHT; y += 1) { const target = y * (stride + 1); raw[target] = 0; raw.set(rgba.subarray(y * stride, (y + 1) * stride), target + 1); } return raw; }

async function encodeApng() {
  const signature = new Uint8Array([137,80,78,71,13,10,26,10]); const ihdr = concat([u32(OUTPUT_WIDTH), u32(OUTPUT_HEIGHT), new Uint8Array([8,6,0,0,0])]); const parts = [signature, chunk("IHDR", ihdr), chunk("acTL", concat([u32(FRAME_COUNT), u32(state.loops)]))];
  const delay = frameDelay(); let sequence = 0;
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const fcTL = concat([u32(sequence++), u32(OUTPUT_WIDTH), u32(OUTPUT_HEIGHT), u32(0), u32(0), u16(delay), u16(1000), new Uint8Array([0,0])]); parts.push(chunk("fcTL", fcTL));
    const compressed = await deflate(scanlines(canvasImageData(state.frameCanvases[index])));
    if (index === 0) parts.push(chunk("IDAT", compressed)); else parts.push(chunk("fdAT", concat([u32(sequence++), compressed])));
  }
  parts.push(chunk("IEND")); return concat(parts);
}

function inspectApng(bytes) { let offset = 8, frames = 0, plays = null; while (offset + 12 <= bytes.length) { const length = (bytes[offset] * 0x1000000) + (bytes[offset+1] << 16) + (bytes[offset+2] << 8) + bytes[offset+3]; const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8)); if (type === "fcTL") frames += 1; if (type === "acTL") plays = (bytes[offset+12] * 0x1000000) + (bytes[offset+13] << 16) + (bytes[offset+14] << 8) + bytes[offset+15]; offset += 12 + length; if (type === "IEND") break; } return { frames, plays }; }
function download(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

async function exportApng() {
  if (!state.bitmap) return; stopPlayback(); elements.exportButton.disabled = true; elements.appStatus.textContent = "APNG生成中…"; setMessage("8フレームを圧縮しています…");
  try { const bytes = await encodeApng(); const inspection = inspectApng(bytes); if (inspection.frames !== FRAME_COUNT || inspection.plays !== state.loops) throw new Error("APNGの再検査に失敗しました。"); state.lastBytes = bytes.length; elements.fileBytes.textContent = formatBytes(bytes.length); updateValidation(); if (bytes.length > MAX_BYTES) { setMessage(`APNGは${formatBytes(bytes.length)}です。1MBを超えています。画像サイズか動きを小さくしてください。`, "error"); return; } download(new Blob([bytes], { type: "image/png" }), `${baseName(state.file.name)}-${state.motion}.png`); setMessage(`APNGを書き出しました（${formatBytes(bytes.length)} / 8フレーム）。`, "success"); }
  catch (error) { console.error(error); setMessage(error.message || "APNG生成に失敗しました。", "error"); }
  finally { elements.appStatus.textContent = "編集中"; updateValidation(); }
}
function baseName(name) { return name.replace(/\.[^.]+$/, "").replace(/[^\w\-ぁ-んァ-ヶ一-龠]/g, "-"); }
function saveCurrentFrame() { if (!state.frameCanvases.length) return; state.frameCanvases[state.currentFrame].toBlob((blob) => { if (blob) download(blob, `${baseName(state.file.name)}-frame-${String(state.currentFrame + 1).padStart(2,"0")}.png`); }, "image/png"); }

function bind() {
  elements.fileInput.addEventListener("change", (event) => loadFile(event.target.files?.[0]));
  ["dragenter","dragover"].forEach((type) => elements.dropZone.addEventListener(type, (event) => { event.preventDefault(); elements.dropZone.classList.add("dragover"); }));
  ["dragleave","drop"].forEach((type) => elements.dropZone.addEventListener(type, (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragover"); }));
  elements.dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer?.files?.[0])); elements.resetButton.addEventListener("click", reset);
  elements.playButton.addEventListener("click", startPlayback); elements.firstButton.addEventListener("click", () => { stopPlayback(); state.currentFrame = 0; renderCurrent(); }); elements.lastButton.addEventListener("click", () => { stopPlayback(); state.currentFrame = FRAME_COUNT - 1; renderCurrent(); });
  elements.prevButton.addEventListener("click", () => { stopPlayback(); state.currentFrame = (state.currentFrame + FRAME_COUNT - 1) % FRAME_COUNT; renderCurrent(); }); elements.nextButton.addEventListener("click", () => { stopPlayback(); state.currentFrame = (state.currentFrame + 1) % FRAME_COUNT; renderCurrent(); });
  elements.backgroundSelect.addEventListener("change", () => { elements.previewStage.className = `preview-stage ${elements.backgroundSelect.value === "checker" ? "checker" : elements.backgroundSelect.value}`; });
  elements.durationSelect.addEventListener("change", () => { state.durationMs = Number(elements.durationSelect.value); updateLoopOptions(); }); elements.loopSelect.addEventListener("change", () => { state.loops = Number(elements.loopSelect.value); updateLoopOptions(); });
  elements.motionSelect.addEventListener("change", () => { state.motion = elements.motionSelect.value; elements.motionDescription.textContent = descriptions[state.motion]; regenerateFrames(); });
  const rangeBindings = [[elements.strengthRange,"strength",elements.strengthValue,(v)=>String(v)],[elements.scaleRange,"scale",elements.scaleValue,(v)=>`${v}%`],[elements.xRange,"offsetX",elements.xValue,(v)=>String(v)],[elements.yRange,"offsetY",elements.yValue,(v)=>String(v)]];
  rangeBindings.forEach(([input,key,label,format]) => input.addEventListener("input", () => { state[key] = Number(input.value); label.textContent = format(input.value); regenerateFrames(); }));
  elements.exportButton.addEventListener("click", exportApng); elements.saveFrameButton.addEventListener("click", saveCurrentFrame);
}

function boot() { bind(); reset(); elements.appStatus.textContent = globalThis.CompressionStream ? "準備完了" : "プレビューのみ"; if (!globalThis.CompressionStream) setMessage("APNG出力には最新版ChromeまたはEdgeを使用してください。", "error"); }
boot();
