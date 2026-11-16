// Shared by the Kakao skill, Worker and offline preview. No model calls or storage.
export function createBot(data, config = {}) {
  const byId = new Map(data.blocks.map(b => [b.id,b]));
  const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  const exact = new Map();
  for (const b of data.blocks) for (const a of [b.title,...b.aliases]) if(a) exact.set(norm(a),b.id);
  for (const b of data.blocks) for (const a of [...b.links,...b.items]) if(a.target) exact.set(norm(a.label),a.target);
  const sensitive = /\b\d{6}\s*[-–]?\s*[1-8]\d{6}\b|(?:\d[ -]?){13,19}|01[016789][ -]?\d{3,4}[ -]?\d{4}|(?:이름|성함)\s*[:：]\s*\S+/.source;
  function guard(raw,payload) {
    const n = norm(raw);
    if (/호흡곤란|숨이차|숨차|숨을못|숨쉬기힘|실신|쓰러|의식이없|의식저하|대량출혈|많은출혈|심한출혈|출혈이심|피가많|피가멈추지|심한통증|극심한|배가너무아|배너무아|너무아파|통증이심/.test(n)) return 'S-05';
    if (new RegExp(sensitive).test(raw) || payload.userRequest?.params?.media || payload.userRequest?.params?.image || /사진첨부|결과지사진|처방전사진/.test(n)) return 'S-08';
    if (/수치|결과해석|결과알려|검사결과알려|결과조회|임신인가|임신됐|임신됐|정상인가|정상인가요|정상인지|정상인가|정상범위|기형인가|착상됐|임신된|이식가능|(?:amh|hcg)\d/.test(n)) return 'S-06';
    if (/아파|아프|통증|출혈|피가|어지러|어지럼|발열|열이나|열나요|구토|토했|복부팽만|배가빵|소변이안|붓|갈색혈|하혈/.test(n)) return 'S-07';
    if (/복용|먹어도|먹어야|처방|용량|몇알|중단|끊어도|빼먹|놓쳤|주사맞아|주사맞는|주사시간|주사시각|주사언제|주사늦|약을|약먹|아스피린|헤파린|질정|프로게스테론/.test(n)) return 'S-07';
    if (/(가능|할수|받을수|해도|해야|할까요|필요)/.test(n) && /(제가|저도|저는|나도|수술|시험관|인공수정|시술|pgt)/.test(n) && !/(차이|절차|과정|예약|금식|출근|회사)/.test(n)) return 'S-07';
    return null;
  }
  function choose(payload={}, requestedId) {
    const raw = String(payload.userRequest?.utterance ?? payload.utterance ?? '').slice(0,3000);
    // The guard always precedes explicit endpoints and button extras.
    const safety = guard(raw,payload);
    if(safety) return {id:safety,reason:'safety'};
    let id = requestedId ?? payload.action?.clientExtra?.targetBlock;
    if(id && byId.has(id)) return {id:byId.get(id).enabled?id:'H-01',reason:'button'};
    const mapped = Object.entries(config.blockIds??{}).find(([,v])=>v===payload.userRequest?.block?.id);
    if(mapped && mapped[0]!=='S-03') return {id:byId.get(mapped[0])?.enabled?mapped[0]:'H-01',reason:'mapped-block'};
    const n=norm(raw);
    if(!n) return {id:'S-01',reason:'welcome'};
    if (/금식|굶|물마|식사해/.test(n)) return {id:'Q-01',reason:'faq'};
    if (/(회사|출근|직장|운동|여행|목욕|성관계)/.test(n)) return {id:'Q-02',reason:'faq'};
    if (/임신확인언제|피검사날|임테기언제|임신검사언제/.test(n)) return {id:'Q-03',reason:'faq'};
    if (/성공률|임신율|성공확률|몇퍼센트|확률|보장/.test(n) && !/pgt/.test(n)) return {id:'S-07',reason:'safety'};
    if(exact.has(n)) {const b=byId.get(exact.get(n));return {id:b.enabled?b.id:(b.id==='C-04'?'C-01':'H-01'),reason:'exact'};}
    if(/유지희/.test(n)) return {id:'B-09',reason:'doctor'};
    if(/조무성/.test(n)) return {id:'B-08',reason:'doctor'};
    if(/예약.*(취소|변경)|날짜바꾸/.test(n)) return {id:'H-07',reason:'faq'};
    if(/결과.*(언제|며칠|나왔)/.test(n)) return {id:/pgt/.test(n)?'P-05':'D-05',reason:'faq'};
    if(/생리중|생리때|월경중/.test(n)) return {id:'I-02',reason:'faq'};
    if(/남편.*(같이|동반)|배우자동반|혼자가도/.test(n)) return {id:'I-03',reason:'faq'};
    if(/타병원|다른병원.*검사|이전검사|검사지가져/.test(n)) return {id:'I-05',reason:'faq'};
    if(/인공수정.*시험관.*차이|시험관.*인공수정.*차이/.test(n)) return {id:'F-05',reason:'faq'};
    if(/반복.*유산|습관성유산/.test(n)) return {id:'R-01',reason:'topic'};
    if(/반복.*착상|착상실패/.test(n)) return {id:'R-03',reason:'topic'};
    if(/pgt|착상전유전자/.test(n)) return {id:/종류|차이/.test(n)?'P-02':/과정|절차/.test(n)?'P-03':/한계|정확|필요/.test(n)?'P-04':'P-01',reason:'topic'};
    const candidates=[];
    for(const b of data.blocks) if(b.enabled) for(const a of b.aliases) {
      const an=norm(a);
      // Only matching curated phrases; never generate an answer for unseen content.
      if(an.length>=3 && n.includes(an)) candidates.push([an.length,b.id]);
    }
    candidates.sort((a,b)=>b[0]-a[0]);
    return candidates.length?{id:candidates[0][1],reason:'curated-phrase'}:{id:'S-03',reason:'fallback'};
  }
  function action(a,quick=false) {
    if(a.url) return {action:'webLink',label:a.label,webLinkUrl:a.url};
    if(a.phone) return {action:'phone',label:a.label,phoneNumber:a.phone};
    if(a.operator) return {action:'operator',label:a.label};
    if(config.blockIds?.[a.target]) return {action:'block',label:a.label,blockId:config.blockIds[a.target],messageText:a.label,extra:{targetBlock:a.target}};
    return {action:'message',label:a.label,messageText:a.label,extra:{targetBlock:a.target}};
  }
  function response(id) {
    const b=byId.get(id)??byId.get('S-03');
    const outputs=[];
    if(b.kind==='list') outputs.push({listCard:{header:{title:b.text},items:b.items.map(a=>{const {label,...rest}=action(a);return {title:label,...rest};})}});
    else if(b.kind==='card') {
      const cardActions=b.links.filter(a=>!a.target).slice(0,3);
      outputs.push({textCard:{title:b.title,description:b.text,buttons:cardActions.map(a=>action(a)),buttonLayout:'vertical'}});
    } else outputs.push({simpleText:{text:b.text}});
    // QuickReply supports only message/block. Links/phones/operators belong in cards.
    const external=b.kind==='card'?[]:b.links.filter(a=>!a.target);
    for(let i=0;i<external.length;i+=3) outputs.push({textCard:{title:'연락·바로가기',buttons:external.slice(i,i+3).map(a=>action(a)),buttonLayout:'vertical'}});
    const quickReplies=b.links.filter(a=>a.target).map(a=>action(a,true)).slice(0,10);
    return {version:'2.0',template:{outputs,quickReplies}};
  }
  function handle(payload={},requestedId) {const selected=choose(payload,requestedId);return {...selected,block:byId.get(selected.id),response:response(selected.id)};}
  return {choose,response,handle,byId};
}
