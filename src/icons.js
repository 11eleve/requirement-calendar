/* Resource symbols are bundled so lists also work offline.
 * DingTalk path: Ant Design Icons, MIT. Source and license below.
 * Figma path: Simple Icons, CC0-1.0. See THIRD_PARTY_NOTICES.md.
 *
 * MIT LICENSE
 * 
 * Copyright (c) 2018-present Ant UED, https://xtech.antfin.com/
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * 
 */
(() => {
  const namespace = 'http://www.w3.org/2000/svg';
  const symbols = {
    '钉': { name:'dingtalk', viewBox:'0 0 1024 1024', filled:true, paths:["M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1-5 61.1 33.6 160.5 53.6 182.8 19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8 11.4 61.7 64.9 131.8 107.2 138.4 42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8-33.1 12.5 24 62.6 24 62.6 84.7 76.8 129.7 50.5 129.7 50.5 33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8 17-71.3-114.5-99.4-265.8-154.5z"] },
    F: { name:'figma', filled:true, paths:["M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z"] },
    G: { name:'repository', paths:['M7 8v8m10-8v2a4 4 0 0 1-4 4H7'], circles:[[7,5,3],[7,19,3],[17,5,3]] },
    '稿': { name:'design', paths:['M14 5H5v14h14v-9','m12 12 7-7 2 2-7 7-3 1z'] },
    '码': { name:'code', paths:['m8 7-5 5 5 5','m16 7 5 5-5 5','m14 4-4 16'] },
    '文': { name:'document', paths:['M14 3H5v18h14V8z','M14 3v5h5','M8 12h8','M8 16h6'] }
  };
  function symbol(value='文') {
    const definition = Object.hasOwn(symbols,value) ? symbols[value] : null;
    if (!definition) return document.createTextNode(value);
    const svg = document.createElementNS(namespace,'svg');
    svg.setAttribute('viewBox',definition.viewBox || '0 0 24 24');
    svg.setAttribute('class','rf-resource-symbol');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    svg.dataset.symbol=definition.name;
    if (definition.filled) svg.dataset.filled='true';
    for (const d of definition.paths) {
      const path=document.createElementNS(namespace,'path');
      path.setAttribute('d',d);svg.append(path);
    }
    for (const [cx,cy,r] of definition.circles || []) {
      const circle=document.createElementNS(namespace,'circle');
      for (const [name,value] of Object.entries({cx,cy,r})) circle.setAttribute(name,String(value));
      svg.append(circle);
    }
    return svg;
  }
  window.CalendarIcons=Object.freeze({symbol});
})();
