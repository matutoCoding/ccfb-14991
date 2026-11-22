// 内置测试素材: 文字变图 / 8 帧动画 / 带深度的立体图
// 全部用 canvas 程序化生成, 方便客户没有图时直接试流程

const makeCanvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext("2d")!];
};

const toImageData = (canvas: HTMLCanvasElement): ImageData =>
  canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);

// 文字变图: 3 帧大字
export const textFlipFrames = (w = 900, h = 600): ImageData[] => {
  const specs: [string, string, string][] = [
    ["#1e3a8a", "#fbbf24", "新品上市"],
    ["#7c2d12", "#fde68a", "限时特惠"],
    ["#14532d", "#a7f3d0", "立即抢购"],
  ];
  return specs.map(([bg, fg, text], i) => {
    const [canvas, ctx] = makeCanvas(w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // 背景斜纹
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 24;
    for (let x = -h; x < w + h; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x + i * 12, 0);
      ctx.lineTo(x + h + i * 12, h);
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.font = `600 ${Math.round(h * 0.28)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 - h * 0.04);
    ctx.font = `500 ${Math.round(h * 0.07)}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`LENTICULAR DEMO ${i + 1} / ${specs.length}`, w / 2, h * 0.82);
    return toImageData(canvas);
  });
};

// 8 帧小动画: 小球弹跳 + 星星旋转
export const animationFrames = (w = 900, h = 600): ImageData[] => {
  const frames: ImageData[] = [];
  for (let i = 0; i < 8; i++) {
    const [canvas, ctx] = makeCanvas(w, h);
    const t = i / 8;
    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#334155");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // 地面
    ctx.fillStyle = "#475569";
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    // 星星(旋转)
    ctx.save();
    ctx.translate(w * 0.8, h * 0.22);
    ctx.rotate(t * Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    for (let s = 0; s < 5; s++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, -46);
      ctx.lineTo(-10, -46);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // 弹跳小球(抛物线 + 压扁)
    const phase = (t * 2) % 1;
    const bounceY = Math.abs(Math.sin(phase * Math.PI));
    const bx = w * (0.15 + 0.7 * t);
    const by = h * 0.8 - bounceY * h * 0.5;
    const squash = 1 + 0.35 * Math.max(0, 1 - bounceY * 4);
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(squash, 1 / squash);
    const ballGrad = ctx.createRadialGradient(-12, -12, 6, 0, 0, 52);
    ballGrad.addColorStop(0, "#fca5a5");
    ballGrad.addColorStop(1, "#dc2626");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(0, -48, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 帧号
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "500 28px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${i + 1} / 8`, 24, 48);
    frames.push(toImageData(canvas));
  }
  return frames;
};

// 立体场景: 彩图 + 深度图(近白远黑)
export const stereoScene = (w = 800, h = 500): { color: ImageData; depth: ImageData } => {
  const [cCanvas, c] = makeCanvas(w, h);
  const [dCanvas, d] = makeCanvas(w, h);
  d.fillStyle = "#000";
  d.fillRect(0, 0, w, h);
  // 天空(最远)
  const sky = c.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, "#7dd3fc");
  sky.addColorStop(1, "#e0f2fe");
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const layer = (depth: number, draw: () => void, depthDraw: () => void) => {
    const g = Math.round(depth * 255);
    d.fillStyle = `rgb(${g},${g},${g})`;
    depthDraw();
    draw();
  };
  // 远山 depth 0.15
  layer(0.15, () => {
    c.fillStyle = "#94a3b8";
    c.beginPath();
    c.moveTo(0, h * 0.62);
    c.lineTo(w * 0.25, h * 0.3);
    c.lineTo(w * 0.5, h * 0.62);
    c.lineTo(w * 0.72, h * 0.38);
    c.lineTo(w, h * 0.62);
    c.closePath();
    c.fill();
  }, () => {
    d.beginPath();
    d.moveTo(0, h * 0.62);
    d.lineTo(w * 0.25, h * 0.3);
    d.lineTo(w * 0.5, h * 0.62);
    d.lineTo(w * 0.72, h * 0.38);
    d.lineTo(w, h * 0.62);
    d.lineTo(w, h);
    d.lineTo(0, h);
    d.closePath();
    d.fill();
  });
  // 草地 depth 0.35
  layer(0.35, () => {
    c.fillStyle = "#4ade80";
    c.fillRect(0, h * 0.62, w, h * 0.38);
  }, () => {
    d.fillRect(0, h * 0.62, w, h * 0.38);
  });
  // 树 depth 0.6
  const tree = (x: number, s: number) => {
    layer(0.6, () => {
      c.fillStyle = "#78350f";
      c.fillRect(x - 8 * s, h * 0.62 - 70 * s, 16 * s, 70 * s);
      c.fillStyle = "#166534";
      c.beginPath();
      c.arc(x, h * 0.62 - 92 * s, 44 * s, 0, Math.PI * 2);
      c.fill();
    }, () => {
      d.fillRect(x - 8 * s, h * 0.62 - 70 * s, 16 * s, 70 * s);
      d.beginPath();
      d.arc(x, h * 0.62 - 92 * s, 44 * s, 0, Math.PI * 2);
      d.fill();
    });
  };
  tree(w * 0.22, 1);
  tree(w * 0.75, 0.8);
  // 前景花 depth 0.9
  const flower = (x: number, y: number, r: number, color: string) => {
    layer(0.9, () => {
      c.fillStyle = color;
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        c.beginPath();
        c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#fef08a";
      c.beginPath();
      c.arc(x, y, r * 0.55, 0, Math.PI * 2);
      c.fill();
    }, () => {
      d.beginPath();
      d.arc(x, y, r * 1.9, 0, Math.PI * 2);
      d.fill();
    });
  };
  flower(w * 0.15, h * 0.85, 26, "#f472b6");
  flower(w * 0.45, h * 0.9, 32, "#fb923c");
  flower(w * 0.85, h * 0.82, 24, "#a78bfa");
  // 太阳 depth 0.05
  layer(0.05, () => {
    c.fillStyle = "#fde047";
    c.beginPath();
    c.arc(w * 0.85, h * 0.15, 40, 0, Math.PI * 2);
    c.fill();
  }, () => {
    d.beginPath();
    d.arc(w * 0.85, h * 0.15, 40, 0, Math.PI * 2);
    d.fill();
  });
  return { color: toImageData(cCanvas), depth: toImageData(dCanvas) };
};
