# 引擎误拆审计报告（enhanced chain 对照）

> 更新：2026-10-05，`node test_decompose.js --audit`（一键版：`回归.bat` 的第 2 步，用的是 `--audit --brief`）。
> 口径：拿 enhanced.json 里 13286 个带真实词源链（chain）的词当基准跑引擎拆解，算词素匹配率。
> **本次总量：引擎未拆出 6605 / 完整拆解 6681 / 低匹配（<0.4）96。**

## 怎么看

- `chain` 是 enhanced 自带的真实词源（ground truth），`引擎` 是规则引擎的拆解结果。
- 匹配率低**不等于用户会看到错**：enhanced 词在界面上优先显示自带 breakdown，引擎结果主要影响 ecdict 派生层（76 万全量词）。
- 常见的三类「假阳性」：
  1. 引擎把整词当基本词（approve / arrive / communicate / remember）——保守，不算错；
  2. chain 里带连接元音或词根变体（actuate = act,u,ate），引擎按 `-uate` 后缀整体切；
  3. 词形还原差异（muffled → muffle+ed、antiquated → antiquate+ed）。
- 真需要修的是「引擎切错」那一类：sensitivity → `sen,siti,vit,y`、undeserved → `und,serv,ed`、animated → `any,mat,ed`、intricate → `in,cat,e`、deprecate → `de,cat,e`、imprecation → `im,cat,ion`。修法是补词根 / 后缀或加 `ROOT_BLOCK` 拦截，见 README 的「开发 / 回归」。

## 低匹配词（96 个）

