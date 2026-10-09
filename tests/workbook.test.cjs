const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),Workbook=require('../src/workbook.js'),Model=require('../src/model.js'),{workbookBytes,writeWorkbook}=require('../electron/workbook.cjs');
const item={id:'req<&1',title:'=HYPERLINK("https://example.com")',start:'2026-10-01',end:'2026-11-06',tone:'rose',phases:[{name:'评审&接口',start:'2026-10-01',end:'2026-10-03'}],milestones:[{id:'node1',name:'灰度发布🚀',date:'2026-10-20',kind:'release',done:false}],resources:[{name:'接口<契约>',type:'PRD',url:'https://example.com/?a=1&b=2'}],tasks:['@保留文字'],done:[true],note:'    评审结论\r\n\t接口约定 & <x>  ',reminder:'2026-10-19T09:30'};
const snapshot=requirements=>({version:7,anchor:'2026-10-01',requirements:requirements??[item]});
function entries(bytes){const data=Buffer.from(bytes),parts=new Map();let offset=0;while(data.readUInt32LE(offset)===0x04034b50){const length=data.readUInt32LE(offset+18),nameSize=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28),name=data.subarray(offset+30,offset+30+nameSize).toString('utf8'),start=offset+30+nameSize+extra,body=data.subarray(start,start+length);assert.equal(Workbook.crc32(body),data.readUInt32LE(offset+14));parts.set(name,body.toString('utf8'));offset=start+length;}assert.equal(data.readUInt32LE(data.length-22),0x06054b50);assert.equal(parts.size,data.readUInt16LE(data.length-12));return parts;}
test('xlsx: complete five-sheet package preserves names, node dates, typed values and literal formulas',()=>{
 const out=Workbook.create(snapshot(),{today:'2026-10-10'}),files=entries(out.bytes);assert.equal(out.name,'需求排期-2026-10-10.xlsx');assert.equal(files.size,10);assert.deepEqual(out.counts.map(value=>value.rows),[1,1,1,1,1]);
 assert.ok(files.get('xl/workbook.xml').includes('时间节点'));assert.ok(files.get('xl/worksheets/sheet2.xml').includes('灰度发布🚀'));
 const summary=files.get('xl/worksheets/sheet1.xml');assert.ok(summary.includes('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;https://example.com&quot;)'));assert.ok(!summary.includes('<f>'));assert.ok(summary.includes(`s="2"><v>${Workbook.serial(item.start)}</v>`));assert.ok(summary.includes('s="4"><v>1</v>'));assert.ok(summary.includes('xSplit="2" ySplit="1"'));assert.ok(summary.includes('<autoFilter ref="A1:O2"'));
 assert.ok(summary.includes('&#13;\n\t接口约定 &amp; &lt;x&gt;  '));assert.ok(files.get('xl/worksheets/sheet5.xml').includes('?a=1&amp;b=2'));
 assert.equal(Workbook.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
});
test('xlsx: calendar dates respect leap years and early dates stay legible text',()=>{
 assert.equal(Workbook.serial('1900-01-01'),1);assert.equal(Workbook.serial('1900-02-28'),59);assert.equal(Workbook.serial('1900-03-01'),61);assert.equal(Workbook.serial('9999-12-31'),2958465);
 const early={...item,start:'0099-12-31',end:'0100-01-01',phases:[],milestones:[],reminder:null};const sheet=entries(Workbook.create(snapshot([early])).bytes).get('xl/worksheets/sheet1.xml');assert.ok(sheet.includes('0099-12-31'));assert.ok(!sheet.includes('<v>-'));
 assert.equal(Workbook.serial('2028-03-01')-Workbook.serial('2028-02-28'),2);
});
test('xlsx: long notes split into labelled continuation columns without losing Unicode or whitespace',()=>{
 const note=('    中文🚀\n'.repeat(6000))+'  ',out=Workbook.create(snapshot([{...item,note}])),files=entries(out.bytes),summary=files.get('xl/worksheets/sheet1.xml');assert.ok(summary.includes('事项与备忘（续2）'));assert.ok(!summary.includes('\ufffd'));assert.ok(summary.includes('<autoFilter ref="A1:P2"'));assert.equal(out.counts[0].rows,1);
 const raw=Workbook.tables([Model.requirement({...item,note})],'2026-10-10')[0];assert.equal(raw.rows[0].slice(14).join(''),note);assert.ok(raw.rows[0].slice(14).every(value=>value.length<=32767));
});
test('xlsx: empty and large exports retain header structure and never mutate stored inputs',()=>{
 const empty=Workbook.create(snapshot([]));assert.ok(empty.counts.every(value=>value.rows===0));assert.ok(entries(empty.bytes).get('xl/worksheets/sheet2.xml').includes('<autoFilter ref="A1:G1"'));
 const items=Array.from({length:1000},(_,i)=>({...item,id:'r-'+i})),raw=JSON.stringify(items),out=Workbook.create(snapshot(items));assert.equal(out.counts[0].rows,1000);assert.equal(out.counts[1].rows,1000);assert.equal(JSON.stringify(items),raw);assert.ok(out.bytes.length>100000);
});
test('desktop xlsx: atomic export replaces only the selected target and fails without damaging it',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'calendar-xlsx-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const file=path.join(directory,'planning.xlsx'),out=Workbook.create(snapshot());
 const payload={name:out.name,base64:Buffer.from(out.bytes).toString('base64')},bytes=workbookBytes(payload);await fs.writeFile(file,'old');await writeWorkbook(file,bytes);assert.deepEqual(await fs.readFile(file),bytes);assert.deepEqual(await fs.readdir(directory),['planning.xlsx']);
 await assert.rejects(writeWorkbook(path.join(directory,'missing','planning.xlsx'),bytes));assert.deepEqual(await fs.readFile(file),bytes);
 for(const name of ['../bad.xlsx','bad.txt'])assert.throws(()=>workbookBytes({...payload,name}),/无效/);
 for(const base64 of ['YQ==','%%%','UEsDBA======'])assert.throws(()=>workbookBytes({...payload,base64}),/无效/);
});
