import http from 'node:http';
export function messagesResponse(content,reason='end_turn') {
 return [
  {type:'message_start',message:{id:'calendar-ui-test',model:'deepseek-flash',usage:{input_tokens:10,output_tokens:0}}},
  {type:'content_block_start',index:0,content_block:content},{type:'content_block_stop',index:0},
  {type:'message_delta',delta:{stop_reason:reason},usage:{output_tokens:10}},{type:'message_stop'},
 ].map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join('');
}
export async function startModel(operations) {
 const requests=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);requests.push(body);
  const operation=operations[requests.length-1];
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  if(operation?.pause){res.write(': waiting for cancellation\n\n');return;}
  if(Array.isArray(operation))res.end(messagesResponse({type:'tool_use',id:'calendar-call-'+requests.length,name:'calendar_'+operation[0],input:operation[1]},'tool_use'));
  else res.end(messagesResponse({type:'text',text:operation||'已完成你的安排。'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port,requests,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
