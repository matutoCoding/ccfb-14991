# 光栅卡交错工作室

浏览器里的光栅卡(lenticular)交错与预览系统: TypeScript + WebGL2 自写着色器, 数据全部存 IndexedDB, 无后端。

## 启动

```bash
pnpm install
pnpm dev        # 开发
pnpm build      # 类型检查 + 构建
pnpm verify     # 核心几何/交错/串扰的 node 验证(28 项断言, 不依赖浏览器)
```

## 页面

- **项目列表**: 变图 / 动画 / 立体三类, 记客户名方便校准复用
- **素材帧**: 排序 / 替换 / 每帧视角范围; 立体项目可从彩图+深度图分层生成多视点(空洞修补+边缘撕裂处理); 内置测试素材(文字变图 3 帧 / 8 帧弹跳动画 / 带深度的立体场景)
- **光栅片库**: 线数 / 折射率 / 厚度 / 柱镜半径建档, 内置 40/60/75/100/161 LPI 五种规格, 编辑时提示聚焦条件 t=nR/(n-1)
- **交错输出**: 按 DPI 和线数生成交错图, 节距非整数时按实际节距重采样, 导出 PNG / TIFF
- **视角预览**: WebGL2 逐像素光线追迹柱镜, 拖动改观察角, 鬼影(角孔径多光线平均)和摩尔纹(贴歪角)实时可见; 串扰曲线标出鬼影严重区间
- **打样记录**: 试印参数留档; 节距测试条生成与解算; 同客户校准节距一键复用

## 几何模型(可手算核对)

坐标: 打印面 z=0, 柱镜轴向沿 Y, 顶点在 z=t, 曲率半径 R, 折射率 n。

单根光线(`src/core/lens.ts` 的 `traceRay`):

```
alpha  = asin(xc / R)              // 表面法线倾角
thetaT = asin(sin(theta+alpha)/n)  // 斯涅尔折射
beta   = thetaT - alpha            // 片内光线角
zs     = t - R + sqrt(R^2 - xc^2)  // 表面矢高
xp     = xc + zs * tan(beta)       // 打印面落点
```

近轴: `xp ≈ xc + t*theta/n`。厚度满足 `t = nR/(n-1)` 时打印面在焦点。

交错取帧含**半条带偏移**(`STRIP_OFFSET = 0.5/N`), 让柱镜中心对准条带中心, 否则偶数帧时条带边界恰在柱镜中心, 正对会在两帧间抖动。交错(`frameForColumn`)、预览着色器、串扰(`frameAtPrint`)三处共用同一公式。

串扰(足迹重叠法, `src/core/crosstalk.ts`):

```
足迹 = [xp(theta-a/2), xp(theta+a/2)]   // a 为有效角孔径
串扰 = 足迹落在非理想帧条带内的长度 / 足迹总长   // 解析解, 非采样
```

## 目录

```
src/core/    纯几何与图像算法(可用 node 直接验证)
src/gl/      WebGL2 预览渲染器
src/pages/   六个页面
test/        verify_core.ts(28 项断言) + smoke_imports.ts
```
