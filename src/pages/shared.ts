// 页面共享助手

import { getProject, getLens, listFrames } from "../db.ts";
import type { Frame, LensSpec, Project } from "../types.ts";

export interface ProjectContext {
  project: Project;
  lens: LensSpec | undefined;
  frames: Frame[];
}

export const loadContext = async (projectId: string): Promise<ProjectContext | null> => {
  const project = await getProject(projectId);
  if (!project) return null;
  const lens = project.lensId ? await getLens(project.lensId) : undefined;
  const frames = await listFrames(projectId);
  return { project, lens, frames };
};

const thumbUrls = new Map<string, string>();

export const frameThumbUrl = (frame: Frame): string => {
  let url = thumbUrls.get(frame.id);
  if (!url) {
    url = URL.createObjectURL(frame.blob);
    thumbUrls.set(frame.id, url);
  }
  return url;
};

export const pageHeader = (title: string, desc: string): DocumentFragment => {
  const frag = document.createDocumentFragment();
  const t = document.createElement("h1");
  t.className = "page-title";
  t.textContent = title;
  const d = document.createElement("p");
  d.className = "page-desc";
  d.textContent = desc;
  frag.append(t, d);
  return frag;
};
