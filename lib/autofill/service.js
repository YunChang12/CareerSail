const path=require('path'),crypto=require('crypto');
const {ProfileStore}=require('./profile');const beisen=require('./beisen');
function createAutofill(root){
 const store=new ProfileStore(root),token=crypto.randomBytes(24).toString('hex');let context=null,page=null,busy=false,uploadKey='',current={state:'idle',message:'尚未开始',fields:[]};
 const set=(state,message,extra={})=>current={...current,state,message,...extra};
 async function launch(){if(context&&page&&!page.isClosed())return;let chromium;try{({chromium}=require('playwright'));}catch{throw Error('缺少 Playwright，请运行 npm install');}context=await chromium.launchPersistentContext(path.join(store.dir,'browser'),{channel:'msedge',headless:false});page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(4000);context.on('close',()=>{context=null;page=null;set('closed','浏览器已关闭，重新开始可恢复登录状态');});}
 const formUrl=url=>'https://ubtrobot.zhiye.com/form?fromPage=job&jobAdId='+new URL(url).searchParams.get('jobAdId');
 async function start(input){if(busy)throw Error('已有任务正在运行');const url=beisen.jobUrl(input.url);const profile=store.read();if(!profile.confirmed)throw Error('请先校对资料并勾选确认');if(input.consent!==true)throw Error('需要确认向当前公司填写资料，网站可能自动保存');busy=true;current={state:'opening',message:'正在打开优必选填写页',jobUrl:url,fields:[],uploadRequested:input.upload===true};
  void(async()=>{try{await launch();await page.goto(formUrl(url),{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.form[name^="Recruitment_extPerfectPersonProfile"]').waitFor({timeout:7000}).catch(()=>{});const status=await beisen.inspect(page);set(status.login?'waiting_login':status.form?'ready':'waiting_form',status.login?'请在 Edge 中扫码登录，然后点击继续':status.form?'已进入表单，点击继续开始填写':'请进入申请资料页，然后点击继续');}catch(e){set('error','浏览器启动或页面打开失败：'+e.message.split('\n')[0]);}finally{busy=false;}})();return current;
 }
 async function resume(){if(busy)throw Error('正在处理，请勿重复点击');if(!page||page.isClosed())throw Error('请先开始任务');busy=true;set('checking','检查当前页面');void(async()=>{try{
   if(new URL(page.url()).hostname!=='ubtrobot.zhiye.com')throw Error('当前页面不属于优必选，已停止');
   let status=await beisen.inspect(page);if(status.login){set('waiting_login','请先完成扫码登录');return;}
   if(!status.form){await page.goto(formUrl(current.jobUrl),{waitUntil:'domcontentloaded'});await page.locator('.form[name^="Recruitment_extPerfectPersonProfile"]').waitFor({timeout:7000});status=await beisen.inspect(page);}
   if(!status.form)throw Error('未识别到北森申请表');
   const destination=new URL(page.url());if(destination.origin!=='https://ubtrobot.zhiye.com'||destination.searchParams.get('jobAdId')!==new URL(current.jobUrl).searchParams.get('jobAdId'))throw Error('当前申请表与所选岗位不一致，请重新打开目标岗位');
   const profile=store.read();if(!profile.confirmed)throw Error('资料尚未确认');
   if(current.uploadRequested){const file=store.resumePath();if(!file)throw Error('请先在资料页选择 PDF 附件');const key=profile.resume.hash+'|'+page.url();if(uploadKey!==key){set('uploading','上传简历并等待官网解析');const uploader=page.locator('input[type=file]').first();await uploader.setInputFiles(file);uploadKey=key;set('waiting_parse','附件已发送，请在官网等待解析完成或处理解析提示，再点击继续');return;}}
   set('filling','正在填写并回读核验；不会点击暂存或提交');const result=await beisen.fill(page,profile);set('review','填写结束。请检查保留项、缺失项及官网必填提示；尚未暂存或投递。',result);
  }catch(e){set('error',e.message.split('\n')[0]);}finally{busy=false;}})();return current;}
 async function readBody(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>9*1024*1024)throw Error('请求过大');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
 function allowed(req){const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return false;const origin=req.headers.origin;if(origin&&origin!=='http://'+host)return false;if(req.headers['sec-fetch-site']==='cross-site')return false;return req.method==='GET'||(origin==='http://'+host&&req.headers['x-autofill-token']===token);}
 async function handle(req,res,url){if(!url.pathname.startsWith('/api/autofill/'))return false;const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  if(!allowed(req)){send(403,{error:'仅允许从本地看板访问自动填写资料'});return true;}
  try{let result;if(req.method==='GET'&&url.pathname==='/api/autofill/profile')result={profile:store.read(),token};else if(req.method==='GET'&&url.pathname==='/api/autofill/status')result={...current,busy};else if(req.method==='POST'){
    const data=await readBody(req);if(url.pathname==='/api/autofill/profile'){if(busy)throw Error('执行期间不能修改资料');result={profile:store.save(data)};}
    else if(url.pathname==='/api/autofill/resume'){if(busy)throw Error('执行期间不能更换简历');result={resume:store.upload(data.name,data.base64)};}
    else if(url.pathname==='/api/autofill/start')result=await start(data);else if(url.pathname==='/api/autofill/continue')result=await resume();else throw Error('未知操作');
   }else{send(404,{error:'未找到接口'});return true;}send(200,result);
  }catch(e){send(400,{error:e.message});}return true;
 }
 return{handle,store,start,resume,status:()=>({...current,busy}),close:async()=>{if(context)await context.close();},allowed};
}
module.exports={createAutofill};
