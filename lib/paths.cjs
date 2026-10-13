const {join}=require('node:path');const {homedir}=require('node:os');
const dataDir=process.env.QESH_DATA_DIR||join(homedir(),process.platform==='darwin'?'Library/Application Support/Qentrah/Qesh':'.local/share/qesh');
module.exports={dataDir,configPath:join(dataDir,'config.jsonc'),databasePath:join(dataDir,'workspaces.sqlite')};
