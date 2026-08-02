"use strict";

const FRAME_COUNT = 8;
const OUTPUT_WIDTH = 320;
const OUTPUT_HEIGHT = 270;
const MAX_OUTPUT_BYTES = 1_000_000;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_INPUT_PIXELS = 32_000_000;

const EMOTIONS = {
  laugh: { label: "笑う", text: "わーい！", faceY: -12, faceSize: 100 },
  angry: { label: "怒る", text: "むかっ！", faceY: -12, faceSize: 100 },
  cry: { label: "泣く", text: "えーん", faceY: -12, faceSize: 100 },
  surprise: { label: "驚く", text: "えっ!?", faceY: -12, faceSize: 105 },
  shy: { label: "照れる", text: "えへへ", faceY: -12, faceSize: 100 },
  bow: { label: "お辞儀", text: "ありがとう", faceY: -12, faceSize: 95 }
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  fileInput: $("#fileInput"), dropZone: $("#dropZone"), resetButton: $("#resetButton"), appStatus: $("#appStatus"),
  sourceMeta: $("#sourceMeta"), fileName: $("#fileName"), sourceSize: $("#sourceSize"), alphaState: $("#alphaState"),
  sourceCanvas: $("#sourceCanvas"), emptySource: $("#emptySource"), previewStage: $("#previewStage"), previewCanvas: $("#previewCanvas"), emptyPreview: $("#emptyPreview"),
  previewFrameLabel: $("#previewFrameLabel"), firstFrameButton: $("#firstFrameButton"), previousFrameButton: $("#previousFrameButton"), playButton: $("#playButton"), nextFrameButton: $("#nextFrameButton"), lastFrameButton: $("#lastFrameButton"),
  backgroundSelect: $("#backgroundSelect"), durationSelect: $("#durationSelect"), loopSelect: $("#loopSelect"),
  metricEmotion: $("#metricEmotion"), metricTotal: $("#metricTotal"), metricOutput: $("#metricOutput"),
  scaleRange: $("#scaleRange"), scaleValue: $("#scaleValue"), positionXRange: $("#positionXRange"), positionXValue: $("#positionXValue"), positionYRange: $("#positionYRange"), positionYValue: $("#positionYValue"),
  emotionGrid: $("#emotionGrid"), intensityRange: $("#intensityRange"), intensityValue: $("#intensityValue"),
  expressionToggle: $("#expressionToggle"), effectToggle: $("#effectToggle"), faceXRange: $("#faceXRange"), faceXValue: $("#faceXValue"), faceYRange: $("#faceYRange"), faceYValue: $("#faceYValue"), faceSizeRange: $("#faceSizeRange"), faceSizeValue: $("#faceSizeValue"),
  textToggle: $("#textToggle"), textInput: $("#textInput"), textPositionSelect: $("#textPositionSelect"), textSizeSelect: $("#textSizeSelect"),
  validationBadge: $("#validationBadge"), validationList: $("#validationList"), exportButton: $("#exportButton"), exportFrameButton: $("#exportFrameButton"), exportMessage: $("#exportMessage"), timeline: $("#timeline")
};

const state = {
  file: null,
  bitmap: null,
  sourceCanvas: document.createElement("canvas"),
  alpha: false,
  bounds: null,
  emotion: "laugh",
  intensity: 0.7,
  imageScale: 1,
  positionX: 0,
  positionY: 0,
  faceX: 0,
  faceY: -12,
  faceSize: 1,
  expression: true,
  effect: true,
  textEnabled: true,
  text: "わーい！",
  textPosition: "bottom",
  textSize: 42,
  durationMs: 1000,
  loopCount: 4,
  previewIndex: 0,
  selectedIndex: 0,
  playing: false,
  timer: null,
  playedLoops: 0,
  lastExportBytes: null,
  lastExportSize: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
};

const interactive = [
  elements.resetButton, elements.firstFrameButton, elements.previousFrameButton, elements.playButton, elements.nextFrameButton, elements.lastFrameButton,
  elements.backgroundSelect, elements.durationSelect, elements.loopSelect, elements.scaleRange, elements.positionXRange, elements.positionYRange,
  elements.intensityRange, elements.expressionToggle, elements.effectToggle, elements.faceXRange, elements.faceYRange, elements.faceSizeRange,
  elements.textToggle, elements.textInput, elements.textPositionSelect, elements.textSizeSelect, elements.exportButton, elements.exportFrameButton,
  ...elements.emotionGrid.querySelectorAll("button")
];

function setEnabled(enabled) {
  interactive.forEach((element) => { element.disabled = !enabled; });
}

function setMessage(message, type = "") {
  elements.exportMessage.textContent = message;
  elements.exportMessage.className = `export-message${type ? ` ${type}` : ""}`;
}

function stopPlayback({ resetFrame = false } = {}) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.playing = false;
  state.playedLoops = 0;
  elements.playButton.textContent = "▶ 再生";
  if (resetFrame) state.previewIndex = 0;
  updateTimelineState();
}

