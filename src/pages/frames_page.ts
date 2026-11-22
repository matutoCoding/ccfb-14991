// 素材帧页: 排序 / 替换 / 视角范围 / 测试素材 / 立体深度生成多视点

import { h, icon, toast, pickFile, blobToImageData, imageDataToBlob, emptyState } from "../ui.ts";
import { deleteFrame, listFrames, putFrame, putProject, uid } from "../db.ts";
import { DEFAULT_DEPTH_CONFIG } from "../types.ts";
import type { DepthConfig, Frame } from "../types.ts";
import { generateViews } from "../core/depth_views.ts";
import { textFlipFrames, animationFrames, stereoScene } from "../core/test_assets.ts";
import { loadContext, frameThumbUrl, pageHeader } from "./shared.ts";

const saveFrames = async (projectId: string, images: ImageData[], startOrder: number): Promise<void> => {
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const frame: Frame = {
      id: uid(),
      projectId,
      order: startOrder + i,
      viewStart: 0,
      viewEnd: 0,
      width: img.width,
      height: img.height,
      blob: await imageDataToBlob(img),
    };
    await putFrame(frame);
  }
};

// 视角范围均分: 帧数变化后重排
const redistributeViewRange = async (projectId: string, total: number): Promise<void> => {
  const frames = await listFrames(projectId);
  const span = 60; // 默认总视角 -30..30
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    f.viewStart = -span / 2 + (i / frames.length) * span;
    f.viewEnd = -span / 2 + ((i + 1) / frames.length) * span;
    await putFrame(f);
  }
  void total;
};

const stereoDialog = (projectId: string, viewCount: number, onDone: () => void): void => {
  let colorImg: ImageData | null = null;
  let depthImg: ImageData | null = null;
  const cfg: DepthConfig = { ...DEFAULT_DEPTH_CONFIG };
  const colorLabel = h("span", { className: "text-sub" }, "未选择");
  const depthLabel = h("span", { className: "text-sub" }, "未选择");
  const progress = h("div", { className: "text-sub" }, "");

  const numInput = (label: string, key: keyof DepthConfig, step = 1): HTMLElement => {
    const input = h("input", {
      className: "input",
      type: "number",
      step: String(step),
      value: cfg[key],
      oninput: (e: Event) => {
        cfg[key] = Number((e.target as HTMLInputElement).value);
      },
    }) as HTMLInputElement;
    return h("div", { className: "form-item" }, h("label", {}, label), input);
  };

  const body = h(
    "div",
    {},
    h(
      "div",
      { className: "form-row" },
      h(
        "button",
        {
          className: "btn",
          onclick: async () => {
            const f = await pickFile("image/*");
            if (!f) return;
            colorImg = await blobToImageData(f);
            colorLabel.textContent = `${f.name} (${colorImg.width}×${colorImg.height})`;
          },
        },
        "选择彩图",
      ),
      colorLabel,
    ),
    h(
      "div",
      { className: "form-row" },
      h(
        "button",
        {
          className: "btn",
          onclick: async () => {
            const f = await pickFile("image/*");
            if (!f) return;
            depthImg = await blobToImageData(f);
            depthLabel.textContent = `${f.name} (${depthImg.width}×${depthImg.height})`;
          },
        },
        "选择深度图",
      ),
      depthLabel,
    ),
    h(
      "div",
      { className: "form-row" },
      numInput("分层数", "layers"),
      numInput("视差强度 px", "strength"),
      numInput("零视差深度 0-1", "refDepth", 0.05),
    ),
    h(
      "div",
      { className: "form-row" },
      numInput("深度 gamma", "gamma", 0.1),
      numInput("平滑半径", "smooth"),
    ),
    h(
      "div",
      { className: "form-row" },
      h(
        "button",
        {
          className: "btn",
          onclick: () => {
            const scene = stereoScene();
            colorImg = scene.color;
            depthImg = scene.depth;
            colorLabel.textContent = `内置场景 (${scene.color.width}×${scene.color.height})`;
            depthLabel.textContent = "内置深度图";
          },
        },
        "用内置立体场景",
      ),
    ),
    progress,
  );

  const mask = h("div", { className: "dialog-mask" });
  const close = () => mask.remove();
  mask.append(
    h(
      "div",
      { className: "dialog" },
      h("div", { className: "dialog-title" }, `深度生成 ${viewCount} 个视点`),
      body,
      h(
        "div",
        { className: "dialog-actions" },
        h("button", { className: "btn", onclick: close }, "取消"),
        h(
          "button",
          {
            className: "btn btn-primary",
            onclick: async () => {
              if (!colorImg || !depthImg) {
                toast("请先选择彩图和深度图");
                return;
              }
              progress.textContent = "正在生成视点...";
              await new Promise((r) => setTimeout(r, 30));
              const views = generateViews(colorImg, depthImg, viewCount, cfg);
              await saveFrames(projectId, views, 0);
              await redistributeViewRange(projectId, viewCount);
              close();
              toast(`已生成 ${views.length} 个视点帧`);
              onDone();
            },
          },
          "生成视点帧",
        ),
      ),
    ),
  );
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });
  document.body.append(mask);
};

