import {extractSingleGarmentPhoto,extractIdentifiedWornRegions} from './mobile/offlinePipeline.mjs';
self.onmessage=async({data})=>{
  const {id,blob,regions,preserveLightFabric}=data;
  try{
    const progress=message=>self.postMessage({id,progress:message});
    const result=regions?await extractIdentifiedWornRegions(blob,regions,progress):await extractSingleGarmentPhoto(blob,'Garment',progress,preserveLightFabric);
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message||'Local extraction failed.'});}
};
