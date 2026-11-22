// WebGL2 视角预览渲染器: 逐像素光线追迹柱镜, 采样交错图纹理
// 鬼影来自观察孔径内多光线平均, 摩尔纹来自柱镜倾斜角

import type { LensGeom } from "../core/lens.ts";

export interface PreviewParams {
  geom: LensGeom;
  widthMm: number;
  heightMm: number;
  thetaDeg: number; // 观察角
  apertureDeg: number; // 有效角孔径(全宽)
  tiltDeg: number; // 光栅片贴歪角度
  samples: number; // 每像素光线数
}

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPrint;
uniform vec2 uSizeMm;
uniform float uPitch;
uniform float uThickness;
uniform float uRadius;
uniform float uIndex;
uniform float uTilt;
uniform float uTheta;
uniform float uAperture;
uniform int uSamples;
in vec2 vUv;
out vec4 frag;

// 与 src/core/lens.ts traceRay 相同的光线追迹
float traceXP(float theta, float xc) {
  float s = clamp(xc / uRadius, -0.9999, 0.9999);
  float alpha = asin(s);
  float thetaT = asin(sin(theta + alpha) / uIndex);
  float beta = thetaT - alpha;
  float zs = uThickness - uRadius + sqrt(uRadius * uRadius - xc * xc);
  return xc + zs * tan(beta);
}

void main() {
  vec2 mm = vec2(vUv.x * uSizeMm.x, (1.0 - vUv.y) * uSizeMm.y);
  float c = cos(uTilt);
  float sn = sin(uTilt);
  // 柱镜坐标系(贴歪 tilt 角)
  vec2 rot = vec2(c * mm.x + sn * mm.y, -sn * mm.x + c * mm.y);
  float L = floor(rot.x / uPitch);
  float xc = rot.x - (L + 0.5) * uPitch;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uSamples) break;
    float f = uSamples > 1 ? float(i) / float(uSamples - 1) - 0.5 : 0.0;
    float th = uTheta + f * uAperture;
    float xp = (L + 0.5) * uPitch + traceXP(th, xc);
    // 逆旋转回打印纹理坐标
    vec2 texMm = vec2(c * xp - sn * rot.y, sn * xp + c * rot.y);
    vec2 uv = vec2(texMm.x / uSizeMm.x, 1.0 - texMm.y / uSizeMm.y);
    acc += texture(uPrint, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  }
  frag = vec4(acc / float(uSamples), 1.0);
}`;

export class PreviewRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private uni: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) throw new Error("需要 WebGL2 支持");
    this.gl = gl;
    this.program = this.buildProgram();
    const tex = gl.createTexture();
    if (!tex) throw new Error("纹理创建失败");
    this.texture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const name of ["uPrint", "uSizeMm", "uPitch", "uThickness", "uRadius", "uIndex", "uTilt", "uTheta", "uAperture", "uSamples"]) {
      this.uni[name] = gl.getUniformLocation(this.program, name);
    }
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`着色器编译失败: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`着色器链接失败: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  setPrint(img: ImageData | HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  render(p: PreviewParams): void {
    const gl = this.gl;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const hPx = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== hPx) {
      this.canvas.width = w;
      this.canvas.height = hPx;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform1i(this.uni.uPrint, 0);
    gl.uniform2f(this.uni.uSizeMm, p.widthMm, p.heightMm);
    gl.uniform1f(this.uni.uPitch, p.geom.pitchMm);
    gl.uniform1f(this.uni.uThickness, p.geom.thicknessMm);
    gl.uniform1f(this.uni.uRadius, p.geom.radiusMm);
    gl.uniform1f(this.uni.uIndex, p.geom.refractiveIndex);
    gl.uniform1f(this.uni.uTilt, (p.tiltDeg * Math.PI) / 180);
    gl.uniform1f(this.uni.uTheta, (p.thetaDeg * Math.PI) / 180);
    gl.uniform1f(this.uni.uAperture, (p.apertureDeg * Math.PI) / 180);
    gl.uniform1i(this.uni.uSamples, Math.max(1, Math.min(24, p.samples)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
