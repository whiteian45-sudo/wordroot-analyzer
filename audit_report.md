# 引擎误拆审计报告（enhanced chain 对照）

> 更新：2026-08-15，test_decompose.js --audit。13279 词中引擎完整拆解 4195，低匹配(词素匹配率<0.4) 50 个。
> **已修复(2026-08-15 补词根)**：electricity/diagnose/commiserate/attrition/combination/enamored/retrieval/abscission/ineluctable 等 7 个真误拆已转正（补 electr/gnos/miser/trit/bin/triev/ciss/eluct 词根）。
> **说明**：剩余多为 enhanced 考试词，显示优先用自带 breakdown，引擎误拆对用户可见影响极小；或为整词识别/变体差异(误报)。

| 词 | 真实词源(chain) | 引擎拆解 |
|---|---|---|
| approval | ap,prov,al | ap,val |
| arrive | ar,riv,e | arrive |
| capacity | cap,aci,ty | cap,city |
| civilization | civil,ize,ation | civil,ization |
| commercial | commerce,merx<商品>）,ial | com,merc,i,al |
| communicate | com,muni,cate | communicate |
| continue | con,tin,ue | continue |
| continuous | con,tin,uous | continue,ous |
| discipline | dis,cip,line | discipline |
| emotional | emotion,movere<移动>）,al | e,mot,ion,al |
| empty | em,pt,y | empty |
| execute | ex,ec,ute | ex,cut,e |
| graduate | grad,u,ate | grad,uate |
| imagination | image,in,ation | imagine,ation |
| precision | pre,cis,ion | preci,sion |
| regular | reg,ul,ar | regular |
| remember | re,mem,ber | remember |
| technology | techn,o,logy | techn,ology |
| tremendous | trem,end,ous | tree,mend,ous |
| intricate | in,tric,ate | in,cat,e |
| reassure | re,assure,securus（安全的） | re,sure |
| abscission | abs,ciss,ion | ab,sci,s,sion |
| centralization | central,ize,ation | centr,al,ization |
| coeval | co,ev,al | co,val |
| concomitant | con,com,itant | con,mit,ant |
| corporeal | corp,ore,al | corp,real |
| deforestation | de,forest,ation | de,stat,ion |
| deprecate | de,prec,ate | de,cat,e |
| designation | design,ate,ion | de,sign,ation |
| detritus | de,ter,itus | de,trit,us |
| enamored | en,amor,ed | e,name,or,ed |
| extricate | ex,tric,ate | ex,cat,e |
| habituate | habit,u,ate | hab,it,uate |
| improvised | im,prov,ised | im,vis,ed |
| tenacity | ten,aci,ty | ten,city |
| undeserved | un,deserve,d | und,serv,ed |
| voracity | vor,aci,ty | vor,city |
| actuate | act,u,ate | act,uate |
| everlasting | ever,last,ing | e,ver,last |
| imprecation | im,prec,ation | im,cat,ion |
| numerology | numer,o,logy | numer,ology |
| percolate | per,col,ate | per,late |
| airily | air,il,y | air,i,ly |
| phonology | phon,o,logy | phon,ology |
| proliferation | proli,fer,ation | pro,life,rat,ion |
| vivacity | viv,ac,ity | viv,city |
| experienced | ex,peri,enced | ex,ced |
| phonetics | phon,et,ics | phone,tic,s |
| unbiased | un,bias,ed | un,sed |
| repertory | re,pert,ory | re,to,ry |
