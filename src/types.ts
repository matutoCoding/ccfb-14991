// 全局类型定义

export type ProjectType = "flip" | "animation" | "stereo";

export interface Project {
  id: string;
  name: string;
  customer: string;
  type: ProjectType;
  lensId: string;
  dpi: number;
  widthMm: number;
  heightMm: number;
  viewCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Frame {
  id: string;
  projectId: string;
  order: number;
  viewStart: number; // 视角范围起点(度)
  viewEnd: number; // 视角范围终点(度)
  width: number;
  height: number;
  blob: Blob;
}

// 帧的存储形式(blob 分离存取太大时直接放一起也行,这里合在一起)
export type FrameRecord = Frame;

export interface LensSpec {
  id: string;
  name: string;
  lpi: number; // 线数 线/英寸
  refractiveIndex: number; // 折射率
  thicknessMm: number; // 基材厚度 mm
  radiusMm: number; // 柱镜半径 mm
  builtin: boolean;
}

export interface ProofRecord {
  id: string;
  projectId: string;
  customer: string;
  date: number;
  lensId: string;
  dpi: number;
  pitchPx: number; // 打印时节距(像素/柱镜)
  calibratedLpi: number; // 校准后实际线数
  bandIndex: number; // 校准看清楚的条带号,-1 表示未走校准页
  result: "pass" | "ghosting" | "jump" | "reject" | "pending";
  notes: string;
  photoBlob: Blob | null;
}

export interface DepthConfig {
  layers: number; // 分层数
  strength: number; // 视差强度(像素,最大位移)
  refDepth: number; // 零视差参考深度 0..1
  gamma: number; // 深度曲线
  smooth: number; // 深度图平滑半径
}

export const DEFAULT_DEPTH_CONFIG: DepthConfig = {
  layers: 8,
  strength: 24,
  refDepth: 0.5,
  gamma: 1,
  smooth: 2,
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  flip: "变图",
  animation: "动画",
  stereo: "立体",
};
