const fixture={version:6,anchor:'2027-01-10',requirements:[{id:'restart-proof',title:'跨进程保存验证',tone:'green',start:'2027-01-10',end:'2027-01-16',phases:[{name:'开发',start:'2027-01-10',end:'2027-01-16'}],resources:[{name:'资料',type:'接口',url:'https://example.com/api'}],tasks:['回归'],done:[true],note:'重新启动后应保持\n完整内容',reminder:null}]};
if(!await CalendarApp.restoreSnapshot(JSON.stringify(fixture)))throw new Error('fixture save failed');
return {saved:JSON.parse(CalendarApp.exportSnapshot())};
