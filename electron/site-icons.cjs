'use strict';
const https=require('node:https');
const dns=require('node:dns');
const net=require('node:net');
function publicAddress(address) {
  if(net.isIP(address)===4) {
    const [a,b]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));
  }
  // Public global unicast only; mapped IPv4, local and multicast are excluded.
  return net.isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:db8:/i.test(address);
}
function iconOrigin(raw) {
  try {
    const url=new URL(raw),host=url.hostname.replace(/^\[|\]$/g,'');
    if(url.protocol!=='https:'||url.origin!==raw||url.username||url.password||url.port||host==='localhost'||host.endsWith('.local')||!host.includes('.')||net.isIP(host)&&!publicAddress(host))return null;
    return url;
  } catch{return null;}
}
function fetchIcon(raw,nativeImage) {
  const origin=iconOrigin(raw);if(!origin)return Promise.resolve(null);
  return new Promise(resolve=>{
    let ended=false;const finish=value=>{if(!ended){ended=true;clearTimeout(timer);resolve(value);}};
    const request=https.get(new URL('/favicon.ico',origin),{
      headers:{Accept:'image/png,image/x-icon,image/vnd.microsoft.icon'},
      lookup(host,options,callback) {
        dns.lookup(host,{all:true},(error,addresses)=>{
          if(error||!addresses.length||addresses.some(item=>!publicAddress(item.address)))return callback(error||new Error('Private address'));
          callback(null,options.all?addresses:addresses[0].address,addresses[0].family);
        });
      }
    },response=>{
      if(response.statusCode!==200){response.resume();finish(null);return;}
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>131072){request.destroy();finish(null);}else chunks.push(chunk);});
      response.on('error',()=>finish(null));
      response.on('end',()=>{
        try {
          const bytes=Buffer.concat(chunks),png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
          const ico=bytes.length>=6&&bytes.readUInt32LE(0)===0x10000;
          if(!png&&!ico)return finish(null);
          if(png&&(bytes.length<24||bytes.readUInt32BE(16)>512||bytes.readUInt32BE(20)>512))return finish(null);
          if(ico&&(bytes.readUInt16LE(4)>32||bytes.length<6+16*bytes.readUInt16LE(4)))return finish(null);
          const bitmap=nativeImage.createFromBuffer(bytes);
          if(bitmap.isEmpty())return finish(null);
          const image=bitmap.resize({width:32,height:32}).toPNG();
          finish(image.length<48000?'data:image/png;base64,'+image.toString('base64'):null);
        } catch{finish(null);}
      });
    });
    const timer=setTimeout(()=>{request.destroy();finish(null);},4000);
    request.on('error',()=>finish(null));
  });
}
module.exports={publicAddress,iconOrigin,fetchIcon};
