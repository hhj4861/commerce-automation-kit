/** JSON.parse semantics with duplicate decoded keys rejected before consumers see data. */
export function parseStrictJson(text:string):unknown {
  if(text.length>1_048_576)throw new Error('JSON 크기 제한 초과');
  const result:unknown=JSON.parse(text); // Validate the complete JSON grammar first.
  let pos=0;
  const whitespace=()=>{while(/[\x20\t\n\r]/.test(text[pos]??'!'))pos++;};
  const string=():string=>{
    const start=pos++;
    while(pos<text.length){
      const c=text[pos++];
      if(c==='\\')pos++; // Escaped quote/backslash cannot terminate the string.
      else if(c==='"')return JSON.parse(text.slice(start,pos)) as string;
    }
    throw new Error('JSON 문자열 오류');
  };
  const value=(depth:number):void=>{
    if(depth>100)throw new Error('JSON 깊이 제한 초과');
    whitespace();
    const first=text[pos];
    if(first==='"'){string();return;}
    if(first==='{'){
      pos++;whitespace();const keys=new Set<string>();
      if(text[pos]==='}'){pos++;return;}
      for(;;){
        whitespace();const key=string();
        if(keys.has(key))throw new Error('JSON 중복 키');
        keys.add(key);whitespace();pos++; // Colon; complete grammar already validated.
        value(depth+1);whitespace();
        if(text[pos++]==='}')return;
      }
    }
    if(first==='['){
      pos++;whitespace();if(text[pos]===']'){pos++;return;}
      for(;;){value(depth+1);whitespace();if(text[pos++]===']')return;}
    }
    const start=pos;
    while(pos<text.length && !/[\x20\t\n\r,\]}]/.test(text[pos]!))pos++;
    const atom:unknown=JSON.parse(text.slice(start,pos));
    if(typeof atom==='number' && !Number.isFinite(atom))throw new Error('JSON 유한 숫자 필수');
  };
  value(0);whitespace();
  if(pos!==text.length)throw new Error('JSON 끝 위치 오류');
  return result;
}
