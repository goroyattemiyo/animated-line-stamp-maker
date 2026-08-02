"use strict";

(() => {
  const BONE_DEFS = [
    ["root", "基準", null],
    ["hips", "腰", "root"],
    ["chest", "胸", "hips"],
    ["neck", "首", "chest"],
    ["head", "頭", "neck"],
    ["leftShoulder", "左肩", "chest"],
    ["leftElbow", "左ひじ", "leftShoulder"],
    ["leftWrist", "左手", "leftElbow"],
    ["rightShoulder", "右肩", "chest"],
    ["rightElbow", "右ひじ", "rightShoulder"],
    ["rightWrist", "右手", "rightElbow"],
    ["leftHip", "左股", "hips"],
    ["leftKnee", "左ひざ", "leftHip"],
    ["leftAnkle", "左足", "leftKnee"],
    ["rightHip", "右股", "hips"],
    ["rightKnee", "右ひざ", "rightHip"],
    ["rightAnkle", "右足", "rightKnee"]
  ];

  const FACE_DEFS = [
    ["leftBrow", "左眉"], ["rightBrow", "右眉"],
    ["leftEye", "左目"], ["rightEye", "右目"], ["mouth", "口"]
  ];

  const boneLabels = Object.fromEntries(BONE_DEFS.map(([id, label]) => [id, label]));
  const faceLabels = Object.fromEntries(FACE_DEFS.map(([id, label]) => [id, label]));
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  let rigRevision = 0;
  let baseCanvas = null;
  let deformCache = new Map();
  let selected = null;
  let dragging = null;
  let previewRaf = null;

  Object.assign(state, {
    rig: null,
    rigEditEnabled: false,
    rigDeformEnabled: true,
    rigShowFace: true
  });

  const sourcePreview = elements.sourceCanvas.closest(".source-preview");
  const rigCanvas = document.createElement("canvas");
  rigCanvas.id = "rigCanvas";
  rigCanvas.width = OUTPUT_WIDTH;
  rigCanvas.height = OUTPUT_HEIGHT;
  rigCanvas.setAttribute("aria-label", "ボーンと表情ポイント編集レイヤー");
  sourcePreview.append(rigCanvas);

  const rigCard = document.createElement("div");
  rigCard.className = "control-card rig-card";
  rigCard.innerHTML = `
    <div class="control-title"><strong>リグ設定</strong><span id="rigStatus">未設定</span></div>
    <p class="rig-help">自動仮配置した点を、画像上でドラッグして合わせます。</p>
    <div class="rig-button-grid">
      <button id="rigEditButton" type="button" disabled>点を調整</button>
      <button id="rigAutoButton" type="button" disabled>自動再配置</button>
      <button id="rigMirrorButton" type="button" disabled>左→右へ反映</button>
      <button id="rigSaveButton" type="button" disabled>JSON保存</button>
      <button id="rigLoadButton" type="button" disabled>JSON読込</button>
    </div>
    <input id="rigLoadInput" type="file" accept="application/json,.json" hidden>
    <div class="toggle-row rig-toggles">
      <label><input id="rigDeformToggle" type="checkbox" checked disabled><span>ボーン変形を使う</span></label>
      <label><input id="rigFaceToggle" type="checkbox" checked disabled><span>顔ポイント表示</span></label>
    </div>
    <div class="rig-selected"><span>選択</span><strong id="rigSelectedLabel">なし</strong></div>`;

  const compactControls = elements.scaleRange.closest(".control-card");
  compactControls.insertAdjacentElement("afterend", rigCard);

  const rigElements = {
    status: rigCard.querySelector("#rigStatus"),
    edit: rigCard.querySelector("#rigEditButton"),
    auto: rigCard.querySelector("#rigAutoButton"),
    mirror: rigCard.querySelector("#rigMirrorButton"),
    save: rigCard.querySelector("#rigSaveButton"),
    load: rigCard.querySelector("#rigLoadButton"),
    loadInput: rigCard.querySelector("#rigLoadInput"),
    deform: rigCard.querySelector("#rigDeformToggle"),
    face: rigCard.querySelector("#rigFaceToggle"),
    selected: rigCard.querySelector("#rigSelectedLabel")
  };

  const style = document.createElement("style");
  style.textContent = `
    #rigCanvas{position:absolute;left:50%;top:50%;width:min(100%,320px);height:auto;aspect-ratio:320/270;transform:translate(-50%,-50%);pointer-events:none;touch-action:none;z-index:3}
    #rigCanvas.editing{pointer-events:auto;cursor:crosshair}
    .rig-card{display:grid;gap:9px}.rig-help{margin:0;color:var(--muted);font-size:.69rem}
    .rig-button-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.rig-button-grid button{min-height:36px;border:1px solid var(--line);border-radius:9px;background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:.71rem}
    .rig-button-grid button:first-child{grid-column:1/-1}.rig-button-grid button.active{border-color:var(--accent);background:rgba(74,221,170,.13);color:#b7f7df}
    .rig-toggles{margin-top:2px}.rig-selected{display:flex;justify-content:space-between;gap:10px;padding:7px 9px;border-radius:9px;background:var(--panel-deep);font-size:.69rem}.rig-selected span{color:var(--muted)}.rig-selected strong{color:var(--accent)}
  `;
  document.head.append(style);

  interactive.push(rigElements.edit, rigElements.auto, rigElements.mirror, rigElements.save, rigElements.load, rigElements.deform, rigElements.face);

  function emptyRig() {
    const bones = {};
    BONE_DEFS.forEach(([id, label, parent]) => { bones[id] = { id, label, parent, x: .5, y: .5 }; });
    const face = {};
    FACE_DEFS.forEach(([id, label]) => { face[id] = { id, label, x: .5, y: .2 }; });
    return { version: 1, bones, face };
  }

  function invalidateRig() {
    rigRevision += 1;
    deformCache = new Map();
  }

  function getDisplayRect() {
    if (!state.bounds) return { x: 0, y: 0, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT };
    const fit = fitImage(state.bounds.width, state.bounds.height);
    const width = fit.width * state.imageScale;
    const height = fit.height * state.imageScale;
    return {
      x: (OUTPUT_WIDTH - width) / 2 + state.positionX,
      y: (OUTPUT_HEIGHT - height) / 2 + state.positionY,
      width,
      height
    };
  }

  function pointToCanvas(point) {
    const rect = getDisplayRect();
    return { x: rect.x + point.x * rect.width, y: rect.y + point.y * rect.height };
  }

  function canvasToPoint(x, y) {
    const rect = getDisplayRect();
    return {
      x: clamp01((x - rect.x) / Math.max(1, rect.width)),
      y: clamp01((y - rect.y) / Math.max(1, rect.height))
    };
  }

  function getPointer(event) {
    const rect = rigCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * rigCanvas.width / rect.width,
      y: (event.clientY - rect.top) * rigCanvas.height / rect.height
    };
  }

  function allPoints() {
    if (!state.rig) return [];
    const points = Object.values(state.rig.bones).map((point) => ({ type: "bone", id: point.id, point }));
    if (state.rigShowFace) points.push(...Object.values(state.rig.face).map((point) => ({ type: "face", id: point.id, point })));
    return points;
  }

  function findNearest(x, y) {
    let best = null;
    for (const item of allPoints()) {
      const position = pointToCanvas(item.point);
      const distance = Math.hypot(position.x - x, position.y - y);
      if (distance <= 15 && (!best || distance < best.distance)) best = { ...item, distance };
    }
    return best;
  }

  function setSelected(item) {
    selected = item ? { type: item.type, id: item.id } : null;
    rigElements.selected.textContent = item
      ? (item.type === "bone" ? boneLabels[item.id] : `表情：${faceLabels[item.id]}`)
      : "なし";
    drawRigOverlay();
  }

  function drawRigOverlay() {
    const context = rigCanvas.getContext("2d");
    context.clearRect(0, 0, rigCanvas.width, rigCanvas.height);
    if (!state.bitmap || !state.rig) return;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = state.rigEditEnabled ? 1 : .48;
    context.strokeStyle = "rgba(74,221,170,.9)";
    context.lineWidth = 2;
    for (const [id, , parent] of BONE_DEFS) {
      if (!parent) continue;
      const from = pointToCanvas(state.rig.bones[parent]);
      const to = pointToCanvas(state.rig.bones[id]);
      context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
    }

    for (const item of allPoints()) {
      const position = pointToCanvas(item.point);
      const isSelected = selected?.type === item.type && selected?.id === item.id;
      context.beginPath();
      context.arc(position.x, position.y, isSelected ? 6.5 : 4.5, 0, Math.PI * 2);
      context.fillStyle = item.type === "bone" ? (isSelected ? "#ffffff" : "#4addaa") : (isSelected ? "#ffffff" : "#ff83ba");
      context.fill();
      context.strokeStyle = "rgba(5,18,28,.95)";
      context.lineWidth = 2;
      context.stroke();
      if (state.rigEditEnabled && (isSelected || item.id === "head" || item.id === "root")) {
        context.font = "700 10px sans-serif";
        context.fillStyle = "rgba(255,255,255,.95)";
        context.fillText(item.type === "bone" ? boneLabels[item.id] : faceLabels[item.id], position.x + 8, position.y - 7);
      }
    }
    context.restore();
  }

  function buildMask() {
    const size = 180;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(state.sourceCanvas, state.bounds.x, state.bounds.y, state.bounds.width, state.bounds.height, 0, 0, size, size);
    return { size, data: context.getImageData(0, 0, size, size).data };
  }

  function autoDetectRig() {
    if (!state.bitmap || !state.bounds) return;
    const rig = emptyRig();
    const { size, data } = buildMask();
    const solid = (x, y) => data[(Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))) * 4 + 3] > 18;

    function spanAt(yNorm, band = .035) {
      const y0 = Math.max(0, Math.floor((yNorm - band) * size));
      const y1 = Math.min(size - 1, Math.ceil((yNorm + band) * size));
      let min = size, max = -1;
      for (let y = y0; y <= y1; y += 1) for (let x = 0; x < size; x += 1) if (solid(x, y)) { min = Math.min(min, x); max = Math.max(max, x); }
      return max >= min ? { min: min / size, max: max / size, center: (min + max) / (2 * size) } : { min: .25, max: .75, center: .5 };
    }

    function centroid(x0, x1, y0, y1) {
      let sx = 0, sy = 0, count = 0;
      for (let y = Math.floor(y0 * size); y < Math.ceil(y1 * size); y += 1) {
        for (let x = Math.floor(x0 * size); x < Math.ceil(x1 * size); x += 1) {
          if (solid(x, y)) { sx += x; sy += y; count += 1; }
        }
      }
      return count ? { x: sx / count / size, y: sy / count / size } : { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    }

    function extremity(side, y0, y1) {
      let extreme = side === "left" ? size : -1;
      const candidates = [];
      for (let y = Math.floor(y0 * size); y < Math.ceil(y1 * size); y += 1) {
        for (let x = 0; x < size; x += 1) if (solid(x, y)) {
          if ((side === "left" && x < extreme) || (side === "right" && x > extreme)) extreme = x;
        }
      }
      if (extreme < 0 || extreme >= size) return { x: side === "left" ? .18 : .82, y: .6 };
      for (let y = Math.floor(y0 * size); y < Math.ceil(y1 * size); y += 1) for (let x = 0; x < size; x += 1) {
        if (solid(x, y) && Math.abs(x - extreme) <= 4) candidates.push({ x, y });
      }
      const avg = candidates.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y }), { x: 0, y: 0 });
      return { x: avg.x / Math.max(1, candidates.length) / size, y: avg.y / Math.max(1, candidates.length) / size };
    }

    const headCenter = centroid(.18, .82, .02, .34);
    const headSpan = spanAt(Math.max(.12, Math.min(.27, headCenter.y)), .06);
    const shoulders = spanAt(.38, .045);
    const hips = spanAt(.66, .04);
    const leftHand = extremity("left", .34, .72);
    const rightHand = extremity("right", .34, .72);
    const leftFoot = centroid(0, .5, .82, 1);
    const rightFoot = centroid(.5, 1, .82, 1);
    const centerX = (hips.center + shoulders.center + headCenter.x) / 3;

    Object.assign(rig.bones.root, { x: (leftFoot.x + rightFoot.x) / 2, y: .95 });
    Object.assign(rig.bones.hips, { x: hips.center, y: .67 });
    Object.assign(rig.bones.chest, { x: (shoulders.center + hips.center) / 2, y: .48 });
    Object.assign(rig.bones.neck, { x: headCenter.x, y: .31 });
    Object.assign(rig.bones.head, { x: headCenter.x, y: Math.max(.1, headCenter.y) });
    Object.assign(rig.bones.leftShoulder, { x: shoulders.min + (shoulders.max - shoulders.min) * .25, y: .39 });
    Object.assign(rig.bones.rightShoulder, { x: shoulders.max - (shoulders.max - shoulders.min) * .25, y: .39 });
    Object.assign(rig.bones.leftWrist, leftHand);
    Object.assign(rig.bones.rightWrist, rightHand);
    Object.assign(rig.bones.leftElbow, { x: (rig.bones.leftShoulder.x + leftHand.x) / 2, y: (rig.bones.leftShoulder.y + leftHand.y) / 2 });
    Object.assign(rig.bones.rightElbow, { x: (rig.bones.rightShoulder.x + rightHand.x) / 2, y: (rig.bones.rightShoulder.y + rightHand.y) / 2 });
    Object.assign(rig.bones.leftHip, { x: hips.min + (hips.max - hips.min) * .4, y: .68 });
    Object.assign(rig.bones.rightHip, { x: hips.max - (hips.max - hips.min) * .4, y: .68 });
    Object.assign(rig.bones.leftAnkle, { x: leftFoot.x || centerX - .08, y: .94 });
    Object.assign(rig.bones.rightAnkle, { x: rightFoot.x || centerX + .08, y: .94 });
    Object.assign(rig.bones.leftKnee, { x: (rig.bones.leftHip.x + rig.bones.leftAnkle.x) / 2, y: .81 });
    Object.assign(rig.bones.rightKnee, { x: (rig.bones.rightHip.x + rig.bones.rightAnkle.x) / 2, y: .81 });

    const eyeY = clamp01(headCenter.y - .015);
    const faceWidth = Math.max(.12, headSpan.max - headSpan.min);
    Object.assign(rig.face.leftEye, { x: headCenter.x - faceWidth * .15, y: eyeY });
    Object.assign(rig.face.rightEye, { x: headCenter.x + faceWidth * .15, y: eyeY });
    Object.assign(rig.face.leftBrow, { x: headCenter.x - faceWidth * .15, y: eyeY - .055 });
    Object.assign(rig.face.rightBrow, { x: headCenter.x + faceWidth * .15, y: eyeY - .055 });
    Object.assign(rig.face.mouth, { x: headCenter.x, y: eyeY + .11 });

    state.rig = rig;
    state.rigEditEnabled = true;
    rigCanvas.classList.add("editing");
    rigElements.edit.classList.add("active");
    rigElements.edit.textContent = "調整を終了";
    rigElements.status.textContent = "自動仮配置";
    setSelected({ type: "bone", id: "head" });
    rebuildBaseCanvas();
    invalidateRig();
    renderAll();
  }

  function mirrorLeftToRight() {
    if (!state.rig) return;
    const pairs = [["leftShoulder", "rightShoulder"], ["leftElbow", "rightElbow"], ["leftWrist", "rightWrist"], ["leftHip", "rightHip"], ["leftKnee", "rightKnee"], ["leftAnkle", "rightAnkle"]];
    const center = state.rig.bones.chest.x;
    for (const [left, right] of pairs) {
      state.rig.bones[right].x = clamp01(center + (center - state.rig.bones[left].x));
      state.rig.bones[right].y = state.rig.bones[left].y;
    }
    for (const [left, right] of [["leftEye", "rightEye"], ["leftBrow", "rightBrow"]]) {
      state.rig.face[right].x = clamp01(center + (center - state.rig.face[left].x));
      state.rig.face[right].y = state.rig.face[left].y;
    }
    rigElements.status.textContent = "左右反映済み";
    invalidateRig();
    renderAll();
  }

  function validateRig(value) {
    if (!value || value.version !== 1 || !value.bones || !value.face) throw new Error("対応していないリグJSONです。");
    for (const [id] of BONE_DEFS) if (!value.bones[id] || !Number.isFinite(value.bones[id].x) || !Number.isFinite(value.bones[id].y)) throw new Error(`ボーン ${id} が不足しています。`);
    for (const [id] of FACE_DEFS) if (!value.face[id] || !Number.isFinite(value.face[id].x) || !Number.isFinite(value.face[id].y)) throw new Error(`表情ポイント ${id} が不足しています。`);
    return value;
  }

  function saveRig() {
    if (!state.rig) return;
    const payload = JSON.stringify({ ...state.rig, image: state.file?.name || null }, null, 2);
    downloadBlob(new Blob([payload], { type: "application/json" }), `${baseFileName()}-rig.json`);
    rigElements.status.textContent = "JSON保存済み";
  }

  async function loadRigFile(file) {
    if (!file) return;
    try {
      const value = validateRig(JSON.parse(await file.text()));
      state.rig = value;
      rigElements.status.textContent = "JSON読込済み";
      invalidateRig();
      renderAll();
    } catch (error) {
      setMessage(error.message || "リグJSONを読み込めませんでした。", "error");
    } finally {
      rigElements.loadInput.value = "";
    }
  }

  function rebuildBaseCanvas() {
    baseCanvas = null;
    deformCache = new Map();
    if (!state.bitmap || !state.bounds) return;
    const maxSize = 520;
    const scale = Math.min(1, maxSize / Math.max(state.bounds.width, state.bounds.height));
    const width = Math.max(8, Math.round(state.bounds.width * scale));
    const height = Math.max(8, Math.round(state.bounds.height * scale));
    baseCanvas = document.createElement("canvas");
    baseCanvas.width = width; baseCanvas.height = height;
    baseCanvas.getContext("2d").drawImage(state.sourceCanvas, state.bounds.x, state.bounds.y, state.bounds.width, state.bounds.height, 0, 0, width, height);
  }

  function copyRigPoints() {
    const bones = Object.fromEntries(Object.entries(state.rig.bones).map(([id, p]) => [id, { x: p.x, y: p.y }]));
    const face = Object.fromEntries(Object.entries(state.rig.face).map(([id, p]) => [id, { x: p.x, y: p.y }]));
    return { bones, face };
  }

  function rotatePoints(store, ids, pivot, degrees) {
    const angle = degrees * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    ids.forEach((id) => {
      const point = store[id];
      if (!point) return;
      const dx = point.x - pivot.x, dy = point.y - pivot.y;
      point.x = pivot.x + dx * c - dy * s;
      point.y = pivot.y + dx * s + dy * c;
    });
  }

  function animatedRig(frameIndex) {
    const result = copyRigPoints();
    const strength = state.motionStrength ?? 1;
    const direction = state.motionFlip ? -1 : 1;
    const preset = state.motionPreset || "jump";
    const upper = ["chest", "neck", "head", "leftShoulder", "leftElbow", "leftWrist", "rightShoulder", "rightElbow", "rightWrist"];
    const faceIds = Object.keys(result.face);
    const factor8 = [0, .2, .55, 1, 1, .55, .2, 0][frameIndex] * strength;

    if (preset === "wave") {
      const side = state.motionFlip ? "left" : "right";
      const shoulder = result.bones[`${side}Shoulder`];
      const elbowId = `${side}Elbow`, wristId = `${side}Wrist`;
      const angle = [0, -18, 16, -24, 21, -18, 14, 0][frameIndex] * strength * direction;
      rotatePoints(result.bones, [elbowId, wristId], shoulder, angle);
      rotatePoints(result.bones, [wristId], result.bones[elbowId], angle * .8);
    } else if (preset === "nod") {
      const angle = [0, 2, 8, 2, 0, 5, 1, 0][frameIndex] * strength;
      rotatePoints(result.bones, ["head"], result.bones.neck, angle);
      rotatePoints(result.face, faceIds, result.bones.neck, angle);
      result.bones.head.y += Math.abs(angle) * .0015;
      faceIds.forEach((id) => { result.face[id].y += Math.abs(angle) * .0015; });
    } else if (preset === "tilt") {
      const angle = [0, -5, -11, -5, 0, 5, 11, 0][frameIndex] * strength * direction;
      rotatePoints(result.bones, ["head"], result.bones.neck, angle);
      rotatePoints(result.face, faceIds, result.bones.neck, angle);
    } else if (preset === "bow") {
      upper.forEach((id) => { result.bones[id].y += factor8 * (id === "head" ? .075 : id === "neck" ? .055 : .032); });
      faceIds.forEach((id) => { result.face[id].y += factor8 * .075; });
      result.bones.leftElbow.x += factor8 * .018; result.bones.rightElbow.x -= factor8 * .018;
    } else if (preset === "jump") {
      const crouch = [1, .45, 0, 0, 0, .15, .8, 0][frameIndex] * strength;
      result.bones.hips.y += crouch * .035;
      ["leftKnee", "rightKnee"].forEach((id, index) => { result.bones[id].y -= crouch * .02; result.bones[id].x += (index ? 1 : -1) * crouch * .022; });
      const lift = [0, .25, .7, 1, .8, .35, 0, 0][frameIndex] * strength;
      result.bones.leftWrist.y -= lift * .035; result.bones.rightWrist.y -= lift * .035;
    } else if (preset === "sad") {
      ["head", "neck", "leftShoulder", "rightShoulder"].forEach((id) => { result.bones[id].y += factor8 * (id === "head" ? .065 : .035); });
      faceIds.forEach((id) => { result.face[id].y += factor8 * .065; });
      result.bones.leftWrist.y += factor8 * .025; result.bones.rightWrist.y += factor8 * .025;
    } else if (preset === "shake") {
      const lag = [0, -.012, .012, -.009, .009, -.012, .012, 0][frameIndex] * strength;
      result.bones.head.x += lag; faceIds.forEach((id) => { result.face[id].x += lag; });
    } else if (preset === "sway") {
      const lag = [0, -.008, -.016, -.008, 0, .008, .016, 0][frameIndex] * strength * direction;
      result.bones.head.x -= lag; result.bones.neck.x -= lag * .55; faceIds.forEach((id) => { result.face[id].x -= lag; });
    }
    return result;
  }

  function buildControlPairs(frameIndex, width, height) {
    const target = animatedRig(frameIndex);
    const pairs = [];
    for (const [id] of BONE_DEFS) {
      const from = state.rig.bones[id];
      const to = target.bones[id];
      pairs.push({ x: from.x * width, y: from.y * height, dx: (to.x - from.x) * width, dy: (to.y - from.y) * height });
    }
    const anchors = [[0,0],[.5,0],[1,0],[0,.5],[1,.5],[0,1],[.5,1],[1,1]];
    anchors.forEach(([x,y]) => pairs.push({ x:x*width, y:y*height, dx:0, dy:0, anchor:true }));
    return pairs;
  }

  function displacedVertex(x, y, pairs, width, height) {
    let sum = 0, dx = 0, dy = 0;
    for (const pair of pairs) {
      const nx = (x - pair.x) / width;
      const ny = (y - pair.y) / height;
      const d2 = nx * nx + ny * ny;
      const weight = pair.anchor ? 1 / Math.pow(d2 + .012, 2) : 1 / Math.pow(d2 + .003, 2);
      sum += weight; dx += pair.dx * weight; dy += pair.dy * weight;
    }
    return { x: x + dx / sum, y: y + dy / sum };
  }

  function affineFromTriangles(source, target) {
    const [s0, s1, s2] = source, [t0, t1, t2] = target;
    const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(det) < 1e-5) return null;
    const a = (t0.x * (s1.y - s2.y) + t1.x * (s2.y - s0.y) + t2.x * (s0.y - s1.y)) / det;
    const c = (t0.x * (s2.x - s1.x) + t1.x * (s0.x - s2.x) + t2.x * (s1.x - s0.x)) / det;
    const e = (t0.x * (s1.x * s2.y - s2.x * s1.y) + t1.x * (s2.x * s0.y - s0.x * s2.y) + t2.x * (s0.x * s1.y - s1.x * s0.y)) / det;
    const b = (t0.y * (s1.y - s2.y) + t1.y * (s2.y - s0.y) + t2.y * (s0.y - s1.y)) / det;
    const d = (t0.y * (s2.x - s1.x) + t1.y * (s0.x - s2.x) + t2.y * (s1.x - s0.x)) / det;
    const f = (t0.y * (s1.x * s2.y - s2.x * s1.y) + t1.y * (s2.x * s0.y - s0.x * s2.y) + t2.y * (s0.x * s1.y - s1.x * s0.y)) / det;
    return { a, b, c, d, e, f };
  }

  function drawWarpTriangle(context, sourceCanvas, source, target) {
    const matrix = affineFromTriangles(source, target);
    if (!matrix) return;
    context.save();
    context.beginPath(); context.moveTo(target[0].x, target[0].y); context.lineTo(target[1].x, target[1].y); context.lineTo(target[2].x, target[2].y); context.closePath(); context.clip();
    context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    context.drawImage(sourceCanvas, 0, 0);
    context.restore();
  }

  function deformFrame(frameIndex) {
    if (!baseCanvas || !state.rig) return baseCanvas;
    const key = `${rigRevision}|${state.motionPreset}|${state.motionStrength}|${state.motionFlip}|${frameIndex}`;
    if (deformCache.has(key)) return deformCache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = baseCanvas.width; canvas.height = baseCanvas.height;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    const cols = 7, rows = 9;
    const pairs = buildControlPairs(frameIndex, canvas.width, canvas.height);
    const source = [], target = [];
    for (let y = 0; y <= rows; y += 1) {
      source[y] = []; target[y] = [];
      for (let x = 0; x <= cols; x += 1) {
        const sx = x * canvas.width / cols, sy = y * canvas.height / rows;
        source[y][x] = { x: sx, y: sy };
        target[y][x] = displacedVertex(sx, sy, pairs, canvas.width, canvas.height);
      }
    }
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
      drawWarpTriangle(context, baseCanvas, [source[y][x], source[y][x+1], source[y+1][x]], [target[y][x], target[y][x+1], target[y+1][x]]);
      drawWarpTriangle(context, baseCanvas, [source[y][x+1], source[y+1][x+1], source[y+1][x]], [target[y][x+1], target[y+1][x+1], target[y+1][x]]);
    }
    deformCache.set(key, canvas);
    return canvas;
  }

  const originalLoadFile = loadFile;
  loadFile = async function loadFileWithRig(file) {
    await originalLoadFile(file);
    if (state.bitmap) autoDetectRig();
  };

  const originalRenderSource = renderSource;
  renderSource = function renderSourceWithRig() {
    originalRenderSource();
    drawRigOverlay();
  };

  const originalDrawFrame = drawFrame;
  drawFrame = function drawFrameWithRig(canvas, frameIndex, options = {}) {
    if (!state.rigDeformEnabled || !state.rig || !baseCanvas) return originalDrawFrame(canvas, frameIndex, options);
    const previousSource = state.sourceCanvas;
    const previousBounds = state.bounds;
    const deformed = deformFrame(frameIndex);
    state.sourceCanvas = deformed;
    state.bounds = { x: 0, y: 0, width: deformed.width, height: deformed.height };
    try {
      return originalDrawFrame(canvas, frameIndex, options);
    } finally {
      state.sourceCanvas = previousSource;
      state.bounds = previousBounds;
    }
  };

  const originalFaceGeometry = faceGeometry;
  faceGeometry = function rigFaceGeometry(imageWidth, imageHeight, pivotX, pivotY, canvasScale) {
    if (!state.rig?.face) return originalFaceGeometry(imageWidth, imageHeight, pivotX, pivotY, canvasScale);
    const left = state.rig.face.leftEye, right = state.rig.face.rightEye, mouth = state.rig.face.mouth;
    const centerX = (left.x + right.x) / 2;
    const eyeY = (left.y + right.y) / 2;
    const eyeGap = Math.max(7 * canvasScale, Math.abs(right.x - left.x) * imageWidth / 2);
    const size = Math.max(16 * canvasScale, eyeGap / .48);
    return { x: -pivotX + centerX * imageWidth, y: -pivotY + eyeY * imageHeight, size, eyeGap, mouthY: -pivotY + mouth.y * imageHeight };
  };

  rigCanvas.addEventListener("pointerdown", (event) => {
    if (!state.rigEditEnabled || !state.rig) return;
    const pointer = getPointer(event);
    const nearest = findNearest(pointer.x, pointer.y);
    if (!nearest) return setSelected(null);
    dragging = { type: nearest.type, id: nearest.id };
    setSelected(nearest);
    rigCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  rigCanvas.addEventListener("pointermove", (event) => {
    if (!dragging || !state.rig) return;
    const pointer = getPointer(event);
    const value = canvasToPoint(pointer.x, pointer.y);
    const store = dragging.type === "bone" ? state.rig.bones : state.rig.face;
    Object.assign(store[dragging.id], value);
    rigElements.status.textContent = "手動調整中";
    invalidateRig();
    drawRigOverlay();
    if (!previewRaf) previewRaf = requestAnimationFrame(() => { previewRaf = null; renderPreview(); });
    event.preventDefault();
  });

  function finishDrag(event) {
    if (!dragging) return;
    dragging = null;
    if (event && rigCanvas.hasPointerCapture(event.pointerId)) rigCanvas.releasePointerCapture(event.pointerId);
    renderAll();
  }
  rigCanvas.addEventListener("pointerup", finishDrag);
  rigCanvas.addEventListener("pointercancel", finishDrag);

  rigElements.edit.addEventListener("click", () => {
    state.rigEditEnabled = !state.rigEditEnabled;
    rigCanvas.classList.toggle("editing", state.rigEditEnabled);
    rigElements.edit.classList.toggle("active", state.rigEditEnabled);
    rigElements.edit.textContent = state.rigEditEnabled ? "調整を終了" : "点を調整";
    rigElements.status.textContent = state.rigEditEnabled ? "ドラッグ調整" : "調整済み";
    drawRigOverlay();
  });
  rigElements.auto.addEventListener("click", autoDetectRig);
  rigElements.mirror.addEventListener("click", mirrorLeftToRight);
  rigElements.save.addEventListener("click", saveRig);
  rigElements.load.addEventListener("click", () => rigElements.loadInput.click());
  rigElements.loadInput.addEventListener("change", () => loadRigFile(rigElements.loadInput.files?.[0]));
  rigElements.deform.addEventListener("change", () => { state.rigDeformEnabled = rigElements.deform.checked; invalidateRig(); renderAll(); });
  rigElements.face.addEventListener("change", () => { state.rigShowFace = rigElements.face.checked; drawRigOverlay(); });

  elements.resetButton.addEventListener("click", () => {
    state.rig = null; state.rigEditEnabled = false; state.rigDeformEnabled = true; state.rigShowFace = true;
    baseCanvas = null; selected = null; invalidateRig();
    rigCanvas.classList.remove("editing");
    rigElements.edit.classList.remove("active"); rigElements.edit.textContent = "点を調整";
    rigElements.status.textContent = "未設定"; rigElements.selected.textContent = "なし";
    rigElements.deform.checked = true; rigElements.face.checked = true;
    drawRigOverlay();
  });

  [elements.scaleRange, elements.positionXRange, elements.positionYRange].forEach((input) => input.addEventListener("input", drawRigOverlay));
  drawRigOverlay();
})();
