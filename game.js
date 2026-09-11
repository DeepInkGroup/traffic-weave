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
  const LEVELS = {
    surface:  { label:'Surface',  cost:0,   speed:1,   wear:1 },
    overpass: { label:'Overpass', cost:240, speed:.88, wear:1.18 },
    tunnel:   { label:'Tunnel',   cost:420, speed:.76, wear:1.32 }
  };
  const CITY_EVENTS = [
    {title:'Harbor shift change',text:'Commuters are surging toward Harbor',icon:'H',node:0,duration:14,demand:1.38,reward:120},
    {title:'Market day',text:'Market district demand has doubled',icon:'M',node:2,duration:13,demand:1.42,reward:130},
    {title:'Park festival',text:'Crowds are heading for the park',icon:'P',node:4,duration:15,demand:1.34,reward:140},
    {title:'Last train arrival',text:'Station traffic is spiking',icon:'R',node:5,duration:12,demand:1.48,reward:130},
    {title:'Heavy rain',text:'Surface roads are moving more slowly',icon:'☂',node:null,duration:14,demand:1.16,surfacePenalty:1.22,reward:150}
  ];
  const POLICIES = {
    mobility:{label:'Mobility Fund',icon:'⌁'},transit:{label:'Transit First',icon:'↔'},care:{label:'Care Program',icon:'✦'}
  };
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
    buildPattern:'straight',buildSkin:'mist',buildLevel:'surface',buildAddons:new Set(),buildStart:null,mouse:null,
    cityEvent:null,eventEnd:0,nextEvent:14,eventIndex:0,nextMilestone:25,policies:[],policyPending:false,flowLens:false
  };

  function makeRoad(a,b,name,curve,type='street',base=1,built=false,options={}) {
    const spec=ROAD_TYPES[type];
    const inferred=Math.abs(curve)>.045?(curve>0?'left':'right'):'straight';
    return {a,b,name,curve,type,lanes:spec.lanes,base,traffic:0,selected:false,flash:0,built,
      pattern:options.pattern||inferred,skin:options.skin||'mist',level:options.level||'surface',health:100,crossings:0,
      features:{signals:false,transit:false,green:false,...options.features}};
  }
  function resetRoads() {
    roads=initialRoads.map(r=>makeRoad(...r));
    roads[0].features.green=true;
    roads[1].features.transit=true;
    roads[3].skin='sand';
    roads[7].name='Civic Tunnel';roads[7].pattern='s';roads[7].curve=0;roads[7].skin='coastal';roads[7].level='tunnel';roads[7].features.signals=true;
    roads[8].name='Sunline Flyover';roads[8].level='overpass';roads[8].features.signals=true;
    roads[2].selected=true;
  }
  resetRoads();

  function resize() {
    const r=canvas.getBoundingClientRect(), sr=spark.getBoundingClientRect();
    state.dpr=Math.min(devicePixelRatio||1,2); state.w=r.width; state.h=r.height;
    canvas.width=Math.round(r.width*state.dpr); canvas.height=Math.round(r.height*state.dpr);
    spark.width=Math.round(sr.width*state.dpr); spark.height=Math.round(sr.height*state.dpr);
    updateCrossings();
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
  function segmentsCross(a,b,c,d){const turn=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x),a1=turn(a,b,c),a2=turn(a,b,d),a3=turn(c,d,a),a4=turn(c,d,b);return a1*a2<0&&a3*a4<0;}
  function updateCrossings(){
    if(!roads.length||!state.w)return;roads.forEach(r=>r.crossings=0);
    for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){const a=roads[i],b=roads[j];if(a.level!=='surface'||b.level!=='surface'||a.a===b.a||a.a===b.b||a.b===b.a||a.b===b.b)continue;let hit=false;
      for(let x=0;x<14&&!hit;x++){const a0=roadPoint(a,x/14),a1=roadPoint(a,(x+1)/14);for(let y=0;y<14;y++){if(segmentsCross(a0,a1,roadPoint(b,y/14),roadPoint(b,(y+1)/14))){hit=true;break;}}}
      if(hit){a.crossings++;b.crossings++;}
    }
  }

  function strokeRoad(r) {
    const spec=ROAD_TYPES[r.type],skin=ROAD_SKINS[r.skin]||ROAD_SKINS.mist,width=spec.width+(r.lanes-spec.lanes)*3;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    if(r.level==='overpass'){traceRoad(r);ctx.lineWidth=width+15;ctx.strokeStyle='rgba(16,45,70,.13)';ctx.shadowColor='rgba(16,45,70,.2)';ctx.shadowBlur=9;ctx.shadowOffsetY=5;ctx.stroke();ctx.shadowColor='transparent';}
    if(r.level==='tunnel')ctx.globalAlpha=r.selected ? .82 : .62;
    traceRoad(r);ctx.setLineDash(r.level==='tunnel'?[10,6]:[]);ctx.lineWidth=width+7;ctx.strokeStyle=r.level==='tunnel'?'#536b7f':COLOR.ink;ctx.stroke();
    traceRoad(r);ctx.setLineDash([]);ctx.lineWidth=width;ctx.strokeStyle=r.selected?'#f5c65f':(skin.surface||spec.surface);ctx.stroke();
    traceRoad(r);ctx.lineWidth=Math.max(4,width-10);ctx.strokeStyle=r.selected?'rgba(255,226,143,.52)':(skin.inner||spec.inner);ctx.stroke();
    traceRoad(r);ctx.lineWidth=r.type==='highway'?2.2:1.7;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.setLineDash(r.type==='highway'?[12,7]:[7,9]);ctx.stroke();
    if(r.type==='highway'&&!r.selected){traceRoad(r);ctx.setLineDash([]);ctx.lineWidth=.8;ctx.strokeStyle='rgba(16,45,70,.22)';ctx.stroke();}
    if(r.features.transit){traceRoad(r);ctx.setLineDash([2,7]);ctx.lineWidth=2.2;ctx.strokeStyle='#35a4bc';ctx.stroke();}
    if(r.selected){traceRoad(r);ctx.setLineDash([]);ctx.lineWidth=2;ctx.strokeStyle='rgba(220,143,45,.88)';ctx.stroke();}
    if(r.features.green&&r.level!=='tunnel'){ctx.setLineDash([]);for(let t=.14;t<.9;t+=.16){const p=roadPoint(r,t),tan=roadTangent(r,t),l=Math.hypot(tan.x,tan.y)||1;ctx.beginPath();ctx.arc(p.x-tan.y/l*(width/2+5),p.y+tan.x/l*(width/2+5),2.1,0,Math.PI*2);ctx.fillStyle='#5aaf96';ctx.fill();}}
    if(r.features.signals){[.08,.92].forEach(t=>{const p=roadPoint(r,t);ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fillStyle='#f4ba47';ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle=COLOR.ink;ctx.stroke();});}
    if(r.level==='tunnel'){ctx.globalAlpha=1;[.035,.965].forEach(t=>{const p=roadPoint(r,t);ctx.beginPath();ctx.arc(p.x,p.y,width*.43,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle=COLOR.ink;ctx.stroke();});}
    if(r.level==='overpass'){[.22,.5,.78].forEach(t=>{const p=roadPoint(r,t),tan=roadTangent(r,t),l=Math.hypot(tan.x,tan.y)||1;ctx.beginPath();ctx.moveTo(p.x-tan.y/l*(width/2+3),p.y+tan.x/l*(width/2+3));ctx.lineTo(p.x+tan.y/l*(width/2+3),p.y-tan.x/l*(width/2+3));ctx.lineWidth=1.2;ctx.strokeStyle='rgba(16,45,70,.45)';ctx.stroke();});}
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
    nodes.forEach((n,i)=>{const p=nodePoint(i),busy=roads.filter(r=>r.a===i||r.b===i).reduce((s,r)=>s+r.traffic,0),chosen=state.build&&state.buildStart===i,hot=state.cityEvent?.node===i;
      ctx.save();if(hot){ctx.beginPath();ctx.arc(p.x,p.y,20+Math.sin(state.elapsed*5)*3,0,Math.PI*2);ctx.fillStyle='rgba(239,108,81,.14)';ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.strokeStyle='rgba(239,108,81,.55)';ctx.lineWidth=2;ctx.stroke();}if(state.build){ctx.beginPath();ctx.arc(p.x,p.y,chosen?22:18,0,Math.PI*2);ctx.fillStyle=chosen?'rgba(244,186,71,.25)':'rgba(39,133,169,.13)';ctx.fill();}
      ctx.beginPath();ctx.arc(p.x,p.y,12.5,0,Math.PI*2);ctx.fillStyle=chosen?'#fff1ca':COLOR.white;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle=chosen?COLOR.amber:COLOR.ink;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,4.3,0,Math.PI*2);ctx.fillStyle=busy>11?COLOR.coral:busy>6?COLOR.amber:COLOR.blue;ctx.fill();ctx.restore();});
  }
  function drawCars() {
    state.cars.forEach(car=>{const r=roads[car.road];if(!r)return;const t=car.direction>0?car.t:1-car.t,p=roadPoint(r,t),tan=roadTangent(r,t),angle=Math.atan2(tan.y,tan.x)+(car.direction>0?0:Math.PI),offset=((car.slot%Math.max(1,r.lanes))-(r.lanes-1)/2)*4;
      ctx.save();if(r.level==='tunnel')ctx.globalAlpha=.5;ctx.translate(p.x-Math.sin(angle)*offset,p.y+Math.cos(angle)*offset);ctx.rotate(angle);ctx.beginPath();ctx.roundRect(-4.5,-2.5,9,5,2.5);ctx.fillStyle=car.color;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='rgba(16,45,70,.45)';ctx.stroke();ctx.restore();});
  }
  function drawLabels() { if(state.w<520)return;nodes.forEach((n,i)=>{const p=nodePoint(i);ctx.save();ctx.fillStyle='rgba(16,45,70,.6)';ctx.font='800 8px Inter, sans-serif';ctx.textAlign='center';ctx.fillText(n.label.toUpperCase(),p.x,p.y+26);ctx.restore();}); }
  function drawProgress() {
    const x=25,y=state.h-20,w=Math.min(130,state.w*.24),sandbox=state.mode==='sandbox';ctx.save();ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.strokeStyle='rgba(16,45,70,.12)';ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*(sandbox?.64:Math.min(1,state.elapsed/state.duration)),y);ctx.strokeStyle=sandbox?COLOR.mint:COLOR.blue;ctx.stroke();ctx.fillStyle=COLOR.ink;ctx.font='800 8px Inter, sans-serif';ctx.fillText(sandbox?'FREE PLAY':`${Math.max(0,Math.ceil(state.duration-state.elapsed))} SEC`,x,y-8);ctx.restore();
  }
  function drawCityBackdrop(){
    if(state.w<430)return;const harbor=nodePoint(0),market=nodePoint(2),park=nodePoint(4),station=nodePoint(5);ctx.save();
    ctx.fillStyle='rgba(107,178,199,.08)';ctx.beginPath();ctx.ellipse(harbor.x-38,harbor.y+5,82,110,-.28,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(39,133,169,.11)';ctx.lineWidth=1.2;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(harbor.x-62,harbor.y+6,43+i*15,-1.2,1.15);ctx.stroke();}
    ctx.fillStyle='rgba(90,175,150,.085)';ctx.beginPath();ctx.ellipse(park.x+18,park.y-12,96,66,-.18,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(90,175,150,.18)';for(let i=0;i<12;i++){const a=i*2.4,p=i%4*13;ctx.beginPath();ctx.arc(park.x-42+p,park.y-35+Math.sin(a)*18,2.2,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='rgba(244,186,71,.07)';ctx.beginPath();ctx.roundRect(market.x-74,market.y-45,150,88,18);ctx.fill();ctx.strokeStyle='rgba(220,143,45,.12)';for(let x=-50;x<=50;x+=25)for(let y=-25;y<=20;y+=22){ctx.strokeRect(market.x+x,market.y+y,16,12);}
    ctx.strokeStyle='rgba(16,45,70,.10)';ctx.lineWidth=2;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(station.x-62,station.y+28+i*5);ctx.lineTo(station.x+70,station.y+28+i*5);ctx.stroke();}
    ctx.font='800 7px Inter, sans-serif';ctx.letterSpacing='1px';ctx.fillStyle='rgba(39,83,107,.27)';ctx.fillText('WATERFRONT',harbor.x-88,harbor.y+100);ctx.fillText('MARKET QUARTER',market.x-47,market.y-54);ctx.fillText('GREEN DISTRICT',park.x-35,park.y+58);ctx.restore();
  }
  function drawFlowLayer(){
    roads.forEach(r=>{const load=utilization(r),color=load>1.08?COLOR.coral:load>.68?COLOR.amber:COLOR.mint,spec=ROAD_TYPES[r.type],width=spec.width+(r.lanes-spec.lanes)*3;ctx.save();traceRoad(r);ctx.lineCap='round';ctx.lineWidth=width+18;ctx.strokeStyle=color;ctx.globalAlpha=.15+Math.min(.2,load*.12);ctx.stroke();const p=roadPoint(r,.5);ctx.globalAlpha=1;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.94)';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=color;ctx.stroke();ctx.fillStyle=COLOR.ink;ctx.font='900 7px Inter, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${Math.round(load*100)}%`,p.x,p.y);if(r.crossings&&r.level==='surface'){ctx.beginPath();ctx.moveTo(p.x,p.y-20);ctx.lineTo(p.x+4,p.y-16);ctx.lineTo(p.x,p.y-12);ctx.lineTo(p.x-4,p.y-16);ctx.closePath();ctx.fillStyle=COLOR.amber;ctx.fill();}ctx.restore();});
  }
  function render(){ctx.setTransform(state.dpr,0,0,state.dpr,0,0);ctx.clearRect(0,0,state.w,state.h);drawCityBackdrop();['tunnel','surface','overpass'].forEach(level=>roads.filter(r=>r.level===level).forEach(strokeRoad));if(state.flowLens)drawFlowLayer();drawBuildPreview();drawCars();drawNodes();drawLabels();drawProgress();}

  const capacity=r=>(3+r.lanes*ROAD_TYPES[r.type].perLane+(r.features.transit?7+(state.policies.includes('transit')?5:0):0))*(r.features.signals?1.25:1)*(r.health<45 ? .78 : 1);
  const utilization=r=>r.traffic/capacity(r);
  const congestion=r=>Math.max(.28,utilization(r));
  const edgeCost=i=>{const r=roads[i],c=congestion(r),signalFactor=r.features.signals ? .9 : 1,level=LEVELS[r.level],crossingFactor=r.level==='surface'?1+r.crossings*.16:1,conditionFactor=1+(100-r.health)*.006,eventFactor=state.cityEvent?.surfacePenalty&&r.level==='surface'?state.cityEvent.surfacePenalty:1;return r.base*ROAD_TYPES[r.type].speed*level.speed*signalFactor*crossingFactor*conditionFactor*eventFactor*(1+Math.pow(c,2.25)*2.5)/Math.sqrt(r.lanes);};
  function route(start,end) {
    const dist=nodes.map(()=>Infinity),prev=nodes.map(()=>null),open=new Set(nodes.map((_,i)=>i));dist[start]=0;
    while(open.size){let u=[...open].reduce((best,n)=>dist[n]<dist[best]?n:best);open.delete(u);if(u===end||!isFinite(dist[u]))break;roads.forEach((r,ri)=>{if(r.a!==u&&r.b!==u)return;const v=r.a===u?r.b:r.a;if(!open.has(v))return;const alt=dist[u]+edgeCost(ri);if(alt<dist[v]){dist[v]=alt;prev[v]={node:u,road:ri};}});}
    const path=[];let cur=end;while(cur!==start&&prev[cur]){path.unshift({road:prev[cur].road,from:prev[cur].node,to:cur});cur=prev[cur].node;}return path.length?path:null;
  }
  function demandNode(exclude=-1){const hot=state.cityEvent?.node;if(hot!==null&&hot!==undefined&&hot!==exclude&&Math.random()<.56)return hot;let node=Math.floor(Math.random()*nodes.length);while(node===exclude)node=Math.floor(Math.random()*nodes.length);return node;}
  function spawnCar() {
    const start=demandNode(),end=demandNode(start),path=route(start,end);if(!path)return;
    const palette=['#ec7358','#2c88aa','#f3c44f','#5caf96','#f5f7f3'],first=path[0];state.cars.push({path,step:0,road:first.road,direction:roads[first.road].a===first.from?1:-1,t:0,total:0,slot:Math.floor(Math.random()*4),color:palette[Math.floor(Math.random()*palette.length)]});roads[first.road].traffic++;
  }
  function updateCars(dt) {
    for(let i=state.cars.length-1;i>=0;i--){const car=state.cars[i],r=roads[car.road],slow=1+Math.pow(congestion(r),2.4)*2.8;car.t+=dt*(.27/(r.base*ROAD_TYPES[r.type].speed))/slow;car.total+=dt*slow;if(car.t<1)continue;r.traffic=Math.max(0,r.traffic-1);car.step++;
      if(car.step>=car.path.length){state.completed++;state.averageTime=state.averageTime*.92+Math.min(40,car.total*2.3)*.08;if(state.mode!=='sandbox')state.budget+=10;state.cars.splice(i,1);continue;}
      const leg=car.path[car.step];car.road=leg.road;car.direction=roads[leg.road].a===leg.from?1:-1;car.t=0;roads[leg.road].traffic++;}
  }
  function calculateScore(){const designBonus=roads.reduce((n,r)=>n+(r.built?90:0)+(r.features.green?120:0)+(r.features.signals?60:0)+(r.pattern==='s'?50:0)+(r.level==='overpass'?140:r.level==='tunnel'?220:0),0),condition=roads.reduce((sum,r)=>sum+r.health,0)/roads.length;return Math.max(0,Math.round(state.completed*115+state.networkFlow*8+condition*3+state.policies.length*250-Math.max(0,state.averageTime-10)*45+designBonus));}
  function startCityEvent(){const source=CITY_EVENTS[state.eventIndex%CITY_EVENTS.length];state.cityEvent={...source};state.eventIndex++;state.eventEnd=state.elapsed+source.duration;toast(`${source.title}: city demand changed`);tone(330,.12);}
  function closeCityEvent(){if(!state.cityEvent)return;const success=state.networkFlow>=62;if(success&&state.mode!=='sandbox'){state.budget+=state.cityEvent.reward;toast(`Event handled · +$${state.cityEvent.reward}`);tone(690,.12);}else toast(success?'Event handled beautifully':'Event ended · network strained');state.cityEvent=null;state.nextEvent=state.elapsed+17;}
  function openPolicyChoice(){
    if(state.policies.length>=3){if(state.mode!=='sandbox')state.budget+=260;toast(`${state.nextMilestone} trips · expansion grant +$260`);state.nextMilestone+=25;return;}
    state.policyPending=true;state.paused=true;setBuild(false);document.querySelector('.policy-seal').textContent=state.nextMilestone;document.querySelectorAll('[data-policy]').forEach(button=>button.disabled=state.policies.includes(button.dataset.policy));$('policyScreen').hidden=false;tone(470,.12);
  }
  function choosePolicy(key){if(state.policies.includes(key))return;state.policies.push(key);state.policyPending=false;state.nextMilestone+=25;if(state.mode!=='sandbox')state.budget+=180;$('policyScreen').hidden=true;state.paused=false;toast(`${POLICIES[key].label} adopted · city grant +$180`);tone(760,.16);updateHUD();}
  function update(dt) {
    if(state.paused||state.ended||!state.started)return;state.elapsed+=dt;state.spawnClock-=dt;const m=MODES[state.mode],ramp=state.mode==='rush'?.16:.26,demand=m.demand-Math.min(ramp,state.elapsed/(isFinite(m.duration)?m.duration:160)*ramp);
    if(!state.cityEvent&&state.elapsed>=state.nextEvent)startCityEvent();if(state.cityEvent&&state.elapsed>=state.eventEnd)closeCityEvent();
    if(state.spawnClock<=0){spawnCar();state.spawnClock=Math.max(.18,demand*(.72+Math.random()*.55)/(state.cityEvent?.demand||1));}updateCars(dt);roads.forEach(r=>{r.flash=Math.max(0,r.flash-dt*1.7);if(r.traffic)r.health=Math.max(18,r.health-dt*r.traffic*.045*LEVELS[r.level].wear*(state.policies.includes('care') ? .55 : 1));});
    const loads=roads.map(congestion),worst=Math.max(...loads),weighted=roads.reduce((sum,r)=>sum+r.traffic*Math.min(3.3,congestion(r)),0)/Math.max(1,state.cars.length),target=8.7+weighted*5.6+worst*2.1;state.averageTime+=(target-state.averageTime)*Math.min(1,dt*.55);state.networkFlow=Math.max(10,Math.min(100,108-weighted*26-worst*9));state.score=calculateScore();
    if(state.completed>=state.nextMilestone&&!state.policyPending)openPolicyChoice();
    if(state.elapsed>=state.nextSample){state.history.push(state.averageTime);if(state.history.length>80)state.history.shift();state.nextSample=state.elapsed+1;}if(isFinite(m.duration)&&state.elapsed>=m.duration)finish();
  }
  function drawSpark() {
    const w=spark.width/state.dpr,h=spark.height/state.dpr,v=state.history,min=7,max=30;sctx.setTransform(state.dpr,0,0,state.dpr,0,0);sctx.clearRect(0,0,w,h);sctx.beginPath();v.forEach((n,i)=>{const x=8+i/79*(w-20),y=h-8-(Math.min(max,Math.max(min,n))-min)/(max-min)*(h-17);i?sctx.lineTo(x,y):sctx.moveTo(x,y);});sctx.lineWidth=2;sctx.lineCap='round';sctx.strokeStyle=state.averageTime>MODES[state.mode].target?COLOR.coral:COLOR.blue;sctx.stroke();const last=v[v.length-1],x=8+(v.length-1)/79*(w-20),y=h-8-(Math.min(max,Math.max(min,last))-min)/(max-min)*(h-17);sctx.beginPath();sctx.arc(x,y,3.5,0,Math.PI*2);sctx.fillStyle=state.averageTime>MODES[state.mode].target?COLOR.coral:COLOR.amber;sctx.fill();
  }
  function rankFor(score){if(score>=15000)return'MASTER PLANNER';if(score>=9500)return'CITY ARCHITECT';if(score>=5500)return'TRAFFIC ENGINEER';if(score>=2500)return'ROAD DESIGNER';return'CITY INTERN';}
  function updateHUD() {
    const hot=roads.reduce((a,b)=>utilization(a)>utilization(b)?a:b),r=roads[state.selected]||roads[0],load=utilization(r),sandbox=state.mode==='sandbox';
    $('tripTime').innerHTML=`${state.averageTime.toFixed(1)} <small>min</small>`;$('networkFlow').innerHTML=`${Math.round(state.networkFlow)}<small>%</small>`;$('score').textContent=state.score.toLocaleString();$('rankLabel').textContent=sandbox?`${state.completed} TRIPS DONE`:rankFor(state.score);$('budget').textContent=sandbox?'∞':`$${state.budget}`;$('hotRoad').textContent=hot.name;$('hotRoadDetail').textContent=`${hot.lanes} LANE${hot.lanes>1?'S':''} · ${Math.round(utilization(hot)*100)}% LOAD`;
    const delta=state.history.length>5?state.averageTime-state.history[Math.max(0,state.history.length-5)]:0;$('trendLabel').textContent=delta>.6?'RISING':delta<-.6?'IMPROVING':'STABLE';$('trendLabel').style.color=delta>.6?COLOR.coral:delta<-.6?COLOR.mint:COLOR.blue;
    $('roadName').textContent=r.name;$('roadType').textContent=ROAD_TYPES[r.type].label.toUpperCase();$('typeSwatch').className=r.type;$('patternLabel').textContent=({straight:'DIRECT',left:'LEFT ARC',right:'RIGHT ARC',s:'S-BEND'})[r.pattern]||'DIRECT';$('levelLabel').textContent=LEVELS[r.level].label.toUpperCase();$('levelLabel').className=`level-label ${r.level}`;$('laneCount').textContent=r.lanes;$('trafficCount').textContent=r.traffic;$('roadTravel').textContent=`${(edgeCost(state.selected)*3.2).toFixed(1)}m`;$('roadHealth').textContent=`${Math.round(r.health)}%`;$('roadHealth').style.color=r.health<45?COLOR.coral:r.health<70?COLOR.amber:COLOR.ink;
    const crossing=$('crossingNote');crossing.className='crossing-note';if(r.level==='surface'&&r.crossings){crossing.textContent=`${r.crossings} AT-GRADE CONFLICT${r.crossings>1?'S':''} · FLOW PENALTY`;crossing.classList.add('conflict');}else{crossing.textContent=r.level==='tunnel'?'UNDERGROUND · CROSSINGS BYPASSED':r.level==='overpass'?'ELEVATED · CROSSINGS BYPASSED':'NO CROSSING DELAY';crossing.classList.add('clear');}
    const pct=Math.min(100,Math.round(load*100));$('roadMeter').style.width=`${pct}%`;$('roadMeter').style.background=load>1.2?COLOR.coral:load>.75?COLOR.amber:COLOR.mint;const status=load>1.2?'JAMMED':load>.75?'BUSY':'FLOWING',pill=$('flowPill');pill.textContent=status;pill.className=`flow-pill ${status==='JAMMED'?'jammed':status==='BUSY'?'slow':''}`;
    const spec=ROAD_TYPES[r.type],cost=spec.upgrade+(r.lanes-spec.lanes)*120,repair=maintenanceCost(r);$('upgradeCost').textContent=sandbox?'FREE':`$${cost}`;$('upgradeButton').disabled=r.lanes>=spec.max||(!sandbox&&state.budget<cost)||state.ended;$('upgradeButton').querySelector('span').textContent=r.lanes>=spec.max?'MAX WIDTH':'ADD LANE';$('repairCost').textContent=r.health>=98?'GOOD':sandbox?'FREE':`$${repair}`;$('maintainButton').disabled=r.health>=98||(!sandbox&&state.budget<repair)||state.ended;
    [['signalButton','signals'],['transitButton','transit'],['greenButton','green']].forEach(([id,key])=>{const button=$(id),installed=r.features[key];button.classList.toggle('installed',installed);button.disabled=installed||(!sandbox&&state.budget<FEATURE_COSTS[key])||state.ended||key==='green'&&r.level==='tunnel';button.querySelector('b').textContent=installed?'ON':key==='green'&&r.level==='tunnel'?'N/A':sandbox?'FREE':`$${FEATURE_COSTS[key]}`;});
    const banner=$('eventBanner');banner.hidden=!state.cityEvent;if(state.cityEvent){$('eventIcon').textContent=state.cityEvent.icon;$('eventTitle').textContent=state.cityEvent.title;$('eventText').textContent=state.cityEvent.text;$('eventTimer').textContent=`${Math.max(0,Math.ceil(state.eventEnd-state.elapsed))}s`;}
    $('policyTray').innerHTML=state.policies.map(key=>`<span class="policy-chip"><i>${POLICIES[key].icon}</i><span>${POLICIES[key].label.toUpperCase()}</span></span>`).join('');$('flowLegend').hidden=!state.flowLens;
    drawSpark();
  }

  function roadHit(x,y){let best=-1,dist=Infinity;roads.forEach((r,i)=>{for(let s=0;s<=36;s++){const p=roadPoint(r,s/36),d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=i;}}});return dist<34?best:-1;}
  function nodeHit(x,y){let best=-1,dist=Infinity;nodes.forEach((_,i)=>{const p=nodePoint(i),d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=i;}});return dist<28?best:-1;}
  let audio=null,toastTimer;
  function tone(freq,duration){if(!state.sound)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch(e){}}
  function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1700);}
  function selectRoad(i){if(i<0)return;roads.forEach(r=>r.selected=false);roads[i].selected=true;state.selected=i;$('hint').style.opacity='0';updateHUD();tone(420,.035);}
  function buildCost(){const levelCost=LEVELS[state.buildLevel].cost*(state.policies.includes('mobility') ? .7 : 1);return Math.round(ROAD_TYPES[state.buildType].cost+PATTERN_COSTS[state.buildPattern]+levelCost+[...state.buildAddons].reduce((sum,key)=>sum+FEATURE_COSTS[key],0));}
  function updateBuildTotal(){$('buildTotal').textContent=state.mode==='sandbox'?'FREE':`$${buildCost()}`;}
  function resetBuildStep(){state.buildStart=null;$('buildInstruction').textContent='Pick a starting junction';document.querySelectorAll('.step-dot').forEach((el,i)=>el.classList.toggle('active',i===0));}
  function setBuild(active){state.build=active;state.mouse=null;$('buildPanel').hidden=!active;$('buildButton').classList.toggle('active',active);document.body.classList.toggle('building',active);document.querySelector('.play-area').classList.toggle('building',active);resetBuildStep();updateBuildTotal();}
  function handleBuildNode(i){
    if(i<0){toast('Tap one of the circular junctions');return;}
    if(state.buildStart===null){state.buildStart=i;$('buildInstruction').textContent=`From ${nodes[i].label} — choose destination`;document.querySelectorAll('.step-dot').forEach((el,j)=>el.classList.toggle('active',j===1));tone(500,.05);return;}
    if(i===state.buildStart){toast('Choose a different junction');return;}
    if(roads.some(r=>((r.a===i&&r.b===state.buildStart)||(r.b===i&&r.a===state.buildStart))&&r.pattern===state.buildPattern&&r.level===state.buildLevel)){toast('That path already exists on this level');return;}
    const spec=ROAD_TYPES[state.buildType],sandbox=state.mode==='sandbox',cost=buildCost();if(!sandbox&&state.budget<cost){toast(`Need $${cost-state.budget} more for this design`);return;}if(!sandbox)state.budget-=cost;
    const a=state.buildStart,b=i,custom=$('roadNameInput').value.trim(),suffix=state.buildLevel==='tunnel'?'Tunnel':state.buildLevel==='overpass'?'Flyover':spec.label,name=custom||`${nodes[a].label}–${nodes[b].label} ${suffix}`,p0=nodePoint(a),p2=nodePoint(b),base=Math.max(.55,Math.hypot(p2.x-p0.x,p2.y-p0.y)/360),curve=state.buildPattern==='left' ? .16 : state.buildPattern==='right' ? -.16 : 0,features={signals:state.buildAddons.has('signals'),transit:state.buildAddons.has('transit'),green:state.buildAddons.has('green')&&state.buildLevel!=='tunnel'};
    roads.forEach(r=>r.selected=false);roads.push(makeRoad(a,b,name,curve,state.buildType,base,true,{pattern:state.buildPattern,skin:state.buildSkin,level:state.buildLevel,features}));state.selected=roads.length-1;roads[state.selected].selected=true;roads[state.selected].flash=1;updateCrossings();state.score+=90;$('roadNameInput').value='';toast(`${LEVELS[state.buildLevel].label} opened: ${nodes[a].label} to ${nodes[b].label}`);tone(680,.14);setBuild(false);updateHUD();
  }
  function upgrade(){const r=roads[state.selected],spec=ROAD_TYPES[r.type],cost=spec.upgrade+(r.lanes-spec.lanes)*120,sandbox=state.mode==='sandbox';if(r.lanes>=spec.max||(!sandbox&&state.budget<cost))return;if(!sandbox)state.budget-=cost;r.lanes++;r.flash=1;tone(620,.12);toast(`${r.name} widened to ${r.lanes} lanes`);updateHUD();}
  function installFeature(key){const r=roads[state.selected],cost=FEATURE_COSTS[key],sandbox=state.mode==='sandbox';if(r.features[key]||(!sandbox&&state.budget<cost))return;if(!sandbox)state.budget-=cost;r.features[key]=true;r.flash=1;const label={signals:'Smart signals',transit:'Transit lane',green:'Green buffer'}[key];toast(`${label} added to ${r.name}`);tone(key==='green'?720:590,.11);updateHUD();}
  function maintenanceCost(r){const base=120+(r.type==='highway'?100:r.type==='avenue'?50:0)+(r.level==='surface'?0:100);return Math.round(base*(state.policies.includes('care') ? .55 : 1));}
  function maintainRoad(){const r=roads[state.selected],cost=maintenanceCost(r),sandbox=state.mode==='sandbox';if(r.health>=98||(!sandbox&&state.budget<cost))return;if(!sandbox)state.budget-=cost;r.health=100;r.flash=1;toast(`${r.name} restored to full condition`);tone(650,.12);updateHUD();}
  function toggleFlowLens(){state.flowLens=!state.flowLens;$('lensButton').setAttribute('aria-pressed',String(state.flowLens));toast(state.flowLens?'Flow Lens on · live load revealed':'Flow Lens off · city view restored');tone(state.flowLens?540:400,.06);updateHUD();}
  function togglePause(){if(state.ended||!state.started)return;state.paused=!state.paused;$('pauseButton').setAttribute('aria-label',state.paused?'Resume game':'Pause game');$('pauseIcon').innerHTML=state.paused?'<path d="m9 6 9 6-9 6V6Z"/>':'<path d="M8 6v12M16 6v12"/>';toast(state.paused?'Simulation paused':'Traffic moving');}
  function resetGame(mode=state.mode){const m=MODES[mode];resetRoads();Object.assign(state,{elapsed:0,duration:m.duration,spawnClock:0,paused:false,ended:false,started:true,mode,selected:2,cars:[],completed:0,budget:m.budget,averageTime:12.4,networkFlow:100,score:0,history:[12.4],nextSample:0,lastFrame:performance.now(),build:false,buildStart:null,mouse:null,cityEvent:null,eventEnd:0,nextEvent:14,eventIndex:Math.floor(Math.random()*CITY_EVENTS.length),nextMilestone:25,policies:[],policyPending:false});updateCrossings();setBuild(false);$('policyScreen').hidden=true;$('modeLabel').textContent=m.label;$('dayLabel').textContent=m.day;$('chapterLabel').textContent=m.chapter;$('missionText').innerHTML=mode==='sandbox'?'Build the city <strong>your way</strong>':`Keep average travel below <strong>${m.target} min</strong>`;$('endScreen').hidden=true;$('pauseIcon').innerHTML='<path d="M8 6v12M16 6v12"/>';updateHUD();}
  function finish(){state.ended=true;state.score=calculateScore();const m=MODES[state.mode],won=state.averageTime<m.target;if(state.mode==='ranked'){const best=Math.max(Number(localStorage.getItem('trafficWeaveBest')||0),state.score);localStorage.setItem('trafficWeaveBest',String(best));} $('resultIcon').textContent=won?'✓':'!';$('resultIcon').style.background=won?COLOR.mint:COLOR.coral;$('resultEyebrow').textContent=won?rankFor(state.score):'GRIDLOCK ALERT';$('resultTitle').textContent=won?'Beautifully balanced.':'The city slowed down.';$('resultText').textContent=won?`Your ${ROAD_TYPES[roads[state.selected].type].label.toLowerCase()} network kept demand moving.`:'Try building a fast bypass before the central roads fill up.';$('resultTrips').textContent=state.completed;$('resultTime').textContent=`${state.averageTime.toFixed(1)}m`;$('resultScore').textContent=state.score.toLocaleString();setTimeout(()=>$('endScreen').hidden=false,400);tone(won?740:180,.3);}
  function showModes(){state.paused=true;$('endScreen').hidden=true;$('policyScreen').hidden=true;$('modeScreen').hidden=false;}

  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();state.mouse={x:e.clientX-r.left,y:e.clientY-r.top};});
  canvas.addEventListener('pointerdown',e=>{if(!state.started)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(state.build)handleBuildNode(nodeHit(x,y));else selectRoad(roadHit(x,y));});
  $('buildButton').addEventListener('click',()=>setBuild(!state.build));$('cancelBuild').addEventListener('click',()=>setBuild(false));
  document.querySelectorAll('.road-type').forEach(btn=>btn.addEventListener('click',()=>{state.buildType=btn.dataset.type;document.querySelectorAll('.road-type').forEach(b=>b.classList.toggle('active',b===btn));resetBuildStep();updateBuildTotal();}));
  document.querySelectorAll('.pattern-choice').forEach(btn=>btn.addEventListener('click',()=>{state.buildPattern=btn.dataset.pattern;document.querySelectorAll('.pattern-choice').forEach(b=>b.classList.toggle('active',b===btn));resetBuildStep();updateBuildTotal();}));
  document.querySelectorAll('.grade-choice').forEach(btn=>btn.addEventListener('click',()=>{state.buildLevel=btn.dataset.level;document.querySelectorAll('.grade-choice').forEach(b=>b.classList.toggle('active',b===btn));if(state.buildLevel==='tunnel'&&state.buildAddons.has('green')){state.buildAddons.delete('green');document.querySelector('.addon-choice[data-addon="green"]').classList.remove('active');}resetBuildStep();updateBuildTotal();}));
  document.querySelectorAll('.palette-choice').forEach(btn=>btn.addEventListener('click',()=>{state.buildSkin=btn.dataset.skin;document.querySelectorAll('.palette-choice').forEach(b=>b.classList.toggle('active',b===btn));}));
  document.querySelectorAll('.addon-choice').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.addon;if(key==='green'&&state.buildLevel==='tunnel'){toast('Green buffers need daylight');return;}state.buildAddons.has(key)?state.buildAddons.delete(key):state.buildAddons.add(key);btn.classList.toggle('active',state.buildAddons.has(key));updateBuildTotal();}));
  document.querySelectorAll('[data-policy]').forEach(btn=>btn.addEventListener('click',()=>choosePolicy(btn.dataset.policy)));
  let chosenMode='solo';document.querySelectorAll('.mode-choice').forEach(btn=>btn.addEventListener('click',()=>{chosenMode=btn.dataset.mode;document.querySelectorAll('.mode-choice').forEach(b=>b.classList.toggle('active',b===btn));$('startButton').innerHTML=`START ${MODES[chosenMode].label} <span>→</span>`;}));
  $('startButton').addEventListener('click',()=>{$('modeScreen').hidden=true;resetGame(chosenMode);tone(560,.07);});$('modeButton').addEventListener('click',showModes);$('changeModeButton').addEventListener('click',showModes);$('restartButton').addEventListener('click',()=>resetGame());$('upgradeButton').addEventListener('click',upgrade);$('maintainButton').addEventListener('click',maintainRoad);$('signalButton').addEventListener('click',()=>installFeature('signals'));$('transitButton').addEventListener('click',()=>installFeature('transit'));$('greenButton').addEventListener('click',()=>installFeature('green'));$('lensButton').addEventListener('click',toggleFlowLens);$('pauseButton').addEventListener('click',togglePause);$('soundButton').addEventListener('click',()=>{state.sound=!state.sound;$('soundButton').setAttribute('aria-pressed',String(state.sound));if(state.sound)tone(520,.05);});
  window.addEventListener('resize',()=>{resize();render();drawSpark();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.started&&!state.ended&&!state.paused)togglePause();});
  const query=new URLSearchParams(location.search),directMode=query.get('mode');if(MODES[directMode]){chosenMode=directMode;$('modeScreen').hidden=true;resetGame(directMode);if(query.get('studio')==='1')setBuild(true);if(query.get('lens')==='1'){state.flowLens=true;$('lensButton').setAttribute('aria-pressed','true');}if(query.get('policy')==='1')openPolicyChoice();}
  function loop(now){const dt=Math.min(.05,(now-state.lastFrame)/1000);state.lastFrame=now;update(dt);render();updateHUD();requestAnimationFrame(loop);}resize();updateHUD();requestAnimationFrame(loop);
})();
