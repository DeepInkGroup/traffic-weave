(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const spark = document.getElementById('sparkCanvas');
  const sctx = spark.getContext('2d');
  const $ = id => document.getElementById(id);

  const COLOR = { ink:'#102d46', white:'#f8fbfa', amber:'#f4ba47', coral:'#ef6c51', mint:'#5aaf96', blue:'#2785a9' };
  const ROAD_TYPES = {
    street:  { label:'Street',  cost:180, upgrade:260, lanes:1, max:3, perLane:6,  speed:1,   width:16, surface:'#bfd0d8', inner:'#dce6e9' },
    avenue:  { label:'Avenue',  cost:360, upgrade:390, lanes:2, max:4, perLane:8,  speed:.80, width:21, surface:'#a9c7d1', inner:'#d1e0e4' },
    highway: { label:'Highway', cost:620, upgrade:540, lanes:2, max:5, perLane:12, speed:.58, width:26, surface:'#91adbb', inner:'#c2d3d9' }
  };
  const ROAD_SKINS = {
    mist:     { surface:null,      inner:null },
    coastal:  { surface:'#86c4d2',inner:'#c9e4e8' },
    sand:     { surface:'#dcc99d',inner:'#eee2c5' },
    graphite: { surface:'#8296a3',inner:'#b9c5cb' }
  };
  const FEATURE_COSTS = { signals:140, transit:180, green:90 };
  const PATTERN_COSTS = { straight:0, left:40, right:40, s:80 };
  const MODES = {
    solo:    { label:'SOLO', duration:90,  budget:900, demand:.67, target:18, chapter:'THE SHORTCUT', day:'DAY 04' },
    rush:    { label:'RUSH', duration:60,  budget:1050,demand:.43, target:16, chapter:'RUSH HOUR', day:'DAY 07' },
    ranked:  { label:'RANKED',duration:120,budget:720, demand:.51, target:15, chapter:'THE LADDER', day:'RANKED RUN' },
    sandbox: { label:'SANDBOX',duration:Infinity,budget:Infinity,demand:.62,target:Infinity,chapter:'OPEN CITY', day:'FREE BUILD' }
  };
  const nodes = [
    {x:.10,y:.27,label:'Harbor'},{x:.34,y:.10,label:'North'},{x:.68,y:.13,label:'Market'},
    {x:.88,y:.36,label:'East'},{x:.73,y:.76,label:'Park'},{x:.37,y:.83,label:'Station'},{x:.15,y:.61,label:'West'}
  ];
  const initialRoads = [
    [0,1,'Harbor Bend',-.10,'street',1.05],[1,2,'North Avenue',.02,'avenue',.92],
    [2,3,'Market Link',-.04,'street',.94],[3,4,'Garden Curve',-.12,'avenue',1.08],
    [4,5,'Parkway',.03,'street',.92],[5,6,'Station Road',-.06,'street',.93],
    [6,0,'West Arc',-.10,'avenue',1],[1,5,'Civic Cut',.09,'street',.78],[2,6,'Sunline',-.04,'street',.72]
  ];

  let roads = [];
  const state = {
    w:0,h:0,dpr:1,elapsed:0,duration:90,spawnClock:0,paused:true,sound:true,ended:false,started:false,
    mode:'solo',selected:2,cars:[],completed:0,budget:900,averageTime:12.4,networkFlow:100,
    score:0,history:[12.4],nextSample:0,lastFrame:performance.now(),build:false,buildType:'street',
    buildPattern:'straight',buildSkin:'mist',buildAddons:new Set(),buildStart:null,mouse:null
  };

  function makeRoad(a,b,name,curve,type='street',base=1,built=false,options={}) {
    const spec=ROAD_TYPES[type];
    const inferred=Math.abs(curve)>.045?(curve>0?'left':'right'):'straight';
    return {a,b,name,curve,type,lanes:spec.lanes,base,traffic:0,selected:false,flash:0,built,
      pattern:options.pattern||inferred,skin:options.skin||'mist',features:{signals:false,transit:false,green:false,...options.features}};
  }
  function resetRoads() {
    roads=initialRoads.map(r=>makeRoad(...r));
    roads[1].features.transit=true;
    roads[3].skin='sand';
    roads[7].name='Civic Greenway';roads[7].pattern='s';roads[7].curve=0;roads[7].skin='coastal';roads[7].features.green=true;
    roads[8].features.signals=true;
    roads[2].selected=true;
  }
  resetRoads();

  function resize() {
    const r=canvas.getBoundingClientRect(), sr=spark.getBoundingClientRect();
    state.dpr=Math.min(devicePixelRatio||1,2); state.w=r.width; state.h=r.height;
    canvas.width=Math.round(r.width*state.dpr); canvas.height=Math.round(r.height*state.dpr);
    spark.width=Math.round(sr.width*state.dpr); spark.height=Math.round(sr.height*state.dpr);
  }
  function nodePoint(i) {
    const n=nodes[i], wide=state.w>700, pad=wide?Math.min(170,state.w*.12):22, top=wide?6:46, bottom=wide?8:76;
    return {x:pad+n.x*(state.w-pad*2),y:top+n.y*(state.h-top-bottom)};
  }
  function geometry(r) {
    const p0=nodePoint(r.a),p2=nodePoint(r.b),dx=p2.x-p0.x,dy=p2.y-p0.y,len=Math.hypot(dx,dy)||1;
    return {p0,p2,p1:{x:(p0.x+p2.x)/2-dy/len*r.curve*len,y:(p0.y+p2.y)/2+dx/len*r.curve*len}};
  }
  function bezier(g,t) { const q=1-t; return {x:q*q*g.p0.x+2*q*t*g.p1.x+t*t*g.p2.x,y:q*q*g.p0.y+2*q*t*g.p1.y+t*t*g.p2.y}; }
  function tangent(g,t) { return {x:2*(1-t)*(g.p1.x-g.p0.x)+2*t*(g.p2.x-g.p1.x),y:2*(1-t)*(g.p1.y-g.p0.y)+2*t*(g.p2.y-g.p1.y)}; }
  function roadPoint(r,t) {
    if(r.pattern!=='s')return bezier(geometry(r),t);
    const p0=nodePoint(r.a),p2=nodePoint(r.b),dx=p2.x-p0.x,dy=p2.y-p0.y,len=Math.hypot(dx,dy)||1,wave=Math.sin(t*Math.PI*2)*len*.075;
    return{x:p0.x+dx*t-dy/len*wave,y:p0.y+dy*t+dx/len*wave};
  }
  function roadTangent(r,t) {
    if(r.pattern!=='s')return tangent(geometry(r),t);
    const a=roadPoint(r,Math.max(0,t-.006)),b=roadPoint(r,Math.min(1,t+.006));return{x:b.x-a.x,y:b.y-a.y};
  }
  function traceRoad(r) {
    ctx.beginPath();const first=roadPoint(r,0);ctx.moveTo(first.x,first.y);
    if(r.pattern==='s'){for(let i=1;i<=32;i++){const p=roadPoint(r,i/32);ctx.lineTo(p.x,p.y);}}
    else{const g=geometry(r);ctx.quadraticCurveTo(g.p1.x,g.p1.y,g.p2.x,g.p2.y);}
  }

  function strokeRoad(r) {
    const spec=ROAD_TYPES[r.type],skin=ROAD_SKINS[r.skin]||ROAD_SKINS.mist,width=spec.width+(r.lanes-spec.lanes)*3;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    traceRoad(r);ctx.lineWidth=width+7;ctx.strokeStyle=COLOR.ink;ctx.stroke();
    traceRoad(r);ctx.lineWidth=width;ctx.strokeStyle=r.selected?'#f5c65f':(skin.surface||spec.surface);ctx.stroke();
    traceRoad(r);ctx.lineWidth=Math.max(4,width-10);ctx.strokeStyle=r.selected?'rgba(255,226,143,.52)':(skin.inner||spec.inner);ctx.stroke();
    traceRoad(r);ctx.lineWidth=r.type==='highway'?2.2:1.7;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.setLineDash(r.type==='highway'?[12,7]:[7,9]);ctx.stroke();
    if(r.type==='highway'&&!r.selected){traceRoad(r);ctx.setLineDash([]);ctx.lineWidth=.8;ctx.strokeStyle='rgba(16,45,70,.22)';ctx.stroke();}
    if(r.features.transit){traceRoad(r);ctx.setLineDash([2,7]);ctx.lineWidth=2.2;ctx.strokeStyle='#35a4bc';ctx.stroke();}
    if(r.selected){traceRoad(r);ctx.setLineDash([]);ctx.lineWidth=2;ctx.strokeStyle='rgba(220,143,45,.88)';ctx.stroke();}
    if(r.features.green){ctx.setLineDash([]);for(let t=.14;t<.9;t+=.16){const p=roadPoint(r,t),tan=roadTangent(r,t),l=Math.hypot(tan.x,tan.y)||1;ctx.beginPath();ctx.arc(p.x-tan.y/l*(width/2+5),p.y+tan.x/l*(width/2+5),2.1,0,Math.PI*2);ctx.fillStyle='#5aaf96';ctx.fill();}}
    if(r.features.signals){[.08,.92].forEach(t=>{const p=roadPoint(r,t);ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fillStyle='#f4ba47';ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle=COLOR.ink;ctx.stroke();});}
    if(r.flash>0){traceRoad(r);ctx.setLineDash([]);ctx.lineWidth=width+14+r.flash*5;ctx.strokeStyle=`rgba(244,186,71,${r.flash*.25})`;ctx.stroke();}
    ctx.restore();
  }
  function drawBuildPreview() {
    if(!state.build||state.buildStart===null||!state.mouse)return;
    const p=nodePoint(state.buildStart),spec=ROAD_TYPES[state.buildType],skin=ROAD_SKINS[state.buildSkin],dx=state.mouse.x-p.x,dy=state.mouse.y-p.y,len=Math.hypot(dx,dy)||1;
    const previewPoint=t=>{let offset=0;if(state.buildPattern==='left')offset=len*.075*Math.sin(Math.PI*t);if(state.buildPattern==='right')offset=-len*.075*Math.sin(Math.PI*t);if(state.buildPattern==='s')offset=len*.075*Math.sin(Math.PI*2*t);return{x:p.x+dx*t-dy/len*offset,y:p.y+dy*t+dx/len*offset};};
    const path=()=>{ctx.beginPath();const q=previewPoint(0);ctx.moveTo(q.x,q.y);for(let i=1;i<=24;i++){const n=previewPoint(i/24);ctx.lineTo(n.x,n.y);}};
    ctx.save();ctx.lineCap='round';path();ctx.lineWidth=spec.width+6;ctx.strokeStyle='rgba(16,45,70,.18)';ctx.setLineDash([5,8]);ctx.stroke();path();ctx.setLineDash([]);ctx.lineWidth=spec.width;ctx.strokeStyle=skin.surface||spec.surface;ctx.globalAlpha=.62;ctx.stroke();ctx.restore();
  }
  function drawNodes() {
    nodes.forEach((n,i)=>{const p=nodePoint(i),busy=roads.filter(r=>r.a===i||r.b===i).reduce((s,r)=>s+r.traffic,0),chosen=state.build&&state.buildStart===i;
      ctx.save();if(state.build){ctx.beginPath();ctx.arc(p.x,p.y,chosen?22:18,0,Math.PI*2);ctx.fillStyle=chosen?'rgba(244,186,71,.25)':'rgba(39,133,169,.13)';ctx.fill();}
      ctx.beginPath();ctx.arc(p.x,p.y,12.5,0,Math.PI*2);ctx.fillStyle=chosen?'#fff1ca':COLOR.white;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle=chosen?COLOR.amber:COLOR.ink;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,4.3,0,Math.PI*2);ctx.fillStyle=busy>11?COLOR.coral:busy>6?COLOR.amber:COLOR.blue;ctx.fill();ctx.restore();});
  }
  function drawCars() {
    state.cars.forEach(car=>{const r=roads[car.road];if(!r)return;const t=car.direction>0?car.t:1-car.t,p=roadPoint(r,t),tan=roadTangent(r,t),angle=Math.atan2(tan.y,tan.x)+(car.direction>0?0:Math.PI),offset=((car.slot%Math.max(1,r.lanes))-(r.lanes-1)/2)*4;
      ctx.save();ctx.translate(p.x-Math.sin(angle)*offset,p.y+Math.cos(angle)*offset);ctx.rotate(angle);ctx.beginPath();ctx.roundRect(-4.5,-2.5,9,5,2.5);ctx.fillStyle=car.color;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='rgba(16,45,70,.45)';ctx.stroke();ctx.restore();});
  }
  function drawLabels() { if(state.w<520)return;nodes.forEach((n,i)=>{const p=nodePoint(i);ctx.save();ctx.fillStyle='rgba(16,45,70,.6)';ctx.font='800 8px Inter, sans-serif';ctx.textAlign='center';ctx.fillText(n.label.toUpperCase(),p.x,p.y+26);ctx.restore();}); }
  function drawProgress() {
    const x=25,y=state.h-20,w=Math.min(130,state.w*.24),sandbox=state.mode==='sandbox';ctx.save();ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.strokeStyle='rgba(16,45,70,.12)';ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*(sandbox?.64:Math.min(1,state.elapsed/state.duration)),y);ctx.strokeStyle=sandbox?COLOR.mint:COLOR.blue;ctx.stroke();ctx.fillStyle=COLOR.ink;ctx.font='800 8px Inter, sans-serif';ctx.fillText(sandbox?'FREE PLAY':`${Math.max(0,Math.ceil(state.duration-state.elapsed))} SEC`,x,y-8);ctx.restore();
  }
  function render(){ctx.setTransform(state.dpr,0,0,state.dpr,0,0);ctx.clearRect(0,0,state.w,state.h);roads.forEach(strokeRoad);drawBuildPreview();drawCars();drawNodes();drawLabels();drawProgress();}

  const capacity=r=>(3+r.lanes*ROAD_TYPES[r.type].perLane+(r.features.transit?7:0))*(r.features.signals?1.25:1);
  const congestion=r=>Math.max(.28,r.traffic/capacity(r));
  const edgeCost=i=>{const r=roads[i],c=congestion(r),signalFactor=r.features.signals ? .9 : 1;return r.base*ROAD_TYPES[r.type].speed*signalFactor*(1+Math.pow(c,2.25)*2.5)/Math.sqrt(r.lanes);};
  function route(start,end) {
    const dist=nodes.map(()=>Infinity),prev=nodes.map(()=>null),open=new Set(nodes.map((_,i)=>i));dist[start]=0;
    while(open.size){let u=[...open].reduce((best,n)=>dist[n]<dist[best]?n:best);open.delete(u);if(u===end||!isFinite(dist[u]))break;roads.forEach((r,ri)=>{if(r.a!==u&&r.b!==u)return;const v=r.a===u?r.b:r.a;if(!open.has(v))return;const alt=dist[u]+edgeCost(ri);if(alt<dist[v]){dist[v]=alt;prev[v]={node:u,road:ri};}});}
    const path=[];let cur=end;while(cur!==start&&prev[cur]){path.unshift({road:prev[cur].road,from:prev[cur].node,to:cur});cur=prev[cur].node;}return path.length?path:null;
  }
  function spawnCar() {
    const start=Math.floor(Math.random()*nodes.length);let end=Math.floor(Math.random()*nodes.length);while(end===start)end=Math.floor(Math.random()*nodes.length);const path=route(start,end);if(!path)return;
    const palette=['#ec7358','#2c88aa','#f3c44f','#5caf96','#f5f7f3'],first=path[0];state.cars.push({path,step:0,road:first.road,direction:roads[first.road].a===first.from?1:-1,t:0,total:0,slot:Math.floor(Math.random()*4),color:palette[Math.floor(Math.random()*palette.length)]});roads[first.road].traffic++;
  }
  function updateCars(dt) {
    for(let i=state.cars.length-1;i>=0;i--){const car=state.cars[i],r=roads[car.road],slow=1+Math.pow(congestion(r),2.4)*2.8;car.t+=dt*(.27/(r.base*ROAD_TYPES[r.type].speed))/slow;car.total+=dt*slow;if(car.t<1)continue;r.traffic=Math.max(0,r.traffic-1);car.step++;
      if(car.step>=car.path.length){state.completed++;state.averageTime=state.averageTime*.92+Math.min(40,car.total*2.3)*.08;if(state.mode!=='sandbox')state.budget+=10;state.cars.splice(i,1);continue;}
      const leg=car.path[car.step];car.road=leg.road;car.direction=roads[leg.road].a===leg.from?1:-1;car.t=0;roads[leg.road].traffic++;}
  }
  function calculateScore(){const designBonus=roads.reduce((n,r)=>n+(r.built?90:0)+(r.features.green?120:0)+(r.features.signals?60:0)+(r.pattern==='s'?50:0),0);return Math.max(0,Math.round(state.completed*115+state.networkFlow*8-Math.max(0,state.averageTime-10)*45+designBonus));}
  function update(dt) {
    if(state.paused||state.ended||!state.started)return;state.elapsed+=dt;state.spawnClock-=dt;const m=MODES[state.mode],ramp=state.mode==='rush'?.16:.26,demand=m.demand-Math.min(ramp,state.elapsed/(isFinite(m.duration)?m.duration:160)*ramp);
    if(state.spawnClock<=0){spawnCar();state.spawnClock=Math.max(.2,demand*(.72+Math.random()*.55));}updateCars(dt);roads.forEach(r=>r.flash=Math.max(0,r.flash-dt*1.7));
    const loads=roads.map(congestion),worst=Math.max(...loads),weighted=roads.reduce((sum,r)=>sum+r.traffic*Math.min(3.3,congestion(r)),0)/Math.max(1,state.cars.length),target=8.7+weighted*5.6+worst*2.1;state.averageTime+=(target-state.averageTime)*Math.min(1,dt*.55);state.networkFlow=Math.max(10,Math.min(100,108-weighted*26-worst*9));state.score=calculateScore();
    if(state.elapsed>=state.nextSample){state.history.push(state.averageTime);if(state.history.length>80)state.history.shift();state.nextSample=state.elapsed+1;}if(isFinite(m.duration)&&state.elapsed>=m.duration)finish();
  }
  function drawSpark() {
    const w=spark.width/state.dpr,h=spark.height/state.dpr,v=state.history,min=7,max=30;sctx.setTransform(state.dpr,0,0,state.dpr,0,0);sctx.clearRect(0,0,w,h);sctx.beginPath();v.forEach((n,i)=>{const x=8+i/79*(w-20),y=h-8-(Math.min(max,Math.max(min,n))-min)/(max-min)*(h-17);i?sctx.lineTo(x,y):sctx.moveTo(x,y);});sctx.lineWidth=2;sctx.lineCap='round';sctx.strokeStyle=state.averageTime>MODES[state.mode].target?COLOR.coral:COLOR.blue;sctx.stroke();const last=v[v.length-1],x=8+(v.length-1)/79*(w-20),y=h-8-(Math.min(max,Math.max(min,last))-min)/(max-min)*(h-17);sctx.beginPath();sctx.arc(x,y,3.5,0,Math.PI*2);sctx.fillStyle=state.averageTime>MODES[state.mode].target?COLOR.coral:COLOR.amber;sctx.fill();
  }
  function rankFor(score){if(score>=15000)return'MASTER PLANNER';if(score>=9500)return'CITY ARCHITECT';if(score>=5500)return'TRAFFIC ENGINEER';if(score>=2500)return'ROAD DESIGNER';return'CITY INTERN';}
  function updateHUD() {
    const hot=roads.reduce((a,b)=>congestion(a)>congestion(b)?a:b),r=roads[state.selected]||roads[0],load=congestion(r),sandbox=state.mode==='sandbox';
    $('tripTime').innerHTML=`${state.averageTime.toFixed(1)} <small>min</small>`;$('networkFlow').innerHTML=`${Math.round(state.networkFlow)}<small>%</small>`;$('score').textContent=state.score.toLocaleString();$('rankLabel').textContent=sandbox?`${state.completed} TRIPS DONE`:rankFor(state.score);$('budget').textContent=sandbox?'∞':`$${state.budget}`;$('hotRoad').textContent=hot.name;$('hotRoadDetail').textContent=`${hot.lanes} LANE${hot.lanes>1?'S':''} · ${Math.round(congestion(hot)*100)}% LOAD`;
    const delta=state.history.length>5?state.averageTime-state.history[Math.max(0,state.history.length-5)]:0;$('trendLabel').textContent=delta>.6?'RISING':delta<-.6?'IMPROVING':'STABLE';$('trendLabel').style.color=delta>.6?COLOR.coral:delta<-.6?COLOR.mint:COLOR.blue;
    $('roadName').textContent=r.name;$('roadType').textContent=ROAD_TYPES[r.type].label.toUpperCase();$('typeSwatch').className=r.type;$('patternLabel').textContent=({straight:'DIRECT',left:'LEFT ARC',right:'RIGHT ARC',s:'S-BEND'})[r.pattern]||'DIRECT';$('laneCount').textContent=r.lanes;$('trafficCount').textContent=r.traffic;$('roadTravel').textContent=`${(r.base*ROAD_TYPES[r.type].speed*(r.features.signals ? .9 : 1)*(1+load*load*2.4)*3.2).toFixed(1)}m`;
    const pct=Math.min(100,Math.round(load*100));$('roadMeter').style.width=`${pct}%`;$('roadMeter').style.background=load>1.2?COLOR.coral:load>.75?COLOR.amber:COLOR.mint;const status=load>1.2?'JAMMED':load>.75?'BUSY':'FLOWING',pill=$('flowPill');pill.textContent=status;pill.className=`flow-pill ${status==='JAMMED'?'jammed':status==='BUSY'?'slow':''}`;
    const spec=ROAD_TYPES[r.type],cost=spec.upgrade+(r.lanes-spec.lanes)*120;$('upgradeCost').textContent=sandbox?'FREE':`$${cost}`;$('upgradeButton').disabled=r.lanes>=spec.max||(!sandbox&&state.budget<cost)||state.ended;$('upgradeButton').querySelector('span').textContent=r.lanes>=spec.max?'MAXIMUM WIDTH':'ADD A LANE';
    [['signalButton','signals'],['transitButton','transit'],['greenButton','green']].forEach(([id,key])=>{const button=$(id),installed=r.features[key];button.classList.toggle('installed',installed);button.disabled=installed||(!sandbox&&state.budget<FEATURE_COSTS[key])||state.ended;button.querySelector('b').textContent=installed?'ON':sandbox?'FREE':`$${FEATURE_COSTS[key]}`;});drawSpark();
  }

  function roadHit(x,y){let best=-1,dist=Infinity;roads.forEach((r,i)=>{for(let s=0;s<=36;s++){const p=roadPoint(r,s/36),d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=i;}}});return dist<34?best:-1;}
  function nodeHit(x,y){let best=-1,dist=Infinity;nodes.forEach((_,i)=>{const p=nodePoint(i),d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=i;}});return dist<28?best:-1;}
  let audio=null,toastTimer;
  function tone(freq,duration){if(!state.sound)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch(e){}}
  function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1700);}
  function selectRoad(i){if(i<0)return;roads.forEach(r=>r.selected=false);roads[i].selected=true;state.selected=i;$('hint').style.opacity='0';updateHUD();tone(420,.035);}
  function buildCost(){return ROAD_TYPES[state.buildType].cost+PATTERN_COSTS[state.buildPattern]+[...state.buildAddons].reduce((sum,key)=>sum+FEATURE_COSTS[key],0);}
  function updateBuildTotal(){$('buildTotal').textContent=state.mode==='sandbox'?'FREE':`$${buildCost()}`;}
  function resetBuildStep(){state.buildStart=null;$('buildInstruction').textContent='Pick a starting junction';document.querySelectorAll('.step-dot').forEach((el,i)=>el.classList.toggle('active',i===0));}
  function setBuild(active){state.build=active;state.mouse=null;$('buildPanel').hidden=!active;$('buildButton').classList.toggle('active',active);document.body.classList.toggle('building',active);document.querySelector('.play-area').classList.toggle('building',active);resetBuildStep();updateBuildTotal();}
  function handleBuildNode(i){
    if(i<0){toast('Tap one of the circular junctions');return;}
    if(state.buildStart===null){state.buildStart=i;$('buildInstruction').textContent=`From ${nodes[i].label} — choose destination`;document.querySelectorAll('.step-dot').forEach((el,j)=>el.classList.toggle('active',j===1));tone(500,.05);return;}
    if(i===state.buildStart){toast('Choose a different junction');return;}
    if(roads.some(r=>((r.a===i&&r.b===state.buildStart)||(r.b===i&&r.a===state.buildStart))&&r.pattern===state.buildPattern)){toast('That path pattern already connects these junctions');return;}
    const spec=ROAD_TYPES[state.buildType],sandbox=state.mode==='sandbox',cost=buildCost();if(!sandbox&&state.budget<cost){toast(`Need $${cost-state.budget} more for this design`);return;}if(!sandbox)state.budget-=cost;
    const a=state.buildStart,b=i,custom=$('roadNameInput').value.trim(),name=custom||`${nodes[a].label}–${nodes[b].label} ${spec.label}`,p0=nodePoint(a),p2=nodePoint(b),base=Math.max(.55,Math.hypot(p2.x-p0.x,p2.y-p0.y)/360),curve=state.buildPattern==='left' ? .16 : state.buildPattern==='right' ? -.16 : 0,features={signals:state.buildAddons.has('signals'),transit:state.buildAddons.has('transit'),green:state.buildAddons.has('green')};
    roads.forEach(r=>r.selected=false);roads.push(makeRoad(a,b,name,curve,state.buildType,base,true,{pattern:state.buildPattern,skin:state.buildSkin,features}));state.selected=roads.length-1;roads[state.selected].selected=true;roads[state.selected].flash=1;state.score+=90;$('roadNameInput').value='';toast(`${spec.label} opened: ${nodes[a].label} to ${nodes[b].label}`);tone(680,.14);setBuild(false);updateHUD();
  }
  function upgrade(){const r=roads[state.selected],spec=ROAD_TYPES[r.type],cost=spec.upgrade+(r.lanes-spec.lanes)*120,sandbox=state.mode==='sandbox';if(r.lanes>=spec.max||(!sandbox&&state.budget<cost))return;if(!sandbox)state.budget-=cost;r.lanes++;r.flash=1;tone(620,.12);toast(`${r.name} widened to ${r.lanes} lanes`);updateHUD();}
  function installFeature(key){const r=roads[state.selected],cost=FEATURE_COSTS[key],sandbox=state.mode==='sandbox';if(r.features[key]||(!sandbox&&state.budget<cost))return;if(!sandbox)state.budget-=cost;r.features[key]=true;r.flash=1;const label={signals:'Smart signals',transit:'Transit lane',green:'Green buffer'}[key];toast(`${label} added to ${r.name}`);tone(key==='green'?720:590,.11);updateHUD();}
  function togglePause(){if(state.ended||!state.started)return;state.paused=!state.paused;$('pauseButton').setAttribute('aria-label',state.paused?'Resume game':'Pause game');$('pauseIcon').innerHTML=state.paused?'<path d="m9 6 9 6-9 6V6Z"/>':'<path d="M8 6v12M16 6v12"/>';toast(state.paused?'Simulation paused':'Traffic moving');}
  function resetGame(mode=state.mode){const m=MODES[mode];resetRoads();Object.assign(state,{elapsed:0,duration:m.duration,spawnClock:0,paused:false,ended:false,started:true,mode,selected:2,cars:[],completed:0,budget:m.budget,averageTime:12.4,networkFlow:100,score:0,history:[12.4],nextSample:0,lastFrame:performance.now(),build:false,buildStart:null,mouse:null});setBuild(false);$('modeLabel').textContent=m.label;$('dayLabel').textContent=m.day;$('chapterLabel').textContent=m.chapter;$('missionText').innerHTML=mode==='sandbox'?'Build the city <strong>your way</strong>':`Keep average travel below <strong>${m.target} min</strong>`;$('endScreen').hidden=true;$('pauseIcon').innerHTML='<path d="M8 6v12M16 6v12"/>';updateHUD();}
  function finish(){state.ended=true;state.score=calculateScore();const m=MODES[state.mode],won=state.averageTime<m.target;if(state.mode==='ranked'){const best=Math.max(Number(localStorage.getItem('trafficWeaveBest')||0),state.score);localStorage.setItem('trafficWeaveBest',String(best));} $('resultIcon').textContent=won?'✓':'!';$('resultIcon').style.background=won?COLOR.mint:COLOR.coral;$('resultEyebrow').textContent=won?rankFor(state.score):'GRIDLOCK ALERT';$('resultTitle').textContent=won?'Beautifully balanced.':'The city slowed down.';$('resultText').textContent=won?`Your ${ROAD_TYPES[roads[state.selected].type].label.toLowerCase()} network kept demand moving.`:'Try building a fast bypass before the central roads fill up.';$('resultTrips').textContent=state.completed;$('resultTime').textContent=`${state.averageTime.toFixed(1)}m`;$('resultScore').textContent=state.score.toLocaleString();setTimeout(()=>$('endScreen').hidden=false,400);tone(won?740:180,.3);}
  function showModes(){state.paused=true;$('endScreen').hidden=true;$('modeScreen').hidden=false;}

  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();state.mouse={x:e.clientX-r.left,y:e.clientY-r.top};});
  canvas.addEventListener('pointerdown',e=>{if(!state.started)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(state.build)handleBuildNode(nodeHit(x,y));else selectRoad(roadHit(x,y));});
  $('buildButton').addEventListener('click',()=>setBuild(!state.build));$('cancelBuild').addEventListener('click',()=>setBuild(false));
  document.querySelectorAll('.road-type').forEach(btn=>btn.addEventListener('click',()=>{state.buildType=btn.dataset.type;document.querySelectorAll('.road-type').forEach(b=>b.classList.toggle('active',b===btn));resetBuildStep();updateBuildTotal();}));
  document.querySelectorAll('.pattern-choice').forEach(btn=>btn.addEventListener('click',()=>{state.buildPattern=btn.dataset.pattern;document.querySelectorAll('.pattern-choice').forEach(b=>b.classList.toggle('active',b===btn));resetBuildStep();updateBuildTotal();}));
  document.querySelectorAll('.palette-choice').forEach(btn=>btn.addEventListener('click',()=>{state.buildSkin=btn.dataset.skin;document.querySelectorAll('.palette-choice').forEach(b=>b.classList.toggle('active',b===btn));}));
  document.querySelectorAll('.addon-choice').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.addon;state.buildAddons.has(key)?state.buildAddons.delete(key):state.buildAddons.add(key);btn.classList.toggle('active',state.buildAddons.has(key));updateBuildTotal();}));
  let chosenMode='solo';document.querySelectorAll('.mode-choice').forEach(btn=>btn.addEventListener('click',()=>{chosenMode=btn.dataset.mode;document.querySelectorAll('.mode-choice').forEach(b=>b.classList.toggle('active',b===btn));$('startButton').innerHTML=`START ${MODES[chosenMode].label} <span>→</span>`;}));
  $('startButton').addEventListener('click',()=>{$('modeScreen').hidden=true;resetGame(chosenMode);tone(560,.07);});$('modeButton').addEventListener('click',showModes);$('changeModeButton').addEventListener('click',showModes);$('restartButton').addEventListener('click',()=>resetGame());$('upgradeButton').addEventListener('click',upgrade);$('signalButton').addEventListener('click',()=>installFeature('signals'));$('transitButton').addEventListener('click',()=>installFeature('transit'));$('greenButton').addEventListener('click',()=>installFeature('green'));$('pauseButton').addEventListener('click',togglePause);$('soundButton').addEventListener('click',()=>{state.sound=!state.sound;$('soundButton').setAttribute('aria-pressed',String(state.sound));if(state.sound)tone(520,.05);});
  window.addEventListener('resize',()=>{resize();render();drawSpark();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.started&&!state.ended&&!state.paused)togglePause();});
  const query=new URLSearchParams(location.search),directMode=query.get('mode');if(MODES[directMode]){chosenMode=directMode;$('modeScreen').hidden=true;resetGame(directMode);if(query.get('studio')==='1')setBuild(true);}
  function loop(now){const dt=Math.min(.05,(now-state.lastFrame)/1000);state.lastFrame=now;update(dt);render();updateHUD();requestAnimationFrame(loop);}resize();updateHUD();requestAnimationFrame(loop);
})();
