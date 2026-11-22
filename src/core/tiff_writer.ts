// 最小 TIFF 编码器: 小端, 非压缩, RGB 8bit, 单条带
// 印厂流程里 TIFF 用于无损交付 RIP

const TAG_SHORT = 3;
const TAG_LONG = 4;
const TAG_RATIONAL = 5;

interface TiffTag {
  tag: number;
  type: number;
  count: number;
  value: number; // 值或偏移
}

export const encodeTiff = (img: ImageData, dpi: number): ArrayBuffer => {
  const w = img.width;
  const h = img.height;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = img.data[i * 4];
    rgb[i * 3 + 1] = img.data[i * 4 + 1];
    rgb[i * 3 + 2] = img.data[i * 4 + 2];
  }

  const headerSize = 8;
  const pixelOffset = headerSize;
  const pixelBytes = rgb.length;
  // IFD 里的额外数据: BitsPerSample(3*SHORT=6B) + X/YResolution(各 8B)
  const bitsOffset = pixelOffset + pixelBytes;
  const xResOffset = bitsOffset + 6;
  const yResOffset = xResOffset + 8;
  const ifdOffset = yResOffset + 8;

  const tags: TiffTag[] = [
    { tag: 256, type: TAG_LONG, count: 1, value: w }, // ImageWidth
    { tag: 257, type: TAG_LONG, count: 1, value: h }, // ImageLength
    { tag: 258, type: TAG_SHORT, count: 3, value: bitsOffset }, // BitsPerSample
    { tag: 259, type: TAG_SHORT, count: 1, value: 1 }, // Compression: none
    { tag: 262, type: TAG_SHORT, count: 1, value: 2 }, // Photometric: RGB
    { tag: 273, type: TAG_LONG, count: 1, value: pixelOffset }, // StripOffsets
    { tag: 277, type: TAG_SHORT, count: 1, value: 3 }, // SamplesPerPixel
    { tag: 278, type: TAG_LONG, count: 1, value: h }, // RowsPerStrip
    { tag: 279, type: TAG_LONG, count: 1, value: pixelBytes }, // StripByteCounts
    { tag: 282, type: TAG_RATIONAL, count: 1, value: xResOffset }, // XResolution
    { tag: 283, type: TAG_RATIONAL, count: 1, value: yResOffset }, // YResolution
    { tag: 284, type: TAG_SHORT, count: 1, value: 1 }, // PlanarConfiguration
    { tag: 296, type: TAG_SHORT, count: 1, value: 2 }, // ResolutionUnit: inch
  ];
  tags.sort((a, b) => a.tag - b.tag);

  const ifdBytes = 2 + tags.length * 12 + 4;
  const buf = new ArrayBuffer(ifdOffset + ifdBytes);
  const dv = new DataView(buf);
  // 头: II + 42 + IFD 偏移
  dv.setUint8(0, 0x49);
  dv.setUint8(1, 0x49);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOffset, true);
  new Uint8Array(buf, pixelOffset, pixelBytes).set(rgb);
  // BitsPerSample = 8,8,8
  dv.setUint16(bitsOffset, 8, true);
  dv.setUint16(bitsOffset + 2, 8, true);
  dv.setUint16(bitsOffset + 4, 8, true);
  // 分辨率
  dv.setUint32(xResOffset, dpi, true);
  dv.setUint32(xResOffset + 4, 1, true);
  dv.setUint32(yResOffset, dpi, true);
  dv.setUint32(yResOffset + 4, 1, true);
  // IFD
  dv.setUint16(ifdOffset, tags.length, true);
  tags.forEach((t, i) => {
    const o = ifdOffset + 2 + i * 12;
    dv.setUint16(o, t.tag, true);
    dv.setUint16(o + 2, t.type, true);
    dv.setUint32(o + 4, t.count, true);
    if (t.type === TAG_SHORT && t.count === 1) {
      dv.setUint16(o + 8, t.value, true);
    } else {
      dv.setUint32(o + 8, t.value, true);
    }
  });
  dv.setUint32(ifdOffset + 2 + tags.length * 12, 0, true);
  return buf;
};
