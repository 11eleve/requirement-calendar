// Native desktop site icons; portable pages keep their bundled symbols offline.
(() => {
  function create(bridge) {
    const cache=new Map(),versions=new WeakMap(),queue=[];
    let active=0;
    function originFor(raw) {
      try { const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password?url.origin:null; }
      catch { return null; }
    }
    function prune() {
      while(cache.size>128){const completed=Array.from(cache).find(([,value])=>value.expires!==Infinity);if(!completed)break;cache.delete(completed[0]);}
    }
    function drain() {
      while(active<4&&queue.length) { active++;const run=queue.shift();run().finally(()=>{active--;drain();}); }
    }
    function load(origin) {
      const previous=cache.get(origin);if(previous&&previous.expires>Date.now())return previous.promise;
      const entry={expires:Infinity,promise:null};
      entry.promise=new Promise(resolve=>{
        queue.push(async()=>{
          let value=null;
          try {
            const reply=await bridge.postMessage({action:'resourceIcon',url:origin});
            if(typeof reply==='string'&&reply.length<=65536&&/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(reply))value=reply;
          } catch {}
          entry.expires=Date.now()+(value?86400000:600000);prune();resolve(value);
        });
      });
      cache.set(origin,entry);
      prune();
      drain();return entry.promise;
    }
    async function apply(badge,raw,kind='文',{fetch=true}={}) {
      const origin=originFor(raw),key=kind+'|'+(origin||''),previous=versions.get(badge);
      if(previous?.key!==key){versions.set(badge,{key});badge.replaceChildren(CalendarIcons.symbol(kind));delete badge.dataset.siteIcon;}
      badge.dataset.kind=kind;
      const version=versions.get(badge),cached=cache.get(origin);
      if(!bridge||!origin||(!fetch&&(!cached||cached.expires<=Date.now())))return false;
      const src=await load(origin);
      if(!src||!badge.isConnected||versions.get(badge)!==version)return false;
      if(badge.querySelector('img')?.src===src)return true;
      const image=new Image();image.alt='';image.className='rf-site-icon';image.src=src;
      try { await image.decode(); } catch { return false; }
      if(!badge.isConnected||versions.get(badge)!==version)return false;
      badge.replaceChildren(image);badge.dataset.siteIcon='true';return true;
    }
    return Object.freeze({apply});
  }
  window.CalendarSiteIcons=Object.freeze({create});
})();
