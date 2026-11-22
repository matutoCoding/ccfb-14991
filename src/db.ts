// IndexedDB 存储: projects / frames / lenses / proofs

import type { Frame, LensSpec, Project, ProofRecord } from "./types.ts";

const DB_NAME = "lenticular-studio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("frames")) {
        const s = db.createObjectStore("frames", { keyPath: "id" });
        s.createIndex("projectId", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains("lenses")) db.createObjectStore("lenses", { keyPath: "id" });
      if (!db.objectStoreNames.contains("proofs")) {
        const s = db.createObjectStore("proofs", { keyPath: "id" });
        s.createIndex("projectId", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const tx = async <T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const listStore = async <T>(store: string): Promise<T[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
};

const listByIndex = async <T>(store: string, index: string, key: string): Promise<T[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).index(index).getAll(key);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
};

export const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// 项目
export const listProjects = () => listStore<Project>("projects");
export const getProject = (id: string) => tx<Project | undefined>("projects", "readonly", (s) => s.get(id));
export const putProject = (p: Project) => tx("projects", "readwrite", (s) => s.put(p));
export const deleteProject = async (id: string): Promise<void> => {
  await tx("projects", "readwrite", (s) => s.delete(id));
  const frames = await listFrames(id);
  for (const f of frames) await tx("frames", "readwrite", (s) => s.delete(f.id));
  const proofs = await listProofs(id);
  for (const p of proofs) await tx("proofs", "readwrite", (s) => s.delete(p.id));
};

// 帧
export const listFrames = async (projectId: string): Promise<Frame[]> => {
  const frames = await listByIndex<Frame>("frames", "projectId", projectId);
  return frames.sort((a, b) => a.order - b.order);
};
export const putFrame = (f: Frame) => tx("frames", "readwrite", (s) => s.put(f));
export const deleteFrame = (id: string) => tx("frames", "readwrite", (s) => s.delete(id));

// 光栅片
export const listLenses = () => listStore<LensSpec>("lenses");
export const getLens = (id: string) => tx<LensSpec | undefined>("lenses", "readonly", (s) => s.get(id));
export const putLens = (l: LensSpec) => tx("lenses", "readwrite", (s) => s.put(l));
export const deleteLens = (id: string) => tx("lenses", "readwrite", (s) => s.delete(id));

// 打样记录
export const listProofs = (projectId: string) => listByIndex<ProofRecord>("proofs", "projectId", projectId);
export const putProof = (p: ProofRecord) => tx("proofs", "readwrite", (s) => s.put(p));
export const deleteProof = (id: string) => tx("proofs", "readwrite", (s) => s.delete(id));

// 内置常用光栅片规格(厚度与半径满足聚焦条件 t = nR/(n-1))
const BUILTIN_LENSES: Omit<LensSpec, "id">[] = [
  { name: "40 LPI 厚片(立体)", lpi: 40, refractiveIndex: 1.55, thicknessMm: 1.2, radiusMm: 0.426, builtin: true },
  { name: "60 LPI 中厚(立体/变图)", lpi: 60, refractiveIndex: 1.55, thicknessMm: 0.6, radiusMm: 0.213, builtin: true },
  { name: "75 LPI 常用(变图)", lpi: 75, refractiveIndex: 1.55, thicknessMm: 0.46, radiusMm: 0.163, builtin: true },
  { name: "100 LPI 薄片(动画)", lpi: 100, refractiveIndex: 1.55, thicknessMm: 0.35, radiusMm: 0.124, builtin: true },
  { name: "161 LPI 超薄片(高精度)", lpi: 161, refractiveIndex: 1.55, thicknessMm: 0.24, radiusMm: 0.085, builtin: true },
];

export const seedBuiltinLenses = async (): Promise<void> => {
  const existing = await listLenses();
  if (existing.length > 0) return;
  for (const l of BUILTIN_LENSES) {
    await putLens({ ...l, id: uid() });
  }
};
