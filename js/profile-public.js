export function safePublicProfile(data={}){
 return {name:data.name||data.displayName||"Campus Student",photoURL:data.photoURL||"",course:data.course||"",branch:data.branch||"",year:data.year||"",section:data.section||"",bio:data.bio||"",badges:Array.isArray(data.badges)?data.badges:[]};
}
