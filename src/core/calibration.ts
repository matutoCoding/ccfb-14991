// 打印校准: 节距测试条生成与实际节距解算
//
// 每条带用略有差异的节距做黑白两帧交错
// 贴上光栅片后, 节距与光栅真实节距匹配的条带呈现最均匀的灰
// 不匹配的条带因相位漂移出现明暗条纹, 肉眼选最均匀的那条即可

import { frameForColumn } from "./interlace.ts";

export interface CalibrationParams {
  dpi: number;
  baseLpi: number; // 标称线数
  bandCount: number; // 条带数(奇数, 中间为标称值)
  stepPct: number; // 相邻条带节距步进(百分比, 如 0.1)
  widthMm: number; // 每条带宽
  bandHeightMm: number; // 每条带高
}

export interface CalibrationResult {
  image: ImageData;
  pitches: number[]; // 每条带的节距(像素/柱镜)
  lpis: number[]; // 每条带对应的实际线数
  bandHeightPx: number;
}

export const makeCalibrationImage = (p: CalibrationParams): CalibrationResult => {
  const widthPx = Math.round((p.widthMm / 25.4) * p.dpi);
  const bandHeightPx = Math.round((p.bandHeightMm / 25.4) * p.dpi);
  const mid = (p.bandCount - 1) / 2;
  const pitches: number[] = [];
  const lpis: number[] = [];
  for (let i = 0; i < p.bandCount; i++) {
    // 条带 i 的等效线数: 标称值按步进偏移
    const lpi = p.baseLpi * (1 + ((i - mid) * p.stepPct) / 100);
    lpis.push(lpi);
    pitches.push(p.dpi / lpi);
  }
  const H = bandHeightPx * p.bandCount + (p.bandCount - 1) * 2;
  const img = new ImageData(widthPx, H);
  const d = img.data;
  for (let b = 0; b < p.bandCount; b++) {
    const y0 = b * (bandHeightPx + 2);
    const pitch = pitches[b];
    for (let y = 0; y < bandHeightPx; y++) {
      for (let x = 0; x < widthPx; x++) {
        // 两帧交错: 帧 0 黑, 帧 1 白
        const v = frameForColumn(x, pitch, 2) === 0 ? 0 : 255;
        const o = ((y0 + y) * widthPx + x) * 4;
        d[o] = v;
        d[o + 1] = v;
        d[o + 2] = v;
        d[o + 3] = 255;
      }
    }
    // 条带间留 2px 中性灰分隔线
    if (b < p.bandCount - 1) {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < widthPx; x++) {
          const o = ((y0 + bandHeightPx + y) * widthPx + x) * 4;
          d[o] = 128;
          d[o + 1] = 128;
          d[o + 2] = 128;
          d[o + 3] = 255;
        }
      }
    }
  }
  return { image: img, pitches, lpis, bandHeightPx };
};

// 用户报回最清楚的条带号 -> 实际节距与实际线数
export const solveActualPitch = (
  p: CalibrationParams,
  bandIndex: number,
): { pitchPx: number; lpi: number } => {
  const mid = (p.bandCount - 1) / 2;
  const lpi = p.baseLpi * (1 + ((bandIndex - mid) * p.stepPct) / 100);
  return { pitchPx: p.dpi / lpi, lpi };
};
