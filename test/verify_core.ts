// 核心几何/交错/串扰验证: node test/verify_core.ts
// 全部断言不依赖浏览器 API

// ImageData 垫片(node 环境没有)
class ImageDataShim {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}
(globalThis as Record<string, unknown>).ImageData ??= ImageDataShim;

const { traceRay, viewToPrint, frameAtPrint, lpiToPitchMm, pitchPx } = await import(
  "../src/core/lens.ts"
);
const { frameForColumn, interlace, interlaceSize } = await import("../src/core/interlace.ts");
const { crosstalkFromFootprint, crosstalkAtAngle } = await import("../src/core/crosstalk.ts");
const { makeCalibrationImage, solveActualPitch } = await import("../src/core/calibration.ts");
const { encodeTiff } = await import("../src/core/tiff_writer.ts");
const { generateViews } = await import("../src/core/depth_views.ts");

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// 75LPI 预设: t = nR/(n-1) 时打印面恰在焦点
const n = 1.55;
const t = 0.46;
const R = (t * (n - 1)) / n;
const geom = { pitchMm: lpiToPitchMm(75), thicknessMm: t, radiusMm: R, refractiveIndex: n };

console.log("-- 光线追迹 --");
{
  const th = 0.001;
  const xp = traceRay(th, 0, geom);
  check("近轴: xc=0 落点 ≈ t*θ/n", near(xp, (t * th) / n, 1e-6), `xp=${xp}`);
}
{
  // 聚焦: 近轴区(|xc|<0.3R)平行光汇聚到柱镜中心
  // 注意: 球面柱镜大孔径有球差, 全孔径不严格聚焦是物理事实
  let maxErr = 0;
  for (let i = -10; i <= 10; i++) {
    const xc = (i / 10) * R * 0.3;
    maxErr = Math.max(maxErr, Math.abs(traceRay(0, xc, geom)));
  }
  check("聚焦: θ=0 近轴落点≈0", maxErr < 0.002, `maxErr=${maxErr}`);
}
{
  // 正对时柱镜中央 60% 孔径内看到的都是同一帧
  const frames = new Set<number>();
  for (let i = -20; i <= 20; i++) {
    const u = geom.pitchMm / 2 + (i / 20) * (geom.pitchMm / 2) * 0.6;
    frames.add(frameAtPrint(viewToPrint(0, u, geom), geom.pitchMm, 4));
  }
  check("正对: 中央孔径只见一帧", frames.size === 1, [...frames].join(","));
}

console.log("-- 交错 --");
{
  // 整数节距 4px, 2 帧, 半条带偏移: 条带中心对准柱镜中心(x=0,4 为柱镜中心)
  // 边界在 x=1,3,5,7 -> [0,1,1,0,0,1,1,0]
  const expect = [0, 1, 1, 0, 0, 1, 1, 0];
  const got = expect.map((_, x) => frameForColumn(x, 4, 2));
  check("整数节距取帧", got.every((v, i) => v === expect[i]), got.join(","));
}
{
  // 非整数节距 3.5, 2 帧: 相位 = x/3.5 + 0.25
  // x=0(0.25->0) x=1(0.536->1) x=2(0.821->1) x=3(1.107->0) x=4(1.393->0)
  const got = [0, 1, 2, 3, 4].map((x) => frameForColumn(x, 3.5, 2));
  check("非整数节距取帧", got.join(",") === "0,1,1,0,0", got.join(","));
}
{
  // 交错输出像素核对: 帧0 全黑, 帧1 全白, 节距 4
  const black = new ImageData(8, 2);
  const white = new ImageData(8, 2);
  white.data.fill(255);
  const size = { widthPx: 8, heightPx: 2, pitch: 4, lenticules: 2, integer: true };
  const out = interlace([black, white], size);
  const cols = [0, 1, 2, 3, 4, 5, 6, 7].map((x) => out.data[x * 4]);
  check("交错图黑白列", cols.join(",") === "0,255,255,0,0,255,255,0", cols.join(","));
}
{
  const s = interlaceSize({ dpi: 600, lpi: 75, widthMm: 25.4 * 4, heightMm: 25.4 * 3, viewCount: 2 });
  check("尺寸: 节距=8 整数", s.pitch === 8 && s.integer, `pitch=${s.pitch}`);
  check("尺寸: 宽度=柱镜数*节距", s.widthPx === 300 * 8, `w=${s.widthPx}`);
  const s2 = interlaceSize({ dpi: 720, lpi: 75, widthMm: 25.4, heightMm: 25.4, viewCount: 2 });
  check("尺寸: 720dpi/75lpi 非整数", !s2.integer && near(s2.pitch, 9.6, 1e-9));
}

