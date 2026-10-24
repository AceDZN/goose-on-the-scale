// Reduce a Tripo GLB for the web: sloppy simplify (ignores UV seams, which block regular
// simplification on Tripo meshes), compact, resize textures to WebP, meshopt compression.
// Usage: node scripts/optimize-model.mjs in.glb out.glb <targetTriangles> [textureSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [, , input, output, targetArg = '12000', texArg = '1024'] = process.argv;
const target = Number(targetArg);
const texSize = Number(texArg);

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
await doc.transform(weld());

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    if (!pos || !idx) continue;
    const tris = idx.getCount() / 3;
    if (tris <= target) continue;
    const positions = new Float32Array(pos.getArray());
    const indices = new Uint32Array(idx.getArray());
    const [out, err] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target * 3, 0.02);
    idx.setArray(new Uint32Array(out));
    compactPrimitive(prim);
    console.log(`${mesh.getName()}: ${tris} → ${out.length / 3} triangles (error ${err.toFixed(4)})`);
  }
}

await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(output, doc);
