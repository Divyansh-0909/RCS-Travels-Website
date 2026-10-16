// A deliberately closed projection: no SQL, parameters, DETAIL or credentials.
export function serverDiagnostics(bytes){
  const selected=[];
  for(const line of bytes.split('\n')){
    if(!line.startsWith('{'))continue;let row;try{row=JSON.parse(line);}catch{continue;}
    const message=row.message??'',signal=/terminated by signal (\d+)/.exec(message);
    let classification=signal?'SERVER_PROCESS_SIGNAL':message.startsWith('terminating any other active server processes')?'TERMINATING_PEERS':message.startsWith('all server processes terminated; reinitializing')?'SERVER_REINITIALIZING':message.startsWith('database system was interrupted')?'CRASH_RECOVERY':message.startsWith('database system is ready to accept connections')?'SERVER_READY':null;
    if(classification)selected.push({at:row.timestamp,pid:row.pid,severity:row.error_severity,sqlstate:row.state_code,classification,...(signal?{signal:Number(signal[1])}:{})});
  }
  return selected;
}
