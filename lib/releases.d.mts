export const releasesURL: string;
export function parseVersion(value:string): {parts:number[];pre:string}|null;
export function compareVersions(a:string,b:string): number;
export function selectRelease(releases:any[],selector?:string):any;
export function nextReleaseVersion(base:string,releases:any[]):string;
export function fetchReleases(fetcher?:(...args:any[])=>Promise<Response>):Promise<any[]>;
