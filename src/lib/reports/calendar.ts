/** Cairo business-day boundaries, including daylight-saving transitions. */
const formatter = new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"});
export function cairoDate(date:Date):string {
  const parts=formatter.formatToParts(date);const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function nextDate(value:string,days=1):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error("INVALID_DATE");
  const start=new Date(value+"T00:00:00.000Z");
  if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==value)throw Error("INVALID_DATE");
  start.setUTCDate(start.getUTCDate()+days);return start.toISOString().slice(0,10);
}
export function cairoDayStart(value:string):Date {
  nextDate(value,0);const midnight=Date.parse(value+"T00:00:00.000Z");let low=midnight-36*3600000,high=midnight+36*3600000;
  while(low<high){const middle=Math.floor((low+high)/2);if(cairoDate(new Date(middle))<value)low=middle+1;else high=middle;}
  return new Date(low);
}
export function reportRange(start:string,end:string){
  nextDate(start,0);nextDate(end,0);const days=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000+1;
  if(days<1||days>31)throw Error("INVALID_RANGE");return {start:cairoDayStart(start),end:cairoDayStart(nextDate(end)),days};
}
