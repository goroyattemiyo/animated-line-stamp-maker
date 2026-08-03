"use strict";

(() => {
  const PART_TYPES = [
    ["head", "頭"], ["body", "胴体"],
    ["leftUpperArm", "左上腕"], ["leftLowerArm", "左前腕"], ["leftHand", "左手"],
    ["rightUpperArm", "右上腕"], ["rightLowerArm", "右前腕"], ["rightHand", "右手"],
    ["leftLeg", "左脚"], ["rightLeg", "右脚"], ["hairBack", "後ろ髪"], ["hairFront", "前髪"],
    ["eyeNormal", "通常目"], ["eyeClosed", "閉じ目"], ["mouthNormal", "通常口"], ["mouthSmile", "笑い口"],
    ["custom", "その他"]
  ];
  const BONE_OPTIONS = [
    ["root", "基準"], ["hips", "腰"], ["chest", "胸"], ["neck", "首"], ["head", "頭"],
    ["leftShoulder", "左肩"], ["leftElbow", "左ひじ"], ["leftWrist", "左手"],
    ["rightShoulder", "右肩"], ["rightElbow", "右ひじ"], ["rightWrist", "右手"],
    ["leftHip", "左股"], ["leftKnee", "左ひざ"], ["leftAnkle", "左足"],
    ["rightHip", "右股"], ["rightKnee", "右ひざ"], ["rightAnkle", "右足"]
  ];
  const DEFAULT_BONE = {
    head: "head", body: "chest", leftUpperArm: "leftShoulder", leftLowerArm: "leftElbow", leftHand: "leftWrist",
    rightUpperArm: "rightShoulder", rightLowerArm: "rightElbow", rightHand: "rightWrist",
    leftLeg: "leftHip", rightLeg: "rightHip", hairBack: "head", hairFront: "head",
    eyeNormal: "head", eyeClosed: "head", mouthNormal: "head", mouthSmile: "head", custom: "root"
  };

  Object.assign(state, {
    parts: [], partDraft: [], partEditMode: "idle", selectedPartId: null, partsEnabled: true
  });

  const sourcePreview = elements.sourceCanvas.closest(".source-preview");
  const partCanvas = document.createElement("canvas");
  partCanvas.id = "partCanvas";
  partCanvas.width = OUTPUT_WIDTH;
  partCanvas.height = OUTPUT_HEIGHT;
  partCanvas.setAttribute("aria-label", "手動パーツ分け編集レイヤー");
  sourcePreview.append(partCanvas);

  const style = document.createElement("style");
  style.textContent = `
    #partCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none;touch-action:none}
    #partCanvas.editing{pointer-events:auto;cursor:crosshair} #rigCanvas{z-index:4}
    .part-card{display:grid;gap:10px}.part-toolbar,.part-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    .part-toolbar button,.part-actions button,.part-row button{min-height:36px;border:1px solid var(--line);border-radius:9px;background:var(--panel-soft);color:var(--text);cursor:pointer}
    .part-name-row{display:grid;grid-template-columns:1fr 1.25fr;gap:7px}.part-list{display:grid;gap:7px;max-height:290px;overflow:auto}
    .part-row{display:grid;grid-template-columns:34px minmax(0,1fr) 42px;gap:7px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:10px;background:var(--panel-deep)}
    .part-row.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px rgba(74,221,170,.2)}
    .part-swatch{width:34px;height:34px;border-radius:8px;background:repeating-conic-gradient(#26354b 0 25%,#162238 0 50%) 50%/10px 10px;overflow:hidden}.part-swatch canvas{width:100%;height:100%}
    .part-info{min-width:0;display:grid;gap:2px;cursor:pointer}.part-info strong{font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.part-info small{color:var(--muted);font-size:.63rem}
    .part-eye{padding:0;font-size:.85rem}.part-detail{display:grid;gap:8px;padding-top:8px;border-top:1px solid var(--line)}.part-help{margin:0;color:var(--muted);font-size:.69rem}.part-status{color:var(--accent);font-size:.7rem;font-weight:800}
    .part-empty{padding:12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);text-align:center;font-size:.7rem}`;
  document.head.append(style);

  const card = document.createElement("div");
  card.className = "control-card part-card";
  card.innerHTML = `
    <div class="control-title"><strong>手動パーツ分け</strong><span id="partStatus" class="part-status">未作成</span></div>
    <p class="part-help">画像上をクリックして輪郭を囲み、最後に「パーツ確定」を押します。</p>
    <div class="part-name-row"><select id="partTypeSelect">${PART_TYPES.map(([id,label])=>`<option value="${id}">${label}</option>`).join("")}</select><input id="partNameInput" type="text" maxlength="30" value="頭"></div>
    <div class="part-toolbar"><button id="partStartButton" type="button" disabled>＋ 囲み始める</button><button id="partFinishButton" type="button" disabled>✓ パーツ確定</button><button id="partUndoButton" type="button" disabled>↶ 1点戻す</button><button id="partCancelButton" type="button" disabled>× キャンセル</button></div>
    <div id="partList" class="part-list"><div class="part-empty">まだパーツがありません</div></div>
    <div id="partDetail" class="part-detail hidden">
      <div class="split-controls"><label><span>接続ボーン</span><select id="partBoneSelect">${BONE_OPTIONS.map(([id,label])=>`<option value="${id}">${label}</option>`).join("")}</select></label><label><span>親パーツ</span><select id="partParentSelect"><option value="">なし</option></select></label></div>
      <div class="split-controls"><label><span>回転軸 X <b id="partPivotXValue">50%</b></span><input id="partPivotXRange" type="range" min="0" max="100" value="50"></label><label><span>回転軸 Y <b id="partPivotYValue">50%</b></span><input id="partPivotYRange" type="range" min="0" max="100" value="50"></label></div>
      <div class="part-actions"><button id="partUpButton" type="button">前へ</button><button id="partDownButton" type="button">後ろへ</button><button id="partDuplicateButton" type="button">複製</button><button id="partDeleteButton" type="button">削除</button></div>
    </div>
    <div class="toggle-row single"><label><input id="partsEnabledToggle" type="checkbox" checked disabled><span>パーツ描画を使う</span></label></div>
    <div class="part-actions"><button id="partProjectSaveButton" type="button" disabled>プロジェクト保存</button><button id="partProjectLoadButton" type="button" disabled>プロジェクト読込</button></div>
    <input id="partProjectLoadInput" type="file" accept="application/json,.json" hidden>`;
  const rigCard = document.querySelector(".rig-card");
  (rigCard || elements.scaleRange.closest(".control-card")).insertAdjacentElement("afterend", card);

  const ui = {
    status:card.querySelector("#partStatus"),type:card.querySelector("#partTypeSelect"),name:card.querySelector("#partNameInput"),start:card.querySelector("#partStartButton"),finish:card.querySelector("#partFinishButton"),undo:card.querySelector("#partUndoButton"),cancel:card.querySelector("#partCancelButton"),list:card.querySelector("#partList"),detail:card.querySelector("#partDetail"),bone:card.querySelector("#partBoneSelect"),parent:card.querySelector("#partParentSelect"),pivotX:card.querySelector("#partPivotXRange"),pivotY:card.querySelector("#partPivotYRange"),pivotXValue:card.querySelector("#partPivotXValue"),pivotYValue:card.querySelector("#partPivotYValue"),up:card.querySelector("#partUpButton"),down:card.querySelector("#partDownButton"),duplicate:card.querySelector("#partDuplicateButton"),delete:card.querySelector("#partDeleteButton"),enabled:card.querySelector("#partsEnabledToggle"),save:card.querySelector("#partProjectSaveButton"),load:card.querySelector("#partProjectLoadButton"),loadInput:card.querySelector("#partProjectLoadInput")
  };
  interactive.push(...Object.values(ui).filter((value)=>value instanceof HTMLElement && "disabled" in value));
  const originalLoadFile=loadFile, originalResetApp=resetApp, originalDrawFrame=drawFrame;
  const rasterCache=new Map();
  const currentPart=()=>state.parts.find((part)=>part.id===state.selectedPartId)||null;
  const uid=()=>`part-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const invalidate=()=>{rasterCache.clear();state.lastExportBytes=null;};
  const escapeHtml=(text)=>String(text).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

  function pointFromEvent(event){const rect=partCanvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*OUTPUT_WIDTH/rect.width,y:(event.clientY-rect.top)*OUTPUT_HEIGHT/rect.height};}
  function canvasToNormalized(point){const fit=fitImage(state.bounds.width,state.bounds.height);const w=fit.width*state.imageScale,h=fit.height*state.imageScale,left=(OUTPUT_WIDTH-w)/2+state.positionX,top=(OUTPUT_HEIGHT-h)/2+state.positionY;return{x:(point.x-left)/w,y:(point.y-top)/h};}
  function normalizedToCanvas(point,width=OUTPUT_WIDTH,height=OUTPUT_HEIGHT){const fit=fitImage(state.bounds.width,state.bounds.height,width,height);const w=fit.width*state.imageScale,h=fit.height*state.imageScale,left=(width-w)/2+state.positionX*width/OUTPUT_WIDTH,top=(height-h)/2+state.positionY*height/OUTPUT_HEIGHT;return{x:left+point.x*w,y:top+point.y*h};}
  function polygonBounds(points){const xs=points.map((p)=>p.x),ys=points.map((p)=>p.y);return{minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};}

  function buildRaster(part){if(rasterCache.has(part.id))return rasterCache.get(part.id);const canvas=document.createElement("canvas");canvas.width=state.sourceCanvas.width;canvas.height=state.sourceCanvas.height;const context=canvas.getContext("2d");context.save();context.beginPath();part.points.forEach((p,index)=>{const x=state.bounds.x+p.x*state.bounds.width,y=state.bounds.y+p.y*state.bounds.height;if(!index)context.moveTo(x,y);else context.lineTo(x,y);});context.closePath();context.clip();context.drawImage(state.sourceCanvas,0,0);context.restore();rasterCache.set(part.id,canvas);return canvas;}

  function partTransform(part,frameIndex){const phase=frameIndex/FRAME_COUNT*Math.PI*2,strength=state.motionStrength||1,flip=state.motionFlip?-1:1,id=part.type,bone=part.bone,preset=state.motionPreset;let rotation=0,x=0,y=0,scaleX=1,scaleY=1;
    if(preset==="wave"){const wave=Math.sin(phase*2)*18*strength*flip;if(/right(UpperArm|LowerArm|Hand)/.test(id)||/right(Shoulder|Elbow|Wrist)/.test(bone))rotation=wave;if(/left(UpperArm|LowerArm|Hand)/.test(id)||/left(Shoulder|Elbow|Wrist)/.test(bone))rotation=-wave*.45;if(id==="head")rotation+=Math.sin(phase)*2;}
    else if(preset==="nod"&&(id==="head"||bone==="head"))rotation=Math.sin(phase*2)*7*strength;
    else if(preset==="tilt"){if(id==="head"||bone==="head")rotation=Math.sin(phase)*11*strength*flip;if(id==="body"||bone==="chest")rotation=-Math.sin(phase)*2.5*strength*flip;}
    else if(preset==="bow"){const bow=Math.pow(Math.sin(frameIndex/(FRAME_COUNT-1)*Math.PI),1.35);if(id==="body"||bone==="chest"||bone==="hips")rotation=bow*13*strength*flip;if(id==="head"||bone==="head")rotation=bow*9*strength*flip;y=bow*5*strength;}
    else if(preset==="jump"){const jump=Math.sin(frameIndex/(FRAME_COUNT-1)*Math.PI);y=-jump*16*strength;if(id==="body"){scaleX=1-jump*.025;scaleY=1+jump*.04;}if(/Leg/.test(id))rotation=(id.startsWith("left")?1:-1)*jump*5*strength;}
    else if(preset==="shake"){x=(frameIndex%2?1:-1)*4*strength;rotation=(frameIndex%2?1:-1)*1.8*strength;}
    else if(preset==="sway"){rotation=Math.sin(phase)*(id==="head"?5:3)*strength*flip;x=Math.sin(phase)*4*strength*flip;}
    else if(preset==="sad"){const sad=Math.sin(frameIndex/(FRAME_COUNT-1)*Math.PI);y=sad*6*strength;if(id==="head"||bone==="head")rotation=sad*7*strength*flip;if(id==="body"||bone==="chest")rotation=sad*4*strength*flip;}
    return{x,y,rotation,scaleX,scaleY};}

  function drawParts(canvas,frameIndex,{width=OUTPUT_WIDTH,height=OUTPUT_HEIGHT,includeBackground=false}={}){canvas.width=width;canvas.height=height;const context=canvas.getContext("2d");context.clearRect(0,0,width,height);if(includeBackground)drawChosenBackground(context,width,height);const fit=fitImage(state.bounds.width,state.bounds.height,width,height),imageWidth=fit.width*state.imageScale,imageHeight=fit.height*state.imageScale,left=(width-imageWidth)/2+state.positionX*width/OUTPUT_WIDTH,top=(height-imageHeight)/2+state.positionY*height/OUTPUT_HEIGHT;
    for(const part of state.parts.filter((p)=>p.visible!==false)){const raster=buildRaster(part),b=polygonBounds(part.points),sx=state.bounds.x+b.minX*state.bounds.width,sy=state.bounds.y+b.minY*state.bounds.height,sw=Math.max(1,(b.maxX-b.minX)*state.bounds.width),sh=Math.max(1,(b.maxY-b.minY)*state.bounds.height),dx=left+b.minX*imageWidth,dy=top+b.minY*imageHeight,dw=(b.maxX-b.minX)*imageWidth,dh=(b.maxY-b.minY)*imageHeight,pivotX=dx+part.pivot.x*dw,pivotY=dy+part.pivot.y*dh,t=partTransform(part,frameIndex);context.save();context.translate(pivotX+t.x*width/OUTPUT_WIDTH,pivotY+t.y*height/OUTPUT_HEIGHT);context.rotate(t.rotation*Math.PI/180);context.scale(t.scaleX,t.scaleY);context.drawImage(raster,sx,sy,sw,sh,dx-pivotX,dy-pivotY,dw,dh);context.restore();}
    if(state.textEnabled&&state.text.trim())drawText(context,frameIndex,width,height);}
  drawFrame=function(canvas,frameIndex,options={}){if(state.partsEnabled&&state.parts.length&&state.bitmap)return drawParts(canvas,frameIndex,options);return originalDrawFrame(canvas,frameIndex,options);};

  function renderOverlay(){const ctx=partCanvas.getContext("2d");ctx.clearRect(0,0,OUTPUT_WIDTH,OUTPUT_HEIGHT);if(!state.bitmap)return;if(state.partDraft.length){ctx.save();ctx.strokeStyle="#ffd45f";ctx.fillStyle="rgba(255,212,95,.12)";ctx.lineWidth=2;ctx.beginPath();state.partDraft.forEach((p,i)=>{const c=normalizedToCanvas(p);if(!i)ctx.moveTo(c.x,c.y);else ctx.lineTo(c.x,c.y);});if(state.partDraft.length>=3)ctx.closePath();ctx.fill();ctx.stroke();state.partDraft.forEach((p,i)=>{const c=normalizedToCanvas(p);ctx.beginPath();ctx.fillStyle=i===0?"#ff8d77":"#ffd45f";ctx.arc(c.x,c.y,5,0,Math.PI*2);ctx.fill();});ctx.restore();}
    const selected=currentPart();if(selected&&state.partEditMode==="idle"){ctx.save();ctx.strokeStyle="#4addaa";ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();selected.points.forEach((p,i)=>{const c=normalizedToCanvas(p);if(!i)ctx.moveTo(c.x,c.y);else ctx.lineTo(c.x,c.y);});ctx.closePath();ctx.stroke();const b=polygonBounds(selected.points),pivot=normalizedToCanvas({x:b.minX+(b.maxX-b.minX)*selected.pivot.x,y:b.minY+(b.maxY-b.minY)*selected.pivot.y});ctx.setLineDash([]);ctx.strokeStyle="#ff6fa6";ctx.beginPath();ctx.moveTo(pivot.x-9,pivot.y);ctx.lineTo(pivot.x+9,pivot.y);ctx.moveTo(pivot.x,pivot.y-9);ctx.lineTo(pivot.x,pivot.y+9);ctx.stroke();ctx.restore();}}
  function setMode(mode){state.partEditMode=mode;partCanvas.classList.toggle("editing",mode==="draw");ui.finish.disabled=mode!=="draw"||state.partDraft.length<3;ui.undo.disabled=mode!=="draw"||!state.partDraft.length;ui.cancel.disabled=mode!=="draw";ui.start.disabled=!state.bitmap||mode==="draw";const rig=document.querySelector("#rigCanvas");if(rig)rig.style.pointerEvents=mode==="draw"?"none":"";renderOverlay();}
  function addPart(){if(state.partDraft.length<3)return;const type=ui.type.value,part={id:uid(),type,name:ui.name.value.trim()||"パーツ",points:state.partDraft.map((p)=>({x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))})),pivot:{x:.5,y:.5},bone:DEFAULT_BONE[type]||"root",parentId:"",visible:true};state.parts.push(part);state.selectedPartId=part.id;state.partDraft=[];invalidate();setMode("idle");renderPartList();renderAll();}
  function renderThumbnail(part,canvas){canvas.width=60;canvas.height=60;const ctx=canvas.getContext("2d"),b=polygonBounds(part.points),raster=buildRaster(part),sx=state.bounds.x+b.minX*state.bounds.width,sy=state.bounds.y+b.minY*state.bounds.height,sw=Math.max(1,(b.maxX-b.minX)*state.bounds.width),sh=Math.max(1,(b.maxY-b.minY)*state.bounds.height),scale=Math.min(52/sw,52/sh),dw=sw*scale,dh=sh*scale;ctx.clearRect(0,0,60,60);ctx.drawImage(raster,sx,sy,sw,sh,(60-dw)/2,(60-dh)/2,dw,dh);}
  function renderPartList(){ui.status.textContent=state.parts.length?`${state.parts.length}パーツ`:"未作成";ui.list.innerHTML="";if(!state.parts.length)ui.list.innerHTML='<div class="part-empty">まだパーツがありません</div>';state.parts.slice().reverse().forEach((part)=>{const row=document.createElement("div");row.className=`part-row${part.id===state.selectedPartId?" selected":""}`;const swatch=document.createElement("div");swatch.className="part-swatch";const thumb=document.createElement("canvas");swatch.append(thumb);renderThumbnail(part,thumb);const info=document.createElement("div");info.className="part-info";info.innerHTML=`<strong>${escapeHtml(part.name)}</strong><small>${part.type} → ${part.bone}</small>`;info.onclick=()=>{state.selectedPartId=part.id;renderPartList();renderOverlay();};const eye=document.createElement("button");eye.className="part-eye";eye.type="button";eye.textContent=part.visible===false?"○":"●";eye.onclick=()=>{part.visible=part.visible===false;invalidate();renderPartList();renderAll();};row.append(swatch,info,eye);ui.list.append(row);});const selected=currentPart();ui.detail.classList.toggle("hidden",!selected);if(selected){ui.bone.value=selected.bone||"root";ui.parent.innerHTML='<option value="">なし</option>'+state.parts.filter((p)=>p.id!==selected.id).map((p)=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");ui.parent.value=selected.parentId||"";ui.pivotX.value=String(Math.round(selected.pivot.x*100));ui.pivotY.value=String(Math.round(selected.pivot.y*100));ui.pivotXValue.textContent=`${ui.pivotX.value}%`;ui.pivotYValue.textContent=`${ui.pivotY.value}%`;}ui.enabled.disabled=!state.bitmap;ui.save.disabled=!state.parts.length;ui.load.disabled=!state.bitmap;}
  function saveProject(){const payload={version:1,app:"animated-line-stamp-maker",source:state.file?.name||null,parts:state.parts,rig:state.rig||null,settings:{emotion:state.emotion,motionPreset:state.motionPreset,motionStrength:state.motionStrength,motionSpeed:state.motionSpeed}};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),`${baseFileName()}-parts.json`);}
  async function loadProject(file){try{const payload=JSON.parse(await file.text());if(!Array.isArray(payload.parts))throw new Error("parts missing");state.parts=payload.parts.map((p)=>({...p,visible:p.visible!==false,pivot:p.pivot||{x:.5,y:.5},points:p.points||[]})).filter((p)=>p.points.length>=3);if(payload.rig)state.rig=payload.rig;if(payload.settings?.motionPreset)state.motionPreset=payload.settings.motionPreset;state.selectedPartId=state.parts[0]?.id||null;invalidate();renderPartList();renderOverlay();renderAll();setMessage("パーツプロジェクトを読み込みました。","success");}catch(error){console.error(error);setMessage("プロジェクトJSONを読み込めませんでした。","error");}}

  partCanvas.addEventListener("pointerdown",(event)=>{if(state.partEditMode!=="draw"||!state.bitmap)return;event.preventDefault();const p=canvasToNormalized(pointFromEvent(event));if(p.x<-.02||p.x>1.02||p.y<-.02||p.y>1.02)return;state.partDraft.push(p);ui.finish.disabled=state.partDraft.length<3;ui.undo.disabled=!state.partDraft.length;renderOverlay();});
  ui.type.addEventListener("change",()=>{ui.name.value=PART_TYPES.find(([id])=>id===ui.type.value)?.[1]||"パーツ";});ui.start.addEventListener("click",()=>{state.partDraft=[];setMode("draw");});ui.finish.addEventListener("click",addPart);ui.undo.addEventListener("click",()=>{state.partDraft.pop();setMode("draw");});ui.cancel.addEventListener("click",()=>{state.partDraft=[];setMode("idle");});
  ui.bone.addEventListener("change",()=>{const p=currentPart();if(p){p.bone=ui.bone.value;invalidate();renderPartList();renderAll();}});ui.parent.addEventListener("change",()=>{const p=currentPart();if(p)p.parentId=ui.parent.value;});[ui.pivotX,ui.pivotY].forEach((input)=>input.addEventListener("input",()=>{const p=currentPart();if(!p)return;p.pivot={x:Number(ui.pivotX.value)/100,y:Number(ui.pivotY.value)/100};ui.pivotXValue.textContent=`${ui.pivotX.value}%`;ui.pivotYValue.textContent=`${ui.pivotY.value}%`;invalidate();renderOverlay();renderAll();}));
  ui.up.addEventListener("click",()=>{const i=state.parts.findIndex((p)=>p.id===state.selectedPartId);if(i>=0&&i<state.parts.length-1){[state.parts[i],state.parts[i+1]]=[state.parts[i+1],state.parts[i]];invalidate();renderPartList();renderAll();}});ui.down.addEventListener("click",()=>{const i=state.parts.findIndex((p)=>p.id===state.selectedPartId);if(i>0){[state.parts[i],state.parts[i-1]]=[state.parts[i-1],state.parts[i]];invalidate();renderPartList();renderAll();}});ui.duplicate.addEventListener("click",()=>{const p=currentPart();if(!p)return;const copy=structuredClone(p);copy.id=uid();copy.name=`${p.name} コピー`;state.parts.push(copy);state.selectedPartId=copy.id;invalidate();renderPartList();renderAll();});ui.delete.addEventListener("click",()=>{const i=state.parts.findIndex((p)=>p.id===state.selectedPartId);if(i<0)return;state.parts.splice(i,1);state.selectedPartId=state.parts.at(-1)?.id||null;invalidate();renderPartList();renderOverlay();renderAll();});
  ui.enabled.addEventListener("change",()=>{state.partsEnabled=ui.enabled.checked;invalidate();renderAll();});ui.save.addEventListener("click",saveProject);ui.load.addEventListener("click",()=>ui.loadInput.click());ui.loadInput.addEventListener("change",()=>{const file=ui.loadInput.files?.[0];if(file)loadProject(file);ui.loadInput.value="";});
  loadFile=async function(file){await originalLoadFile(file);if(!state.bitmap)return;state.parts=[];state.selectedPartId=null;state.partDraft=[];invalidate();setMode("idle");renderPartList();ui.start.disabled=false;ui.enabled.disabled=false;ui.enabled.checked=true;ui.load.disabled=false;};
  elements.fileInput.onchange=(event)=>loadFile(event.target.files?.[0]);
  resetApp=function(){originalResetApp();state.parts=[];state.selectedPartId=null;state.partDraft=[];state.partsEnabled=true;invalidate();setMode("idle");renderPartList();};
  [elements.scaleRange,elements.positionXRange,elements.positionYRange].forEach((el)=>el.addEventListener("input",renderOverlay));
  setMode("idle");renderPartList();
})();