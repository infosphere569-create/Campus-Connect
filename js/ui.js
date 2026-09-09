export function toast(message,type="info"){
 let host=document.querySelector("#toastHost");
 if(!host){host=document.createElement("div");host.id="toastHost";host.className="toast-host";document.body.appendChild(host);}
 const el=document.createElement("div");el.className=`toast toast-${type}`;el.setAttribute("role","status");el.textContent=message;
 host.appendChild(el);setTimeout(()=>el.remove(),3200);
}
export function setBusy(button,busy,label="Working…"){
 if(!button)return;
 if(busy){button.dataset.oldLabel=button.textContent;button.disabled=true;button.textContent=label;}
 else{button.disabled=false;button.textContent=button.dataset.oldLabel||button.textContent;}
}
