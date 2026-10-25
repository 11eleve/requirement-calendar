/* The assistant uses the native host bridge. Credentials and network requests
   stay outside the renderer; model text is always rendered as plain text. */
window.CalendarReady.then(()=>{
 const root=document.getElementById('req-calendar-refined'),toolbar=root.querySelector('.rf-toolbar');
 const bridge=window.CalendarDesktop||window.webkit?.messageHandlers?.calendar;
 const el=(tag,classes,text)=>{const node=document.createElement(tag);node.className=classes||'';if(text!==undefined)node.textContent=text;return node;};
 const toggle=el('button','rf-assistant-toggle','日历助手');toggle.type='button';toggle.setAttribute('aria-label','日历助手');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','rf-assistant');toolbar.append(toggle);
 const panel=el('aside','rf-assistant');panel.id='rf-assistant';panel.hidden=true;panel.setAttribute('aria-label','日历助手');
 panel.innerHTML=`
  <div class="rf-ai-head"><div><h3>日历助手</h3><p>更懂你的安排</p></div><div class="rf-ai-actions"><button type="button" data-ai="settings" class="rf-button">设置</button><button type="button" data-ai="close" class="rf-close" aria-label="关闭日历助手">×</button></div></div>
  <p data-ai="error" class="rf-ai-error" role="alert" hidden></p>
  <div data-ai="chat" class="rf-ai-chat">
   <div class="rf-ai-history"><label><span class="rf-ai-sr">选择历史对话</span><select data-ai="history" aria-label="选择历史对话"></select></label><button type="button" data-ai="new" class="rf-ai-link">新对话</button></div>
   <div data-ai="messages" class="rf-ai-messages" role="log" aria-label="与日历助手的对话" aria-live="polite"></div>
   <div data-ai="empty" class="rf-ai-empty"><span class="rf-ai-mark" aria-hidden="true">✳</span><h3>这周，想先安排什么？</h3><p>聊聊想法、查看安排，或让助手帮你整理需求。</p><button type="button" class="rf-ai-suggestion">看看本周有哪些需求</button><button type="button" class="rf-ai-suggestion">帮我检查接下来两周的排期冲突</button><button type="button" class="rf-ai-suggestion">我想把一个新想法整理成需求</button></div>
   <p data-ai="setup" class="rf-ai-setup" hidden>连接 DeepSeek 后，即可在这里对话。<button type="button" class="rf-ai-link" data-ai="connect">连接 AI</button></p>
   <form data-ai="composer" class="rf-ai-composer"><label class="rf-ai-sr" for="rf-ai-input">给日历助手发消息</label><textarea id="rf-ai-input" rows="3" maxlength="16000" placeholder="例如：把登录优化安排在下周，周五验收…"></textarea><div class="rf-ai-compose-actions"><span data-ai="status" role="status">按 Enter 发送，Shift+Enter 换行</span><button data-ai="send" type="submit" class="rf-button rf-primary">发送</button><button data-ai="stop" type="button" class="rf-button" hidden>停止</button></div></form>
  </div>
  <form data-ai="configuration" class="rf-ai-configuration" hidden>
   <div class="rf-ai-section"><h3>连接 DeepSeek</h3><label>API Key<input data-ai="key" type="password" autocomplete="off" spellcheck="false" placeholder="填写你的 API Key"></label><button type="button" data-ai="clearKey" class="rf-ai-link" hidden>清除已保存的密钥</button><label>模型<input data-ai="model" spellcheck="false" placeholder="deepseek-flash"></label><label>服务地址<input data-ai="baseURL" type="url" spellcheck="false"></label><p class="rf-ai-help">默认地址已填写；自定义服务需要兼容 Messages 接口。</p></div>
   <div class="rf-ai-section"><h3>让助手更了解你</h3><label>我的工作习惯<textarea data-ai="preferences" rows="3" maxlength="8000" placeholder="例如：周五留给验收；大需求先拆阶段；回复尽量简短。"></textarea></label><p class="rf-ai-help">主动告诉助手你的偏好，它会结合当前日期和正在看的月份安排工作。</p></div>
   <fieldset class="rf-ai-section rf-ai-permissions"><legend>允许助手做什么</legend><p class="rf-ai-help">权限开关立即生效，也适用于本机 API。</p><label><input type="checkbox" data-permission="read"><span>读取需求<small>查询安排、详情与排期</small></span></label><label><input type="checkbox" data-permission="create"><span>创建需求<small>把想法保存到日历</small></span></label><label><input type="checkbox" data-permission="update"><span>修改需求<small>编辑内容、整体调整日期</small></span></label><label><input type="checkbox" data-permission="delete"><span>删除需求<small>删除你明确指定的需求</small></span></label></fieldset>
   <div class="rf-ai-section"><label class="rf-ai-api-switch"><input type="checkbox" data-ai="apiEnabled"><span>允许本机 API 调用</span></label><p class="rf-ai-help">供其他 AI 或本机脚本使用，需要访问令牌。</p><div data-ai="api" class="rf-ai-api" hidden><label>本机地址<input data-ai="apiURL" readonly></label><label>访问令牌<input data-ai="apiToken" type="password" readonly autocomplete="off"></label><div class="rf-ai-actions"><button type="button" data-ai="showToken" class="rf-ai-link">显示令牌</button><button type="button" data-ai="rotateToken" class="rf-ai-link">更换令牌</button></div><p class="rf-ai-help">请求使用 Authorization: Bearer TOKEN。写入还需要 If-Match: REVISION。</p></div></div>
   <p class="rf-ai-privacy">消息、已授权读取的需求和工作习惯会发送到你配置的模型服务。密钥由系统加密保存，对话历史保存在本机。</p>
   <div class="rf-ai-settings-actions"><button type="button" data-ai="back" class="rf-button">返回对话</button><button type="submit" data-ai="save" class="rf-button rf-primary">保存设置</button></div>
  </form>`;
 root.querySelector('.rf-content').append(panel);
 const get=name=>panel.querySelector('[data-ai="'+name+'"]');
 let opened=false,configuration=false,current=null,timer=null,polling=false,messageSignature='',historySignature='',configurationQueue=Promise.resolve(),navigationQueue=Promise.resolve(),navigating=0;
 const messages=get('messages');
 new ResizeObserver(()=>{if(opened&&!configuration)messages.scrollTop=messages.scrollHeight;}).observe(messages);
 function error(message){get('error').hidden=!message;get('error').textContent=message||'';}
 function context(){return window.CalendarApp.aiContext();}
 async function call(request){if(!bridge)throw Error('请安装桌面版使用日历助手；浏览器预览不保存 API Key。');return bridge.postMessage({action:'assistant',request});}
 function render(state){
  current=state;
  if(state.keyIssue)error(state.keyIssue);
  get('empty').hidden=state.messages.length>0;get('messages').hidden=!state.messages.length;
  const history=JSON.stringify([state.conversations,state.current]);
  if(history!==historySignature){historySignature=history;get('history').replaceChildren(...state.conversations.map(c=>{const option=el('option','',c.title);option.value=c.id;option.selected=c.id===state.current;return option;}));}
  const signature=JSON.stringify(state.messages);
  if(signature!==messageSignature){
   messageSignature=signature;const list=get('messages'),bottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
   list.replaceChildren(...state.messages.map(message=>{
    const node=el('div','rf-ai-message rf-ai-'+message.role+(message.status==='pending'?' is-pending':''));
    node.append(el('span','rf-ai-speaker',message.role==='user'?'你':message.role==='assistant'?'日历助手':'日历操作'));
    node.append(el('p','',message.content));
    if(message.role==='tool'&&message.ok&&message.requirementId&&message.action!=='delete'){
     const open=el('button','rf-ai-link','打开需求');open.type='button';open.addEventListener('click',()=>{close();window.CalendarApp.openRequirement(message.requirementId);});node.append(open);
    }
    return node;
   }));
   if(bottom||state.busy)list.scrollTop=list.scrollHeight;
  }
  get('setup').hidden=state.hasKey;get('send').hidden=state.busy;get('stop').hidden=!state.busy;get('send').disabled=!state.hasKey||navigating>0;
  get('status').textContent=state.busy?'正在处理你的安排…':navigating?'正在打开对话…':'按 Enter 发送，Shift+Enter 换行';
  get('history').disabled=state.busy||navigating>0;get('new').disabled=state.busy||navigating>0;
  if(configuration){for(const name of ['model','baseURL','preferences','key','save','clearKey','apiEnabled'])get(name).disabled=state.busy;}
 }
 async function refresh(){if(polling)return;polling=true;try{render(await call({method:'state'}));}catch(e){error(e.message);}finally{polling=false;}}
 function close(){opened=false;panel.hidden=true;root.classList.remove('has-assistant');toggle.setAttribute('aria-expanded','false');clearInterval(timer);timer=null;toggle.focus({preventScroll:true});}
 async function open(){opened=true;panel.hidden=false;root.classList.add('has-assistant');toggle.setAttribute('aria-expanded','true');await refresh();if(!timer)timer=setInterval(refresh,800);if(!configuration)get('composer').querySelector('textarea').focus({preventScroll:true});}
 function fillAPI(){if(!current)return;get('apiEnabled').checked=current.settings.apiEnabled;get('api').hidden=!current.api.enabled;get('apiURL').value=current.api.url;get('apiToken').value=current.api.token||'';get('apiToken').type='password';get('showToken').textContent='显示令牌';}
 function fillSettings(){
  if(!current)return;
  for(const name of ['model','baseURL','preferences'])get(name).value=current.settings[name];
  get('key').value='';get('key').placeholder=current.hasKey?'已保存，留空保持不变':'填写你的 API Key';get('clearKey').hidden=!current.hasKey;
  panel.querySelectorAll('[data-permission]').forEach(input=>{input.checked=current.settings.permissions[input.dataset.permission];});
  fillAPI();render(current);
 }
 function showSettings(show){configuration=show;get('configuration').hidden=!show;get('chat').hidden=show;error('');if(show){fillSettings();get('key').focus({preventScroll:true});}else get('composer').querySelector('textarea').focus({preventScroll:true});}
 async function action(request){error('');try{const state=await call(request);render(state);return state;}catch(e){error(e.message);return null;}}
 function configure(build){
  configurationQueue=configurationQueue.then(async()=>{try{const latest=await call({method:'state'});render(latest);return await action(build(latest));}catch(e){error(e.message);return null;}});
  return configurationQueue;
 }
 function navigate(request){
  navigating++;if(current)render(current);
  navigationQueue=navigationQueue.then(()=>action(request)).finally(()=>{navigating--;if(current)render(current);});
  return navigationQueue;
 }
 toggle.addEventListener('click',()=>opened?close():void open());get('close').addEventListener('click',close);
 get('settings').addEventListener('click',()=>showSettings(!configuration));get('connect').addEventListener('click',()=>showSettings(true));get('back').addEventListener('click',()=>showSettings(false));
 get('new').addEventListener('click',()=>void navigate({method:'new'}));get('history').addEventListener('change',()=>void navigate({method:'select',id:get('history').value}));
 get('stop').addEventListener('click',()=>void action({method:'cancel'}));
 panel.querySelectorAll('.rf-ai-suggestion').forEach(button=>button.addEventListener('click',()=>{get('composer').querySelector('textarea').value=button.textContent;get('composer').querySelector('textarea').focus();}));
 const input=get('composer').querySelector('textarea');
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!current?.busy)get('composer').requestSubmit();}});
 get('composer').addEventListener('submit',async event=>{event.preventDefault();const text=input.value.trim();if(!text)return;await Promise.all([configurationQueue,navigationQueue]);const state=await action({method:'send',text,context:context()});if(state)input.value='';});
 get('configuration').addEventListener('submit',async event=>{
  event.preventDefault();if(!current)return;
  const fields={model:get('model').value.trim(),baseURL:get('baseURL').value.trim(),preferences:get('preferences').value};
  const apiKey=get('key').value.trim();get('key').value='';
  const state=await configure(latest=>({method:'configure',settings:{...latest.settings,...fields},...apiKey?{apiKey}:{}}));if(state)showSettings(false);
 });
 panel.querySelectorAll('[data-permission]').forEach(input=>input.addEventListener('change',()=>{
  const checked=input.checked;
  void configure(latest=>({method:'configure',settings:{...latest.settings,permissions:{...latest.settings.permissions,[input.dataset.permission]:checked}}})).then(state=>{if(!state&&current)input.checked=current.settings.permissions[input.dataset.permission];});
 }));
 get('apiEnabled').addEventListener('change',async()=>{const enabled=get('apiEnabled').checked;await configure(latest=>({method:'configure',settings:{...latest.settings,apiEnabled:enabled}}));fillAPI();});
 get('clearKey').addEventListener('click',async()=>{if(current){await configure(latest=>({method:'configure',settings:latest.settings,clearKey:true}));get('clearKey').hidden=!current.hasKey;get('key').placeholder=current.hasKey?'已保存，留空保持不变':'填写你的 API Key';}});
 get('rotateToken').addEventListener('click',async()=>{await configure(()=>({method:'rotateToken'}));fillAPI();});
 get('showToken').addEventListener('click',()=>{const visible=get('apiToken').type==='password';get('apiToken').type=visible?'text':'password';get('showToken').textContent=visible?'隐藏令牌':'显示令牌';});
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.stopPropagation();if(configuration)showSettings(false);else close();}});
});
