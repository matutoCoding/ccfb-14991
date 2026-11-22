// 入口: 布局 + hash 路由

import "./style.css";
import { h, icon } from "./ui.ts";
import { seedBuiltinLenses } from "./db.ts";
import { renderProjects } from "./pages/projects_page.ts";
import { renderLenses } from "./pages/lenses_page.ts";
import { renderFrames } from "./pages/frames_page.ts";
import { renderOutput } from "./pages/output_page.ts";
import { renderPreview } from "./pages/preview_page.ts";
import { renderProofs } from "./pages/proofs_page.ts";

interface Route {
  page: string;
  projectId?: string;
}

const parseHash = (): Route => {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "lenses") return { page: "lenses" };
  if (parts[0] === "project" && parts[1] && parts[2]) {
    return { page: parts[2], projectId: parts[1] };
  }
  return { page: "projects" };
};

const navItem = (label: string, iconName: string, hash: string, active: boolean): HTMLElement => {
  const a = h("a", { className: `nav-item${active ? " active" : ""}`, href: hash }, icon(iconName), label);
  return a;
};

const render = async (): Promise<void> => {
  const app = document.getElementById("app")!;
  const route = parseHash();
  app.innerHTML = "";
  const content = h("div", { className: "content" });
  const sidebar = h(
    "div",
    { className: "sidebar" },
    h("div", { className: "brand" }, "光栅卡工作室"),
    navItem("项目列表", "layers", "#/", route.page === "projects"),
    navItem("光栅片库", "ruler", "#/lenses", route.page === "lenses"),
  );
  if (route.projectId) {
    const id = route.projectId;
    sidebar.append(
      h("div", { className: "nav-section" }, "当前项目"),
      navItem("素材帧", "image", `#/project/${id}/frames`, route.page === "frames"),
      navItem("交错输出", "grid", `#/project/${id}/output`, route.page === "output"),
      navItem("视角预览", "eye", `#/project/${id}/preview`, route.page === "preview"),
      navItem("打样记录", "print", `#/project/${id}/proofs`, route.page === "proofs"),
    );
  }
  app.append(h("div", { className: "layout" }, sidebar, content));

  switch (route.page) {
    case "lenses":
      await renderLenses(content);
      break;
    case "frames":
      await renderFrames(content, route.projectId!);
      break;
    case "output":
      await renderOutput(content, route.projectId!);
      break;
    case "preview":
      await renderPreview(content, route.projectId!);
      break;
    case "proofs":
      await renderProofs(content, route.projectId!);
      break;
    default:
      await renderProjects(content);
  }
};

await seedBuiltinLenses();
window.addEventListener("hashchange", () => void render());
await render();
