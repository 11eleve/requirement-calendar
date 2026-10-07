const info=await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow',save:true});
if(info.width!==980||info.height!==700)throw new Error('Native frame was not set and saved');
return {saved:info};
