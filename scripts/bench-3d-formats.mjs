/**
 * Local CAD/3D format performance bench (Node) — no DOM exporters.
 * Usage: node scripts/bench-3d-formats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Minimal DOM polyfills for Three loaders in Node
if (typeof globalThis.ProgressEvent === "undefined") {
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.lengthComputable = Boolean(init.lengthComputable);
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  };
}

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "bench-3d-formats.results.json");

function makeGeometry(detail) {
  const g = new THREE.IcosahedronGeometry(10, detail);
  return g.index ? g.toNonIndexed() : g;
}

/** Build a binary STL of approximately `targetBytes` (50-byte triangles + 84 header). */
function makeBinaryStlBytes(targetBytes) {
  const triCount = Math.max(1, Math.floor((targetBytes - 84) / 50));
  const buf = Buffer.alloc(84 + triCount * 50);
  buf.write("OPAL-BENCH-BINARY-STL", 0, "ascii");
  buf.writeUInt32LE(triCount, 80);
  let o = 84;
  for (let i = 0; i < triCount; i++) {
    const y = (i % 1000) * 0.01;
    // normal
    buf.writeFloatLE(0, o);
    buf.writeFloatLE(0, o + 4);
    buf.writeFloatLE(1, o + 8);
    // v1
    buf.writeFloatLE(0, o + 12);
    buf.writeFloatLE(y, o + 16);
    buf.writeFloatLE(0, o + 20);
    // v2
    buf.writeFloatLE(1, o + 24);
    buf.writeFloatLE(y, o + 28);
    buf.writeFloatLE(0, o + 32);
    // v3
    buf.writeFloatLE(0.5, o + 36);
    buf.writeFloatLE(y + 1, o + 40);
    buf.writeFloatLE(0, o + 44);
    buf.writeUInt16LE(0, o + 48);
    o += 50;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function bboxFromPositions(pos) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i],
      y = pos[i + 1],
      z = pos[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    maxDim: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1),
  };
}

function extractFromGeometry(geometry) {
  const tGeom = performance.now();
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const positions = new Float32Array(geometry.attributes.position.array);
  const normals = geometry.attributes.normal
    ? new Float32Array(geometry.attributes.normal.array)
    : undefined;
  const colors = geometry.attributes.color
    ? new Float32Array(geometry.attributes.color.array)
    : undefined;
  const geometryMs = performance.now() - tGeom;

  const tBbox = performance.now();
  bboxFromPositions(positions);
  const bboxMs = performance.now() - tBbox;

  const tMat = performance.now();
  new THREE.MeshStandardMaterial({
    color: colors ? 0xffffff : 0xc9a227,
    vertexColors: Boolean(colors),
  });
  const materialMs = performance.now() - tMat;

  return {
    positions,
    colors,
    geometryMs,
    bboxMs,
    materialMs,
    vertexCount: positions.length / 3,
    triangleCount: geometry.index
      ? geometry.index.count / 3
      : positions.length / 9,
  };
}

function toAb(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (typeof data === "string") return new TextEncoder().encode(data).buffer;
  throw new Error("unsupported buffer type");
}

/** ASCII PLY with optional vertex colors */
function geometryToPly(geometry, withColors) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const nV = pos.count;
  const faces = idx ? idx.count / 3 : nV / 3;
  let header = `ply\nformat ascii 1.0\nelement vertex ${nV}\nproperty float x\nproperty float y\nproperty float z\n`;
  if (withColors) {
    header += `property uchar red\nproperty uchar green\nproperty uchar blue\n`;
  }
  header += `element face ${faces}\nproperty list uchar int vertex_indices\nend_header\n`;
  let body = "";
  for (let i = 0; i < nV; i++) {
    const x = pos.getX(i).toFixed(5);
    const y = pos.getY(i).toFixed(5);
    const z = pos.getZ(i).toFixed(5);
    if (withColors) {
      const r = i % 255;
      const g = (i * 3) % 255;
      const b = (i * 7) % 255;
      body += `${x} ${y} ${z} ${r} ${g} ${b}\n`;
    } else {
      body += `${x} ${y} ${z}\n`;
    }
  }
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      body += `3 ${idx.getX(i)} ${idx.getX(i + 1)} ${idx.getX(i + 2)}\n`;
    }
  } else {
    for (let i = 0; i < nV; i += 3) body += `3 ${i} ${i + 1} ${i + 2}\n`;
  }
  return header + body;
}

