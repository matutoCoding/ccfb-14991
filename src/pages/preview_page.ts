// 视角预览页: WebGL2 光线追迹 + 串扰曲线

import { h, emptyState, blobToImageData } from "../ui.ts";
import { lensGeomFromSpec, frameAtView } from "../core/lens.ts";
import { interlace, interlaceSize } from "../core/interlace.ts";
import { crosstalkCurve, crosstalkAtAngle } from "../core/crosstalk.ts";
import type { CrosstalkPoint } from "../core/crosstalk.ts";
import { PreviewRenderer } from "../gl/preview_renderer.ts";
import { loadContext, pageHeader } from "./shared.ts";

const PREVIEW_MAX_WIDTH = 1600;

export const renderPreview = async (root: HTMLElement, projectId: string): Promise<void> => {
  const ctx = await loadContext(projectId);
  if (!ctx) {
    root.append(pageHeader("项目不存在", ""));
    return;
  }
  const { project, lens, frames } = ctx;
  root.append(
    pageHeader(`视角预览 - ${project.name}`, "拖动画面或滑块改变观察角, 鬼影与摩尔纹与实贴一致"),
  );
  if (frames.length < 2 || !lens) {
    root.append(h("div", { className: "card" }, emptyState("需要至少 2 帧素材和一片光栅片")));
    return;
  }

  const geom = lensGeomFromSpec(lens);
  const viewCount = frames.length;

  // 预览用交错图: 限制纹理宽度, 保持实际节距比例
  const widthInch = project.widthMm / 25.4;
  const previewDpi = Math.min(project.dpi, PREVIEW_MAX_WIDTH / widthInch);
  const size = interlaceSize({
    dpi: previewDpi,
    lpi: lens.lpi,
    widthMm: project.widthMm,
    heightMm: project.heightMm,
    viewCount,
  });
  const images: ImageData[] = [];
  for (const f of frames) images.push(await blobToImageData(f.blob));
  const t0 = performance.now();
  const print = interlace(images, size);
  const genMs = performance.now() - t0;

  // 状态
  const state = {
    thetaDeg: 0,
    apertureDeg: 1,
    tiltDeg: 0,
    samples: 8,
  };

  const stage = h("div", { className: "preview-stage" });
  const canvasWrap = h("div", { className: "preview-canvas-wrap", style: "flex:1;min-width:320px" });
  const canvas = h("canvas", {}) as HTMLCanvasElement;
  canvasWrap.append(canvas);
  const controls = h("div", { className: "preview-controls" });
  stage.append(canvasWrap, controls);
  const card = h("div", { className: "card" }, stage);
  root.append(card);

  const curveCanvas = h("canvas", { style: "width:100%;height:220px;display:block" }) as HTMLCanvasElement;
  const curveCard = h(
    "div",
    { className: "card" },
    h("div", { className: "card-title" }, "串扰曲线(红色区间为鬼影严重视角)"),
    curveCanvas,
  );
  root.append(curveCard);

  // 渲染器
  let renderer: PreviewRenderer;
  try {
    renderer = new PreviewRenderer(canvas);
  } catch (e) {
    card.append(h("div", { className: "notice notice-warn" }, String(e)));
    return;
  }
  renderer.setPrint(print);

  const readout = h("div", { className: "text-sub mono" });

  const renderView = () => {
    renderer.render({
      geom,
      widthMm: project.widthMm,
      heightMm: project.heightMm,
      thetaDeg: state.thetaDeg,
      apertureDeg: state.apertureDeg,
      tiltDeg: state.tiltDeg,
      samples: state.samples,
    });
    const theta = (state.thetaDeg * Math.PI) / 180;
    const frame = frameAtView(theta, geom, viewCount);
    const ct = crosstalkAtAngle(theta, (state.apertureDeg * Math.PI) / 180, geom, viewCount);
    readout.textContent = `视角 ${state.thetaDeg.toFixed(1)}° | 主看帧 ${frame + 1}/${viewCount} | 串扰 ${(ct * 100).toFixed(1)}%`;
    drawCurve();
  };

  // 串扰曲线
  let curve: CrosstalkPoint[] = [];
  let curveKey = "";
  const drawCurve = () => {
    const key = `${state.apertureDeg}`;
    if (key !== curveKey) {
      curveKey = key;
      curve = crosstalkCurve(-40, 40, 161, (state.apertureDeg * Math.PI) / 180, geom, viewCount);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = curveCanvas.clientWidth * dpr;
    const H = 220 * dpr;
    if (curveCanvas.width !== W) {
      curveCanvas.width = W;
      curveCanvas.height = H;
    }
    const g = curveCanvas.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    const padL = 44 * dpr;
    const padR = 16 * dpr;
    const padT = 12 * dpr;
    const padB = 28 * dpr;
    const xOf = (deg: number) => padL + ((deg + 40) / 80) * (W - padL - padR);
    const yOf = (ct: number) => padT + (1 - ct) * (H - padT - padB);
    // 鬼影严重区间(串扰>20%)涂红
    g.fillStyle = "rgba(220,38,38,0.08)";
    let segStart: number | null = null;
    for (const p of curve) {
      if (p.crosstalk > 0.2 && segStart === null) segStart = p.angleDeg;
      if (p.crosstalk <= 0.2 && segStart !== null) {
        g.fillRect(xOf(segStart), padT, xOf(p.angleDeg) - xOf(segStart), H - padT - padB);
        segStart = null;
      }
    }
    if (segStart !== null) g.fillRect(xOf(segStart), padT, xOf(40) - xOf(segStart), H - padT - padB);
    // 坐标轴
    g.strokeStyle = "#cbd5e1";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(padL, padT);
    g.lineTo(padL, H - padB);
    g.lineTo(W - padR, H - padB);
    g.stroke();
    g.fillStyle = "#64748b";
    g.font = `${11 * dpr}px sans-serif`;
    g.textAlign = "center";
    for (const deg of [-40, -20, 0, 20, 40]) {
      g.fillText(`${deg}°`, xOf(deg), H - padB + 16 * dpr);
      g.strokeStyle = "#e2e8f0";
      g.beginPath();
      g.moveTo(xOf(deg), padT);
      g.lineTo(xOf(deg), H - padB);
      g.stroke();
    }
    g.textAlign = "right";
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      g.fillText(`${Math.round(v * 100)}%`, padL - 6 * dpr, yOf(v) + 4 * dpr);
    }
    // 曲线
    g.strokeStyle = "#2563eb";
    g.lineWidth = 2 * dpr;
    g.beginPath();
    curve.forEach((p, i) => {
      if (i === 0) g.moveTo(xOf(p.angleDeg), yOf(p.crosstalk));
      else g.lineTo(xOf(p.angleDeg), yOf(p.crosstalk));
    });
    g.stroke();
    // 当前视角标记
    g.strokeStyle = "#dc2626";
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.moveTo(xOf(state.thetaDeg), padT);
    g.lineTo(xOf(state.thetaDeg), H - padB);
    g.stroke();
  };

  // 控件
  const sliderRefs: { sync: () => void }[] = [];
  const slider = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    fmt: (v: number) => string,
  ): HTMLElement => {
    const value = h("span", { className: "control-value" }, fmt(get()));
    const input = h("input", {
      className: "slider",
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(get()),
      oninput: () => {
        set(Number(input.value));
        value.textContent = fmt(get());
        renderView();
      },
    }) as HTMLInputElement;
    sliderRefs.push({
      sync: () => {
        input.value = String(get());
        value.textContent = fmt(get());
      },
    });
    return h(
      "div",
      { className: "control-item" },
      h("div", { className: "control-label" }, h("span", {}, label), value),
      input,
    );
  };

  controls.append(
    slider("观察角", -40, 40, 0.1, () => state.thetaDeg, (v) => (state.thetaDeg = v), (v) => `${v.toFixed(1)}°`),
    slider("贴歪角度", -5, 5, 0.05, () => state.tiltDeg, (v) => (state.tiltDeg = v), (v) => `${v.toFixed(2)}°`),
    slider("有效角孔径", 0, 5, 0.1, () => state.apertureDeg, (v) => (state.apertureDeg = v), (v) => `${v.toFixed(1)}°`),
    slider("光线采样数", 1, 16, 1, () => state.samples, (v) => (state.samples = v), (v) => `${v}`),
    readout,
    h("div", { className: "text-sub" }, `交错纹理 ${print.width}×${print.height}, 生成 ${genMs.toFixed(0)}ms`),
  );

  // 拖动改视角
  let dragging = false;
  let startX = 0;
  let startTheta = 0;
  canvasWrap.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startTheta = state.thetaDeg;
    canvasWrap.setPointerCapture(e.pointerId);
  });
  canvasWrap.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const range = 80;
    state.thetaDeg = Math.max(-40, Math.min(40, startTheta + ((e.clientX - startX) / canvasWrap.clientWidth) * range));
    for (const s of sliderRefs) s.sync();
    renderView();
  });
  canvasWrap.addEventListener("pointerup", () => {
    dragging = false;
  });

  // 画布尺寸跟随
  const fitCanvas = () => {
    const w = canvasWrap.clientWidth;
    canvas.style.height = `${(w * project.heightMm) / project.widthMm}px`;
    renderView();
  };
  new ResizeObserver(fitCanvas).observe(canvasWrap);
  fitCanvas();
};
