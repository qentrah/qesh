import {readFileSync,appendFileSync} from 'node:fs';
import {nextReleaseVersion,parseVersion} from '../lib/releases.mjs';
const base=JSON.parse(readFileSync('package.json')).version,ref=process.env.GITHUB_REF||'',publish=process.env.GITHUB_EVENT_NAME==='push'&&(ref==='refs/heads/main'||ref.startsWith('refs/tags/v'));
let tag='',version=base,preview=false;
if(publish&&ref.startsWith('refs/tags/')){tag=ref.slice('refs/tags/'.length);if(!parseVersion(tag))throw new Error('Invalid release tag.');version=tag.slice(1);preview=!!parseVersion(tag).pre;}
else if(publish){const response=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GH_TOKEN}`}});if(!response.ok)throw new Error(`Release plan failed: ${response.status}`);tag=nextReleaseVersion(base,await response.json());version=tag.slice(1);}
const output=`publish=${publish}\ntag=${tag}\nversion=${version}\npreview=${preview}\n`;if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,output);else process.stdout.write(output);
