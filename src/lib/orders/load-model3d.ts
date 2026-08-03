import { unzipSync } from "fflate";
import { getFileExtension } from "@/lib/file-utils";

export const MODEL3D_EXTS = ["stl", "obj", "ply", "glb", "gltf"] as const;
export type Model3DExt = (typeof MODEL3D_EXTS)[number];

export type ZipVirtualFs = Map<string, Uint8Array>;

export type LoadedModelBundle = {
  ext: Model3DExt;
  fileName: string;
  buffer: ArrayBuffer;
  companions: ZipVirtualFs;
};

function isModelExt(ext: string): ext is Model3DExt {
  return (MODEL3D_EXTS as readonly string[]).includes(ext);
}

function normalizeZipPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

function basename(path: string): string {
  const parts = normalizeZipPath(path).split("/");
  return parts[parts.length - 1] || path;
}

export function zipToVirtualFs(zipBytes: Uint8Array): ZipVirtualFs {
  const entries = unzipSync(zipBytes);
  const fs: ZipVirtualFs = new Map();
  for (const [rawName, data] of Object.entries(entries)) {
    if (rawName.endsWith("/") || rawName.split("/").some((p) => p.startsWith("."))) continue;
    const name = normalizeZipPath(rawName);
    fs.set(name, data);
    fs.set(basename(name).toLowerCase(), data);
  }
  return fs;
}

export async function bundleFromFile(file: File): Promise<LoadedModelBundle | null> {
  const ext = getFileExtension(file.name);
  if (isModelExt(ext)) {
    return {
      ext,
      fileName: file.name,
      buffer: await file.arrayBuffer(),
      companions: new Map(),
    };
  }

  const isZip =
    ext === "zip" ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";
  if (!isZip) return null;

  const zipBytes = new Uint8Array(await file.arrayBuffer());
  const companions = zipToVirtualFs(zipBytes);

  const pathCandidates = [...companions.keys()]
    .filter((name) => name.includes("/") || !name.includes("\\"))
    .filter((name) => name === basename(name) || name.includes("/"))
    .map((name) => ({ name, ext: getFileExtension(name) }))
    .filter((c): c is { name: string; ext: Model3DExt } => isModelExt(c.ext))
    // Prefer real relative paths over basename aliases
    .filter((c) => c.name.includes("/") || ![...companions.keys()].some((k) => k.endsWith("/" + c.name)))
    .sort((a, b) => {
      const rank = (e: Model3DExt) =>
        e === "obj" ? 0 : e === "ply" ? 1 : e === "stl" ? 2 : e === "glb" ? 3 : 4;
      const pathScore = (n: string) => (n.includes("/") ? 0 : 1);
      return pathScore(a.name) - pathScore(b.name) || rank(a.ext) - rank(b.ext) || a.name.localeCompare(b.name);
    });

  // Deduplicate basename aliases: keep first unique basename
  const seen = new Set<string>();
  const unique: typeof pathCandidates = [];
  for (const c of pathCandidates) {
    const key = `${basename(c.name).toLowerCase()}|${c.ext}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const pick = unique[0];
  if (!pick) return null;

  const data = companions.get(pick.name) ?? companions.get(basename(pick.name).toLowerCase());
  if (!data) return null;

  const copy = new Uint8Array(data.byteLength);
  copy.set(data);

  return {
    ext: pick.ext,
    fileName: basename(pick.name),
    buffer: copy.buffer,
    companions,
  };
}

export async function bundleFromUrl(
  url: string,
  fileName: string,
): Promise<LoadedModelBundle | null> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("טעינת הקובץ מהשרת נכשלה");
  const buffer = await response.arrayBuffer();
  const blob = new File([buffer], fileName, {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
  return bundleFromFile(blob);
}

/** Load a Three.js Object3D from STL / PLY (vertex colors) / OBJ+MTL / GLB. */
export async function createThreeObjectFromBundle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  THREE: any,
  bundle: LoadedModelBundle,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { ext, buffer, companions } = bundle;

  if (ext === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xc9a227,
        metalness: 0.15,
        roughness: 0.55,
        side: THREE.DoubleSide,
      }),
    );
  }

  if (ext === "ply") {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
    const geometry = new PLYLoader().parse(buffer);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const hasColor = Boolean(geometry.attributes.color);
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: hasColor ? 0xffffff : 0xc9a227,
        vertexColors: hasColor,
        metalness: 0.08,
        roughness: 0.65,
        side: THREE.DoubleSide,
      }),
    );
  }

  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: unknown }>((resolve, reject) => {
      loader.parse(buffer, "", resolve, reject);
    });
    return gltf.scene;
  }

  if (ext === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    const { MTLLoader } = await import("three/examples/jsm/loaders/MTLLoader.js");
    const objText = new TextDecoder().decode(buffer);
    const mtlRef =
      objText.match(/^\s*mtllib\s+(.+)\s*$/im)?.[1]?.trim().replace(/\\/g, "/") ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let materials: any = null;
    if (mtlRef && companions.size) {
      const mtlBytes =
        companions.get(mtlRef) ||
        companions.get(basename(mtlRef).toLowerCase()) ||
        companions.get(normalizeZipPath(mtlRef));
      if (mtlBytes) {
        const mtlText = new TextDecoder().decode(mtlBytes);
        const mtlLoader = new MTLLoader();
        materials = mtlLoader.parse(mtlText, "");
        materials.preload();

        const mats = materials.materials || {};
        for (const match of mtlText.matchAll(/^\s*map_Kd\s+(.+)\s*$/gim)) {
          const texPath = match[1].trim().replace(/\\/g, "/");
          const texBytes =
            companions.get(texPath) || companions.get(basename(texPath).toLowerCase());
          if (!texBytes) continue;
          const texCopy = new Uint8Array(texBytes.byteLength);
          texCopy.set(texBytes);
          const blob = new Blob([texCopy]);
          const url = URL.createObjectURL(blob);
          const texture = await new Promise((resolve) => {
            new THREE.TextureLoader().load(
              url,
              (t: unknown) => {
                URL.revokeObjectURL(url);
                resolve(t);
              },
              undefined,
              () => {
                URL.revokeObjectURL(url);
                resolve(null);
              },
            );
          });
          if (!texture) continue;
          for (const mat of Object.values(mats) as Array<{
            map?: unknown;
            needsUpdate?: boolean;
          }>) {
            mat.map = texture;
            mat.needsUpdate = true;
          }
        }
      }
    }

    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    const object = objLoader.parse(objText);

    object.traverse((child: { isMesh?: boolean; material?: unknown }) => {
      if (!child.isMesh) return;
      if (!materials) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0xc9a227,
          metalness: 0.15,
          roughness: 0.55,
          side: THREE.DoubleSide,
        });
      }
    });

    return object;
  }

  throw new Error(`פורמט .${ext} אינו נתמך ב־Viewer`);
}