function resetApp() {
  stopPlayback({ resetFrame: true });
  if (state.bitmap?.close) state.bitmap.close();
  Object.assign(state, {
    file: null, bitmap: null, alpha: false, bounds: null, emotion: "laugh", intensity: 0.7,
    imageScale: 1, positionX: 0, positionY: 0, faceX: 0, faceY: -12, faceSize: 1,
    expression: true, effect: true, textEnabled: true, text: "わーい！", textPosition: "bottom", textSize: 42,
    durationMs: 1000, loopCount: 4, previewIndex: 0, selectedIndex: 0, lastExportBytes: null,
    lastExportSize: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
  });
  elements.fileInput.value = "";
  elements.sourceMeta.classList.add("hidden");
  elements.emptySource.classList.remove("hidden");
  elements.emptyPreview.classList.remove("hidden");
  clearCanvas(elements.sourceCanvas);
  clearCanvas(elements.previewCanvas);
  elements.timeline.innerHTML = '<div class="timeline-empty">画像を読み込むと8フレームを自動生成します</div>';
  elements.appStatus.textContent = "画像未読込";
  elements.previewFrameLabel.textContent = "- / 8";
  elements.metricEmotion.textContent = "-";
  elements.metricTotal.textContent = "4.0秒";
  elements.metricOutput.textContent = "320×270";
  elements.validationBadge.textContent = "待機";
  elements.validationBadge.className = "validation-badge idle";
  elements.validationList.querySelectorAll("li").forEach((li) => { li.className = ""; });
  elements.scaleRange.value = "100"; elements.scaleValue.textContent = "100%";
  elements.positionXRange.value = "0"; elements.positionXValue.textContent = "0";
  elements.positionYRange.value = "0"; elements.positionYValue.textContent = "0";
  elements.intensityRange.value = "70"; elements.intensityValue.textContent = "70%";
  elements.expressionToggle.checked = true; elements.effectToggle.checked = true;
  elements.faceXRange.value = "0"; elements.faceXValue.textContent = "0";
  elements.faceYRange.value = "-12"; elements.faceYValue.textContent = "-12";
  elements.faceSizeRange.value = "100"; elements.faceSizeValue.textContent = "100%";
  elements.textToggle.checked = true; elements.textInput.value = "わーい！"; elements.textPositionSelect.value = "bottom"; elements.textSizeSelect.value = "42";
  elements.durationSelect.value = "1000"; elements.loopSelect.value = "4";
  selectEmotionButton("laugh");
  setEnabled(false);
  setMessage("");
}

async function loadFile(file) {
  stopPlayback({ resetFrame: true });
  setMessage("");
  if (!file) return;
  if (file.size > MAX_INPUT_BYTES) return setMessage("50MBを超える画像は読み込めません。", "error");
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) return setMessage("PNG画像を選択してください。", "error");

  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > MAX_INPUT_PIXELS) {
      bitmap.close();
      return setMessage("画像が大きすぎます。総画素数32MP以下にしてください。", "error");
    }
    if (state.bitmap?.close) state.bitmap.close();
    state.file = file;
    state.bitmap = bitmap;
    state.sourceCanvas.width = bitmap.width;
    state.sourceCanvas.height = bitmap.height;
    const context = state.sourceCanvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    const analysis = analyzeImage(context, bitmap.width, bitmap.height);
    state.alpha = analysis.hasAlpha;
    state.bounds = analysis.bounds;
    state.lastExportBytes = null;

    elements.fileName.textContent = file.name;
    elements.sourceSize.textContent = `${bitmap.width} × ${bitmap.height}px`;
    elements.alphaState.textContent = state.alpha ? "あり" : "なし（背景も動きます）";
    elements.sourceMeta.classList.remove("hidden");
    elements.emptySource.classList.add("hidden");
    elements.emptyPreview.classList.add("hidden");
    elements.appStatus.textContent = "編集中";
    setEnabled(true);
    renderSource();
    renderAll();
    setMessage("画像から8フレームを生成しました。感情を選んで調整してください。", "success");
  } catch (error) {
    console.error(error);
    setMessage("PNGを読み込めませんでした。画像ファイルを確認してください。", "error");
  }
}

function analyzeImage(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1, hasAlpha = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 255) hasAlpha = true;
      if (alpha > 8) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  const bounds = maxX >= minX ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : { x: 0, y: 0, width, height };
  return { hasAlpha, bounds };
}

