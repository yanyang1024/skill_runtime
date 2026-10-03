/* Optional browser acceptance test. Start APP_MODE=demo python run.py first. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.TEST_BASE_URL||"http://127.0.0.1:8000";
const shots=path.resolve(__dirname,"../docs/screenshots");
fs.mkdirSync(shots,{recursive:true});

(async()=>{
 let browser;const checks=[],errors=[];
 const check=(name,condition=true)=>{assert.ok(condition,name);checks.push(name);};
 try{
  let args=[],executablePath=process.env.CHROMIUM_EXECUTABLE_PATH;
  // Optional binary for constrained Linux test hosts; not needed on normal desktops.
  if(process.env.CHROMIUM_BUNDLE_PATH){const {default:bundle}=await import(process.env.CHROMIUM_BUNDLE_PATH);args=bundle.args;executablePath=await bundle.executablePath();}
  browser=await chromium.launch({headless:true,executablePath,args});
  const context=await browser.newContext({viewport:{width:1440,height:1020},locale:"zh-CN",reducedMotion:"reduce",acceptDownloads:true});
  const page=await context.newPage();page.on("pageerror",err=>errors.push(err.message));
  async function localTestFont(){
   const fontDir=process.env.QA_FONT_DIR;if(!fontDir)return;
   await page.route("**/qa-font/**",route=>{const filename=path.basename(new URL(route.request().url()).pathname);route.fulfill({contentType:"font/woff2",body:fs.readFileSync(path.join(fontDir,"files",filename))});});
   const css=fs.readFileSync(path.join(fontDir,"index.css"),"utf8").replaceAll("./files/","/qa-font/");
   await page.addStyleTag({content:css+'\n:root{font-family:"Noto Sans SC",system-ui,sans-serif}'});
   await page.evaluate(()=>document.fonts.ready);
  }
  const mode=await context.request.get(base+"/api/config");check("demo mode required",(await mode.json()).mode==="demo");
  await page.goto(base+"/adapted");await page.locator("#mode-badge").filter({hasText:"演示模式"}).waitFor();await localTestFont();
  await page.click("#suggest-example");await page.click("#suggest-btn");await page.locator("#suggestion:not(.hidden)").waitFor();
  check("suggestion does not modify form",await page.inputValue("#metric")==="sessions");
  await page.click("#apply-btn");check("applying patch changes known fields",await page.inputValue("#metric")==="tool_failure_rate"&&await page.inputValue("#date-from")==="2026-09-05");
  check("applying patch does not auto-submit",await page.locator("#result-empty").isVisible());
  await page.click("#analyze-btn");await page.locator("#result-state").filter({hasText:"已计算"}).waitFor();check("submitted scope has two departments",await page.locator("#metric-cards .metric-card").count()===2);
  await page.click("#explain-btn");await page.locator("#explain-content:not(.hidden)").waitFor();check("demo explanation explicitly labelled",await page.locator("#explain-origin").innerText()==="演示规则解读");
  const downloadEvent=page.waitForEvent("download");await page.click("#export-btn");check("form report downloads",(await downloadEvent).suggestedFilename()==="usage-analysis.md");
  await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById("toast").classList.add("hidden");});await page.screenshot({path:path.join(shots,"adapted.png"),fullPage:true});
  await page.fill("#suggest-instruction","看活跃用户");await page.click("#suggest-btn");await page.locator("#suggestion:not(.hidden)").waitFor();await page.fill("#report-title","人工更名");check("stale patch cannot overwrite a changed form",await page.locator("#apply-btn").isDisabled());check("old result is labelled after form edit",await page.locator("#stale-result").isVisible());

  await page.goto(base+"/native");await page.locator("#mode-badge").filter({hasText:"演示模式"}).waitFor();await localTestFont();
  await page.fill("#goal-input","帮我看看各部门的使用情况，整理一份报告。");await page.click("#start-btn");await page.locator("#clarification-panel:not(.hidden)").waitFor();check("vague goal reaches structured clarification",await page.locator("#task-status").innerText()==="等待条件确认");
  await page.selectOption("#clarify-metric","tool_failure_rate");await page.uncheck('input[name="clarify-department"][value="设备"]');await page.fill("#clarify-from","2026-09-05");await page.fill("#clarify-to","2026-09-10");await page.click("#clarify-btn");await page.locator("#draft-panel:not(.hidden)").waitFor();
  check("draft does not become current artifact automatically",await page.locator("#artifact-version").innerText()==="v0"&&await page.locator("#artifact-empty").isVisible());
  check("confirmed scope used in draft",(await page.locator("#draft-scope").innerText()).includes("2026-09-05"));
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(shots,"native-draft.png"),fullPage:true});
  await page.click("#edit-tab");await page.fill("#artifact-editor","# 人工补充\n\n请优先核查权限错误，暂不判断部门绩效。");await page.click("#save-edit-btn");await page.locator("#artifact-version").filter({hasText:"v1"}).waitFor();
  check("human edit invalidates older candidate",await page.locator("#accept-btn").isDisabled()&&await page.locator("#draft-conflict").isVisible());
  await page.click("#refresh-draft-btn");await page.locator("#draft-version").filter({hasText:"基于 v1"}).waitFor();check("reproposal preserves human context",(await page.locator("#draft-prose").innerText()).includes("权限错误"));
  await page.click("#accept-btn");await page.locator("#artifact-version").filter({hasText:"v2"}).waitFor();await page.click("#preview-tab");check("acceptance produces current report",await page.locator("#artifact-preview").isVisible()&&!(await page.locator("#draft-panel").isVisible()));
  const nativeDownload=page.waitForEvent("download");await page.click("#export-btn");check("native report downloads",(await nativeDownload).suggestedFilename()==="usage-report-v2.md");
  await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById("toast").classList.add("hidden");});await page.screenshot({path:path.join(shots,"native-current.png"),fullPage:true});
  await page.reload();await page.locator("#artifact-version").filter({hasText:"v2"}).waitFor();await localTestFont();check("refresh restores task and artifact",(await page.locator("#artifact-prose").innerText()).includes("权限错误"));
  await page.fill("#followup-input","建议收敛到两条，再生成一份草稿。");await page.click("#followup-btn");await page.locator("#draft-panel:not(.hidden)").waitFor();check("followup creates new candidate with two recommendations",await page.locator("#draft-prose ol li").count()===2);await page.click("#discard-btn");await page.locator("#task-status").filter({hasText:"可继续任务"}).waitFor();check("discard retains accepted report",await page.locator("#artifact-version").innerText()==="v2");
  await page.click("#new-task");await page.fill("#goal-input","比较研发的工具失败率");await page.click("#start-btn");await page.locator("#cancel-btn:not(.hidden)").waitFor();await page.click("#cancel-btn");await page.locator("#task-status").filter({hasText:"本轮已停止"}).waitFor();await page.waitForTimeout(800);check("cancelled run cannot produce late candidate",!(await page.locator("#draft-panel").isVisible()));

  await page.setViewportSize({width:390,height:844});await page.goto(base+"/adapted");await page.locator("#mode-badge").filter({hasText:"演示模式"}).waitFor();await localTestFont();await page.click("#analyze-btn");await page.locator("#result-content:not(.hidden)").waitFor();check("form has no mobile horizontal overflow",await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(shots,"adapted-mobile.png"),fullPage:true});
  await page.goto(base+"/native");await page.locator("#task-status").filter({hasText:"本轮已停止"}).waitFor();await localTestFont();await page.click("#mobile-new");await page.fill("#goal-input","比较研发和工艺的工具失败率");await page.click("#start-btn");await page.locator("#draft-panel:not(.hidden)").waitFor();check("native has no mobile horizontal overflow",await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(shots,"native-mobile.png"),fullPage:true});
  await page.click("#edit-tab");const originalText='# 测试文本\n\n<img src="x" onerror="window.XSS=1">';await page.fill("#artifact-editor",originalText);
  let release,signalHeld;const held=new Promise(resolve=>signalHeld=resolve),releaseResponse=new Promise(resolve=>release=resolve),artifactPattern="**/api/native/tasks/*/artifact";
  await page.route(artifactPattern,async route=>{const response=await route.fetch();signalHeld();await releaseResponse;await route.fulfill({response});});
  await page.click("#save-edit-btn");await held;await page.fill("#artifact-editor",originalText+"\n\n保存期间继续写下的补充。");release();await page.locator("#artifact-version").filter({hasText:"v1"}).waitFor();await page.unroute(artifactPattern);
  check("edits made during a pending save remain unsaved",(await page.inputValue("#artifact-editor")).includes("保存期间")&&(await page.locator("#edit-state").innerText()).includes("未保存"));
  await page.click("#save-edit-btn");await page.locator("#artifact-version").filter({hasText:"v2"}).waitFor();await page.click("#preview-tab");check("later edits can be saved against the new version",(await page.locator("#artifact-prose").innerText()).includes("保存期间"));check("model and user HTML rendered as text",await page.locator("#artifact-prose img").count()===0&&await page.evaluate(()=>window.XSS===undefined));
  check("no browser JavaScript exceptions",errors.length===0);
  fs.writeFileSync(path.resolve(__dirname,"../docs/browser-results.json"),JSON.stringify({browser:await browser.version(),viewport:"1440×1020 / 390×844",checks,errors,live_llm_tested:false},null,2));
  console.log(JSON.stringify({passed:checks.length,browser:await browser.version(),errors},null,2));
 }finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
