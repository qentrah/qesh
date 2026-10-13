export type MouseModifiers={shift?:boolean;alt?:boolean;ctrl?:boolean};
export function mouseSequence(code:number,x:number,y:number,encoding:'sgr'|'utf8'|'legacy',release=false){
 x=Math.max(1,Math.floor(x));y=Math.max(1,Math.floor(y));
 if(encoding==='sgr')return `\x1b[<${code};${x};${y}${release?'m':'M'}`;
 if(release)code=3+(code&28);
 if(encoding==='legacy'){x=Math.min(223,x);y=Math.min(223,y);}
 return '\x1b[M'+String.fromCodePoint(code+32,x+32,y+32);
}
export function mouseModifierBits(value:MouseModifiers){return (value.shift?4:0)+(value.alt?8:0)+(value.ctrl?16:0);}
