"use strict";

(() => {
  const MOTION_PRESETS = {
    bow: {
      label: "お辞儀",
      description: "足元を軸に前へ傾き、丁寧に戻ります。",
      frames: [
        {}, { y: 2, rotation: 4 }, { y: 6, rotation: 10 }, { y: 10, rotation: 18, scaleY: .97 },
        { y: 10, rotation: 18, scaleY: .97 }, { y: 6, rotation: 10 }, { y: 2, rotation: 4 }, {}
      ],
      pivotY: .82
    },
    nod: {
      label: "うなずく",
      description: "短く二度うなずく動きです。",
      frames: [
        {}, { y: 1, rotation: 2 }, { y: 4, rotation: 7 }, { y: 1, rotation: 2 },
        {}, { y: 2, rotation: 4 }, { y: 1, rotation: 1 }, {}
      ],
      pivotY: .64
    },
    tilt: {
      label: "首かしげ",
      description: "左右へゆっくり傾き、疑問やお願いを表します。",
      frames: [
        {}, { x: -2, rotation: -4 }, { x: -4, rotation: -8 }, { x: -2, rotation: -4 },
        {}, { x: 2, rotation: 4 }, { x: 4, rotation: 8 }, {}
      ],
      pivotY: .64
    },
    wave: {
      label: "手を振る（仮）",
      description: "ボーン接続前の仮動作として、体を左右へ小さく振ります。",
      frames: [
        {}, { x: -3, y: -1, rotation: -3 }, { x: -5, y: -2, rotation: -5 }, { x: -2, y: -1, rotation: -2 },
        { x: 3, y: -1, rotation: 3 }, { x: 5, y: -2, rotation: 5 }, { x: 2, y: -1, rotation: 2 }, {}
      ],
      pivotY: .68
    },
    jump: {
      label: "ジャンプ",
      description: "縮んでから上へ跳ね、着地して戻ります。",
      frames: [
        { y: 2, scaleX: 1.04, scaleY: .96 },
        { y: 5, scaleX: 1.02, scaleY: .98 },
        { y: -9, scaleX: .98, scaleY: 1.04 },
        { y: -18, scaleX: .96, scaleY: 1.07 },
        { y: -11, scaleX: .98, scaleY: 1.04 },
        { y: -3, scaleX: 1, scaleY: 1 },
        { y: 3, scaleX: 1.05, scaleY: .95 },
        {}
      ],
      pivotY: .82
    },
    shake: {
      label: "ぷるぷる",
      description: "細かく左右へ震えます。怒り・緊張・泣きに向きます。",
      frames: [
        {}, { x: -4, rotation: -2 }, { x: 4, rotation: 2 }, { x: -3, rotation: -1.5 },
        { x: 3, rotation: 1.5 }, { x: -4, rotation: -2 }, { x: 4, rotation: 2 }, {}
      ],
      pivotY: .64
    },
    sway: {
      label: "左右ゆらゆら",
      description: "左右へゆっくり揺れます。照れやご機嫌な動き向けです。",
      frames: [
        {}, { x: -3, rotation: -2 }, { x: -6, rotation: -4 }, { x: -3, rotation: -2 },
        {}, { x: 3, rotation: 2 }, { x: 6, rotation: 4 }, {}
      ],
      pivotY: .76
    },
    sad: {
      label: "しょんぼり",
      description: "少し沈み、前へ丸まるように戻ります。",
      frames: [
        {}, { y: 2, rotation: 1 }, { y: 5, rotation: 3, scaleY: .99 }, { y: 8, rotation: 5, scaleY: .97 },
        { y: 8, rotation: 5, scaleY: .97 }, { y: 5, rotation: 3, scaleY: .99 }, { y: 2, rotation: 1 }, {}
      ],
      pivotY: .72
    }
  };

  const emotionMotion = {
    laugh: "jump",
    angry: "shake",
    cry: "sad",
    surprise: "jump",
    shy: "sway",
    bow: "bow"
  };

  Object.entries(emotionMotion).forEach(([emotion, motionPreset]) => {
    if (EMOTIONS[emotion]) EMOTIONS[emotion].motionPreset = motionPreset;
  });

  Object.assign(state, {
    motionPreset: emotionMotion[state.emotion] || "jump",
    motionStrength: 1,
    motionSpeed: 1,
    motionFlip: false
  });

  const control = document.createElement("div");
  control.className = "control-card";
  control.innerHTML = `
    <div class="control-title"><strong>ボーン動作プリセット（基盤）</strong><span id="motionPresetLabel">ジャンプ</span></div>
    <select id="motionPresetSelect" aria-label="動きプリセット">
      ${Object.entries(MOTION_PRESETS).map(([id, preset]) => `<option value="${id}">${preset.label}</option>`).join("")}
    </select>
    <p id="motionPresetDescription" style="margin:8px 0 0;color:var(--muted);font-size:.7rem"></p>
    <div class="split-controls" style="margin-top:10px">
      <label><span>強さ <b id="motionStrengthValue">100%</b></span><input id="motionStrengthRange" type="range" min="20" max="200" step="5" value="100"></label>
      <label><span>速さ <b id="motionSpeedValue">100%</b></span><input id="motionSpeedRange" type="range" min="50" max="200" step="5" value="100"></label>
    </div>
    <div class="toggle-row single" style="margin-top:10px">
      <label><input id="motionFlipToggle" type="checkbox"><span>動きの向きを左右反転</span></label>
    </div>`;

  const intensityCard = elements.intensityRange.closest(".control-card");
  intensityCard.insertAdjacentElement("afterend", control);
  intensityCard.classList.add("hidden");

  const motionElements = {
    preset: control.querySelector("#motionPresetSelect"),
    label: control.querySelector("#motionPresetLabel"),
    description: control.querySelector("#motionPresetDescription"),
    strength: control.querySelector("#motionStrengthRange"),
    strengthValue: control.querySelector("#motionStrengthValue"),
    speed: control.querySelector("#motionSpeedRange"),
    speedValue: control.querySelector("#motionSpeedValue"),
    flip: control.querySelector("#motionFlipToggle")
  };

  interactive.push(motionElements.preset, motionElements.strength, motionElements.speed, motionElements.flip);

  const originalGetMotion = getMotion;
  const originalSelectEmotion = selectEmotion;
  const originalMakeApng = makeApng;
  const originalResetApp = resetApp;

  function effectiveDurationMs() {
    return Math.max(250, Math.round(state.durationMs / state.motionSpeed));
  }

  function updateMotionUi() {
    const preset = MOTION_PRESETS[state.motionPreset] || MOTION_PRESETS.jump;
    motionElements.preset.value = state.motionPreset;
    motionElements.label.textContent = preset.label;
    motionElements.description.textContent = preset.description;
    motionElements.strength.value = String(Math.round(state.motionStrength * 100));
    motionElements.strengthValue.textContent = `${Math.round(state.motionStrength * 100)}%`;
    motionElements.speed.value = String(Math.round(state.motionSpeed * 100));
    motionElements.speedValue.textContent = `${Math.round(state.motionSpeed * 100)}%`;
    motionElements.flip.checked = state.motionFlip;
  }

  function applyMotionPreset(id, { render = true } = {}) {
    if (!MOTION_PRESETS[id]) return;
    stopPlayback({ resetFrame: true });
    state.motionPreset = id;
    state.lastExportBytes = null;
    updateMotionUi();
    if (render && state.bitmap) renderAll();
  }

  getMotion = function motionPresetFrame(frameIndex) {
    const preset = MOTION_PRESETS[state.motionPreset];
    if (!preset) return originalGetMotion(frameIndex);
    const base = preset.frames[frameIndex % FRAME_COUNT] || {};
    const strength = state.motionStrength;
    const direction = state.motionFlip ? -1 : 1;
    return {
      x: (base.x || 0) * strength * direction,
      y: (base.y || 0) * strength,
      rotation: (base.rotation || 0) * strength * direction,
      scaleX: 1 + ((base.scaleX ?? 1) - 1) * strength,
      scaleY: 1 + ((base.scaleY ?? 1) - 1) * strength,
      pivotY: base.pivotY ?? preset.pivotY ?? .68
    };
  };

  selectEmotion = function selectEmotionWithMotion(emotion) {
    const suggested = EMOTIONS[emotion]?.motionPreset || emotionMotion[emotion];
    if (suggested) state.motionPreset = suggested;
    originalSelectEmotion(emotion);
    updateMotionUi();
  };

  makeApng = async function makeApngWithMotionSpeed(width, height) {
    const baseDuration = state.durationMs;
    state.durationMs = effectiveDurationMs();
    try {
      return await originalMakeApng(width, height);
    } finally {
      state.durationMs = baseDuration;
    }
  };

  updateMetrics = function updateMetricsWithMotion() {
    const emotionLabel = EMOTIONS[state.emotion].label;
    const motionLabel = MOTION_PRESETS[state.motionPreset]?.label || "-";
    elements.metricEmotion.textContent = `${emotionLabel}・${motionLabel}`;
    const total = effectiveDurationMs() * state.loopCount / 1000;
    elements.metricTotal.textContent = `${total.toFixed(1)}秒`;
    elements.metricOutput.textContent = `${state.lastExportSize.width}×${state.lastExportSize.height}`;
  };

  updateValidation = function updateValidationWithMotionSpeed() {
    const rules = {
      image: Boolean(state.bitmap),
      frames: true,
      duration: effectiveDurationMs() * state.loopCount <= 4000,
      size: state.lastExportSize.width <= OUTPUT_WIDTH && state.lastExportSize.height <= OUTPUT_HEIGHT,
      alpha: true,
      bytes: state.lastExportBytes == null ? null : state.lastExportBytes <= MAX_OUTPUT_BYTES
    };
    Object.entries(rules).forEach(([name, value]) => {
      const item = elements.validationList.querySelector(`[data-rule="${name}"]`);
      item.className = value == null ? "pending" : value ? "ok" : "error";
      if (name === "duration") item.textContent = `総再生時間 ${(effectiveDurationMs() * state.loopCount / 1000).toFixed(1)}秒 / 4秒以内`;
      if (name === "bytes" && state.lastExportBytes != null) item.textContent = `APNG ${(state.lastExportBytes / 1024).toFixed(0)}KB / 1MB以下`;
    });
    const values = Object.values(rules);
    const invalid = values.includes(false);
    const pending = values.includes(null);
    elements.validationBadge.textContent = invalid ? "要修正" : pending ? "出力待ち" : "合格";
    elements.validationBadge.className = `validation-badge ${invalid ? "error" : pending ? "warn" : "ok"}`;
    elements.exportButton.disabled = !state.bitmap || invalid;
  };

  function playWithMotionSpeed() {
    if (!state.bitmap) return;
    if (state.playing) return stopPlayback();
    state.playing = true;
    state.playedLoops = 0;
    state.previewIndex = 0;
    elements.playButton.textContent = "■ 停止";
    const delay = Math.max(20, Math.round(effectiveDurationMs() / FRAME_COUNT));
    const tick = () => {
      if (!state.playing) return;
      renderPreview();
      state.previewIndex += 1;
      if (state.previewIndex >= FRAME_COUNT) {
        state.previewIndex = 0;
        state.playedLoops += 1;
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

  function replaceButton(oldButton, listener) {
    const replacement = oldButton.cloneNode(true);
    oldButton.replaceWith(replacement);
    const index = interactive.indexOf(oldButton);
    if (index >= 0) interactive[index] = replacement;
    replacement.addEventListener("click", listener);
    return replacement;
  }

  elements.playButton = replaceButton(elements.playButton, playWithMotionSpeed);
  elements.resetButton = replaceButton(elements.resetButton, () => {
    originalResetApp();
    Object.assign(state, { motionPreset: "jump", motionStrength: 1, motionSpeed: 1, motionFlip: false });
    state.expression = false;
    elements.expressionToggle.checked = false;
    updateMotionUi();
    updateMetrics();
    updateValidation();
  });

  motionElements.preset.addEventListener("change", () => applyMotionPreset(motionElements.preset.value));
  motionElements.strength.addEventListener("input", () => {
    state.motionStrength = Number(motionElements.strength.value) / 100;
    motionElements.strengthValue.textContent = `${motionElements.strength.value}%`;
    state.lastExportBytes = null;
    if (state.bitmap) renderAll();
  });
  motionElements.speed.addEventListener("input", () => {
    stopPlayback({ resetFrame: true });
    state.motionSpeed = Number(motionElements.speed.value) / 100;
    motionElements.speedValue.textContent = `${motionElements.speed.value}%`;
    state.lastExportBytes = null;
    updateMetrics();
    updateValidation();
  });
  motionElements.flip.addEventListener("change", () => {
    state.motionFlip = motionElements.flip.checked;
    state.lastExportBytes = null;
    if (state.bitmap) renderAll();
  });

  state.expression = false;
  elements.expressionToggle.checked = false;
  updateMotionUi();
  updateMetrics();
  updateValidation();
  motionElements.preset.disabled = !state.bitmap;
  motionElements.strength.disabled = !state.bitmap;
  motionElements.speed.disabled = !state.bitmap;
  motionElements.flip.disabled = !state.bitmap;
})();