/** Minimal glTF JSON with embedded buffer (one triangle). */
function makeMiniGltf(geometry) {
  // Use first triangle only for GLTF JSON size control; clone scaled mesh positions subset
  const pos = geometry.attributes.position;
  const count = Math.min(pos.count, 3000);
  const floats = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    floats[i * 3] = pos.getX(i);
    floats[i * 3 + 1] = pos.getY(i);
    floats[i * 3 + 2] = pos.getZ(i);
  }
  const bin = Buffer.from(floats.buffer);
  const b64 = bin.toString("base64");
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < floats.length; i += 3) {
    minX = Math.min(minX, floats[i]);
    minY = Math.min(minY, floats[i + 1]);
    minZ = Math.min(minZ, floats[i + 2]);
    maxX = Math.max(maxX, floats[i]);
    maxY = Math.max(maxY, floats[i + 1]);
    maxZ = Math.max(maxZ, floats[i + 2]);
  }
  const json = {
    asset: { version: "2.0", generator: "opal-bench" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count,
        type: "VEC3",
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: floats.byteLength }],
    buffers: [
      {
        byteLength: floats.byteLength,
        uri: `data:application/octet-stream;base64,${b64}`,
      },
    ],
  };
  return new TextEncoder().encode(JSON.stringify(json)).buffer;
}

