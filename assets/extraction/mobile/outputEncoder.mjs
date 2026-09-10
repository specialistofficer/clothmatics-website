import {savePNG} from '../browser-io.mjs';
import {resizeRGBA} from './imageTensor.mjs';
export async function saveCutout(img){
  const scale=Math.min(1,1000/Math.max(img.width,img.height));
  const output=scale<1?resizeRGBA(img,Math.round(img.width*scale),Math.round(img.height*scale)):img;
  return {uri:await savePNG(output),width:output.width,height:output.height};
}
