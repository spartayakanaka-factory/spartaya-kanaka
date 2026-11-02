/** Identify supported raster bytes without renaming or re-encoding preserved originals. */
export function imageContentType(bytes: Uint8Array): string | null {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "image/png";
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && text(4, 8) === "ftyp") {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size >= 16 && size <= bytes.length && size <= 4096) {
      if (["avif", "avis"].includes(text(8, 12))) return "image/avif";
      for (let i = 16; i + 4 <= size; i += 4)
        if (["avif", "avis"].includes(text(i, i + 4))) return "image/avif";
    }
  }
  return null;
}
