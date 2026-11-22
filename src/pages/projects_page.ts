// 项目列表页

import { h, icon, openDialog, emptyState, toast } from "../ui.ts";
import { deleteProject, listLenses, listProjects, putProject, uid } from "../db.ts";
import { fmtDateTime } from "../lib/format.ts";
import { PROJECT_TYPE_LABEL } from "../types.ts";
import type { Project, ProjectType } from "../types.ts";
import { pageHeader } from "./shared.ts";

const newProjectDialog = async (onCreated: () => void): Promise<void> => {
  const lenses = await listLenses();
  const nameInput = h("input", { className: "input", placeholder: "如: 中秋贺卡变图" }) as HTMLInputElement;
  const customerInput = h("input", { className: "input", placeholder: "客户名称" }) as HTMLInputElement;
  const typeSelect = h(
    "select",
    { className: "select" },
    ...(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) =>
      h("option", { value: t }, PROJECT_TYPE_LABEL[t]),
    ),
  ) as HTMLSelectElement;
  const lensSelect = h(
    "select",
    { className: "select" },
    ...lenses.map((l) => h("option", { value: l.id }, l.name)),
  ) as HTMLSelectElement;
  const dpiInput = h("input", { className: "input", type: "number", value: 600 }) as HTMLInputElement;
  const widthInput = h("input", { className: "input", type: "number", value: 100 }) as HTMLInputElement;
  const heightInput = h("input", { className: "input", type: "number", value: 140 }) as HTMLInputElement;
  const viewsInput = h("input", { className: "input", type: "number", value: 2, min: 2, max: 24 }) as HTMLInputElement;

  const body = h(
    "div",
    {},
    h("div", { className: "form-row" }, h("div", { className: "form-item grow" }, h("label", {}, "项目名称"), nameInput)),
    h("div", { className: "form-row" }, h("div", { className: "form-item grow" }, h("label", {}, "客户"), customerInput)),
    h(
      "div",
      { className: "form-row" },
      h("div", { className: "form-item" }, h("label", {}, "类型"), typeSelect),
      h("div", { className: "form-item grow" }, h("label", {}, "光栅片"), lensSelect),
    ),
    h(
      "div",
      { className: "form-row" },
      h("div", { className: "form-item" }, h("label", {}, "打印 DPI"), dpiInput),
      h("div", { className: "form-item" }, h("label", {}, "宽 mm"), widthInput),
      h("div", { className: "form-item" }, h("label", {}, "高 mm"), heightInput),
      h("div", { className: "form-item" }, h("label", {}, "视点数"), viewsInput),
    ),
  );

  openDialog("新建项目", body, () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast("项目名称不能为空");
      return false;
    }
    const now = Date.now();
    const project: Project = {
      id: uid(),
      name,
      customer: customerInput.value.trim(),
      type: typeSelect.value as ProjectType,
      lensId: lensSelect.value,
      dpi: Number(dpiInput.value),
      widthMm: Number(widthInput.value),
      heightMm: Number(heightInput.value),
      viewCount: Math.max(2, Number(viewsInput.value)),
      createdAt: now,
      updatedAt: now,
    };
    void putProject(project).then(() => {
      toast("项目已创建");
      onCreated();
    });
  });
};

export const renderProjects = async (root: HTMLElement): Promise<void> => {
  root.append(pageHeader("项目列表", "变图 / 动画 / 立体三类光栅卡项目"));
  const projects = (await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);

  const card = h(
    "div",
    { className: "card" },
    h(
      "div",
      { className: "row", style: "margin-bottom: 16px" },
      h("div", { className: "grow" }),
      h(
        "button",
        {
          className: "btn btn-primary",
          onclick: () => void newProjectDialog(() => location.reload()),
        },
        icon("plus"),
        "新建项目",
      ),
    ),
  );
  root.append(card);

  if (projects.length === 0) {
    card.append(emptyState("还没有项目, 点右上角新建一个"));
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
        h("th", {}, "项目名称"),
        h("th", {}, "客户"),
        h("th", {}, "类型"),
        h("th", {}, "尺寸"),
        h("th", {}, "DPI"),
        h("th", {}, "更新时间"),
        h("th", {}, ""),
      ),
    ),
  );
  const tbody = h("tbody", {});
  for (const p of projects) {
    tbody.append(
      h(
        "tr",
        {
          className: "clickable",
          onclick: () => {
            location.hash = `#/project/${p.id}/frames`;
          },
        },
        h("td", {}, p.name),
        h("td", {}, p.customer || "-"),
        h("td", {}, h("span", { className: "tag tag-accent" }, PROJECT_TYPE_LABEL[p.type])),
        h("td", { className: "mono" }, `${p.widthMm}×${p.heightMm}mm`),
        h("td", { className: "mono" }, String(p.dpi)),
        h("td", { className: "text-sub" }, fmtDateTime(p.updatedAt)),
        h(
          "td",
          {},
          h(
            "button",
            {
              className: "btn btn-sm btn-danger",
              onclick: (e: Event) => {
                e.stopPropagation();
                void deleteProject(p.id).then(() => location.reload());
              },
            },
            icon("trash"),
          ),
        ),
      ),
    );
  }
  table.append(tbody);
  card.append(table);
};
