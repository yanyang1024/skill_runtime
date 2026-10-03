"use strict";
(() => {
 const {$,el,show,error,toast,api,busy,download,configure,statistics,explanation,saveText}=UI;
 let revision=0,pending=null,last=null,lastRevision=-1,explainData=null,analysisSequence=0,explaining=false;
 const labels={title:"名称",metric:"指标",departments:"部门",date_from:"开始日期",date_to:"结束日期"};
 const metricNames={sessions:"会话数",active_users:"活跃用户",tool_failure_rate:"工具失败率"};
 function values(){return {title:$("report-title").value.trim(),metric:$("metric").value,departments:Array.from(document.querySelectorAll('input[name="department"]:checked')).map(n=>n.value),date_from:$("date-from").value,date_to:$("date-to").value};}
 function changed(){revision++;show("stale-result",Boolean(last)&&revision!==lastRevision);if(pending&&pending.revision!==revision){$("apply-btn").disabled=true;$("patch-explanation").textContent="表单已改变，请重新生成建议，以免覆盖你的修改。";}}
 $("analysis-form").addEventListener("input",changed);$("analysis-form").addEventListener("change",()=>show("stale-result",Boolean(last)&&revision!==lastRevision));
 function readable(key,value){return key==="metric"?metricNames[value]:Array.isArray(value)?value.join("、"):value;}
 function checkForm(){if(!$("analysis-form").reportValidity())return false;const data=values();if(!data.departments.length){error("form-error","至少选择一个部门。");return false;}if(data.date_from>data.date_to){error("form-error","开始日期不能晚于结束日期。");return false;}error("form-error");return true;}
 $("suggest-example").addEventListener("click",()=>{$("suggest-instruction").value="看研发和工艺9月5日至10日的工具失败率";$("suggest-instruction").focus();});
 $("suggest-btn").addEventListener("click",async()=>{
   if(!checkForm())return;const instruction=$("suggest-instruction").value.trim();if(!instruction){error("suggest-error","先描述你希望修改的条件。");return;}
   const captured=revision,current=values();busy("suggest-btn",true,"生成建议中");error("suggest-error");show("suggestion",false);pending=null;
   try{const response=await api("/api/adapted/suggest",{instruction,current});pending={...response,revision:captured};$("patch-table").replaceChildren();const entries=Object.entries(response.changes);
     if(!entries.length)$("patch-table").append(el("p","hint","未提出字段修改。"));
     entries.forEach(([key,value])=>{const row=el("div");row.append(el("span","",labels[key]));const val=el("span");val.append(el("span","before",readable(key,current[key])),el("span","after",readable(key,value)));row.append(val);$("patch-table").append(row);});
     $("patch-explanation").textContent=captured===revision?response.explanation:"表单已改变，请重新生成建议，以免覆盖你的修改。";$("apply-btn").disabled=!entries.length||captured!==revision;show("suggestion");
   }catch(exc){error("suggest-error",exc.message);}finally{busy("suggest-btn",false,"生成字段建议");}
 });
 $("apply-btn").addEventListener("click",()=>{if(!pending||pending.revision!==revision)return;for(const [key,value] of Object.entries(pending.changes)){if(key==="departments"){document.querySelectorAll('input[name="department"]').forEach(n=>n.checked=value.includes(n.value));}else $( {title:"report-title",metric:"metric",date_from:"date-from",date_to:"date-to"}[key]).value=value;}
   pending=null;show("suggestion",false);changed();toast("建议已应用。检查条件后点击“生成分析”。");
 });
 $("dismiss-btn").addEventListener("click",()=>{pending=null;show("suggestion",false);});
 $("analysis-form").addEventListener("submit",async event=>{
   event.preventDefault();if(!checkForm())return;const data=values(),captured=revision,sequence=++analysisSequence;busy("analyze-btn",true,"计算中");error("form-error");
   try{const response=await api("/api/adapted/analyze",data);if(sequence!==analysisSequence)return;last={...response,values:data};lastRevision=captured;explainData=null;show("result-empty",false);show("result-content");show("explain-content",false);error("explain-error");
     $("result-sub").textContent=response.title;$("result-state").textContent="已计算";$("result-state").className="tag good";$("result-meta").replaceChildren(el("span","tag",`${data.date_from} → ${data.date_to}`),el("span","tag blue",response.result.metric.label));
     const cards=statistics($("result-table"),response.result,true);$("metric-cards").replaceChildren(...Array.from(cards.children));$("metric-cards").style.gridTemplateColumns=`repeat(${response.result.rows.length},minmax(0,1fr))`;$("metric-definition").textContent=`口径：${response.result.metric.definition}`;show("stale-result",revision!==captured);toast("统计完成。");
   }catch(exc){error("form-error",exc.message);}finally{busy("analyze-btn",false,"生成分析 ↗");}
 });
 $("explain-btn").addEventListener("click",async()=>{
   if(!last||explaining)return;const sequence=analysisSequence,data=last.values;explaining=true;busy("explain-btn",true,"生成解读中");error("explain-error");
   try{const response=await api("/api/adapted/explain",data);if(sequence!==analysisSequence)return;explainData=response;explanation($("explain-prose"),response);$("explain-origin").textContent=response.mode==="demo"?"演示规则解读":"AI 解读";show("explain-content");}
   catch(exc){if(sequence===analysisSequence)error("explain-error",exc.message);}finally{explaining=false;busy("explain-btn",false,"✦ 解释这份结果");}
 });
 $("export-btn").addEventListener("click",async()=>{if(!last)return;try{if(explainData)saveText(explainData.markdown,"usage-analysis.md");else await download("/api/adapted/export",last.values,"usage-analysis.md");toast("Markdown 已导出。");}catch(exc){error("explain-error",exc.message);}});
 configure().catch(exc=>error("page-error",exc.message));
})();