function clearCanvas(canvas) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function fitImage(width, height, canvasWidth = OUTPUT_WIDTH, canvasHeight = OUTPUT_HEIGHT) {
  const maxWidth = canvasWidth * 0.76;
  const maxHeight = canvasHeight * 0.72;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

function renderSource() {
  if (!state.bitmap) return;
  const canvas = elements.sourceCanvas;
  canvas.width = OUTPUT_WIDTH; canvas.height = OUTPUT_HEIGHT;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const fit = fitImage(state.bounds.width, state.bounds.height);
  const width = fit.width * state.imageScale;
  const height = fit.height * state.imageScale;
  context.drawImage(state.sourceCanvas, state.bounds.x, state.bounds.y, state.bounds.width, state.bounds.height, (OUTPUT_WIDTH - width) / 2 + state.positionX, (OUTPUT_HEIGHT - height) / 2 + state.positionY, width, height);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function getMotion(frameIndex) {
  const p = frameIndex / FRAME_COUNT;
  const wave = Math.sin(p * Math.PI * 2);
  const intensity = state.intensity;
  switch (state.emotion) {
    case "laugh":
      return { x: wave * 4 * intensity, y: -Math.abs(wave) * 18 * intensity, rotation: wave * 2.4 * intensity, scaleX: 1 + Math.abs(wave) * .035 * intensity, scaleY: 1 - Math.abs(wave) * .025 * intensity, pivotY: .58 };
    case "angry": {
      const shake = frameIndex % 2 === 0 ? -1 : 1;
      return { x: shake * 7 * intensity, y: Math.abs(wave) * 2, rotation: shake * 1.6 * intensity, scaleX: 1 + Math.abs(wave) * .015, scaleY: 1, pivotY: .58 };
    }
    case "cry":
      return { x: wave * 2.5 * intensity, y: Math.sin(p * Math.PI) * 8 * intensity, rotation: wave * .9 * intensity, scaleX: 1, scaleY: 1 - Math.abs(wave) * .012, pivotY: .6 };
    case "surprise": {
      const t = frameIndex <= 2 ? frameIndex / 2 : (FRAME_COUNT - frameIndex) / (FRAME_COUNT - 2);
      const pop = easeOutBack(Math.max(0, Math.min(1, t)));
      return { x: 0, y: -Math.sin(p * Math.PI) * 10 * intensity, rotation: 0, scaleX: .92 + pop * .13 * intensity + (1 - intensity) * .08, scaleY: .92 + pop * .13 * intensity + (1 - intensity) * .08, pivotY: .58 };
    }
    case "shy":
      return { x: wave * 7 * intensity, y: -Math.abs(wave) * 3, rotation: wave * 3.2 * intensity, scaleX: 1, scaleY: 1, pivotY: .6 };
    case "bow": {
      const bow = Math.pow(Math.sin(p * Math.PI), 1.4);
      return { x: 0, y: bow * 14 * intensity, rotation: bow * 17 * intensity, scaleX: 1, scaleY: 1 - bow * .04, pivotY: .8 };
    }
    default:
      return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotY: .58 };
  }
}

function drawFrame(canvas, frameIndex, { width = OUTPUT_WIDTH, height = OUTPUT_HEIGHT, includeBackground = false } = {}) {
  if (!state.bitmap) return;
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  if (includeBackground) drawChosenBackground(context, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const ratioX = width / OUTPUT_WIDTH;
  const ratioY = height / OUTPUT_HEIGHT;
  const fit = fitImage(state.bounds.width, state.bounds.height, width, height);
  const imageWidth = fit.width * state.imageScale;
  const imageHeight = fit.height * state.imageScale;
  const motion = getMotion(frameIndex);
  const centerX = width / 2 + state.positionX * ratioX + motion.x * ratioX;
  const centerY = height / 2 + state.positionY * ratioY + motion.y * ratioY;
  const pivotX = imageWidth * .5;
  const pivotY = imageHeight * motion.pivotY;

  context.save();
  context.translate(centerX - imageWidth / 2 + pivotX, centerY - imageHeight / 2 + pivotY);
  context.rotate(motion.rotation * Math.PI / 180);
  context.scale(motion.scaleX, motion.scaleY);
  context.drawImage(state.sourceCanvas, state.bounds.x, state.bounds.y, state.bounds.width, state.bounds.height, -pivotX, -pivotY, imageWidth, imageHeight);

  if (state.expression) drawExpression(context, frameIndex, imageWidth, imageHeight, pivotX, pivotY, width / OUTPUT_WIDTH);
  if (state.effect) drawEffects(context, frameIndex, imageWidth, imageHeight, pivotX, pivotY, width / OUTPUT_WIDTH);
  context.restore();

  if (state.textEnabled && state.text.trim()) drawText(context, frameIndex, width, height);
}

function drawChosenBackground(context, width, height) {
  const background = elements.backgroundSelect.value;
  if (background === "white") { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); }
  else if (background === "black") { context.fillStyle = "#000"; context.fillRect(0, 0, width, height); }
  else if (background === "gray") { context.fillStyle = "#8e9298"; context.fillRect(0, 0, width, height); }
}

function faceGeometry(imageWidth, imageHeight, pivotX, pivotY, canvasScale) {
  const scale = Math.min(imageWidth, imageHeight) * 0.19 * state.faceSize;
  const x = -pivotX + imageWidth * (.5 + state.faceX / 100);
  const y = -pivotY + imageHeight * (.42 + state.faceY / 100);
  return { x, y, size: Math.max(16 * canvasScale, scale), eyeGap: scale * .48 };
}

function drawExpression(context, frameIndex, imageWidth, imageHeight, pivotX, pivotY, canvasScale) {
  const g = faceGeometry(imageWidth, imageHeight, pivotX, pivotY, canvasScale);
  const p = frameIndex / FRAME_COUNT;
  const wave = Math.sin(p * Math.PI * 2);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2.3 * canvasScale, g.size * .065);
  context.strokeStyle = "rgba(37, 25, 34, .94)";
  context.fillStyle = "rgba(37, 25, 34, .94)";

  if (state.emotion === "laugh") {
    drawArcEye(context, g.x - g.eyeGap, g.y, g.size * .26, true);
    drawArcEye(context, g.x + g.eyeGap, g.y, g.size * .26, true);
    context.beginPath();
    context.ellipse(g.x, g.y + g.size * .55, g.size * .31, g.size * (.26 + Math.abs(wave) * .07), 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ff7f91";
    context.beginPath();
    context.ellipse(g.x, g.y + g.size * .65, g.size * .2, g.size * .08, 0, 0, Math.PI * 2);
    context.fill();
  } else if (state.emotion === "angry") {
    drawAngryEye(context, g.x - g.eyeGap, g.y, g.size, -1);
    drawAngryEye(context, g.x + g.eyeGap, g.y, g.size, 1);
    context.beginPath();
    context.moveTo(g.x - g.size * .25, g.y + g.size * .62);
    context.quadraticCurveTo(g.x, g.y + g.size * .42, g.x + g.size * .25, g.y + g.size * .62);
    context.stroke();
  } else if (state.emotion === "cry") {
    drawArcEye(context, g.x - g.eyeGap, g.y, g.size * .25, false);
    drawArcEye(context, g.x + g.eyeGap, g.y, g.size * .25, false);
    context.beginPath();
    context.moveTo(g.x - g.size * .25, g.y + g.size * .65);
    context.quadraticCurveTo(g.x, g.y + g.size * .43, g.x + g.size * .25, g.y + g.size * .65);
    context.stroke();
  } else if (state.emotion === "surprise") {
    context.fillStyle = "rgba(255,255,255,.92)";
    [g.x - g.eyeGap, g.x + g.eyeGap].forEach((x) => {
      context.beginPath(); context.arc(x, g.y, g.size * .22, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "rgba(37,25,34,.94)"; context.stroke();
      context.fillStyle = "rgba(37,25,34,.94)"; context.beginPath(); context.arc(x, g.y, g.size * .08, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(255,255,255,.92)";
    });
    context.fillStyle = "rgba(37,25,34,.94)";
    context.beginPath(); context.ellipse(g.x, g.y + g.size * .58, g.size * .18, g.size * .28, 0, 0, Math.PI * 2); context.fill();
  } else if (state.emotion === "shy") {
    drawArcEye(context, g.x - g.eyeGap, g.y, g.size * .23, true);
    drawArcEye(context, g.x + g.eyeGap, g.y, g.size * .23, true);
    context.beginPath();
    context.moveTo(g.x - g.size * .22, g.y + g.size * .5);
    context.quadraticCurveTo(g.x, g.y + g.size * .72, g.x + g.size * .22, g.y + g.size * .5);
    context.stroke();
    drawBlush(context, g.x - g.eyeGap * 1.45, g.y + g.size * .38, g.size);
    drawBlush(context, g.x + g.eyeGap * 1.45, g.y + g.size * .38, g.size);
  } else if (state.emotion === "bow") {
    drawArcEye(context, g.x - g.eyeGap, g.y, g.size * .22, true);
    drawArcEye(context, g.x + g.eyeGap, g.y, g.size * .22, true);
    context.beginPath();
    context.moveTo(g.x - g.size * .18, g.y + g.size * .5);
    context.quadraticCurveTo(g.x, g.y + g.size * .61, g.x + g.size * .18, g.y + g.size * .5);
    context.stroke();
  }
  context.restore();
}

function drawArcEye(context, x, y, radius, happy) {
  context.beginPath();
  context.arc(x, y, radius, happy ? Math.PI * 1.08 : Math.PI * .08, happy ? Math.PI * 1.92 : Math.PI * .92, happy);
  context.stroke();
}

function drawAngryEye(context, x, y, size, direction) {
  context.beginPath();
  context.moveTo(x - size * .2, y + direction * size * .04);
  context.lineTo(x + size * .2, y - direction * size * .12);
  context.stroke();
  context.beginPath();
  context.arc(x, y + size * .12, size * .07, 0, Math.PI * 2);
  context.fill();
}

function drawBlush(context, x, y, size) {
  context.save();
  context.fillStyle = "rgba(255, 100, 130, .48)";
  context.beginPath(); context.ellipse(x, y, size * .24, size * .12, 0, 0, Math.PI * 2); context.fill();
  context.restore();
}

function drawEffects(context, frameIndex, imageWidth, imageHeight, pivotX, pivotY, canvasScale) {
  const p = frameIndex / FRAME_COUNT;
  const wave = Math.sin(p * Math.PI * 2);
  const g = faceGeometry(imageWidth, imageHeight, pivotX, pivotY, canvasScale);
  context.save();
  if (state.emotion === "laugh") {
    drawSparkle(context, -pivotX + imageWidth * .16, -pivotY + imageHeight * .18, g.size * (.2 + Math.abs(wave) * .08));
    drawSparkle(context, -pivotX + imageWidth * .83, -pivotY + imageHeight * .26, g.size * (.15 + Math.abs(wave) * .07));
  } else if (state.emotion === "angry") {
    context.globalAlpha = .18 + Math.abs(wave) * .1;
    context.fillStyle = "#ff405c";
    context.beginPath(); context.ellipse(g.x, g.y + g.size * .12, g.size * 1.35, g.size * 1.05, 0, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 1;
    drawAngerMark(context, -pivotX + imageWidth * .78, -pivotY + imageHeight * .15, g.size * .5);
  } else if (state.emotion === "cry") {
    const fall = ((frameIndex * .22) % 1);
    drawTear(context, g.x - g.eyeGap, g.y + g.size * (.22 + fall * .95), g.size * .14);
    drawTear(context, g.x + g.eyeGap, g.y + g.size * (.34 + ((fall + .45) % 1) * .9), g.size * .14);
  } else if (state.emotion === "surprise") {
    drawSurpriseLines(context, g.x, g.y + g.size * .15, g.size * (1.15 + Math.abs(wave) * .15));
  } else if (state.emotion === "shy") {
    drawHeart(context, -pivotX + imageWidth * .78, -pivotY + imageHeight * (.2 - Math.sin(p * Math.PI) * .06), g.size * .3, "#ff6f9f");
    drawHeart(context, -pivotX + imageWidth * .18, -pivotY + imageHeight * (.32 - Math.sin((p + .25) * Math.PI) * .05), g.size * .2, "#ff94b8");
  } else if (state.emotion === "bow") {
    if (frameIndex >= 3 && frameIndex <= 6) {
      drawSparkle(context, -pivotX + imageWidth * .78, -pivotY + imageHeight * .2, g.size * .17);
    }
  }
  context.restore();
}

function drawSparkle(context, x, y, size) {
  context.save(); context.translate(x, y); context.fillStyle = "#ffd95e";
  context.beginPath();
  context.moveTo(0, -size); context.lineTo(size * .22, -size * .22); context.lineTo(size, 0); context.lineTo(size * .22, size * .22); context.lineTo(0, size); context.lineTo(-size * .22, size * .22); context.lineTo(-size, 0); context.lineTo(-size * .22, -size * .22); context.closePath(); context.fill(); context.restore();
}

function drawAngerMark(context, x, y, size) {
  context.save(); context.translate(x, y); context.strokeStyle = "#ff3b51"; context.lineWidth = Math.max(3, size * .1); context.lineCap = "round";
  [[-1,-1], [1,-1], [-1,1], [1,1]].forEach(([sx, sy]) => { context.beginPath(); context.moveTo(sx * size * .1, sy * size * .1); context.lineTo(sx * size * .65, sy * size * .15); context.lineTo(sx * size * .55, sy * size * .65); context.stroke(); });
  context.restore();
}

function drawTear(context, x, y, size) {
  context.save(); context.fillStyle = "rgba(91, 190, 255, .88)"; context.strokeStyle = "rgba(255,255,255,.75)"; context.lineWidth = 1.5;
  context.beginPath(); context.moveTo(x, y - size * 1.2); context.bezierCurveTo(x + size, y - size * .2, x + size * .8, y + size, x, y + size * 1.15); context.bezierCurveTo(x - size * .8, y + size, x - size, y - size * .2, x, y - size * 1.2); context.fill(); context.stroke(); context.restore();
}

function drawSurpriseLines(context, x, y, radius) {
  context.save(); context.strokeStyle = "#ffd95e"; context.lineWidth = Math.max(2.5, radius * .045); context.lineCap = "round";
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI * .92 + i * Math.PI * 1.84 / 9;
    const inner = radius * .82; const outer = radius * (1.05 + (i % 2) * .12);
    context.beginPath(); context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner); context.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer); context.stroke();
  }
  context.restore();
}

function drawHeart(context, x, y, size, color) {
  context.save(); context.translate(x, y); context.scale(size / 20, size / 20); context.fillStyle = color;
  context.beginPath(); context.moveTo(0, 7); context.bezierCurveTo(-16, -3, -9, -17, 0, -8); context.bezierCurveTo(9, -17, 16, -3, 0, 7); context.fill(); context.restore();
}

function drawText(context, frameIndex, width, height) {
  const p = frameIndex / FRAME_COUNT;
  const wave = Math.sin(p * Math.PI * 2);
  let scale = 1;
  let x = width / 2;
  let y = state.textPosition === "top" ? height * .17 : height * .87;
  let rotation = 0;
  if (state.emotion === "laugh") { y -= Math.abs(wave) * 5; scale += Math.abs(wave) * .07; }
  else if (state.emotion === "angry") { x += (frameIndex % 2 ? 1 : -1) * 4 * state.intensity; rotation = (frameIndex % 2 ? 1 : -1) * .025; }
  else if (state.emotion === "cry") { y += Math.sin(p * Math.PI) * 5; }
  else if (state.emotion === "surprise") { scale = frameIndex < 3 ? .72 + frameIndex * .2 : 1; }
  else if (state.emotion === "shy") { x += wave * 3; }
  else if (state.emotion === "bow") { y += Math.sin(p * Math.PI) * 3; }

  const fontSize = state.textSize * width / OUTPUT_WIDTH;
  context.save(); context.translate(x, y); context.rotate(rotation); context.scale(scale, scale);
  context.textAlign = "center"; context.textBaseline = "middle"; context.font = `900 ${fontSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
  context.lineJoin = "round"; context.lineWidth = Math.max(5, fontSize * .18); context.strokeStyle = "rgba(255,255,255,.98)"; context.strokeText(state.text, 0, 0);
  context.lineWidth = Math.max(2, fontSize * .055); context.strokeStyle = "rgba(20,25,35,.75)"; context.strokeText(state.text, 0, 0);
  context.fillStyle = emotionTextColor(state.emotion); context.fillText(state.text, 0, 0);
  context.restore();
}

function emotionTextColor(emotion) {
  return ({ laugh: "#ff9d3d", angry: "#ff405c", cry: "#55b9ff", surprise: "#ffd84f", shy: "#ff78aa", bow: "#4addaa" })[emotion] || "#4addaa";
}

function renderPreview() {
  if (!state.bitmap) return;
  drawFrame(elements.previewCanvas, state.previewIndex);
  elements.previewFrameLabel.textContent = `${state.previewIndex + 1} / 8`;
  updateTimelineState();
}

function renderTimeline() {
  if (!state.bitmap) return;
  elements.timeline.innerHTML = "";
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "frame-card"; button.dataset.index = String(index);
    const canvas = document.createElement("canvas");
    drawFrame(canvas, index, { width: 184, height: 156 });
    const label = document.createElement("span"); label.textContent = `FRAME ${index + 1}`;
    button.append(canvas, label);
    button.addEventListener("click", () => { stopPlayback(); state.selectedIndex = index; state.previewIndex = index; renderPreview(); });
    elements.timeline.append(button);
  }
  updateTimelineState();
}

function updateTimelineState() {
  elements.timeline.querySelectorAll(".frame-card").forEach((button, index) => {
    button.classList.toggle("selected", index === state.selectedIndex);
    button.classList.toggle("playing", state.playing && index === state.previewIndex);
  });
}

function renderAll() {
  renderSource();
  renderPreview();
  renderTimeline();
  updateMetrics();
  updateValidation();
}

function updateMetrics() {
  elements.metricEmotion.textContent = EMOTIONS[state.emotion].label;
  const total = state.durationMs * state.loopCount / 1000;
  elements.metricTotal.textContent = `${total.toFixed(1)}秒`;
  elements.metricOutput.textContent = `${state.lastExportSize.width}×${state.lastExportSize.height}`;
}

function updateValidation() {
  const rules = {
    image: Boolean(state.bitmap),
    frames: true,
    duration: state.durationMs * state.loopCount <= 4000,
    size: state.lastExportSize.width <= OUTPUT_WIDTH && state.lastExportSize.height <= OUTPUT_HEIGHT,
    alpha: true,
    bytes: state.lastExportBytes == null ? null : state.lastExportBytes <= MAX_OUTPUT_BYTES
  };
  Object.entries(rules).forEach(([name, value]) => {
    const item = elements.validationList.querySelector(`[data-rule="${name}"]`);
    item.className = value == null ? "pending" : value ? "ok" : "error";
    if (name === "bytes" && state.lastExportBytes != null) item.textContent = `APNG ${(state.lastExportBytes / 1024).toFixed(0)}KB / 1MB以下`;
  });
  const values = Object.values(rules);
  const invalid = values.includes(false);
  const pending = values.includes(null);
  elements.validationBadge.textContent = invalid ? "要修正" : pending ? "出力待ち" : "合格";
  elements.validationBadge.className = `validation-badge ${invalid ? "error" : pending ? "warn" : "ok"}`;
  elements.exportButton.disabled = !state.bitmap || invalid;
}

function play() {
  if (!state.bitmap) return;
  if (state.playing) return stopPlayback();
  state.playing = true; state.playedLoops = 0; state.previewIndex = 0;
  elements.playButton.textContent = "■ 停止";
  const delay = Math.max(20, Math.round(state.durationMs / FRAME_COUNT));
  const tick = () => {
    if (!state.playing) return;
    renderPreview();
    state.previewIndex += 1;
    if (state.previewIndex >= FRAME_COUNT) {
      state.previewIndex = 0; state.playedLoops += 1;
      if (state.playedLoops >= state.loopCount) {
        state.previewIndex = FRAME_COUNT - 1;
        renderPreview();
        stopPlayback();
        return;
      }
    }
    state.timer = setTimeout(tick, delay);
  };
  tick();
}

function selectEmotion(emotion) {
  if (!EMOTIONS[emotion]) return;
  stopPlayback({ resetFrame: true });
  state.emotion = emotion;
  const preset = EMOTIONS[emotion];
  state.text = preset.text;
  state.faceY = preset.faceY;
  state.faceSize = preset.faceSize / 100;
  elements.textInput.value = state.text;
  elements.faceYRange.value = String(state.faceY); elements.faceYValue.textContent = String(state.faceY);
  elements.faceSizeRange.value = String(preset.faceSize); elements.faceSizeValue.textContent = `${preset.faceSize}%`;
  selectEmotionButton(emotion);
  state.lastExportBytes = null;
  renderAll();
}

function selectEmotionButton(emotion) {
  elements.emotionGrid.querySelectorAll("button").forEach((button) => button.classList.toggle("selected", button.dataset.emotion === emotion));
}

async function exportCurrentFrame() {
  if (!state.bitmap) return;
  const canvas = document.createElement("canvas");
  drawFrame(canvas, state.previewIndex);
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, `${baseFileName()}-${state.emotion}-frame-${state.previewIndex + 1}.png`);
}

async function exportApng() {
  if (!state.bitmap) return;
  stopPlayback();
  elements.exportButton.disabled = true;
  setMessage("APNGを生成しています…");
  try {
    const candidates = [
      { width: 320, height: 270 },
      { width: 300, height: 253 },
      { width: 280, height: 236 },
      { width: 270, height: 228 }
    ];
    let result = null;
    for (const size of candidates) {
      result = await makeApng(size.width, size.height);
      if (result.bytes.length <= MAX_OUTPUT_BYTES) break;
    }
    state.lastExportBytes = result.bytes.length;
    state.lastExportSize = { width: result.width, height: result.height };
    updateMetrics();
    updateValidation();
    const verification = inspectApng(result.bytes);
    if (verification.frames !== FRAME_COUNT || verification.width !== result.width || verification.height !== result.height) throw new Error("生成後のAPNG検査に失敗しました。");
    downloadBlob(new Blob([result.bytes], { type: "image/png" }), `${baseFileName()}-${state.emotion}.png`);
    setMessage(`APNGを保存しました（${verification.frames}フレーム・${(result.bytes.length / 1024).toFixed(0)}KB）。`, result.bytes.length <= MAX_OUTPUT_BYTES ? "success" : "error");
  } catch (error) {
    console.error(error);
    setMessage(error.message || "APNGの生成に失敗しました。", "error");
  } finally {
    updateValidation();
  }
}

async function makeApng(width, height) {
  if (typeof CompressionStream !== "function") throw new Error("このブラウザはAPNG圧縮に対応していません。最新版のChromeまたはEdgeを使用してください。");
  const frames = [];
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const canvas = document.createElement("canvas");
    drawFrame(canvas, index, { width, height });
    frames.push(canvas.getContext("2d").getImageData(0, 0, width, height).data);
  }
  const delay = Math.max(1, Math.round(state.durationMs / FRAME_COUNT));
  const bytes = await encodeApng(frames, width, height, delay, state.loopCount);
  return { bytes, width, height };
}

async function encodeApng(frames, width, height, delayMs, loopCount) {
  const chunks = [pngSignature(), pngChunk("IHDR", concatBytes(uint32(width), uint32(height), Uint8Array.from([8, 6, 0, 0, 0]))), pngChunk("acTL", concatBytes(uint32(frames.length), uint32(loopCount)))];
  let sequence = 0;
  for (let index = 0; index < frames.length; index += 1) {
    const frameControl = concatBytes(uint32(sequence++), uint32(width), uint32(height), uint32(0), uint32(0), uint16(Math.min(65535, delayMs)), uint16(1000), Uint8Array.from([0, 0]));
    chunks.push(pngChunk("fcTL", frameControl));
    const filtered = addPngFilters(frames[index], width, height);
    const compressed = await deflate(filtered);
    if (index === 0) chunks.push(pngChunk("IDAT", compressed));
    else chunks.push(pngChunk("fdAT", concatBytes(uint32(sequence++), compressed)));
  }
  chunks.push(pngChunk("IEND", new Uint8Array()));
  return concatBytes(...chunks);
}

function addPngFilters(rgba, width, height) {
  const stride = width * 4;
  const output = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const outOffset = y * (stride + 1);
    output[outOffset] = 0;
    output.set(rgba.subarray(y * stride, (y + 1) * stride), outOffset + 1);
  }
  return output;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pngSignature() { return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]); }
function uint16(value) { return Uint8Array.from([(value >>> 8) & 255, value & 255]); }
function uint32(value) { return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]); }
function ascii(text) { return Uint8Array.from([...text].map((char) => char.charCodeAt(0))); }
function concatBytes(...arrays) { const length = arrays.reduce((sum, array) => sum + array.length, 0); const output = new Uint8Array(length); let offset = 0; arrays.forEach((array) => { output.set(array, offset); offset += array.length; }); return output; }
function pngChunk(type, data) { const typeBytes = ascii(type); const crcInput = concatBytes(typeBytes, data); return concatBytes(uint32(data.length), typeBytes, data, uint32(crc32(crcInput))); }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectApng(bytes) {
  let offset = 8, width = 0, height = 0, frames = 0, loops = 0;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const dataOffset = offset + 8;
    if (type === "IHDR") { width = readUint32(bytes, dataOffset); height = readUint32(bytes, dataOffset + 4); }
    if (type === "acTL") { frames = readUint32(bytes, dataOffset); loops = readUint32(bytes, dataOffset + 4); }
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return { width, height, frames, loops };
}

function readUint32(bytes, offset) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }
function canvasToBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG生成に失敗しました。")), "image/png")); }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function baseFileName() { return (state.file?.name || "animated-stamp").replace(/\.png$/i, "").replace(/[^\w\-\u3000-\u9fff]+/g, "-"); }

function bindRange(element, callback) {
  element.addEventListener("input", () => { callback(Number(element.value)); state.lastExportBytes = null; renderAll(); });
}

function bindEvents() {
  elements.fileInput.addEventListener("change", (event) => loadFile(event.target.files?.[0]));
  ["dragenter", "dragover"].forEach((type) => elements.dropZone.addEventListener(type, (event) => { event.preventDefault(); elements.dropZone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((type) => elements.dropZone.addEventListener(type, (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragover"); }));
  elements.dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files?.[0]));
  elements.resetButton.addEventListener("click", resetApp);
  elements.playButton.addEventListener("click", play);
  elements.firstFrameButton.addEventListener("click", () => { stopPlayback(); state.previewIndex = 0; state.selectedIndex = 0; renderPreview(); });
  elements.lastFrameButton.addEventListener("click", () => { stopPlayback(); state.previewIndex = FRAME_COUNT - 1; state.selectedIndex = FRAME_COUNT - 1; renderPreview(); });
  elements.previousFrameButton.addEventListener("click", () => { stopPlayback(); state.previewIndex = (state.previewIndex + FRAME_COUNT - 1) % FRAME_COUNT; state.selectedIndex = state.previewIndex; renderPreview(); });
  elements.nextFrameButton.addEventListener("click", () => { stopPlayback(); state.previewIndex = (state.previewIndex + 1) % FRAME_COUNT; state.selectedIndex = state.previewIndex; renderPreview(); });
  elements.emotionGrid.addEventListener("click", (event) => { const button = event.target.closest("button[data-emotion]"); if (button && !button.disabled) selectEmotion(button.dataset.emotion); });

  bindRange(elements.scaleRange, (value) => { state.imageScale = value / 100; elements.scaleValue.textContent = `${value}%`; });
  bindRange(elements.positionXRange, (value) => { state.positionX = value; elements.positionXValue.textContent = String(value); });
  bindRange(elements.positionYRange, (value) => { state.positionY = value; elements.positionYValue.textContent = String(value); });
  bindRange(elements.intensityRange, (value) => { state.intensity = value / 100; elements.intensityValue.textContent = `${value}%`; });
  bindRange(elements.faceXRange, (value) => { state.faceX = value; elements.faceXValue.textContent = String(value); });
  bindRange(elements.faceYRange, (value) => { state.faceY = value; elements.faceYValue.textContent = String(value); });
  bindRange(elements.faceSizeRange, (value) => { state.faceSize = value / 100; elements.faceSizeValue.textContent = `${value}%`; });

  elements.expressionToggle.addEventListener("change", () => { state.expression = elements.expressionToggle.checked; state.lastExportBytes = null; renderAll(); });
  elements.effectToggle.addEventListener("change", () => { state.effect = elements.effectToggle.checked; state.lastExportBytes = null; renderAll(); });
  elements.textToggle.addEventListener("change", () => { state.textEnabled = elements.textToggle.checked; state.lastExportBytes = null; renderAll(); });
  elements.textInput.addEventListener("input", () => { state.text = elements.textInput.value; state.lastExportBytes = null; renderAll(); });
  elements.textPositionSelect.addEventListener("change", () => { state.textPosition = elements.textPositionSelect.value; state.lastExportBytes = null; renderAll(); });
  elements.textSizeSelect.addEventListener("change", () => { state.textSize = Number(elements.textSizeSelect.value); state.lastExportBytes = null; renderAll(); });
  elements.backgroundSelect.addEventListener("change", () => {
    elements.previewStage.className = `preview-stage ${elements.backgroundSelect.value === "checker" ? "checker" : elements.backgroundSelect.value}`;
  });
  elements.durationSelect.addEventListener("change", () => { state.durationMs = Number(elements.durationSelect.value); stopPlayback({ resetFrame: true }); state.lastExportBytes = null; updateMetrics(); updateValidation(); });
  elements.loopSelect.addEventListener("change", () => { state.loopCount = Number(elements.loopSelect.value); stopPlayback({ resetFrame: true }); state.lastExportBytes = null; updateMetrics(); updateValidation(); });
  elements.exportButton.addEventListener("click", exportApng);
  elements.exportFrameButton.addEventListener("click", exportCurrentFrame);
}

bindEvents();
resetApp();
elements.appStatus.textContent = "画像未読込";