| 词 | 真实词源 (chain) | 引擎拆解 | 匹配率 |
|---|---|---|---|
| abashed | a,bash,ed | abash,ed | 0.33 |
| abscission | abs,ciss,ion | ab,sci,s,sion | 0.33 |
| actuate | act,u,ate | act,uate | 0.33 |
| airily | air,il,y | air,i,ly | 0.33 |
| algebra | al,gebr,a | algebra | 0.33 |
| allegory | al,leg,ory | allegor,y | 0.33 |
| anaerobic | an,aero,bic | an,ic | 0.33 |
| animated | anim,ate,ed | any,mat,ed | 0.33 |
| antiquated | antique,ate,ed | antiquate,ed | 0.33 |
| appetizing | appet,it,ing | ap,pet,izing | 0.33 |
| approve | ap,prov,e | approve | 0.33 |
| arbitrator | arbit,r,ator | ar,bit,rat,or | 0.33 |
| arrive | ar,riv,e | arrive | 0.33 |
| assiduous | ad,sid,uous | assid,uous | 0.33 |
| associate | as,soci,ate | associate | 0.33 |
| association | as,soci,ation | associate,ion | 0.33 |
| castigate | cast,ig,ate | cast,i,gate | 0.33 |
| centralization | central,ize,ation | centr,al,ization | 0.33 |
| character | char,act,er | character | 0.33 |
| characterization | character,ize,ation | character,ization | 0.33 |
| civilization | civil,ize,ation | civil,ization | 0.33 |
| coeval | co,ev,al | co,val | 0.33 |
| communicate | com,muni,cate | communicate | 0.33 |
| community | com,mun,ity | community | 0.33 |
| concomitant | con,com,itant | con,mit,ant | 0.33 |
| conflagration | con,flagr,ation | confl,agra,tion | 0.33 |
| consummate | con,sum,ate | consummat,e | 0.33 |
| contagious | con,tag,ious | contagio,us | 0.33 |
| contemplate | con,templ,ate | contemplat,e | 0.33 |
| continue | con,tin,ue | continue | 0.33 |
| controversial | contro,vers,ial | controvers,i,al | 0.33 |
| corrugated | cor,rug,ated | corrugate,ed | 0.33 |
| countenance | con,ten,ance | count,en,ance | 0.33 |
| deprecate | de,prec,ate | de,cat,e | 0.33 |
| dermatologist | derma,tolog,ist | dermat,o,logist | 0.33 |
| designate | de,sign,ate | designate | 0.33 |
| difficult | dif,fic,ult | difficult | 0.33 |
| difficulty | dif,fic,ulty | difficult,y | 0.33 |
| disintegrate | dis,integer,ate | dis,integrat,e | 0.33 |
| dissipated | dis,sip,ated | dissipate,ed | 0.33 |
| distant | dis,st,ant | dis,tant | 0.33 |
| document | doc,u,ment | document | 0.33 |
| effervesce | ef,ferv,esce | effervesc,e | 0.33 |
| elusive | e,lus,ive | elus,ive | 0.33 |
| evangelist | ev,angel,ist | e,van,gel,ist | 0.33 |
| everlasting | ever,last,ing | e,ver,last | 0.33 |
| example | ex,ampl,e | example | 0.33 |
| execrate | ex,ecr,ate | ex,crat,e | 0.33 |
| execration | ex,ecr,ation | ex,crat,ion | 0.33 |
| execute | ex,ec,ute | execut,e | 0.33 |
| exhilarating | ex,hilar,ating | exhilarate,ing | 0.33 |
| experienced | ex,peri,enced | ex,ced | 0.33 |
| exponent | ex,pon,ent | exponent | 0.33 |
| extant | ex,st,ant | ex,tant | 0.33 |
| extricate | ex,tric,ate | ex,cat,e | 0.33 |
| fumigate | fum,ig,ate | fum,i,gate | 0.33 |
| glutinous | gluti,n,ous | glut,ino,us | 0.33 |
| graduate | grad,u,ate | grad,uate | 0.33 |
| gratification | grat,ify,cation | grat,ific,ation | 0.33 |
| habituate | habit,u,ate | hab,it,uate | 0.33 |
| identification | ident,ify,ication | ident,ific,ation | 0.33 |
| ignorant | i,gnor,ant | ign,or,ant | 0.33 |
| imprecation | im,prec,ation | im,cat,ion | 0.33 |
| infatuated | in,fatu,ated | infatuate,ed | 0.33 |
| iniquity | in,iqu,ity | iniquit,y | 0.33 |
| initiative | initi,ate,ive | in,it,i,ative | 0.33 |
| institution | in,stitut,ion | institution | 0.33 |
| instrument | in,stru,ment | instrument | 0.33 |
| intricacy | in,tric,acy | in,cac,y | 0.33 |
| intricate | in,tric,ate | in,cat,e | 0.33 |
| intriguing | in,trig,uing | intrigue,ing | 0.33 |
| manufacture | manu,fact,ure | manufacture | 0.33 |
| mediocrity | medi,ocr,ity | medio,crit,y | 0.33 |
| mitigate | mit,ig,ate | mit,i,gate | 0.33 |
| muffled | muff,le,d | muffle,ed | 0.33 |
| navigate | nav,ig,ate | navigat,e | 0.33 |
| navigation | nav,ig,ation | navigat,ion | 0.33 |
| official | of,fic,ial | offic,i,al | 0.33 |
| oleaginous | olea,gin,ous | ole,ag,ino,us | 0.33 |
| organization | organ,ize,ation | organ,ization | 0.33 |
| possibly | poss,ible,ly | possibl,y | 0.33 |
| propitious | pro,piti,ous | prop,itious | 0.33 |
| recipe | re,cip,e | recipe | 0.33 |
| recondite | re,con,dite | recondit,e | 0.33 |
| regular | reg,ul,ar | regular | 0.33 |
| regulation | regul,ate,ion | regula,tion | 0.33 |
| remember | re,mem,ber | remember | 0.33 |
| residue | re,sid,ue | residu,e | 0.33 |
| sensitivity | sens,itive,ity | sen,siti,vit,y | 0.33 |
| somnolent | somn,ol,ent | somn,o,lent | 0.33 |
| spasmodic | spasm,od,ic | spasmo,dic | 0.33 |
| technology | techn,o,logy | technology | 0.33 |
| tortuous | tort,u,ous | tort,uous | 0.33 |
| unbiased | un,bias,ed | un,sed | 0.33 |
| undeserved | un,deserve,d | und,serv,ed | 0.33 |
| vascular | vas,cul,ar | vascular | 0.33 |

---

历史对比：2026-08-15 那次是 13279 词 / 完整拆解 4195 / 低匹配 50；此后词库与词素表持续扩充，口径相同但基数变了，数字不能直接比。
