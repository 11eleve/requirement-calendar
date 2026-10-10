// Shared DOM controls. Business rules stay in domain/.
window.CalendarElements=(()=>{
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(cls,text,label,action)=>{const b=el('button',cls+' cursor-interaction',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',action);return b;};
const field=(label,input)=>{const l=el('label','rf-field');l.append(el('span','',label),input);return l;};
const input=(type,value='',placeholder='')=>{const n=el('input');n.type=type;n.value=value;n.placeholder=placeholder;if(type==='date'){n.min='0001-01-01';n.max='9999-12-31';}else if(type==='datetime-local'){n.min='0001-01-01T00:00';n.max='9999-12-31T23:59';}return n;};
 return {el,button,field,input};
})();
