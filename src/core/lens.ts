// 柱镜光栅几何与光线追迹(纯几何,可手算核对)
//
// 坐标约定: 打印面在 z=0, 柱镜轴向沿 Y, 截面在 XZ 平面
// 柱镜顶点(中心)在 z = thicknessMm, 表面是半径 R 的圆弧
// 曲率中心在柱镜中心正下方 z = thicknessMm - R 处
// 视角 theta: 光线传播方向与片基法线(+z)的有向夹角, 弧度
// 观察者在 +x 侧时 theta < 0, 对称模型下符号不影响串扰曲线

export interface LensGeom {
  pitchMm: number; // 节距 = 25.4 / lpi
  thicknessMm: number; // 基材厚度(顶点到打印面)
  radiusMm: number; // 柱镜曲率半径
  refractiveIndex: number; // 折射率
}

export const MM_PER_INCH = 25.4;

export const lpiToPitchMm = (lpi: number): number => MM_PER_INCH / lpi;

// 每柱镜覆盖的打印像素数(可非整数, 非整数时交错要重采样)
export const pitchPx = (dpi: number, lpi: number): number => dpi / lpi;

export const lensGeomFromSpec = (spec: {
  lpi: number;
  thicknessMm: number;
  radiusMm: number;
  refractiveIndex: number;
}): LensGeom => ({
  pitchMm: lpiToPitchMm(spec.lpi),
  thicknessMm: spec.thicknessMm,
  radiusMm: spec.radiusMm,
  refractiveIndex: spec.refractiveIndex,
});

// 单根光线追迹
// theta: 入射光线角度(弧度, 传播方向与+z 轴夹角, 斜率符号即方向符号)
// xc: 光线在柱镜表面落点(相对柱镜中心, mm)
// 返回光线在打印面上的落点(相对柱镜中心, mm)
// 角度簿记: 向下法线方向(指向片内)的倾角为 -alpha
// 入射角 i = theta + alpha, 折射角 i' = asin(sin(i)/n), 片内光线角 beta = i' - alpha
// 近轴校验: xc=0 时落点 ≈ thicknessMm * theta / n
// 焦点校验: thicknessMm = nR/(n-1) 时, 平行光(theta=0)全孔径聚焦到柱镜中心
export const traceRay = (theta: number, xc: number, geom: LensGeom): number => {
  const { radiusMm: R, refractiveIndex: n, thicknessMm: t } = geom;
  // 表面法线倾角: sin(alpha) = xc / R
  const s = Math.max(-0.9999, Math.min(0.9999, xc / R));
  const alpha = Math.asin(s);
  // 斯涅尔定律: sin(theta + alpha) = n * sin(thetaT)
  const thetaT = Math.asin(Math.sin(theta + alpha) / n);
  // 片内光线与 +z 轴夹角
  const beta = thetaT - alpha;
  // 表面点高度(矢高: 边缘比顶点低)
  const zs = t - R + Math.sqrt(R * R - xc * xc);
  return xc + zs * Math.tan(beta);
};

// 观察映射: 屏幕上看到片基表面 u 处(mm, 沿节距方向)时, 实际看到的打印面位置
// 返回打印面绝对坐标 mm
export const viewToPrint = (theta: number, u: number, geom: LensGeom): number => {
  const P = geom.pitchMm;
  const l = Math.floor(u / P);
  const xc = u - (l + 0.5) * P;
  return (l + 0.5) * P + traceRay(theta, xc, geom);
};

// 条带相位偏移: 半个条带, 让柱镜中心对准条带中心
// 不偏移时偶数帧的条带边界恰在柱镜中心, 正对会在两帧间抖动
export const STRIP_OFFSET = (viewCount: number): number => 0.5 / viewCount;

// 打印面位置 x(mm) 落在第几帧的条带
export const frameAtPrint = (x: number, pitchMm: number, viewCount: number): number => {
  const phase = ((x / pitchMm + STRIP_OFFSET(viewCount)) % 1 + 1) % 1;
  return Math.min(viewCount - 1, Math.floor(phase * viewCount));
};

// 视角 theta 下主光线看到的帧(主光线穿过柱镜中心顶点)
export const frameAtView = (
  theta: number,
  geom: LensGeom,
  viewCount: number,
): number => frameAtPrint(viewToPrint(theta, geom.pitchMm / 2, geom), geom.pitchMm, viewCount);
