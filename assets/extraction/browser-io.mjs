// Browser-specific IO only. Model normalization and mask math remain in mobile/.
export async function decodeToRGBA(blob, maxSide = 1280) {
  const bitmap = await createImageBitmap(blob, {imageOrientation:'from-image'});
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width*scale)), height = Math.max(1,Math.round(bitmap.height*scale));
  const canvas = new OffscreenCanvas(width,height);
  const ctx = canvas.getContext('2d', {alpha:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);bitmap.close();
  // Match the mobile decode's JPEG 0.92 pass before model preprocessing.
  const jpeg = await createImageBitmap(await canvas.convertToBlob({type:'image/jpeg',quality:.92}));
  ctx.drawImage(jpeg,0,0);jpeg.close();
  return {data:new Uint8Array(ctx.getImageData(0,0,width,height).data),width,height};
}
export async function savePNG(img) {
  const canvas = new OffscreenCanvas(img.width,img.height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data),img.width,img.height),0,0);
  const blob = await canvas.convertToBlob({type:'image/png'});
  if(blob.size<500) throw Error('The prepared garment image is too small.');
  return blob; // Pipeline uri is an opaque IO handle; here it is a transferable Blob.
}
