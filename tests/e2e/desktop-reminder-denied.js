const item={id:'denied-check',title:'通知拒绝仍可保存',tone:'',start:CalendarModel.localDate(),end:CalendarModel.localDate(),phases:[],resources:[],tasks:[],done:[],note:'',reminder:CalendarModel.add(CalendarModel.localDate(),1)+'T09:00'};
if(!await CalendarApp.restoreSnapshot(JSON.stringify({version:6,anchor:item.start,requirements:[item]})))throw new Error('denied notifications must not fail requirement persistence');
const banner=document.querySelector('#rf-reminder-status'),info=await webkit.messageHandlers.calendar.postMessage({action:'verifyReminders'});
if(banner.hidden||!banner.textContent.includes('尚未启用')||info.ids.length!==0||info.permissionRequests!==0)throw new Error('denied permission must be visible without retrying OS prompts');
return {saved:JSON.parse(CalendarApp.exportSnapshot()).requirements[0].title,status:banner.textContent,notificationAdapter:'isolated denied permission'};
