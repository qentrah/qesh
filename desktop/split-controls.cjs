function dragPosition(origin,event,start,cells){
 if(!origin||![origin.x,origin.y,event.clientX,event.clientY,start.x,start.y,cells.width,cells.height].every(Number.isFinite)||cells.width<=0||cells.height<=0)return null;
 return {x:start.x+Math.round((event.clientX-origin.x)/cells.width),y:start.y+Math.round((event.clientY-origin.y)/cells.height)};
}
module.exports={dragPosition};
