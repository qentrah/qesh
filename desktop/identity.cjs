function identify(pane,apps){
 const process=String(pane.process||'').toLowerCase(),items=Object.values(apps||{});
 const direct=items.find(app=>process.includes(app.match.toLowerCase()));if(direct)return direct;
 if(['zsh','bash','fish','sh','dash','ksh'].includes(process.split('/').pop()))return null;
 const title=String(pane.title||'').toLowerCase();return items.find(app=>title.includes(app.match.toLowerCase()))||null;
}
module.exports={identify};
