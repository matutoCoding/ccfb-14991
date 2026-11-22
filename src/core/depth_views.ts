// 立体项目: 单图 + 深度图生成多视点帧
// 流程: 深度平滑 -> 分层 -> 每层按视差平移 -> 由远及近画家算法合成 -> 空洞修补
// 边缘撕裂处理: 深度图先平滑, 近层做 1px 膨胀, 剩余空洞迭代邻域填充

import type { DepthConfig } from "../types.ts";

// 盒式模糊(深度图平滑, 半径 r)
const boxBlur = (src: Float32Array, w: number, h: number, r: number): Float32Array => {
  if (r <= 0) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = 2 * r + 1;
  // 水平
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.max(0, Math.min(w - 1, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / win;
      const xAdd = Math.min(w - 1, x + r + 1);
      const xSub = Math.max(0, x - r);
      acc += src[y * w + xAdd] - src[y * w + xSub];
    }
  }
  // 垂直
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      const yAdd = Math.min(h - 1, y + r + 1);
      const ySub = Math.max(0, y - r);
      acc += tmp[yAdd * w + x] - tmp[ySub * w + x];
    }
  }
  return out;
};

// 从 ImageData 提取灰度深度 0..1(取 R 通道), 应用 gamma
const extractDepth = (depth: ImageData, gamma: number): Float32Array => {
  const n = depth.width * depth.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.pow(depth.data[i * 4] / 255, gamma);
  }
  return out;
};

// 空洞修补: 透明像素迭代取邻近不透明像素均值
const fillHoles = (img: ImageData, passes: number): void => {
  const w = img.width;
  const h = img.height;
  const d = img.data;
  for (let p = 0; p < passes; p++) {
    const snapshot = new Uint8ClampedArray(d);
    let holes = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (snapshot[o + 3] !== 0) continue;
        let r = 0, g = 0, b = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const no = (ny * w + nx) * 4;
            if (snapshot[no + 3] === 0) continue;
            r += snapshot[no];
            g += snapshot[no + 1];
            b += snapshot[no + 2];
            cnt++;
          }
        }
        if (cnt > 0) {
          d[o] = r / cnt;
          d[o + 1] = g / cnt;
          d[o + 2] = b / cnt;
          d[o + 3] = 255;
        } else {
          holes++;
        }
      }
    }
    if (holes === 0) return;
  }
  // 残余空洞兜底: 整体再扫几遍
};

// 生成 viewCount 个视点帧
export const generateViews = (
  color: ImageData,
  depthMap: ImageData,
  viewCount: number,
  cfg: DepthConfig,
): ImageData[] => {
  const w = color.width;
  const h = color.height;
  // 深度图尺寸与彩图不一致时最近邻重采样
  let depthData = depthMap;
  if (depthMap.width !== w || depthMap.height !== h) {
    depthData = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(depthMap.width - 1, Math.floor((x / w) * depthMap.width));
        const sy = Math.min(depthMap.height - 1, Math.floor((y / h) * depthMap.height));
        const so = (sy * depthMap.width + sx) * 4;
        const oo = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) depthData.data[oo + c] = depthMap.data[so + c];
      }
    }
  }
  const depth = boxBlur(extractDepth(depthData, cfg.gamma), w, h, cfg.smooth);
  const L = Math.max(2, cfg.layers);
  // 层索引: 0 最远, L-1 最近
  const layerOf = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    layerOf[i] = Math.min(L - 1, Math.floor(depth[i] * L));
  }
  const views: ImageData[] = [];
  for (let v = 0; v < viewCount; v++) {
    const out = new ImageData(w, h);
    const d = out.data;
    // 视点系数 -1..1
    const vc = viewCount > 1 ? (v / (viewCount - 1)) * 2 - 1 : 0;
    // 由远及近逐层绘制, 位移按像素实际深度算(不按层中心), 保证零视差面严格不动
    for (let l = 0; l < L; l++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (layerOf[idx] !== l) continue;
          const dx = Math.round(vc * (depth[idx] - cfg.refDepth) * cfg.strength);
          const tx = x + dx;
          if (tx < 0 || tx >= w) continue;
          const so = (y * w + x) * 4;
          const to = (y * w + tx) * 4;
          d[to] = color.data[so];
          d[to + 1] = color.data[so + 1];
          d[to + 2] = color.data[so + 2];
          d[to + 3] = 255;
          // 近层 1px 膨胀, 压住边缘撕裂
          if (l >= L - 2 && tx + 1 < w) {
            const eo = (y * w + tx + 1) * 4;
            if (d[eo + 3] === 0) {
              d[eo] = color.data[so];
              d[eo + 1] = color.data[so + 1];
              d[eo + 2] = color.data[so + 2];
              d[eo + 3] = 255;
            }
          }
        }
      }
    }
    fillHoles(out, 24);
    views.push(out);
  }
  return views;
};
