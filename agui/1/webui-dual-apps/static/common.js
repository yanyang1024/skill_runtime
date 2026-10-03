"use strict";
window.UI = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, value) => {const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=String(value);return node;};
  const show = (id, visible=true) => $(id).classList.toggle("hidden", !visible);
  const error = (id, message="") => {$(id).textContent=message;show(id,Boolean(message));};
  let toastTimer;
  function toast(message){$("toast").textContent=message;show("toast");clearTimeout(toastTimer);toastTimer=setTimeout(()=>show("toast",false),4500);}
  async function api(url, body, method){
    const response=await fetch(url,{method:method||(body===undefined?"GET":"POST"),credentials:"same-origin",headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
    let data;try{data=await response.json();}catch{throw new Error("服务器响应无法读取，请确认服务已启动。");}
    if(!response.ok){const err=new Error(data.error?.message||"操作失败，请重试。");err.status=response.status;err.details=data.error;throw err;}
    return data;
  }
  function busy(id, state, label){const node=$(id);node.disabled=state;node.classList.toggle("loading",state);if(label)node.textContent=label;}
  function saveText(text, filename){const url=URL.createObjectURL(new Blob([text],{type:"text/markdown;charset=utf-8"}));const a=el("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function download(url,body,filename){const response=await fetch(url,{method:body===undefined?"GET":"POST",credentials:"same-origin",headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok){const data=await response.json();throw new Error(data.error?.message||"导出失败。");}saveText(await response.text(),filename);}
  async function configure(){const config=await api("/api/config");$("mode-badge").textContent=config.mode==="live"?"AI 已配置":"演示模式";$("mode-badge").classList.toggle("live",config.mode==="live");$("mode-badge").title=config.mode==="live"?`模型：${config.model}；调用状态以任务结果为准。`:"未调用模型；演示规则驱动交互，统计仍由服务器计算。";return config;}
  function statistics(root,result,compact=false){
    root.replaceChildren();const cards=el("div","metric-cards");cards.style.gridTemplateColumns=`repeat(${result.rows.length},minmax(0,1fr))`;
    const max=Math.max(...result.rows.map(r=>r.value||0),1);
    for(const row of result.rows){const card=el("div","metric-card");card.append(el("div","label",row.department));const value=el("div","value",row.value===null?"—":row.value);value.append(el("span","unit",result.metric.unit));card.append(value);card.append(el("div","foot",result.metric.label));const bar=el("div","bar"),fill=el("span");fill.style.width=`${(row.value||0)/max*100}%`;bar.append(fill);card.append(bar);cards.append(card);}
    if(!compact)root.append(cards);
    const wrap=el("div","table-wrap"),table=el("table"),head=el("thead"),hr=el("tr");
    ["部门",`${result.metric.label} (${result.metric.unit})`,"工具调用","失败调用"].forEach((label,i)=>hr.append(el("th",i?"numeric":"",label)));head.append(hr);table.append(head);const body=el("tbody");
    result.rows.forEach(row=>{const tr=el("tr");[row.department,row.value??"无数据",row.tool_calls,row.failed_tool_calls].forEach((value,i)=>tr.append(el("td",i?"numeric":"",value)));body.append(tr);});table.append(body);wrap.append(table);root.append(wrap);
    return cards;
  }
  function explanation(root,data){root.replaceChildren(el("p","",data.summary));const list=el("ol");data.recommendations.forEach(text=>list.append(el("li","",text)));root.append(list);if(data.notes)root.append(el("p","source-note",data.notes));}
  // Deliberately small Markdown preview: text nodes only, never model-supplied HTML.
  function markdown(root,text){
    root.replaceChildren();const lines=text.split("\n");let list=null,paragraph=[];
    function flush(){if(paragraph.length){root.append(el("p","",paragraph.join("\n")));paragraph=[];}list=null;}
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(!line.trim()){flush();continue;}
      const heading=line.match(/^(#{1,3})\s+(.+)$/);if(heading){flush();root.append(el(heading[1].length===1?"h2":"h3","",heading[2]));continue;}
      if(line.startsWith("|")&&i+1<lines.length&&/^\|[\s:|-]+\|$/.test(lines[i+1])){
        flush();const wrap=el("div","table-wrap"),table=el("table"),head=el("thead"),tr=el("tr");const cells=s=>s.trim().slice(1,-1).split("|").map(x=>x.trim());cells(line).forEach(x=>tr.append(el("th","",x)));head.append(tr);table.append(head);i++;const body=el("tbody");while(i+1<lines.length&&lines[i+1].startsWith("|")){i++;const row=el("tr");cells(lines[i]).forEach(x=>row.append(el("td","",x)));body.append(row);}table.append(body);wrap.append(table);root.append(wrap);continue;
      }
      const item=line.match(/^(?:\d+\.|[-*])\s+(.+)$/);if(item){if(paragraph.length)flush();if(!list){list=el("ol");root.append(list);}list.append(el("li","",item[1]));continue;}
      if(list)flush();paragraph.push(line);
    }
    flush();
  }
  return {$,el,show,error,toast,api,busy,saveText,download,configure,statistics,explanation,markdown};
})();
