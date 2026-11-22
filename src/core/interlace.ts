// 交错图生成: 按打印机 DPI 和光栅线数把 N 帧切成条带交错
// 节距(像素/柱镜) = dpi / lpi, 非整数时按实际节距逐列取帧, 帧图重采样到输出宽度

import { pitchPx, STRIP_OFFSET } from "./lens.ts";

// 输出第 x 列取自第几帧(与预览着色器的取帧公式一致, 含半条带偏移)
export const frameForColumn = (x: number, pitch: number, viewCount: number): number => {
  const phase = ((x / pitch + STRIP_OFFSET(viewCount)) % 1 + 1) % 1;
  return Math.min(viewCount - 1, Math.floor(phase * viewCount));
};

export interface InterlaceParams {
  dpi: number;
  lpi: number;
  widthMm: number;
  heightMm: number;
  viewCount: number;
}

export interface InterlaceSize {
  widthPx: number;
  heightPx: number;
  pitch: number; // 像素/柱镜
  lenticules: number; // 柱镜条数
  integer: boolean; // 节距是否整数
}

export const interlaceSize = (p: InterlaceParams): InterlaceSize => {
  const pitch = pitchPx(p.dpi, p.lpi);
  const lenticules = Math.max(1, Math.round((p.widthMm / 25.4) * p.lpi));
  const widthPx = Math.round(lenticules * pitch);
  const heightPx = Math.round((p.heightMm / 25.4) * p.dpi);
  return { widthPx, heightPx, pitch, lenticules, integer: Number.isInteger(pitch) };
};

// 双线性采样 src 的 (fx, fy)(像素坐标, 可小数)
const sampleBilinear = (
  src: Uint8ClampedArray,
  w: number,
  h: number,
  fx: number,
  fy: number,
  out: Uint8ClampedArray,
  o: number,
): void => {
  const x = Math.max(0, Math.min(w - 1.001, fx));
  const y = Math.max(0, Math.min(h - 1.001, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const ax = x - x0;
  const ay = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + w * 4;
  const i11 = i01 + 4;
  for (let c = 0; c < 3; c++) {
    const v0 = src[i00 + c] * (1 - ax) + src[i10 + c] * ax;
    const v1 = src[i01 + c] * (1 - ax) + src[i11 + c] * ax;
    out[o + c] = v0 * (1 - ay) + v1 * ay;
  }
  out[o + 3] = 255;
};

// 生成交错图(同步版, 小图/测试用)
export const interlace = (frames: ImageData[], size: InterlaceSize): ImageData => {
  const { widthPx: W, heightPx: H, pitch } = size;
  const n = frames.length;
  const out = new ImageData(W, H);
  const d = out.data;
  const px = new Uint8ClampedArray(4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const f = frames[frameForColumn(x, pitch, n)];
      const fx = (x / W) * (f.width - 1);
      const fy = (y / H) * (f.height - 1);
      sampleBilinear(f.data, f.width, f.height, fx, fy, px, 0);
      const o = (y * W + x) * 4;
      d[o] = px[0];
      d[o + 1] = px[1];
      d[o + 2] = px[2];
      d[o + 3] = 255;
    }
  }
  return out;
};

// 分块异步版, 大图不卡界面, onProgress 0..1
export const interlaceAsync = async (
  frames: ImageData[],
  size: InterlaceSize,
  onProgress?: (p: number) => void,
): Promise<ImageData> => {
  const { widthPx: W, heightPx: H, pitch } = size;
  const n = frames.length;
  const out = new ImageData(W, H);
  const d = out.data;
  const px = new Uint8ClampedArray(4);
  const chunkRows = 64;
  for (let y0 = 0; y0 < H; y0 += chunkRows) {
    const yEnd = Math.min(H, y0 + chunkRows);
    for (let y = y0; y < yEnd; y++) {
      for (let x = 0; x < W; x++) {
        const f = frames[frameForColumn(x, pitch, n)];
        const fx = (x / W) * (f.width - 1);
        const fy = (y / H) * (f.height - 1);
        sampleBilinear(f.data, f.width, f.height, fx, fy, px, 0);
        const o = (y * W + x) * 4;
        d[o] = px[0];
        d[o + 1] = px[1];
        d[o + 2] = px[2];
        d[o + 3] = 255;
      }
    }
    onProgress?.(yEnd / H);
    // 让出主线程
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
};
