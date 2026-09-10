let worker=null,sequence=0,active=null,idleTimer;
export function extractInBrowser(blob,{regions,preserveLightFabric=false,signal,onProgress}={}){
  if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  if(active)return Promise.reject(new Error('Another photo is still being prepared.'));
  return new Promise((resolve,reject)=>{
    clearTimeout(idleTimer);
    try{worker??=new Worker(new URL('./assets/extraction/extraction-worker.mjs',import.meta.url),{type:'module'});}catch(error){reject(error);return;}
    const id=++sequence;
    const dispose=()=>{worker?.terminate();worker=null;};
    const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);active=null;if(error){dispose();reject(error);}else{idleTimer=setTimeout(dispose,120000);resolve(result);}};
    const abort=()=>finish(new DOMException('Aborted','AbortError'));
    const timer=setTimeout(()=>finish(new Error('Preparing this photo took too long. Please try again.')),180000);
    active=id;
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>finish(new Error('Local extraction could not start. Check your connection and browser support.'));
    worker.onmessage=({data})=>{if(data.id!==id)return;if(data.progress){onProgress?.(data.progress);return;}finish(data.error?new Error(data.error):null,data.result);};
    worker.postMessage({id,blob,regions,preserveLightFabric});
  });
}
