const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function emptyProfile() {
  return { version: 1, confirmed: false, basic: { name: '', phone: '', email: '', gender: '', birthDate: '', hometown: '', address: '', highestDegree:'', highestQualification:'', studyMode:'', recruitmentChannel:'' }, education: [], internships: [], projects: [], skills: '', awards: '', resume: null };
}
function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('资料格式错误');
  const result = emptyProfile();
  const text = (v, limit = 10000) => { if (v == null) return ''; if (typeof v !== 'string' || v.length > limit) throw Error('字段类型或长度错误'); return v.trim(); };
  for (const key of Object.keys(result.basic)) result.basic[key] = text(input.basic?.[key], 300);
  for (const [group, fields] of Object.entries({education:['school','degree','qualification','studyMode','major','start','end','graduationYear','gpa','ranking'],internships:['company','position','start','end','description'],projects:['name','role','start','end','description','results']})) {
    if (input[group] != null && (!Array.isArray(input[group]) || input[group].length > 30)) throw Error('经历条数无效');
    result[group] = (input[group] || []).map(row => Object.fromEntries(fields.map(field => [field, text(row?.[field])])));
  }
  result.skills = text(input.skills); result.awards = text(input.awards);
  result.confirmed = input.confirmed === true;
  if (result.basic.phone && !/^[+\d ()-]{6,30}$/.test(result.basic.phone)) throw Error('手机号格式无效');
  if (result.basic.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.basic.email)) throw Error('邮箱格式无效');
  return result;
}
class ProfileStore {
  constructor(root) { this.dir = path.join(root, 'config', 'autofill'); this.file = path.join(root, 'config', 'candidate_profile.json'); }
  read() { if (!fs.existsSync(this.file)) return emptyProfile(); return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
  save(input) { const result = validateProfile(input); result.resume = this.read().resume; this.write(result); return result; }
  write(profile) { fs.mkdirSync(this.dir, {recursive:true}); const temp=this.file+'.tmp'; fs.writeFileSync(temp,JSON.stringify(profile,null,2)+'\n',{mode:0o600});fs.renameSync(temp,this.file); }
  upload(name, encoded) {
    if (typeof encoded !== 'string' || encoded.length > 8 * 1024 * 1024 || !/^[\w+/=\r\n]+$/.test(encoded)) throw Error('附件过大或编码错误（最多5MB PDF）');
    const data=Buffer.from(encoded,'base64');if(data.length>5*1024*1024||data.subarray(0,5).toString()!=='%PDF-')throw Error('请选择不超过5MB的PDF文件');
    fs.mkdirSync(this.dir,{recursive:true});const hash=crypto.createHash('sha256').update(data).digest('hex');fs.writeFileSync(path.join(this.dir,hash+'.pdf'),data,{mode:0o600});
    const profile=this.read();profile.resume={name:path.basename(String(name||'resume.pdf')).slice(0,200),hash,size:data.length};this.write(profile);return profile.resume;
  }
  resumePath() { const hash=this.read().resume?.hash;if(!/^[a-f0-9]{64}$/.test(hash||''))return null;const p=path.join(this.dir,hash+'.pdf');return fs.existsSync(p)?p:null; }
}
module.exports={emptyProfile,validateProfile,ProfileStore};
