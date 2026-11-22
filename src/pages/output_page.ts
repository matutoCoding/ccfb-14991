// 交错输出页: 按 DPI + 线数生成交错图, 导出 PNG / TIFF

import { h, icon, toast, download, blobToImageData, emptyState } from "../ui.ts";
import { listLenses, putProject } from "../db.ts";
import { interlaceAsync, interlaceSize } from "../core/interlace.ts";
import { encodeTiff } from "../core/tiff_writer.ts";
import { loadContext, pageHeader } from "./shared.ts";

export const renderOutput = async (root: HTMLElement, projectId: string): Promise<void> => {
  const ctx = await loadContext(projectId);
  if (!ctx) {
    root.append(pageHeader("项目不存在", ""));
    return;
  }
  const { project, lens, frames } = ctx;
  root.append(pageHeader(`交错输出 - ${project.name}`, "按打印机 DPI 和光栅线数生成交错图"));

  if (frames.length < 2) {
    root.append(h("div", { className: "card" }, emptyState("至少需要 2 帧素材, 先去素材帧页导入")));
    return;
  }
  if (!lens) {
    root.append(h("div", { className: "card" }, emptyState("项目未绑定光栅片")));
    return;
  }

  const lenses = await listLenses();
  const lensSelect = h(
    "select",
    { className: "select" },
    ...lenses.map((l) => h("option", { value: l.id, selected: l.id === project.lensId }, l.name)),
  ) as HTMLSelectElement;
  const dpiInput = h("input", { className: "input", type: "number", value: project.dpi }) as HTMLInputElement;
  const widthInput = h("input", { className: "input", type: "number", value: project.widthMm }) as HTMLInputElement;
  const heightInput = h("input", { className: "input", type: "number", value: project.heightMm }) as HTMLInputElement;

  const paramCard = h(
    "div",
    { className: "card" },
    h("div", { className: "card-title" }, "输出参数"),
    h(
      "div",
      { className: "form-row" },
      h("div", { className: "form-item grow" }, h("label", {}, "光栅片"), lensSelect),
      h("div", { className: "form-item" }, h("label", {}, "打印 DPI"), dpiInput),
      h("div", { className: "form-item" }, h("label", {}, "宽 mm"), widthInput),
      h("div", { className: "form-item" }, h("label", {}, "高 mm"), heightInput),
    ),
  );
  root.append(paramCard);

  const infoBox = h("div", {});
  paramCard.append(infoBox);

  const progressWrap = h("div", { className: "progress", style: "display:none" }, h("div", { style: "width:0%" }));
  const progressBar = progressWrap.firstChild as HTMLElement;
  const previewBox = h("div", {});
  const exportRow = h("div", { className: "row", style: "display:none" });
  const resultCard = h(
    "div",
    { className: "card" },
    h("div", { className: "card-title" }, "交错图"),
    progressWrap,
    previewBox,
    exportRow,
  );
  root.append(resultCard);

  let result: ImageData | null = null;

  const currentSize = () => {
    const dpi = Number(dpiInput.value);
    const lpi = lenses.find((l) => l.id === lensSelect.value)?.lpi ?? lens.lpi;
    return interlaceSize({
      dpi,
      lpi,
      widthMm: Number(widthInput.value),
      heightMm: Number(heightInput.value),
      viewCount: frames.length,
    });
  };

  const updateInfo = () => {
    const s = currentSize();
    infoBox.innerHTML = "";
    infoBox.append(
      h(
        "div",
        { className: s.integer ? "notice" : "notice notice-warn" },
        `节距 ${s.pitch.toFixed(3)} px/柱镜, 共 ${s.lenticules} 条柱镜, 输出 ${s.widthPx}×${s.heightPx}px` +
          (s.integer ? ", 整除无需重采样" : ", 非整除, 将按实际节距重采样取帧"),
      ),
    );
  };
  for (const input of [dpiInput, widthInput, heightInput]) input.addEventListener("input", updateInfo);
  lensSelect.addEventListener("change", updateInfo);
  updateInfo();

  paramCard.append(
    h(
      "button",
      {
        className: "btn btn-primary",
        onclick: async () => {
          // 参数写回项目
          project.lensId = lensSelect.value;
          project.dpi = Number(dpiInput.value);
          project.widthMm = Number(widthInput.value);
          project.heightMm = Number(heightInput.value);
          project.viewCount = frames.length;
          project.updatedAt = Date.now();
          await putProject(project);

          progressWrap.style.display = "block";
          const images: ImageData[] = [];
          for (const f of frames) images.push(await blobToImageData(f.blob));
          const size = currentSize();
          const t0 = performance.now();
          result = await interlaceAsync(images, size, (p) => {
            progressBar.style.width = `${Math.round(p * 100)}%`;
          });
          const ms = Math.round(performance.now() - t0);
          progressWrap.style.display = "none";
          toast(`交错完成, 耗时 ${ms}ms`);

          previewBox.innerHTML = "";
          const canvas = h("canvas", { style: "max-width:100%;border-radius:8px;background:#fff" }) as HTMLCanvasElement;
          canvas.width = result.width;
          canvas.height = result.height;
          canvas.getContext("2d")!.putImageData(result, 0, 0);
          previewBox.append(
            h("div", { className: "text-sub", style: "margin: 12px 0 8px" }, "局部放大看是竖条交错, 整体发灰属正常"),
            canvas,
          );
          exportRow.style.display = "flex";
        },
      },
      icon("grid"),
      "生成交错图",
    ),
  );

  exportRow.append(
    h(
      "button",
      {
        className: "btn",
        onclick: () => {
          if (!result) return;
          const canvas = document.createElement("canvas");
          canvas.width = result.width;
          canvas.height = result.height;
          canvas.getContext("2d")!.putImageData(result, 0, 0);
          canvas.toBlob((b) => {
            if (b) download(`${project.name}-interlaced.png`, b);
          }, "image/png");
        },
      },
      icon("download"),
      "导出 PNG",
    ),
    h(
      "button",
      {
        className: "btn",
        onclick: () => {
          if (!result) return;
          const buf = encodeTiff(result, Number(dpiInput.value));
          download(`${project.name}-interlaced.tif`, new Blob([buf], { type: "image/tiff" }));
        },
      },
      icon("download"),
      "导出 TIFF",
    ),
  );
};
