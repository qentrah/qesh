const {join}=require('node:path');const {homedir}=require('node:os');
const {existsSync,mkdirSync,mkdtempSync,copyFileSync,renameSync,rmSync}=require('node:fs');
const dataDir=process.env.QH_DATA_DIR||join(homedir(),process.platform==='darwin'?'Library/Application Support/Qentrah/QH':'.local/share/qh');
// Import pre-rename data without moving installed versions or touching their launchers.
const legacyDir=join(homedir(),process.platform==='darwin'?'Library/Application Support/Qentrah/Qesh':'.local/share/qesh');
if(!process.env.QH_DATA_DIR&&existsSync(legacyDir)){
 mkdirSync(dataDir,{recursive:true,mode:0o700});
  if(!existsSync(join(dataDir,'config.jsonc'))&&!existsSync(join(dataDir,'config.json')))
   for(const name of ['config.jsonc','config.json'])if(existsSync(join(legacyDir,name)))copyFileSync(join(legacyDir,name),join(dataDir,name));
  const database=join(legacyDir,'workspaces.sqlite');
  if(existsSync(database)&&!existsSync(join(dataDir,'workspaces.sqlite'))){
   // SQLite's snapshot includes committed WAL data from a running older app.
   const temporary=mkdtempSync(join(dataDir,'.migration-'));
   try{
    const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(database,{readOnly:true});
    try{db.prepare('VACUUM INTO ?').run(join(temporary,'workspaces.sqlite'));}finally{db.close();}
    if(!existsSync(join(dataDir,'workspaces.sqlite')))renameSync(join(temporary,'workspaces.sqlite'),join(dataDir,'workspaces.sqlite'));
   }finally{rmSync(temporary,{recursive:true,force:true});}
  }
}
module.exports={dataDir,configPath:join(dataDir,'config.jsonc'),databasePath:join(dataDir,'workspaces.sqlite')};
