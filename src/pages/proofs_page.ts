// 打样记录页: 试印参数与结果 + 节距校准 + 同客户复用

import { h, icon, toast, download, pickFile, openDialog, emptyState } from "../ui.ts";
import { deleteProof, getLens, listLenses, listProofs, putLens, putProof, uid, listProjects } from "../db.ts";
import { fmtDateTime } from "../lib/format.ts";
import { makeCalibrationImage, solveActualPitch } from "../core/calibration.ts";
import type { CalibrationParams } from "../core/calibration.ts";
import { pitchPx } from "../core/lens.ts";
import type { ProofRecord } from "../types.ts";
import { loadContext, pageHeader } from "./shared.ts";

const RESULT_LABEL: Record<ProofRecord["result"], [string, string]> = {
  pass: ["合格", "tag-ok"],
  ghosting: ["鬼影重", "tag-warn"],
  jump: ["跳变", "tag-warn"],
  reject: ["退货", "tag-danger"],
  pending: ["待定", ""],
};

const imageDataToPngBlob = (img: ImageData): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("导出失败"))), "image/png");
  });

export const renderProofs = async (root: HTMLElement, projectId: string): Promise<void> => {
  const ctx = await loadContext(projectId);
  if (!ctx) {
    root.append(pageHeader("项目不存在", ""));
    return;
  }
  const { project, lens } = ctx;
  root.append(pageHeader(`打样记录 - ${project.name}`, "每次试印留档, 校准好的节距同客户可复用"));

  const lenses = await listLenses();
  const lensName = (id: string) => lenses.find((l) => l.id === id)?.name ?? "-";

  // ---- 节距校准 ----
  const calibCard = h(
    "div",
    { className: "card" },
    h("div", { className: "card-title" }, "节距校准(打印测试条, 看哪条最均匀)"),
  );
  root.append(calibCard);

  const baseLpiInput = h("input", { className: "input", type: "number", step: "0.001", value: lens?.lpi ?? 75 }) as HTMLInputElement;
  const dpiInput = h("input", { className: "input", type: "number", value: project.dpi }) as HTMLInputElement;
  const bandCountInput = h("input", { className: "input", type: "number", value: 11, min: 3, max: 41 }) as HTMLInputElement;
  const stepInput = h("input", { className: "input", type: "number", step: "0.05", value: 0.1 }) as HTMLInputElement;
  const calibPreview = h("div", { style: "margin-top:16px" });
  const calibParams = (): CalibrationParams => ({
    dpi: Number(dpiInput.value),
    baseLpi: Number(baseLpiInput.value),
    bandCount: Number(bandCountInput.value),
    stepPct: Number(stepInput.value),
    widthMm: 120,
    bandHeightMm: 8,
  });

  calibCard.append(
    h(
      "div",
      { className: "form-row" },
      h("div", { className: "form-item" }, h("label", {}, "标称线数 LPI"), baseLpiInput),
      h("div", { className: "form-item" }, h("label", {}, "打印 DPI"), dpiInput),
      h("div", { className: "form-item" }, h("label", {}, "条带数(奇数)"), bandCountInput),
      h("div", { className: "form-item" }, h("label", {}, "步进 %"), stepInput),
    ),
    h(
      "div",
      { className: "row" },
      h(
        "button",
        {
          className: "btn",
          onclick: async () => {
            const r = makeCalibrationImage(calibParams());
            calibPreview.innerHTML = "";
            const canvas = h("canvas", { style: "max-width:100%;background:#fff;border-radius:8px" }) as HTMLCanvasElement;
            canvas.width = r.image.width;
            canvas.height = r.image.height;
            canvas.getContext("2d")!.putImageData(r.image, 0, 0);
            calibPreview.append(
              h(
                "div",
                { className: "text-sub", style: "margin-bottom:8px" },
                `中间条带为标称 ${baseLpiInput.value} LPI, 上下各偏移 ${stepInput.value}% 一档, 打印后贴光栅片看哪条最均匀`,
              ),
              canvas,
              h(
                "div",
                { className: "row", style: "margin-top:8px" },
                h(
                  "button",
                  {
                    className: "btn",
                    onclick: async () => {
                      const blob = await imageDataToPngBlob(r.image);
                      download(`pitch-test-${baseLpiInput.value}lpi.png`, blob);
                    },
                  },
                  icon("download"),
                  "导出校准页 PNG",
                ),
              ),
            );
          },
        },
        icon("print"),
        "生成校准页",
      ),
    ),
    calibPreview,
  );

  // 解算区
  const bandInput = h("input", { className: "input", type: "number", value: 5, min: 0 }) as HTMLInputElement;
  const solveOut = h("span", { className: "mono" });
  calibCard.append(
    h("div", { className: "card-title", style: "margin-top:24px" }, "读数解算"),
    h(
      "div",
      { className: "row" },
      h("span", { className: "text-sub" }, "最均匀条带号(从 0 数)"),
      bandInput,
      h(
        "button",
        {
          className: "btn btn-primary",
          onclick: async () => {
            const p = calibParams();
            const band = Number(bandInput.value);
            if (band < 0 || band >= p.bandCount) {
              toast(`条带号要在 0 ~ ${p.bandCount - 1} 之间`);
              return;
            }
            const s = solveActualPitch(p, band);
            solveOut.textContent = `实际节距 ${s.pitchPx.toFixed(4)} px, 实际线数 ${s.lpi.toFixed(3)} LPI`;
            // 存一条打样记录
            const record: ProofRecord = {
              id: uid(),
              projectId,
              customer: project.customer,
              date: Date.now(),
              lensId: project.lensId,
              dpi: p.dpi,
              pitchPx: s.pitchPx,
              calibratedLpi: s.lpi,
              bandIndex: band,
              result: "pending",
              notes: "节距校准",
              photoBlob: null,
            };
            await putProof(record);
            toast("校准结果已存为打样记录");
          },
        },
        "解算并存档",
      ),
      solveOut,
    ),
  );

  // ---- 同客户复用 ----
  const allProjects = await listProjects();
  const sameCustomer = allProjects.filter((p) => p.customer && p.customer === project.customer && p.id !== projectId);
  const reuseBox = h("div", {});
  root.append(reuseBox);
  const reuseProofs: ProofRecord[] = [];
  for (const p of sameCustomer) {
    const proofs = await listProofs(p.id);
    reuseProofs.push(...proofs.filter((r) => r.calibratedLpi > 0));
  }
  if (reuseProofs.length > 0 && lens) {
    const latest = reuseProofs.sort((a, b) => b.date - a.date)[0];
    reuseBox.append(
      h(
        "div",
        { className: "notice row" },
        h(
          "span",
          { className: "grow" },
          `客户「${project.customer}」上次校准: ${latest.calibratedLpi.toFixed(3)} LPI (${fmtDateTime(latest.date)})`,
        ),
        h(
          "button",
          {
            className: "btn btn-sm",
            onclick: async () => {
              lens.lpi = latest.calibratedLpi;
              await putLens(lens);
              toast("已把校准线数写回当前光栅片");
            },
          },
          "复用到当前光栅片",
        ),
      ),
    );
  }

  // ---- 打样记录列表 ----
  const records = (await listProofs(projectId)).sort((a, b) => b.date - a.date);
  const listCard = h(
    "div",
    { className: "card" },
    h(
      "div",
      { className: "row", style: "margin-bottom:16px" },
      h("div", { className: "card-title grow", style: "margin:0" }, "试印记录"),
      h(
        "button",
        {
          className: "btn btn-primary",
          onclick: () => {
            const lensSelect = h(
              "select",
              { className: "select" },
              ...lenses.map((l) => h("option", { value: l.id, selected: l.id === project.lensId }, l.name)),
            ) as HTMLSelectElement;
            const dpiIn = h("input", { className: "input", type: "number", value: project.dpi }) as HTMLInputElement;
            const resultSelect = h(
              "select",
              { className: "select" },
              ...(Object.keys(RESULT_LABEL) as ProofRecord["result"][]).map((r) =>
                h("option", { value: r }, RESULT_LABEL[r][0]),
              ),
            ) as HTMLSelectElement;
            const notesIn = h("input", { className: "input", placeholder: "鬼影位置 / 跳变描述..." }) as HTMLInputElement;
            let photo: Blob | null = null;
            const photoLabel = h("span", { className: "text-sub" }, "无照片");
            const body = h(
              "div",
              {},
              h(
                "div",
                { className: "form-row" },
                h("div", { className: "form-item grow" }, h("label", {}, "光栅片"), lensSelect),
                h("div", { className: "form-item" }, h("label", {}, "DPI"), dpiIn),
              ),
              h(
                "div",
                { className: "form-row" },
                h("div", { className: "form-item" }, h("label", {}, "结果"), resultSelect),
                h("div", { className: "form-item grow" }, h("label", {}, "备注"), notesIn),
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
                      if (f) {
                        photo = f;
                        photoLabel.textContent = f.name;
                      }
                    },
                  },
                  "上传试印照片",
                ),
                photoLabel,
              ),
            );
            openDialog("新增试印记录", body, () => {
              const lpi = lenses.find((l) => l.id === lensSelect.value)?.lpi ?? 0;
              const record: ProofRecord = {
                id: uid(),
                projectId,
                customer: project.customer,
                date: Date.now(),
                lensId: lensSelect.value,
                dpi: Number(dpiIn.value),
                pitchPx: lpi > 0 ? pitchPx(Number(dpiIn.value), lpi) : 0,
                calibratedLpi: 0,
                bandIndex: -1,
                result: resultSelect.value as ProofRecord["result"],
                notes: notesIn.value.trim(),
                photoBlob: photo,
              };
              void putProof(record).then(() => location.reload());
            });
          },
        },
        icon("plus"),
        "新增记录",
      ),
    ),
  );
  root.append(listCard);

  if (records.length === 0) {
    listCard.append(emptyState("还没有试印记录"));
    return;
  }

  const table = h(
    "table",
    { className: "table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, "时间"),
        h("th", {}, "光栅片"),
        h("th", {}, "DPI"),
        h("th", {}, "节距 px"),
        h("th", {}, "校准 LPI"),
        h("th", {}, "结果"),
        h("th", {}, "备注"),
        h("th", {}, ""),
      ),
    ),
  );
  const tbody = h("tbody", {});
  for (const r of records) {
    const [label, tagClass] = RESULT_LABEL[r.result];
    tbody.append(
      h(
        "tr",
        {},
        h("td", { className: "text-sub" }, fmtDateTime(r.date)),
        h("td", {}, lensName(r.lensId)),
        h("td", { className: "mono" }, String(r.dpi)),
        h("td", { className: "mono" }, r.pitchPx > 0 ? r.pitchPx.toFixed(4) : "-"),
        h("td", { className: "mono" }, r.calibratedLpi > 0 ? r.calibratedLpi.toFixed(3) : "-"),
        h("td", {}, h("span", { className: `tag ${tagClass}` }, label)),
        h("td", {}, r.notes || "-"),
        h(
          "td",
          {},
          h(
            "button",
            {
              className: "btn btn-sm btn-danger",
              onclick: () => void deleteProof(r.id).then(() => location.reload()),
            },
            icon("trash"),
          ),
        ),
      ),
    );
  }
  table.append(tbody);
  listCard.append(table);

  // 把校准写回光栅片的快捷入口
  const calibrated = records.filter((r) => r.calibratedLpi > 0);
  if (calibrated.length > 0 && lens) {
    const latest = calibrated[0];
    listCard.append(
      h(
        "div",
        { className: "notice row", style: "margin-top:16px" },
        h("span", { className: "grow" }, `本项目最新校准 ${latest.calibratedLpi.toFixed(3)} LPI`),
        h(
          "button",
          {
            className: "btn btn-sm",
            onclick: async () => {
              const target = await getLens(project.lensId);
              if (!target) return;
              target.lpi = latest.calibratedLpi;
              await putLens(target);
              toast("已写回光栅片, 交错输出将按校准线数");
            },
          },
          "写回当前光栅片",
        ),
      ),
    );
  }
};
