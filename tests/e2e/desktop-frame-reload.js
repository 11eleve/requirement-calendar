const info=await webkit.messageHandlers.calendar.postMessage({action:'verifyWindow'});
if(info.width!==980||info.height!==700)throw new Error('A separate process did not restore the saved native frame');
return {restored:info};
