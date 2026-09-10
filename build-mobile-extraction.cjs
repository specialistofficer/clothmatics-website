// Run from this website directory: node build-mobile-extraction.cjs /path/to/StyleMateAI
// Pure mask/tensor algorithms are generated unchanged; browser IO lives in browser-io.mjs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mobile = path.resolve(process.argv[2] || '..');
const ts = require(path.join(mobile, 'node_modules/typescript'));
const out = path.join(__dirname, 'assets/extraction/mobile');
fs.mkdirSync(out, {recursive:true});
const files = ['offlinePipeline','imageTensor','mattingModels','matting','maskPostprocess','garmentPartition','extractionValidator','wornPairSeams','pixelColor','contestedPixels','extractionTelemetry','wornPartitionPipeline','nsfwService','regionSaveQuality'];
const manifest = {};
for (const name of [...files, 'extractionFlags']) {
  const sourcePath = `src/${name === 'extractionFlags' ? 'config' : 'ai'}/${name}.ts`;
  let source = fs.readFileSync(path.join(mobile, sourcePath), 'utf8');
  manifest[sourcePath] = crypto.createHash('sha256').update(source).digest('hex');
  if (name === 'imageTensor') {
    const ast = ts.createSourceFile('imageTensor.ts', source, ts.ScriptTarget.Latest, true);
    for (const node of [...ast.statements].reverse()) {
      const nativeImport = ts.isImportDeclaration(node) && node.moduleSpecifier.text !== './extractionDiagnostics';
      const ioFunction = ts.isFunctionDeclaration(node) && ['decodeToRGBA','savePNG'].includes(node.name?.text);
      if(nativeImport || ioFunction) source = source.slice(0,node.pos) + source.slice(node.end);
    }
    source = 'export { decodeToRGBA, savePNG } from "../browser-io.mjs";\n' + source;
  }
  let js = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  js = js.replace(/from "(\.\.?\/[^"\n]+)"/g, (_, dep) => `from "./${path.posix.basename(dep).replace(/\.(ts|mjs)$/, '')}.mjs"`);
  if (name === 'imageTensor') js = js.replace('from "./browser-io.mjs"', 'from "../browser-io.mjs"');
  fs.writeFileSync(path.join(out, name+'.mjs'), '// Generated from '+sourcePath+'; see source-manifest.json.\n'+js);
}
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const models = {u2netp:'309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',modnet:'5069a5e306b9f5e9f4f2b0360264c9f8ea13b257c7c39943c7cf6a2ec3a102ae'};
const modelManifest = {};
for(const [name,sha256] of Object.entries(models)) {
  const bytes = fs.readFileSync(path.join(mobile,`oracle-extraction-api/models/${name}.onnx`));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256) throw Error('Model hash mismatch: '+name);
  const chunks=[];
  for(let offset=0,index=0;offset<bytes.length;offset+=8*1024*1024,index++) {
    const file=`${name}-${index}.bin`;chunks.push(file);
    fs.writeFileSync(path.join(out,'..',file),bytes.subarray(offset,offset+8*1024*1024));
  }
  modelManifest[name]={sha256,chunks};
}
fs.writeFileSync(path.join(out,'../models.json'),JSON.stringify(modelManifest,null,2)+'\n');
console.log('Generated mobile algorithms and verified model chunks.');
