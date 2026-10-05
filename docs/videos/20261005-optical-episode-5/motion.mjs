// Reuse the deployed HyperFrames summary template; adapt layout only for landscape.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const cache=process.argv[2]; if(!cache)throw Error('cache directory required');
const app=join(process.env.CAK_ENGINE_ROOT||'/Users/admin/workSpace/shopshorts-production','apps/shopshorts');
const req=createRequire(join(app,'package.json'));const cli=join(dirname(req.resolve('hyperframes/package.json')),'bin/hyperframes.mjs');
const gsap=join(dirname(req.resolve('gsap/package.json')),'dist/gsap.min.js');
const original=await readFile(join(app,'motion-templates/summary.html'),'utf8');
const css=await readFile(join(app,'motion-templates/shared.css'),'utf8');
const font=join(cache,'fonts/Pretendard-SemiBold.otf');
const receipts=[];
for(const variant of ['short','long']){
 const dir=join(cache,'motion-'+variant);await mkdir(join(dir,'assets'),{recursive:true});
 await copyFile(gsap,join(dir,'assets/gsap.min.js'));await copyFile(font,join(dir,'assets/Pretendard-SemiBold.otf'));
 let html=original;let style=css.replaceAll('NanumGothic-Regular.ttf','Pretendard-SemiBold.otf').replace('format("truetype")','format("opentype")').replaceAll('#f5efdc','#26363e').replaceAll('#3b3932','#edf1ee');
 html=html.replaceAll('#3b3932','#edf1ee');
 if(variant==='long'){
  html=html.replace('data-resolution="portrait"','data-resolution="landscape"').replaceAll('width=1080, height=1920','width=1920, height=1080').replaceAll('data-width="1080" data-height="1920"','data-width="1920" data-height="1080"').replace('viewBox="0 0 1080 1920"','viewBox="0 0 1920 1080"');
  html=html.replace('translate(270 560)','translate(390 420)').replace('translate(270 870)','translate(960 420)').replace('translate(270 1180)','translate(1530 420)').replace('x1="270" y1="660" x2="270" y2="780"','x1="510" y1="420" x2="830" y2="420"').replace('x1="270" y1="970" x2="270" y2="1090"','x1="1090" y1="420" x2="1410" y2="420"');
  style+='\nhtml,body,svg.full{width:1920px;height:1080px} #heading{left:0!important;width:1920px!important;top:140px!important;font-size:70px!important} .item{top:590px!important;width:500px;text-align:center;font-size:56px} #it1{left:140px}#it2{left:710px}#it3{left:1280px}';
 }
 await writeFile(join(dir,'summary.html'),html);await writeFile(join(dir,'shared.css'),style);
 const vars={heading:'빛이 필요한 이유',icon1:'layers',label1:'많은 데이터',icon2:'ring',label2:'더 먼 연결',icon3:'shield',label3:'전력 효율'};
 await writeFile(join(dir,'variables.json'),JSON.stringify(vars));
 const output=join(cache,`summary-${variant}.mp4`);
 const r=spawnSync(process.execPath,[cli,'render',dir,'-c','summary.html','-o',output,'--fps','24','--quiet','--strict','--strict-variables','--variables-file',join(dir,'variables.json')],{env:{...process.env,HYPERFRAMES_NO_TELEMETRY:'1',HYPERFRAMES_SKIP_SKILLS:'1'},stdio:'inherit',timeout:180000});
 if(r.error||r.status!==0)throw r.error||Error(`render failed ${r.status}`);
 receipts.push({variant,template:'summary',engine:'hyperframes',output,originalSha256:createHash('sha256').update(original).digest('hex'),vars,paidCalls:0});
}
await writeFile(join(cache,'motion-receipts.json'),JSON.stringify(receipts,null,2));
