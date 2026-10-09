'use strict';
const Model = require('../src/model.js');
const ENTRY='calendar-app://local/index.html';
function externalURL(raw) { try { return typeof raw==='string'&&raw?Model.safeURL(raw):null; } catch{return null;} }
function requirementURL(id) { return 'requirement-calendar://requirement/'+encodeURIComponent(id); }
function requirementID(raw) {
  try {
    const url=new URL(raw);
    if(url.protocol!=='requirement-calendar:'||url.hostname!=='requirement'||url.username||url.password||url.port||url.search||url.hash)return null;
    const id=decodeURIComponent(url.pathname.slice(1));
    return id&&id.length<=256&&!/[\u0000-\u001f\u007f/\\]/.test(id)?id:null;
  } catch{return null;}
}
function trustedSender(event,window) {
  return !!window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===ENTRY;
}
module.exports={ENTRY,externalURL,requirementURL,requirementID,trustedSender};