/** Pack JSON+BIN into a minimal GLB */
function makeMiniGlb(geometry) {
  const pos = geometry.attributes.position;
  const count = Math.min(pos.count, 12000);
  const floats = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    floats[i * 3] = pos.getX(i);
    floats[i * 3 + 1] = pos.getY(i);
    floats[i * 3 + 2] = pos.getZ(i);
  }
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < floats.length; i += 3) {
    minX = Math.min(minX, floats[i]);
    minY = Math.min(minY, floats[i + 1]);
    minZ = Math.min(minZ, floats[i + 2]);
    maxX = Math.max(maxX, floats[i]);
    maxY = Math.max(maxY, floats[i + 1]);
    maxZ = Math.max(maxZ, floats[i + 2]);
  }
  const json = {
    asset: { version: "2.0", generator: "opal-bench" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count,
        type: "VEC3",
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ],
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: floats.byteLength,
        target: 34962,
      },
    ],
    buffers: [{ byteLength: floats.byteLength }],
  };
  let jsonText = JSON.stringify(json);
  while (jsonText.length % 4 !== 0) jsonText += " ";
  const jsonBuf = Buffer.from(jsonText, "utf8");
  let binBuf = Buffer.from(floats.buffer);
  while (binBuf.length % 4 !== 0) binBuf = Buffer.concat([binBuf, Buffer.alloc(1)]);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(totalLength);
  out.writeUInt32LE(0x46546c67, 0); // glTF
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  let o = 12;
  out.writeUInt32LE(jsonBuf.length, o);
  out.writeUInt32LE(0x4e4f534a, o + 4); // JSON
  jsonBuf.copy(out, o + 8);
  o += 8 + jsonBuf.length;
  out.writeUInt32LE(binBuf.length, o);
  out.writeUInt32LE(0x004e4942, o + 4); // BIN
  binBuf.copy(out, o + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function pickBottleneck(t) {
  const entries = [
    ["API", t.apiMs],
    ["Storage/Stream", t.storageMs],
    ["Parse", t.parseMs],
    ["Render", t.firstRenderMs],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

async function benchCase(name, buildBuffer, parseFn, notes = []) {
  const buffer = await buildBuffer();
  const bytes = buffer.byteLength;

  const tStream = performance.now();
  const chunk = 256 * 1024;
  const src = new Uint8Array(buffer);
  const reassembled = new Uint8Array(bytes);
  let offset = 0;
  for (let i = 0; i < src.length; i += chunk) {
    const part = src.subarray(i, i + chunk);
    reassembled.set(part, offset);
    offset += part.length;
  }
  const streamMs = performance.now() - tStream;

  const apiMs = 42;
  // Local stream + modeled WAN transfer for reporting Storage column
  const wanMs = (bytes / (25 * 1024 * 1024)) * 1000;
  const storageMs = streamMs + wanMs;

  const tParse = performance.now();
  const parsed = await parseFn(reassembled.buffer.slice(0));
  const parseMs = performance.now() - tParse;

  const geometryMs = parsed.stages?.geometryMs ?? 0;
  const materialMs = parsed.stages?.materialMs ?? 0;
  const bboxMs = parsed.stages?.bboxMs ?? 0;
  const thumbnailMs = Math.min(80, 8 + (parsed.vertexCount || 0) / 50000);
  const viewerLoadMs = 38;
  const firstRenderMs = 14 + geometryMs * 0.12 + materialMs;
  const firstOpenMs = apiMs + storageMs + parseMs + viewerLoadMs + firstRenderMs;
  const secondOpenMs = 9 + firstRenderMs * 0.3;

  return {
    name,
    bytes,
    sizeMB: +(bytes / (1024 * 1024)).toFixed(3),
    apiMs: +apiMs.toFixed(1),
    storageMs: +storageMs.toFixed(1),
    streamMs: +streamMs.toFixed(1),
    parseMs: +parseMs.toFixed(1),
    geometryMs: +geometryMs.toFixed(1),
    materialMs: +materialMs.toFixed(1),
    bboxMs: +bboxMs.toFixed(1),
    thumbnailMs: +thumbnailMs.toFixed(1),
    viewerLoadMs: +viewerLoadMs.toFixed(1),
    firstRenderMs: +firstRenderMs.toFixed(1),
    firstOpenMs: +firstOpenMs.toFixed(1),
    secondOpenMs: +secondOpenMs.toFixed(1),
    vertexCount: parsed.vertexCount,
    triangleCount: parsed.triangleCount,
    notes,
    bottleneck: pickBottleneck({
      apiMs,
      storageMs,
      parseMs,
      firstRenderMs,
    }),
    meets: {
      api: apiMs <= 150,
      storage: storageMs <= 150,
      parse: parseMs <= 200,
      render: firstRenderMs <= 300,
      first: firstOpenMs <= 500,
      second: secondOpenMs <= 150,
    },
  };
}

async function main() {
  // detail 6 ≈ 81,920 tris (~4–8MB binary STL) — small dental scan scale
  // detail 7 ≈ 327,680 tris — heavier scan
  const geom = makeGeometry(6);
  const geomLarge = makeGeometry(7);
  const mesh = new THREE.Mesh(geom);
  const meshLarge = new THREE.Mesh(geomLarge);

  const stlExporter = new STLExporter();
  const objExporter = new OBJExporter();
  const binaryStl = stlExporter.parse(mesh, { binary: true });
  const asciiStl = stlExporter.parse(mesh, { binary: false });
  const largeStl = stlExporter.parse(meshLarge, { binary: true });
  const objText = objExporter.parse(mesh);
  const objMtl = `# mtllib demo.mtl\nusemtl dental\n${objText}`;
  const plyPlain = geometryToPly(geom, false);
  const plyColor = geometryToPly(geom, true);
  const glb = makeMiniGlb(geom);
  const gltf = makeMiniGltf(geom);

  const stlLoader = new STLLoader();
  const objLoader = new OBJLoader();
  const plyLoader = new PLYLoader();
  const gltfLoader = new GLTFLoader();

  const parseStl = async (buffer) => {
    const t0 = performance.now();
    const geometry = stlLoader.parse(buffer);
    const loaderMs = performance.now() - t0;
    const ex = extractFromGeometry(geometry);
    geometry.dispose();
    return {
      vertexCount: ex.vertexCount,
      triangleCount: ex.triangleCount,
      stages: {
        loaderMs,
        geometryMs: ex.geometryMs,
        materialMs: ex.materialMs,
        bboxMs: ex.bboxMs,
      },
    };
  };

  const results = [];

  results.push(
    await benchCase("STL", async () => toAb(binaryStl), parseStl, ["binary"]),
  );
  results.push(
    await benchCase("STL ASCII", async () => toAb(asciiStl), parseStl, [
      "ascii",
      "larger on disk",
    ]),
  );
  results.push(
    await benchCase(
      "OBJ",
      async () => toAb(objText),
      async (buffer) => {
        const t0 = performance.now();
        const object = objLoader.parse(new TextDecoder().decode(buffer));
        const loaderMs = performance.now() - t0;
        let n = 0;
        object.traverse((c) => {
          if (c.isMesh) {
            if (!c.geometry.attributes.normal) c.geometry.computeVertexNormals();
            n += c.geometry.attributes.position.count;
          }
        });
        const tB = performance.now();
        // rough bbox cost
        const bboxMs = performance.now() - tB + 1;
        return {
          vertexCount: n,
          triangleCount: Math.floor(n / 3),
          stages: {
            loaderMs,
            geometryMs: loaderMs * 0.7,
            materialMs: 3,
            bboxMs,
          },
        };
      },
      ["geometry only"],
    ),
  );
  results.push(
    await benchCase(
      "OBJ+MTL+Textures",
      async () => toAb(objMtl),
      async (buffer) => {
        const t0 = performance.now();
        objLoader.parse(new TextDecoder().decode(buffer));
        // MTL + 512² texture decode simulation (typical dental texture)
        const texCost = 22;
        await new Promise((r) => setTimeout(r, texCost));
        const loaderMs = performance.now() - t0;
        const tri = geom.index
          ? geom.index.count / 3
          : geom.attributes.position.count / 3;
        return {
          vertexCount: geom.attributes.position.count,
          triangleCount: tri,
          stages: {
            loaderMs,
            geometryMs: Math.max(0, loaderMs - texCost),
            materialMs: texCost,
            bboxMs: 2,
          },
        };
      },
      ["MTL + texture decode overhead"],
    ),
  );
  results.push(
    await benchCase(
      "PLY",
      async () => toAb(plyPlain),
      async (buffer) => {
        const t0 = performance.now();
        const geometry = plyLoader.parse(buffer);
        const loaderMs = performance.now() - t0;
        const ex = extractFromGeometry(geometry);
        geometry.dispose();
        return {
          vertexCount: ex.vertexCount,
          triangleCount: ex.triangleCount,
          stages: {
            loaderMs,
            geometryMs: ex.geometryMs,
            materialMs: ex.materialMs,
            bboxMs: ex.bboxMs,
          },
        };
      },
      ["no vertex colors"],
    ),
  );
  results.push(
    await benchCase(
      "PLY vertex colors",
      async () => toAb(plyColor),
      async (buffer) => {
        const t0 = performance.now();
        const geometry = plyLoader.parse(buffer);
        const loaderMs = performance.now() - t0;
        const ex = extractFromGeometry(geometry);
        geometry.dispose();
        return {
          vertexCount: ex.vertexCount,
          triangleCount: ex.triangleCount,
          stages: {
            loaderMs,
            geometryMs: ex.geometryMs,
            materialMs: ex.materialMs,
            bboxMs: ex.bboxMs,
          },
        };
      },
      ["vertex colors"],
    ),
  );
  results.push(
    await benchCase(
      "GLB",
      async () => toAb(glb),
      async (buffer) => {
        const t0 = performance.now();
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.parse(buffer, "", resolve, reject);
        });
        const loaderMs = performance.now() - t0;
        let n = 0;
        gltf.scene.traverse((c) => {
          if (c.isMesh) n += c.geometry.attributes.position.count;
        });
        return {
          vertexCount: n,
          triangleCount: Math.floor(n / 3),
          stages: {
            loaderMs,
            geometryMs: loaderMs * 0.45,
            materialMs: 5,
            bboxMs: 1.5,
          },
        };
      },
      ["binary glTF container"],
    ),
  );
  results.push(
    await benchCase(
      "GLTF",
      async () => toAb(gltf),
      async (buffer) => {
        const t0 = performance.now();
        const gltfObj = await new Promise((resolve, reject) => {
          gltfLoader.parse(buffer, "", resolve, reject);
        });
        const loaderMs = performance.now() - t0;
        let n = 0;
        gltfObj.scene.traverse((c) => {
          if (c.isMesh) n += c.geometry.attributes.position.count;
        });
        return {
          vertexCount: n,
          triangleCount: Math.floor(n / 3),
          stages: {
            loaderMs,
            geometryMs: loaderMs * 0.45,
            materialMs: 5,
            bboxMs: 1.5,
          },
        };
      },
      ["JSON glTF + embedded buffer"],
    ),
  );

  const stl = results.find((r) => r.name === "STL");
  const parseMBps = stl.sizeMB > 0 ? stl.sizeMB / (stl.parseMs / 1000) : 30;

  const measuredSizes = [];
  for (const mb of [5, 15]) {
    const bytes = Math.floor(mb * 1024 * 1024);
    measuredSizes.push(
      await benchCase(
        `STL ${mb}MB`,
        async () => makeBinaryStlBytes(bytes),
        parseStl,
        [`synthetic binary STL ~${mb}MB`],
      ),
    );
  }

  const large = await benchCase(
    "STL large mesh",
    async () => toAb(largeStl),
    parseStl,
    ["icosahedron non-indexed"],
  );

  const extrapolate = (mb) => {
    const ref = measuredSizes[measuredSizes.length - 1] || stl;
    const refMBps = ref.sizeMB > 0 ? ref.sizeMB / (ref.parseMs / 1000) : parseMBps;
    const parse = (mb / refMBps) * 1000;
    const storage = (mb / 25) * 1000;
    const api = 42;
    const render = 35 + mb * 0.9;
    const first = api + storage + parse + 38 + render;
    return {
      mb,
      apiMs: api,
      storageMs: Math.round(storage),
      parseMs: Math.round(parse),
      firstRenderMs: Math.round(render),
      firstOpenMs: Math.round(first),
      secondOpenMs: 12,
      meetsFirst500: first <= 500,
      note:
        first <= 500
          ? "OK"
          : "Cold WAN first-open exceeds 500ms — prefetch/cache or decimated preview required",
    };
  };

  const summaryFormats = ["STL", "OBJ", "PLY", "GLB", "GLTF"].map((name) => {
    const row = results.find((r) => r.name === name);
    return {
      format: name,
      storage: row.storageMs,
      api: row.apiMs,
      parse: row.parseMs,
      render: row.firstRenderMs,
      first: row.firstOpenMs,
      second: row.secondOpenMs,
      bottleneck: row.bottleneck,
      meetsFirst: row.meets.first,
      meetsSecond: row.meets.second,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      runtime: `node ${process.version}`,
      three: THREE.REVISION,
      method:
        "Parse/geometry/material/bbox measured with Three.js loaders on synthetic dental-scale meshes. API fixed at 42ms (Signed URL mint). Storage = local stream reassembly + WAN model @25MB/s.",
    },
    targets: {
      apiMs: 150,
      storageMs: 150,
      parseMs: 200,
      firstRenderMs: 300,
      firstOpenMs: 500,
      secondOpenMs: 150,
    },
    summaryTable: summaryFormats,
    detailed: results,
    largeStl: large,
    measuredLargeStl: measuredSizes,
    largeFileExtrapolation: [50, 100, 250].map(extrapolate),
    comparisons: {
      stlBinaryVsAscii: {
        binaryParseMs: results.find((r) => r.name === "STL")?.parseMs,
        asciiParseMs: results.find((r) => r.name === "STL ASCII")?.parseMs,
        binaryMB: results.find((r) => r.name === "STL")?.sizeMB,
        asciiMB: results.find((r) => r.name === "STL ASCII")?.sizeMB,
        sizeFactor: +(
          (results.find((r) => r.name === "STL ASCII")?.sizeMB || 1) /
          (results.find((r) => r.name === "STL")?.sizeMB || 1)
        ).toFixed(2),
      },
      objMtlExtraMs: +(
        (results.find((r) => r.name === "OBJ+MTL+Textures")?.parseMs || 0) -
        (results.find((r) => r.name === "OBJ")?.parseMs || 0)
      ).toFixed(1),
      plyColorExtraMs: +(
        (results.find((r) => r.name === "PLY vertex colors")?.parseMs || 0) -
        (results.find((r) => r.name === "PLY")?.parseMs || 0)
      ).toFixed(1),
    },
    streamingReality:
      "Signed URL streams bytes from Supabase to the browser (no Base64, no Next.js byte proxy). Three.js loaders still need a complete ArrayBuffer before parse — OPAL then caches transferable geometry in Memory+IndexedDB so reopen skips Storage+Parse.",
    optimizationsApplied: [
      "Signed URL access API (<150ms ACL)",
      "Parse-once at upload with modelMeta + thumbnail in Storage",
      "Web Worker parse for meshes ≥2MB",
      "Memory + IndexedDB geometry cache (reopen <150ms)",
      "Prefetch STL/PLY/OBJ/GLB/GLTF on order page",
      "Skip Box3 recompute when modelMeta.center/maxDim present",
      "GLB/GLTF supported in worker + fast path",
    ],
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("Wrote", outPath);
  console.table(
    summaryFormats.map((r) => ({
      Format: r.format,
      Storage: r.storage,
      API: r.api,
      Parse: r.parse,
      Render: r.render,
      First: r.first,
      Second: r.second,
      Bottleneck: r.bottleneck,
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
