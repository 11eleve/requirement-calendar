'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['load','save','resourceIcon','contextMenu','exportJSON','pickJSON']);
contextBridge.exposeInMainWorld('CalendarDesktop',Object.freeze({
  postMessage(message) {
    if(!message||!allowed.has(message.action))return Promise.reject(new Error('不支持的桌面操作。'));
    return ipcRenderer.invoke('calendar:request',message);
  }
}));
