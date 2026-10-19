const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const {emptyProfile,ProfileStore}=require('../lib/autofill/profile');
const {createAutofill}=require('../lib/autofill/service');
const beisen=require('../lib/autofill/beisen');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'careersail-autofill-'));let browser,server;
 try{
 const store=new ProfileStore(root);let p=emptyProfile();p.basic.name='测试姓名';p.basic.phone='13800000000';p.education=[{school:'学校甲',major:'控制',start:'2024-09'},{school:'学校乙',major:'仪器'}];p.confirmed=true;store.save(p);
 assert.throws(()=>store.upload('bad.pdf',Buffer.from('not pdf').toString('base64')));store.upload('cv.pdf',Buffer.from('%PDF-1.7\ntest').toString('base64'));assert.ok(store.resumePath());assert.equal(store.save(p).resume.name,'cv.pdf');assert.throws(()=>store.save({...p,basic:{email:'bad'}}));
 assert.throws(()=>beisen.jobUrl('https://example.com/campus/detail?jobAdId=x'));assert.ok(beisen.dateEqual('2024年09月','2024-09'));
 const service=createAutofill(root);server=http.createServer((req,res)=>service.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(origin+'/api/autofill/profile',{headers:{Origin:'https://evil.example'}})).status,403);
 const loaded=await(await fetch(origin+'/api/autofill/profile')).json();assert.equal((await fetch(origin+'/api/autofill/profile',{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(origin+'/api/autofill/profile',{method:'POST',headers:{Origin:origin,'X-Autofill-Token':loaded.token,'Content-Type':'application/json'},body:JSON.stringify(p)})).status,200);
 const {chromium}=require('playwright');browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.setDefaultTimeout(1000);
 const item=(label,value='')=>`<div class="form-item"><label class="form-item__text">${label}</label><input value="${value}"></div>`;
 const edu=()=>`<div class="form" name="Recruitment_extPerfectApplicantEducation_x">${item('学校名称')}${item('专业名称')}${item('开始时间')}</div>`;
 await page.setContent(`<div class="form" name="Recruitment_extPerfectPersonProfile_x">${item('姓名')}${item('手机号','13900000000')}</div><section id="edu">${edu()}</section><button id="add">添加教育经历</button><button onclick="window.submitted=true">预览并提交</button>`);
 await page.evaluate(html=>{document.querySelector('#add').onclick=()=>document.querySelector('#edu').insertAdjacentHTML('beforeend',html);},edu());
 const result=await beisen.fill(page,p);assert.equal(result.fields.find(x=>x.field==='姓名').status,'filled');assert.equal(result.fields.find(x=>x.field==='手机号').status,'preserved');
 await beisen.fill(page,p);assert.equal(await page.locator('.form[name^="Recruitment_extPerfectApplicantEducation"]').count(),2);assert.equal(await page.evaluate(()=>!!window.submitted),false);
 assert.equal(await beisen.field(page.locator('.form[name^="Recruitment_extPerfectPersonProfile"]'),'手机号').locator('input').inputValue(),'13900000000');
 // Exercise the Phoenix option and year/month UI without contacting a recruiter.
 await page.setContent(`<div id="scope"><div class="form-item"><label class="form-item__text">学历</label><div class="phoenix-select"><span id="chosen">请选择</span><input onclick="document.querySelector('#options').hidden=false"></div></div><div class="form-item"><label class="form-item__text">开始时间</label><div class="phoenix-select"><span id="date">请选择</span><input onclick="document.querySelector('#calendar').hidden=false"></div></div></div><div id="options" hidden><span onclick="document.querySelector('#chosen').textContent=this.textContent;this.parentNode.hidden=true">硕士研究生</span></div><div id="calendar" class="phoenix-calendar-month-panel" hidden><button class="phoenix-calendar-month-panel-prev-year-btn" onclick="document.querySelector('#year').textContent--">前一年</button><span id="year" class="phoenix-calendar-month-panel-year-select-content">2026</span><button class="phoenix-calendar-month-panel-next-year-btn" onclick="document.querySelector('#year').textContent++">后一年</button><button class="phoenix-calendar-month-panel-month" onclick="document.querySelector('#date').textContent=document.querySelector('#year').textContent+'年09月';this.parentNode.hidden=true">9月</button></div>`);
 const fields=[];await beisen.fillField(page,page.locator('#scope'),'学历','硕士',fields);await beisen.fillField(page,page.locator('#scope'),'开始时间','2024-09',fields);assert.deepEqual(fields.map(f=>f.status),['filled','filled']);
 await beisen.fillField(page,page.locator('#scope'),'开始时间','2023-09',fields);assert.equal(fields.at(-1).status,'preserved');
 console.log('Autofill: profile validation, PDF storage, origin/token protection, repeated records, preservation, no submission passed.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
