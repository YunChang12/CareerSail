const BASIC={name:'姓名',phone:'手机号',email:'邮箱',gender:'性别',birthDate:'出生日期',hometown:'籍贯',highestDegree:'最高学历',highestQualification:'最高学位',studyMode:'学习形式',recruitmentChannel:'招聘信息获取渠道'};
const GROUPS={education:{prefix:'Recruitment_extPerfectApplicantEducation',label:'教育经历',identity:'school',fields:{school:'学校名称',start:'开始时间',end:'结束时间',major:'专业名称',degree:'学历',qualification:'学位',studyMode:'学习形式',gpa:'成绩（GPA）',ranking:'班级排名'}},internships:{prefix:'Recruitment_extPerfectApplicantInternship',label:'实习经历',identity:'company',fields:{company:'单位名称',start:'开始时间',end:'结束时间',description:'实习内容'}},projects:{prefix:'Recruitment_extPerfectApplicantProject',label:'项目经历',identity:'name',fields:{name:'项目名称',start:'开始时间',end:'结束时间',description:'项目中职责',results:'项目成果'}}};
function jobUrl(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='ubtrobot.zhiye.com'||u.port||u.username||u.password||u.pathname!=='/campus/detail'||!/^[-\da-f]{36}$/i.test(u.searchParams.get('jobAdId')||''))throw Error('第一版仅支持优必选北森校园招聘职位详情链接');return u.href;}
const rx=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function field(scope,label){return scope.locator('.form-item').filter({has:scope.page().locator('label.form-item__text').filter({hasText:new RegExp('^'+rx(label)+'$')})});}
function dateEqual(text,value){const parts=text.match(/\d+/g)||[];return parts.slice(0,value.length===7?2:3).map((x,i)=>i?x.padStart(2,'0'):x).join('-')===value;}
async function fillField(page,scope,label,value,results){
 const finish=(status,message)=>results.push({field:label,status,message});
 if(!value)return finish('missing','档案未提供');const box=field(scope,label);if(await box.count()!==1||!await box.isVisible())return finish('manual','未找到唯一字段');
 const inputs=box.locator('input:not([type=file]):not([type=hidden]),textarea');const dropdown=box.locator('.phoenix-select');
 try{
  if(await dropdown.count()){
   const visible=(await box.innerText()).replace(label,'').trim();if(visible&&!/请选择/.test(visible))return finish(visible.includes(value)||dateEqual(visible,value)?'verified':'preserved','保留已有选项');
   if(label==='籍贯')return finish('manual','省市区需精确选择，请在官网确认');
   await inputs.first().click();
   if(/时间|日期/.test(label)){
    if(!/^\d{4}-\d{2}$/.test(value)){await page.keyboard.press('Escape');return finish('manual','目前支持精确年月；完整出生日期请在官网选择');}
    const calendar=page.locator('.phoenix-calendar-month-panel:visible');await calendar.waitFor({timeout:2000});let year=Number((await calendar.locator('.phoenix-calendar-month-panel-year-select-content').innerText()).match(/\d{4}/)?.[0]);const target=Number(value.slice(0,4));if(!year||Math.abs(target-year)>60)throw Error('日期范围异常');
    while(year!==target){await calendar.locator(target<year?'.phoenix-calendar-month-panel-prev-year-btn':'.phoenix-calendar-month-panel-next-year-btn').click();year+=target<year?-1:1;}
    await calendar.locator('.phoenix-calendar-month-panel-month').filter({hasText:new RegExp('^'+Number(value.slice(5))+'月$')}).click();
   }else{
    const aliases=value==='硕士'?['硕士研究生','硕士']:value==='本科'?['大学本科','本科']:[value];let chosen=false;
    for(const text of aliases){const exact=page.getByText(text,{exact:true}).filter({visible:true});if(await exact.count()===1){await exact.click();chosen=true;break;}}
    if(!chosen){await page.keyboard.press('Escape');return finish('manual','官网选项无唯一精确匹配');}
   }
   const now=(await box.innerText()).replace(label,'').trim();return finish(now.includes(value)||dateEqual(now,value)||value==='硕士'&&now.includes('硕士研究生')||value==='本科'&&now.includes('大学本科')?'filled':'manual','已选择，请核对网站显示值');
  }
  if(label==='性别'){const current=box.locator('.phoenix-radio--checked');if(await current.count())return finish('preserved','保留已有选项');const option=box.getByText(value,{exact:true});if(await option.count()===1){await option.click();return finish('filled','已选择');}return finish('manual','性别需人工确认');}
  if(await inputs.count()!==1||!await inputs.isEnabled())return finish('manual','字段不可编辑或不唯一');const old=await inputs.inputValue();if(old.trim())return finish(old.trim()===value?'verified':'preserved','保留已有内容');
  const max=await inputs.getAttribute('maxlength');if(max&&value.length>Number(max)||await box.locator('.phoenix-textarea').count()&&value.length>2000)return finish('manual','内容超出网站字数限制，不自动截断');
  await inputs.fill(value);await inputs.blur();return finish((await inputs.inputValue())===value?'filled':'manual','已回读核验');
 }catch{await page.keyboard.press('Escape').catch(()=>{});return finish('manual','控件操作失败，未继续尝试其他选项');}
}
async function fill(page,profile){
 const results=[],personal=page.locator('.form[name^="Recruitment_extPerfectPersonProfile"]');for(const [key,label]of Object.entries(BASIC))await fillField(page,personal,label,profile.basic[key],results);
 for(const [group,spec]of Object.entries(GROUPS)){
  const used=new Set();
  for(let i=0;i<profile[group].length;i++){
   const row=profile[group][i],identity=row[spec.identity];if(!identity){results.push({field:spec.label+' '+(i+1),status:'missing',message:'缺少学校/公司/项目名称'});continue;}
   let forms=page.locator(`.form[name^="${spec.prefix}"]`),selected=null,empty=null;
   let selectedIndex=-1,emptyIndex=-1;
   for(let n=0;n<await forms.count();n++){if(used.has(n))continue;const c=field(forms.nth(n),spec.fields[spec.identity]).locator('input');if(await c.count()!==1)continue;const existing=(await c.inputValue()).trim();if(existing===identity){selected=forms.nth(n);selectedIndex=n;break;}if(!existing&&!empty){empty=forms.nth(n);emptyIndex=n;}}
   selected=selected||empty;if(!selected){const add=page.getByText('添加'+spec.label,{exact:true});if(await add.count()!==1){results.push({field:spec.label+' '+(i+1),status:'manual',message:'找不到新增入口'});continue;}const before=await forms.count();await add.click();await forms.nth(before).waitFor({timeout:3000});selected=forms.nth(before);}
   used.add(selectedIndex>=0?selectedIndex:emptyIndex>=0?emptyIndex:(await forms.count())-1);
   for(const [key,label]of Object.entries(spec.fields)){const before=results.length;await fillField(page,selected,label,row[key],results);if(results.length>before)results[results.length-1].field=spec.label+' '+(i+1)+' / '+label;}
  }
 }
 await fillField(page,page.locator('.form[name^="Recruitment_extPerfectApplicantAdditionalInfo"]'),'获得荣誉',profile.awards,results);
 results.push({field:'照片、在校实践、语言能力、证书及其他附加信息',status:'manual',message:'当前版本未自动填写，请按官网必填标记逐项检查'});
 const errors=await page.locator('.form-item__error,.ant-form-item-explain-error,[role="alert"]').allTextContents();return{fields:results,validationErrors:errors.filter(Boolean).map(x=>x.slice(0,250))};
}
async function inspect(page){return{login:/\/login(?:[/?]|$)/i.test(page.url()),form:new URL(page.url()).pathname==='/form'&&await page.locator('.form[name^="Recruitment_extPerfectPersonProfile"]').count()===1,url:page.url()};}
module.exports={BASIC,GROUPS,jobUrl,field,dateEqual,fillField,fill,inspect};
