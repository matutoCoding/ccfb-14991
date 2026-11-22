// 模块冒烟测试: 全部可导入, 顶层无副作用崩溃
const modules = [
  "../src/types.ts",
  "../src/lib/format.ts",
  "../src/core/lens.ts",
  "../src/core/interlace.ts",
  "../src/core/crosstalk.ts",
  "../src/core/depth_views.ts",
  "../src/core/tiff_writer.ts",
  "../src/core/calibration.ts",
  "../src/core/test_assets.ts",
  "../src/gl/preview_renderer.ts",
  "../src/ui.ts",
  "../src/db.ts",
  "../src/pages/shared.ts",
  "../src/pages/projects_page.ts",
  "../src/pages/lenses_page.ts",
  "../src/pages/frames_page.ts",
  "../src/pages/output_page.ts",
  "../src/pages/preview_page.ts",
  "../src/pages/proofs_page.ts",
];

let failed = 0;
for (const m of modules) {
  try {
    await import(m);
    console.log(`  ok  ${m}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${m}: ${e}`);
  }
}
console.log(failed === 0 ? "全部模块可导入" : `${failed} 个模块导入失败`);
if (failed > 0) process.exit(1);