console.log("-- 串扰(手算对照) --");
{
  // P=1, N=2, 半条带偏移: 条带0 [-0.25,0.25)∪[0.75,1.25), 条带1 [0.25,0.75)
  check("足迹全在理想条带内", crosstalkFromFootprint(0.1, 0.2, 1, 2, 0) === 0);
  check("足迹 [0.1,0.3] 理想帧0", near(crosstalkFromFootprint(0.1, 0.3, 1, 2, 0), 0.25, 1e-12));
  check("足迹 [0.4,0.6] 理想帧1", crosstalkFromFootprint(0.4, 0.6, 1, 2, 1) === 0);
  check("负坐标 [-0.3,-0.1] 理想帧0", near(crosstalkFromFootprint(-0.3, -0.1, 1, 2, 0), 0.25, 1e-12));
  check("跨周期 [0.9,1.2] 理想帧0", crosstalkFromFootprint(0.9, 1.2, 1, 2, 0) === 0);
}
{
  // 视角 10°, 零孔径 -> 串扰 0; 帧号手算
  const theta = (10 * Math.PI) / 180;
  const xp = t * Math.tan(Math.asin(Math.sin(theta) / n));
  const kExpect = Math.floor((((xp / geom.pitchMm + 0.25) % 1) + 1) % 1 * 2);
  const ct = crosstalkAtAngle(theta, 0, geom, 2);
  check("零孔径串扰=0", ct === 0, `ct=${ct}`);
  check("手算帧号一致", kExpect === frameAtPrint(xp, geom.pitchMm, 2));
}
{
  // 对称性
  const a = crosstalkAtAngle(0.2, 0.02, geom, 3);
  const b = crosstalkAtAngle(-0.2, 0.02, geom, 3);
  check("串扰曲线左右对称", near(a, b, 1e-9), `${a} vs ${b}`);
}

console.log("-- 校准 --");
{
  const p = { dpi: 600, baseLpi: 75, bandCount: 11, stepPct: 0.1, widthMm: 100, bandHeightMm: 10 };
  const r = makeCalibrationImage(p);
  check("条带数=11", r.pitches.length === 11);
  check("中间条带=标称节距", near(r.pitches[5], 8, 1e-9), `p=${r.pitches[5]}`);
  const s = solveActualPitch(p, 7);
  check("条带7 解算线数", near(s.lpi, 75 * 1.002, 1e-9), `lpi=${s.lpi}`);
  check("解算节距=dpi/lpi", near(s.pitchPx, 600 / s.lpi, 1e-9));
}

console.log("-- TIFF --");
{
  const img = new ImageData(3, 2);
  img.data.fill(128);
  const buf = encodeTiff(img, 600);
  const dv = new DataView(buf);
  check("头: II*", dv.getUint8(0) === 0x49 && dv.getUint16(2, true) === 42);
  const ifd = dv.getUint32(4, true);
  check("IFD 在像素数据之后", ifd >= 8 + 3 * 2 * 3);
  check("宽度标签", dv.getUint32(ifd + 2 + 0 * 12 + 8, true) === 3);
  check("像素数据从偏移 8 开始", dv.getUint8(8) === 128 && dv.getUint8(9) === 128);
}

console.log("-- 深度多视点 --");
{
  // 平坦深度=参考深度 -> 所有视点与原图一致
  const color = new ImageData(16, 16);
  for (let i = 0; i < 16 * 16; i++) {
    color.data[i * 4] = (i * 7) % 256;
    color.data[i * 4 + 3] = 255;
  }
  const depth = new ImageData(16, 16);
  for (let i = 0; i < 16 * 16; i++) {
    depth.data[i * 4] = 128;
    depth.data[i * 4 + 3] = 255;
  }
  const views = generateViews(color, depth, 4, {
    layers: 4,
    strength: 8,
    refDepth: 128 / 255,
    gamma: 1,
    smooth: 0,
  });
  check("生成 4 个视点", views.length === 4);
  const same = views.every((v) => {
    for (let i = 0; i < 16 * 16; i++) {
      if (v.data[i * 4] !== color.data[i * 4]) return false;
    }
    return true;
  });
  check("零视差深度 -> 视点无位移", same);
}
{
  // 近处白点(深度1)在中间视点间应平移
  const color = new ImageData(32, 8);
  for (let i = 0; i < 32 * 8; i++) color.data[i * 4 + 3] = 255;
  const dot = (4 * 32 + 16) * 4;
  color.data[dot] = 255;
  const depth = new ImageData(32, 8);
  depth.data[dot] = 255;
  depth.data[dot + 3] = 255;
  for (let i = 0; i < 32 * 8; i++) if (depth.data[i * 4 + 3] === 0) depth.data[i * 4 + 3] = 255;
  const views = generateViews(color, depth, 3, {
    layers: 4,
    strength: 8,
    refDepth: 0,
    gamma: 1,
    smooth: 0,
  });
  const findX = (v: ImageData) => {
    for (let x = 0; x < 32; x++) if (v.data[(4 * 32 + x) * 4] > 200) return x;
    return -1;
  };
  const xs = views.map(findX);
  check("近点随视点平移", xs[0] < 16 && xs[2] > 16 && xs[0] < xs[1] && xs[1] < xs[2], xs.join(","));
}

console.log(`\n${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
