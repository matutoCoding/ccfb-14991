// 串扰计算: 足迹重叠法, 纯几何可手算核对
//
// 模型: 观察角 theta 的主光线穿过柱镜中心, 落在打印面 xP(theta)
// 眼睛瞳孔/离焦等效为角孔径 aperture(全宽, 弧度)
// 孔径内的光线在打印面上扫出足迹 [xP(theta-a/2), xP(theta+a/2)]
// 串扰 = 足迹落在非理想帧条带内的长度 / 足迹总长

import { traceRay, frameAtPrint } from "./lens.ts";
import type { LensGeom } from "./lens.ts";

const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// 足迹 [x0, x1] 内落在理想帧 kStar 条带之外的比例(解析解)
// 含半条带偏移: 条带 k 覆盖相位 [(k-0.5)/N, (k+0.5)/N), 柱镜中心对准条带中心
export const crosstalkFromFootprint = (
  x0: number,
  x1: number,
  pitchMm: number,
  viewCount: number,
  kStar: number,
): number => {
  const width = x1 - x0;
  if (width <= 0) return 0;
  const stripW = pitchMm / viewCount;
  const m0 = Math.floor(x0 / pitchMm) - 1;
  const m1 = Math.ceil(x1 / pitchMm) + 1;
  let inside = 0;
  for (let m = m0; m <= m1; m++) {
    const s0 = m * pitchMm + (kStar - 0.5) * stripW;
    inside += overlap(x0, x1, s0, s0 + stripW);
  }
  return 1 - inside / width;
};

// 主光线在打印面的落点(过柱镜中心顶点, xc = 0)
export const chiefRayPrint = (theta: number, geom: LensGeom): number =>
  traceRay(theta, 0, geom);

// 视角 theta 下的串扰比例 0..1
export const crosstalkAtAngle = (
  theta: number,
  aperture: number,
  geom: LensGeom,
  viewCount: number,
): number => {
  const xc = chiefRayPrint(theta, geom);
  const kStar = frameAtPrint(xc, geom.pitchMm, viewCount);
  const x0 = chiefRayPrint(theta - aperture / 2, geom);
  const x1 = chiefRayPrint(theta + aperture / 2, geom);
  return crosstalkFromFootprint(x0, x1, geom.pitchMm, viewCount, kStar);
};

export interface CrosstalkPoint {
  angleDeg: number;
  crosstalk: number;
  frame: number;
}

// 串扰曲线: 在 [minDeg, maxDeg] 内采样
export const crosstalkCurve = (
  minDeg: number,
  maxDeg: number,
  samples: number,
  apertureRad: number,
  geom: LensGeom,
  viewCount: number,
): CrosstalkPoint[] => {
  const pts: CrosstalkPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const deg = minDeg + ((maxDeg - minDeg) * i) / (samples - 1);
    const theta = (deg * Math.PI) / 180;
    const xc = chiefRayPrint(theta, geom);
    pts.push({
      angleDeg: deg,
      crosstalk: crosstalkAtAngle(theta, apertureRad, geom, viewCount),
      frame: frameAtPrint(xc, geom.pitchMm, viewCount),
    });
  }
  return pts;
};
