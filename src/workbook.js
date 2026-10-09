/* Offline SpreadsheetML export. Package layout: https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document */
(function(scope){
 'use strict';
 const Model=typeof module!=='undefined'&&module.exports?require('./model.js'):scope.CalendarModel;
 const Planning=typeof module!=='undefined'&&module.exports?require('./planning.js'):scope.CalendarPlanning;
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const encode=value=>new TextEncoder().encode(value);
 const xml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
 function text(value){
  return xml(String(value).replace(/_x[0-9a-f]{4}_/gi,'_x005F_$&').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,char=>'_x'+char.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()+'_')).replace(/\r/g,'&#13;');
 }
 function chunks(value){const result=[];let part='';for(const character of String(value)){if(part.length+character.length>32767){result.push(part);part='';}part+=character;}result.push(part);return result;}
 const column=index=>{let result='';for(index++;index;index=Math.floor((index-1)/26))result=String.fromCharCode(65+(index-1)%26)+result;return result;};
 function serial(date){return Model.days('1899-12-31',date)+(date>='1900-03-01'?1:0);}
 const date=value=>({value,kind:'date'}),number=value=>({value,kind:'number'}),percent=value=>({value,kind:'percent'}),datetime=value=>({value,kind:'datetime'}),colored=(value,tone)=>({value,kind:'tone',tone});
 function expand(columns,rows){
  const counts=columns.map(()=>1);
  for(const row of rows)for(let i=0;i<columns.length;i++){const value=row[i]?.value??row[i];if(typeof value==='string')counts[i]=Math.max(counts[i],chunks(value).length);}
  const fields=columns.flatMap((value,i)=>Array.from({length:counts[i]},(_,n)=>({...value,name:value.name+(n?'（续'+(n+1)+'）':'')})));
  const values=rows.map(row=>row.flatMap((cell,i)=>{const parts=typeof(cell?.value??cell)==='string'?chunks(cell?.value??cell):[cell?.value??cell];return Array.from({length:counts[i]},(_,n)=>typeof cell==='object'&&cell!==null?{...cell,value:parts[n]??''}:parts[n]??'');}));
  return {columns:fields,rows:values};
 }
 function sheet(name,columns,rows){return {name,...expand(columns.map(([name,width])=>({name,width})),rows)};}
 function tables(items,today){
  return [
   sheet('需求汇总',[['需求标识',38],['需求名称',34],['开始日期',14],['结束日期',14],['跨度（自然日）',17],['状态',16],['当前阶段',24],['事项数',11],['已完成事项',14],['事项完成率',14],['下一待办节点',28],['节点日期',14],['配色',14],['提醒（本机时间）',23],['事项与备忘',55]],items.map(item=>{const p=Planning.progress(item),next=Planning.nextNode(item,today);return [item.id,colored(item.title,item.tone),date(item.start),date(item.end),number(Model.days(item.start,item.end)+1),Planning.STATUS[Planning.status(item,today)],Planning.currentPhase(item,today),number(p.total),number(p.done),percent(p.ratio),next?.name??'',date(next?.date??''),Model.TONES.find(tone=>tone.id===item.tone).name,datetime(item.reminder??''),item.note];})),
   sheet('时间节点',[['需求标识',38],['需求名称',34],['节点标识',38],['节点名称',32],['节点类型',14],['节点日期',14],['完成状态',14]],items.flatMap(item=>item.milestones.map(node=>[item.id,colored(item.title,item.tone),node.id,node.name,Model.NODE_KINDS.find(kind=>kind.id===node.kind).name,date(node.date),node.done?'已完成':'未完成']))),
   sheet('阶段排期',[['需求标识',38],['需求名称',34],['阶段名称',32],['开始日期',14],['结束日期',14],['跨度（自然日）',17]],items.flatMap(item=>item.phases.map(phase=>[item.id,colored(item.title,item.tone),phase.name,date(phase.start),date(phase.end),number(Model.days(phase.start,phase.end)+1)]))),
   sheet('工作事项',[['需求标识',38],['需求名称',34],['事项序号',12],['事项内容',55],['完成状态',14]],items.flatMap(item=>item.tasks.map((task,i)=>[item.id,colored(item.title,item.tone),number(i+1),task,item.done[i]?'已完成':'未完成']))),
   sheet('相关资料',[['需求标识',38],['需求名称',34],['资料名称',34],['资料类型',24],['链接',70]],items.flatMap(item=>item.resources.map(resource=>[item.id,colored(item.title,item.tone),resource.name,resource.type,resource.url])))
  ];
 }
 function cellXml(cell,address,header=false){
  const item=typeof cell==='object'&&cell!==null?cell:{value:cell},value=item.value;
  let style=header?1:item.kind==='date'?2:item.kind==='number'?3:item.kind==='percent'?4:item.kind==='datetime'?5:item.kind==='tone'?6+Math.max(0,Model.TONES.findIndex(tone=>tone.id===item.tone)):0;
  if(value===null||value===undefined||value==='')return `<c r="${address}" s="${style}"/>`;
  if((item.kind==='date'||item.kind==='datetime')&&value.slice(0,10)>='1900-01-01'){
   const days=serial(value.slice(0,10)),fraction=item.kind==='datetime'?(Number(value.slice(11,13))*60+Number(value.slice(14,16)))/1440:0;
   return `<c r="${address}" s="${style}"><v>${days+fraction}</v></c>`;
  }
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('导出数值无效。');return `<c r="${address}" s="${style}"><v>${value}</v></c>`;}
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text(value)}</t></is></c>`;
 }
 function worksheet(table){
  const end=column(table.columns.length-1)+(table.rows.length+1),rows=[table.columns.map(value=>value.name),...table.rows];
  const data=rows.map((row,i)=>`<row r="${i+1}" ht="${i===0?30:Math.min(150,Math.max(32,...row.map((cell,n)=>Math.ceil(String(cell?.value??cell??'').length/Math.max(12,table.columns[n]?.width??30))*15+14)))}" customHeight="1">${row.map((cell,n)=>cellXml(cell,column(n)+(i+1),i===0)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="C2" sqref="C2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="32"/><cols>${table.columns.map((col,i)=>`<col min="${i+1}" max="${i+1}" width="${col.width}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${end}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
 }
 function styles(){
  const color=value=>'FF'+value.replace('#','').toUpperCase(),font=value=>`<font><sz val="11"/><color rgb="${value}"/><name val="Microsoft YaHei"/></font>`;
  const fonts=font('FF28334D')+'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>'+Model.TONES.map(tone=>font(color(tone.color))).join('');
  const fill=value=>`<fill><patternFill patternType="solid"><fgColor rgb="${value}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills='<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+fill('FF6842B9')+Model.TONES.map(tone=>fill(color(tone.fill))).join('');
  const xf=(font=0,fill=0,num=0)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`;
  const formats=xf()+xf(1,2)+xf(0,0,164)+xf(0,0,1)+xf(0,0,165)+xf(0,0,166)+Model.TONES.map((_,i)=>xf(i+2,i+3)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="${Model.TONES.length+2}">${fonts}</fonts><fills count="${Model.TONES.length+3}">${fills}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1">${xf()}</cellStyleXfs><cellXfs count="${Model.TONES.length+6}">${formats}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 }
 const crcTable=Array.from({length:256},(_,index)=>{for(let n=0;n<8;n++)index=(index&1)?0xedb88320^(index>>>1):index>>>1;return index>>>0;});
 function crc32(bytes){let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
 function zip(entries){
  let offset=0;const parts=[],directory=[];
  function header(size,fields){const result=new Uint8Array(size),view=new DataView(result.buffer);for(const [at,value,bytes] of fields)bytes===4?view.setUint32(at,value,true):view.setUint16(at,value,true);return result;}
  for(const [path,source] of entries){const name=encode(path),data=encode(source),crc=crc32(data);if(data.length>0xffffffff||offset>0xffffffff)throw Error('导出文件过大，无法生成 XLSX。');
   const local=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[12,33,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]]);
   const central=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[14,33,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]);
   parts.push(local,name,data);directory.push(central,name);offset+=local.length+name.length+data.length;
  }
  const length=directory.reduce((sum,part)=>sum+part.length,0),end=header(22,[[0,0x06054b50,4],[8,entries.length,2],[10,entries.length,2],[12,length,4],[16,offset,4]]),result=new Uint8Array(offset+length+end.length);let position=0;
  for(const part of [...parts,...directory,end]){result.set(part,position);position+=part.length;}return result;
 }
 function create(raw,{today=Model.localDate()}={}){
  const snapshot=Model.snapshot(raw);if(snapshot.requirements.length>1048575)throw Error('需求数量超过 Excel 单表行数限制。');const items=snapshot.requirements.slice().sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id)),sheets=tables(items,today);
  if(sheets.some(sheet=>sheet.rows.length>1048575||sheet.columns.length>16384))throw Error('导出内容超过 Excel 单表的行列限制。');
  const entries=[['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet,i)=>`<sheet name="${xml(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rStyles" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],['xl/styles.xml',styles()],...sheets.map((sheet,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',worksheet(sheet)])];
  return {name:'需求排期-'+today+'.xlsx',bytes:zip(entries),counts:sheets.map(sheet=>({name:sheet.name,rows:sheet.rows.length}))};
 }
 const api={create,tables,serial,crc32};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.CalendarWorkbook=api;
})(globalThis);
