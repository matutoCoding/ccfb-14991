// 光栅片库页: 建档 + 内置规格

import { h, icon, openDialog, toast } from "../ui.ts";
import { deleteLens, listLenses, putLens, uid } from "../db.ts";
import { lpiToPitchMm } from "../core/lens.ts";
import type { LensSpec } from "../types.ts";
import { pageHeader } from "./shared.ts";

const lensDialog = (lens: LensSpec | null, onSaved: () => void): void => {
  const nameInput = h("input", { className: "input", value: lens?.name ?? "" }) as HTMLInputElement;
  const lpiInput = h("input", { className: "input", type: "number", step: "0.001", value: lens?.lpi ?? 75 }) as HTMLInputElement;
  const nInput = h("input", { className: "input", type: "number", step: "0.01", value: lens?.refractiveIndex ?? 1.55 }) as HTMLInputElement;
  const tInput = h("input", { className: "input", type: "number", step: "0.01", value: lens?.thicknessMm ?? 0.46 }) as HTMLInputElement;
  const rInput = h("input", { className: "input", type: "number", step: "0.001", value: lens?.radiusMm ?? 0.163 }) as HTMLInputElement;
  const focusHint = h("div", { className: "text-sub" });

  const updateHint = () => {
    const t = Number(tInput.value);
    const n = Number(nInput.value);
    const r = Number(rInput.value);
    // 聚焦条件 t = nR/(n-1)
    const ideal = (n * r) / (n - 1);
    const ok = Math.abs(t - ideal) / ideal < 0.05;
    focusHint.textContent = `聚焦条件 t = nR/(n-1) = ${ideal.toFixed(3)}mm, 当前厚度${ok ? "匹配" : "偏离, 会有离焦鬼影"}`;
    focusHint.style.color = ok ? "var(--ok)" : "var(--warn)";
  };
  for (const input of [nInput, tInput, rInput]) input.addEventListener("input", updateHint);
  updateHint();

  const body = h(
    "div",
    {},
    h("div", { className: "form-row" }, h("div", { className: "form-item grow" }, h("label", {}, "名称"), nameInput)),
    h(
      "div",
      { className: "form-row" },
      h("div", { className: "form-item" }, h("label", {}, "线数 LPI"), lpiInput),
      h("div", { className: "form-item" }, h("label", {}, "折射率 n"), nInput),
    ),
    h(
      "div",
      { className: "form-row" },
      h("div", { className: "form-item" }, h("label", {}, "厚度 mm"), tInput),
      h("div", { className: "form-item" }, h("label", {}, "柱镜半径 mm"), rInput),
    ),
    focusHint,
  );

  openDialog(lens ? "编辑光栅片" : "新建光栅片", body, () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast("名称不能为空");
      return false;
    }
    const record: LensSpec = {
      id: lens?.id ?? uid(),
      name,
      lpi: Number(lpiInput.value),
      refractiveIndex: Number(nInput.value),
      thicknessMm: Number(tInput.value),
      radiusMm: Number(rInput.value),
      builtin: lens?.builtin ?? false,
    };
    void putLens(record).then(() => {
      toast("已保存");
      onSaved();
    });
  });
};

export const renderLenses = async (root: HTMLElement): Promise<void> => {
  root.append(pageHeader("光栅片库", "按线数 / 折射率 / 厚度 / 柱镜半径建档, 内置五种常用规格"));
  const lenses = (await listLenses()).sort((a, b) => a.lpi - b.lpi);

  const card = h(
    "div",
    { className: "card" },
    h(
      "div",
      { className: "row", style: "margin-bottom: 16px" },
      h("div", { className: "grow" }),
      h(
        "button",
        { className: "btn btn-primary", onclick: () => lensDialog(null, () => location.reload()) },
        icon("plus"),
        "新建光栅片",
      ),
    ),
  );
  root.append(card);

  const table = h(
    "table",
    { className: "table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, "名称"),
        h("th", {}, "线数 LPI"),
        h("th", {}, "节距 mm"),
        h("th", {}, "折射率"),
        h("th", {}, "厚度 mm"),
        h("th", {}, "半径 mm"),
        h("th", {}, "来源"),
        h("th", {}, ""),
      ),
    ),
  );
  const tbody = h("tbody", {});
  for (const l of lenses) {
    tbody.append(
      h(
        "tr",
        {},
        h("td", {}, l.name),
        h("td", { className: "mono" }, String(l.lpi)),
        h("td", { className: "mono" }, lpiToPitchMm(l.lpi).toFixed(4)),
        h("td", { className: "mono" }, String(l.refractiveIndex)),
        h("td", { className: "mono" }, String(l.thicknessMm)),
        h("td", { className: "mono" }, String(l.radiusMm)),
        h("td", {}, l.builtin ? h("span", { className: "tag" }, "内置") : h("span", { className: "tag tag-accent" }, "自建")),
        h(
          "td",
          {},
          h(
            "div",
            { className: "row" },
            h(
              "button",
              { className: "btn btn-sm", onclick: () => lensDialog(l, () => location.reload()) },
              "编辑",
            ),
            l.builtin
              ? ""
              : h(
                  "button",
                  {
                    className: "btn btn-sm btn-danger",
                    onclick: () => void deleteLens(l.id).then(() => location.reload()),
                  },
                  icon("trash"),
                ),
          ),
        ),
      ),
    );
  }
  table.append(tbody);
  card.append(table);
};
