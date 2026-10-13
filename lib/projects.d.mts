export interface Project {name:string;description:string;url:string;package?:string;trust?:boolean}
export interface ProjectPlan {executable:string;args:string[];dry:boolean;repo:string;url:string;preview:string;note?:string}
export const projects:Project[];
export const projectCommands:string[];
export function findProject(name:string):Project|undefined;
export function planProject(command:string,args:string[],cwd?:string):ProjectPlan;
export function runProjectCommand(command:string,args:string[],options?:{execute?:(executable:string,args:string[],options:object)=>{status?:number|null;error?:Error};log?:(text:string)=>void;cwd?:string;fetcher?:(input:string,init?:RequestInit)=>Promise<Response>}):Promise<number>;
