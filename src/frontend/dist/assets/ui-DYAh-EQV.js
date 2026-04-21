import{r as s}from"./index-CBbcooE2.js";import{c as b}from"./auth-DY4dh_FL.js";/**
 * @license lucide-react v0.503.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),C=t=>t.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,r,o)=>o?o.toUpperCase():r.toLowerCase()),c=t=>{const e=C(t);return e.charAt(0).toUpperCase()+e.slice(1)},l=(...t)=>t.filter((e,r,o)=>!!e&&e.trim()!==""&&o.indexOf(e)===r).join(" ").trim(),w=t=>{for(const e in t)if(e.startsWith("aria-")||e==="role"||e==="title")return!0};/**
 * @license lucide-react v0.503.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var h={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.503.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=s.forwardRef(({color:t="currentColor",size:e=24,strokeWidth:r=2,absoluteStrokeWidth:o,className:i="",children:a,iconNode:u,...n},p)=>s.createElement("svg",{ref:p,...h,width:e,height:e,stroke:t,strokeWidth:o?Number(r)*24/Number(e):r,className:l("lucide",i),...!a&&!w(n)&&{"aria-hidden":"true"},...n},[...u.map(([m,d])=>s.createElement(m,d)),...Array.isArray(a)?a:[a]]));/**
 * @license lucide-react v0.503.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=(t,e)=>{const r=s.forwardRef(({className:o,...i},a)=>s.createElement(g,{ref:a,iconNode:e,className:l(`lucide-${f(c(t))}`,`lucide-${t}`,o),...i}));return r.displayName=c(t),r},x=b(t=>({sidebarOpen:!1,activeTab:"chat",isMobile:!1,setSidebarOpen:e=>t({sidebarOpen:e}),setActiveTab:e=>t({activeTab:e}),setIsMobile:e=>t({isMobile:e})}));export{k as c,x as u};
//# sourceMappingURL=ui-DYAh-EQV.js.map
