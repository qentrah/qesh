#!/usr/bin/env node
import {runProjectCommand,projectCommands,findProject} from './projects.mjs';
import {fetchReleases,selectRelease} from './releases.mjs';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),command=args.shift()||'help';
try{
 if(['help','--help','-h'].includes(command))console.log(`Qentrah CLI\n\nqh projects [SEARCH] [--live]\nqh project PROJECT\nqh clone PROJECT [DIRECTORY] [--dry-run]\nqh fork PROJECT [--dry-run]\nqh bug PROJECT [--web] [--title TITLE] [--body TEXT | --body-file FILE]\nqh bugs PROJECT\nqh install PROJECT [--manager npm|bun] [--source] [--dir DIRECTORY] [--dry-run]\nqh install latest [--check]\nqh update [stable|preview] [--check]\n\nGit is required for source checkouts. GitHub CLI (gh auth login) is required for forks and issues.\nThe desktop Qesh install also supplies workspace, settings, and diagnostics commands.\n`);
 else if(['version','--version','-v'].includes(command))console.log(JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);
 else if(projectCommands.includes(command))process.exitCode=await runProjectCommand(command,args);
 else if(command==='install'&&findProject(args[0])&&(args[0].toLowerCase()!=='qesh'||args.includes('--source')))process.exitCode=await runProjectCommand(command,args);
 else if(command==='install'||command==='update'){
  if(command==='install'&&args[0]?.toLowerCase()==='qesh')args.shift();const check=args.includes('--check'),dry=args.includes('--dry-run'),tokens=args.filter(x=>!['--check','--dry-run'].includes(x));if(['version','versions'].includes(tokens[1]))tokens.pop();if(tokens.length>1)throw new Error('Usage: qh install [latest|stable|preview|vVERSION] [--check]');
  if(process.platform!=='darwin'&&!check&&!dry)throw new Error('The Qesh desktop installer requires macOS. Other project commands work on this platform.');
  if(dry){console.log('Install Qesh from https://github.com/qentrah/qesh/releases using the selected release installer.');process.exitCode=0;}
  else{const release=selectRelease(await fetchReleases(),tokens[0]||'stable');console.log(`Qesh ${release.tag_name}\n${release.html_url}`);if(!check){const url=release.assets.find(a=>a.name==='install.sh')?.browser_download_url;if(!url)throw new Error('This release has no installer.');const response=await fetch(url);if(!response.ok)throw new Error(`Installer unavailable: HTTP ${response.status}`);const folder=mkdtempSync(join(tmpdir(),'qh-install-'));try{const path=join(folder,'install.sh');writeFileSync(path,await response.text(),{mode:0o700});const result=spawnSync('/bin/sh',[path,release.tag_name],{stdio:'inherit',env:process.env});if(result.error)throw result.error;process.exitCode=result.status??1;}finally{rmSync(folder,{recursive:true,force:true});}}}
 }else throw new Error(`Unknown command: ${command}. Run qh help.`);
}catch(error){console.error(`qh: ${error.message}`);process.exitCode=1;}
