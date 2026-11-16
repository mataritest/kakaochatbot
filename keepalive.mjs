export const PING_INTERVAL_MS = 9 * 60 * 1000;

// This only pings this service's public health endpoint. No chat content or key.
export function startKeepAlive({baseUrl,fetchFn=fetch,schedule=setInterval,log=console.log}={}) {
  const status={enabled:false,intervalMinutes:9,lastAttempt:null,lastSuccess:null,lastOk:null};
  if(!baseUrl)return {status,stop(){}};
  const url=new URL('/health',baseUrl);
  if(url.protocol!=='https:')throw new Error('Keep-alive requires the service HTTPS URL.');
  status.enabled=true;
  let running=false,stopped=false;
  async function ping(){
    if(running||stopped)return;
    running=true;status.lastAttempt=new Date().toISOString();
    try{
      const r=await fetchFn(url.href,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Agaebom-Health-Ping/1.0'}});
      await r.arrayBuffer();status.lastOk=r.ok;
      if(r.ok)status.lastSuccess=new Date().toISOString();
      log(`[keepalive] health ${r.ok?'OK':'HTTP '+r.status}; every 9 minutes`);
    }catch{status.lastOk=false;log('[keepalive] health request failed; next attempt in 9 minutes');}
    finally{running=false;}
  }
  const timer=schedule(()=>void ping(),PING_INTERVAL_MS);
  timer?.unref?.();
  void ping();
  return {status,stop(){stopped=true;clearInterval(timer);}};
}
