// 轻量 DOM 助手 + 线性图标 + toast + 对话框

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export const h = (
  tag: string,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElement => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "className") {
      el.className = String(v);
    } else if (k === "value") {
      (el as HTMLInputElement).value = String(v);
    } else if (k === "checked") {
      (el as HTMLInputElement).checked = Boolean(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
};

// 统一线宽 1.6 的线性图标, 禁 emoji
const ICONS: Record<string, string> = {
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  ruler: '<path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/><path d="M7 12v-3M12 12V8M17 12v-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
};

export const icon = (name: keyof typeof ICONS): SVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = ICONS[name];
  return svg;
};

export const toast = (msg: string): void => {
  let wrap = document.querySelector<HTMLElement>(".toast-wrap");
  if (!wrap) {
    wrap = h("div", { className: "toast-wrap" });
    document.body.append(wrap);
  }
  const el = h("div", { className: "toast" }, msg);
  wrap.append(el);
  setTimeout(() => el.remove(), 2600);
};

export const openDialog = (title: string, body: HTMLElement, onOk: () => boolean | void): void => {
  const mask = h("div", { className: "dialog-mask" });
  const close = () => mask.remove();
  const dialog = h(
    "div",
    { className: "dialog" },
    h("div", { className: "dialog-title" }, title),
    body,
    h(
      "div",
      { className: "dialog-actions" },
      h("button", { className: "btn", onclick: close }, "取消"),
      h(
        "button",
        {
          className: "btn btn-primary",
          onclick: () => {
            if (onOk() !== false) close();
          },
        },
        "确定",
      ),
    ),
  );
  mask.append(dialog);
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });
  document.body.append(mask);
};

export const emptyState = (text: string): HTMLElement =>
  h("div", { className: "empty" }, icon("box"), h("div", { className: "empty-title" }, text));

// 文件选择
export const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = h("input", { type: "file", accept }) as HTMLInputElement;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });

// 下载
export const download = (name: string, blob: Blob): void => {
  const a = h("a", { href: URL.createObjectURL(blob), download: name }) as HTMLAnchorElement;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// Blob -> ImageData
export const blobToImageData = async (blob: Blob): Promise<ImageData> => {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
};

export const imageDataToBlob = (img: ImageData): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
