function dragPosition(origin,event,start,cells){
 if(!origin||![origin.x,origin.y,event.clientX,event.clientY,start.x,start.y,cells.width,cells.height].every(Number.isFinite)||cells.width<=0||cells.height<=0)return null;
 return {x:start.x+Math.round((event.clientX-origin.x)/cells.width),y:start.y+Math.round((event.clientY-origin.y)/cells.height)};
}
function junctions(dividers){
 const points=new Map();
 for(const column of dividers.filter(d=>d.axis==='horizontal'))for(const row of dividers.filter(d=>d.axis==='vertical')){
  if(column.x<row.x-1||column.x>row.x+row.width||row.y<column.y-1||row.y>column.y+column.height)continue;
  const key=column.x+':'+row.y;
  if(!points.has(key))points.set(key,{x:column.x,y:row.y,ids:[]});
  const point=points.get(key);for(const d of [column,row])if(!point.ids.includes(d.id))point.ids.push(d.id);
 }
 return [...points.values()].map(point=>({...point,id:point.ids.sort().join(':')}));
}
module.exports={dragPosition,junctions};
