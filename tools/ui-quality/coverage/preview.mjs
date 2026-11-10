// Only the dedicated loopback preview server imports this module.
export function safePreviewPath(value) {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\r\n]/.test(value))return false;
  let decoded;try{decoded=decodeURIComponent(value.split(/[?#]/)[0]);}catch{return false;}
  return !decoded.startsWith('//')&&!/[\\\r\n]/.test(decoded)&&!/^\/(?:api|fixture-auth|fixture-clerk|__review)(?:\/|$)/.test(decoded);
}
export function previewRequest(url, allowedPaths) {
  const query=new URL(url,'http://127.0.0.1').searchParams,actor=query.get('actor'),target=query.get('to');
  if(!['customer','admin'].includes(actor)||!safePreviewPath(target)||!allowedPaths.has(target))return null;
  return {actor,target};
}