export const renderFrames = async (root: HTMLElement, projectId: string): Promise<void> => {
  const ctx = await loadContext(projectId);
  if (!ctx) {
    root.append(pageHeader("项目不存在", ""));
    return;
  }
  const { project, frames } = ctx;
  root.append(
    pageHeader(
      `素材帧 - ${project.name}`,
      `共 ${frames.length} 帧, 项目视点目标 ${project.viewCount} 个`,
    ),
  );

  // 工具栏
  const toolbar = h(
    "div",
    { className: "card row" },
    h(
      "button",
      {
        className: "btn",
        onclick: async () => {
          const f = await pickFile("image/*");
          if (!f) return;
          const img = await blobToImageData(f);
          await saveFrames(projectId, [img], frames.length);
          await redistributeViewRange(projectId, frames.length + 1);
          location.reload();
        },
      },
      icon("plus"),
      "导入图片",
    ),
    h(
      "button",
      {
        className: "btn",
        onclick: async () => {
          await saveFrames(projectId, textFlipFrames(), 0);
          await redistributeViewRange(projectId, 3);
          toast("已生成文字变图 3 帧");
          location.reload();
        },
      },
      "测试: 文字变图",
    ),
    h(
      "button",
      {
        className: "btn",
        onclick: async () => {
          await saveFrames(projectId, animationFrames(), 0);
          await redistributeViewRange(projectId, 8);
          toast("已生成 8 帧动画");
          location.reload();
        },
      },
      "测试: 8帧动画",
    ),
    project.type === "stereo"
      ? h(
          "button",
          {
            className: "btn btn-primary",
            onclick: () => stereoDialog(projectId, project.viewCount, () => location.reload()),
          },
          "深度图生成视点",
        )
      : "",
    frames.length > 0
      ? h(
          "button",
          {
            className: "btn btn-danger",
            onclick: async () => {
              for (const f of frames) await deleteFrame(f.id);
              location.reload();
            },
          },
          icon("trash"),
          "清空",
        )
      : "",
  );
  root.append(toolbar);

  // 帧列表
  const listCard = h("div", { className: "card" }, h("div", { className: "card-title" }, "帧序列(顺序即视角顺序)"));
  root.append(listCard);
  if (frames.length === 0) {
    listCard.append(emptyState("还没有素材帧, 导入图片或生成测试素材"));
    return;
  }

  const grid = h("div", { className: "thumb-grid" });
  frames.forEach((frame, idx) => {
    const startInput = h("input", {
      className: "input",
      type: "number",
      step: "0.5",
      value: frame.viewStart.toFixed(1),
      style: "width: 76px",
      onchange: async () => {
        frame.viewStart = Number(startInput.value);
        await putFrame(frame);
        toast("视角范围已更新");
      },
    }) as HTMLInputElement;
    const endInput = h("input", {
      className: "input",
      type: "number",
      step: "0.5",
      value: frame.viewEnd.toFixed(1),
      style: "width: 76px",
      onchange: async () => {
        frame.viewEnd = Number(endInput.value);
        await putFrame(frame);
        toast("视角范围已更新");
      },
    }) as HTMLInputElement;

    const move = async (dir: number) => {
      const target = frames[idx + dir];
      if (!target) return;
      const o = frame.order;
      frame.order = target.order;
      target.order = o;
      await putFrame(frame);
      await putFrame(target);
      location.reload();
    };

    grid.append(
      h(
        "div",
        { className: "thumb-card" },
        h("img", { src: frameThumbUrl(frame), alt: `帧 ${idx + 1}` }),
        h(
          "div",
          { className: "thumb-info" },
          h("div", {}, `帧 ${idx + 1}`, " ", h("span", { className: "text-sub mono" }, `${frame.width}×${frame.height}`)),
          h(
            "div",
            { className: "row", style: "margin-top: 8px" },
            h("span", { className: "text-sub" }, "视角"),
            startInput,
            h("span", { className: "text-sub" }, "° ~"),
            endInput,
            h("span", { className: "text-sub" }, "°"),
          ),
        ),
        h(
          "div",
          { className: "thumb-actions" },
          h("button", { className: "btn btn-sm", onclick: () => void move(-1), disabled: idx === 0 }, icon("up")),
          h("button", { className: "btn btn-sm", onclick: () => void move(1), disabled: idx === frames.length - 1 }, icon("down")),
          h(
            "button",
            {
              className: "btn btn-sm",
              onclick: async () => {
                const f = await pickFile("image/*");
                if (!f) return;
                const img = await blobToImageData(f);
                frame.blob = await imageDataToBlob(img);
                frame.width = img.width;
                frame.height = img.height;
                await putFrame(frame);
                toast("已替换");
                location.reload();
              },
            },
            icon("refresh"),
          ),
          h(
            "button",
            {
              className: "btn btn-sm btn-danger",
              onclick: async () => {
                await deleteFrame(frame.id);
                location.reload();
              },
            },
            icon("trash"),
          ),
        ),
      ),
    );
  });
  listCard.append(grid);

  // 同步视点数到项目
  if (frames.length !== project.viewCount && frames.length >= 2) {
    root.append(
      h(
        "div",
        { className: "notice notice-warn row" },
        h("span", { className: "grow" }, `当前 ${frames.length} 帧与项目视点数 ${project.viewCount} 不一致`),
        h(
          "button",
          {
            className: "btn btn-sm",
            onclick: async () => {
              project.viewCount = frames.length;
              project.updatedAt = Date.now();
              await putProject(project);
              location.reload();
            },
          },
          "同步视点数",
        ),
      ),
    );
  }
};
