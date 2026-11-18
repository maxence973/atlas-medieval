/* Atlas médiéval — moteur commun des cartes.
   Chaque page définit window.ATLAS puis charge d3 et ce fichier. */
(function(){
const A=window.ATLAS;
const NAV=[["france-1310.html","France"],["empire-1310.html","Saint-Empire"],["italie-1310.html","Italie"],["pologne-1310.html","Pologne et Lituanie"]];
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const here=location.pathname.split("/").pop()||"index.html";

/* ---------- squelette de la page ---------- */
const hasK=A.regions.some(r=>r.k!==undefined);
document.body.insertAdjacentHTML("afterbegin",`
<div class="wrap">
<nav class="atlas-nav" aria-label="Atlas"><a class="brand" href="index.html">Atlas médiéval</a>${NAV.map(([h,l])=>`<a href="${h}"${h===here?' aria-current="page"':""}>${l}, 1310</a>`).join("")}</nav>
<header class="hd"><div class="eyebrow">${esc(A.eyebrow)}</div><h1>${esc(A.title)}</h1><p class="lede">${A.lede}</p></header>
<main class="grid">
  <section aria-label="Carte">
    <div class="mapbox" id="mapbox">
      <svg id="map" role="img" aria-label="${esc(A.title)}"></svg>
      <div class="zoom"><button type="button" id="zin" aria-label="Zoomer">+</button><button type="button" id="zout" aria-label="Dézoomer">−</button><button type="button" id="zreset" aria-label="Recentrer" style="font-size:14px">⟲</button></div>
      <div class="tip" id="tip" hidden></div>
    </div>
    <div class="maptools">
      <label><input type="checkbox" id="t-labels" checked> Noms</label>
      <label><input type="checkbox" id="t-points" checked> Villes</label>
      <label><input type="checkbox" id="t-rivers" checked> Fleuves</label>
      ${hasK?`<label><input type="checkbox" id="t-king" checked> ${esc(A.borderToggle||"Frontière")}</label>`:""}
      <span style="font-style:italic">Zoomez pour voir les plus petits états.</span>
    </div>
  </section>
  <aside class="side">
    <div class="card panel" id="panel" aria-live="polite"></div>
    <div class="card legend"><h3>Légende</h3><p class="hint">Cliquez sur une catégorie pour l'isoler sur la carte.</p><ul id="legend"></ul><div id="legend-extra"></div></div>
    <div class="card index"><h3>Index</h3><input type="search" id="q" placeholder="Chercher un nom…" aria-label="Chercher un territoire ou une ville"><div class="cnt" id="cnt"></div><ul id="results"></ul></div>
  </aside>
</main>
<section class="chron"><h3>${esc(A.chronTitle)}</h3><p class="intro">${esc(A.chronIntro||"Cliquez sur un événement pour le situer sur la carte.")}</p><ul class="events" id="events"></ul></section>
<footer class="ft">${A.footer||"Carte de synthèse. Les limites sont tracées automatiquement entre les chefs-lieux et restent approximatives ; les seigneuries médiévales étaient faites d'enclaves, de droits partagés et de suzerainetés contestées."}</footer>
</div>`);

/* ---------- projection ---------- */
const F=A.frame,COS=Math.cos(F.midLat*Math.PI/180),K=F.K;
const W=Math.round(F.lonSpan*COS*K),H=Math.round(F.latSpan*K);
const P=([lon,lat])=>[(lon-F.lon0)*COS*K,(F.lat1-lat)*K];
const poly=a=>"M"+a.map(p=>P(p).map(v=>v.toFixed(1)).join(",")).join("L")+"Z";
const LAND=A.land.map(poly).join("");

const R=A.regions,CATS=A.cats;
R.forEach((r,i)=>r.i=i);
const byId={};R.forEach(r=>byId[r.id]=r);
const isOut=r=>!!(CATS[r.c]&&CATS[r.c].out);
const state={sel:null,selPt:null,filter:null,event:null,k:1};

/* ---------- Voronoï ---------- */
const pts=[],owner=[];
R.forEach(r=>r.p.forEach(p=>{pts.push(P(p));owner.push(r.i)}));
const delaunay=d3.Delaunay.from(pts);
const vor=delaunay.voronoi([-10,-10,W+10,H+10]);
R.forEach(r=>r.d="");
pts.forEach((_,i)=>{const c=vor.renderCell(i);if(c)R[owner[i]].d+=c});
const key=p=>p[0].toFixed(2)+","+p[1].toFixed(2);
const SEGS=[];
for(let i=0;i<pts.length;i++){
  const a=vor.cellPolygon(i);if(!a)continue;
  const set=new Set(a.map(key));
  for(const j of delaunay.neighbors(i)){
    if(j<=i||owner[j]===owner[i])continue;
    const b=vor.cellPolygon(j);if(!b)continue;
    for(let q=0;q<b.length-1;q++)if(set.has(key(b[q]))&&set.has(key(b[q+1]))){SEGS.push({a:owner[i],b:owner[j],p:[b[q],b[q+1]]});break}
  }
}
const segD=l=>l.map(s=>"M"+s.p[0][0].toFixed(1)+","+s.p[0][1].toFixed(1)+"L"+s.p[1][0].toFixed(1)+","+s.p[1][1].toFixed(1)).join("");

/* ---------- dessin ---------- */
const svg=d3.select("#map").attr("viewBox",`0 0 ${W} ${H}`);
const defs=svg.append("defs");
defs.append("clipPath").attr("id","landclip").append("path").attr("d",LAND);
const hp=defs.append("pattern").attr("id","hatch").attr("patternUnits","userSpaceOnUse").attr("width",7).attr("height",7).attr("patternTransform","rotate(45)");
hp.append("line").attr("x1",0).attr("y1",0).attr("x2",0).attr("y2",7).style("stroke","var(--muted)").style("stroke-width",.8).style("opacity",.35);
const lp=defs.append("pattern").attr("id","lys").attr("patternUnits","userSpaceOnUse").attr("width",15).attr("height",15);
const LYS="M10 1.5C8.2 4 8.2 7.5 10 10.5 11.8 7.5 11.8 4 10 1.5ZM10 10.5C7.5 8.3 4.2 8.6 3.6 11.6 5.4 10.6 7.2 11.4 8 13.4ZM10 10.5C12.5 8.3 15.8 8.6 16.4 11.6 14.6 10.6 12.8 11.4 12 13.4ZM6.3 12.6H13.7V14H6.3ZM8.8 14 10 18 11.2 14Z";
lp.append("path").attr("d",LYS).attr("transform","translate(1.5,0.5) scale(.6)").attr("fill","rgba(255,236,170,.55)");
lp.append("path").attr("d",LYS).attr("transform","translate(9,8) scale(.6)").attr("fill","rgba(255,236,170,.55)");

const root=svg.append("g");
root.append("rect").attr("x",-W).attr("y",-H).attr("width",W*3).attr("height",H*3).attr("fill","var(--sea)");
(A.seas||[]).forEach(([t,lo,la,fs])=>{const [x,y]=P([lo,la]);root.append("text").attr("class","lbl-sea").attr("x",x).attr("y",y).attr("font-size",fs).text(t)});
root.append("path").attr("class","coast-halo").attr("d",LAND);
const land=root.append("g").attr("clip-path","url(#landclip)");
const regionsG=land.append("g");
const rg=regionsG.selectAll("g.region").data(R).join("g")
  .attr("class",r=>"region"+(isOut(r)?" out":""))
  .attr("tabindex",r=>isOut(r)?null:0).attr("role",r=>isOut(r)?null:"button").attr("aria-label",r=>r.n);
rg.append("path").attr("class","fill").attr("d",r=>r.d)
  .style("fill",r=>CATS[r.c].color).style("stroke",r=>CATS[r.c].color)
  .style("filter",r=>isOut(r)?null:`brightness(${(0.88+((r.i*37)%7)*0.04).toFixed(2)})`);
rg.filter(r=>CATS[r.c].lys).append("path").attr("class","lys").attr("d",r=>r.d);
rg.filter(isOut).append("path").attr("class","hatch").attr("d",r=>r.d);
const riverG=land.append("g");
const line=d3.line().curve(d3.curveCatmullRom.alpha(.5));
(A.rivers||[]).forEach(r=>riverG.append("path").attr("class","river").attr("d",line(r.map(P))));
land.append("path").attr("class","b-region").attr("d",segD(SEGS));
const kingPath=land.append("path").attr("class","b-king").attr("d",hasK?segD(SEGS.filter(s=>!!R[s.a].k!==!!R[s.b].k)):"");
const selPath=land.append("path").attr("class","b-sel");
(A.waters||[]).forEach(w=>root.append("path").attr("class","lake").attr("d",poly(w)));
root.append("path").attr("class","coast").attr("d",LAND);

const labelsG=root.append("g");
R.forEach(r=>{
  const pos=r.lp||[d3.mean(r.p,p=>p[0]),d3.mean(r.p,p=>p[1])];
  const n=r.p.length;
  r.size=isOut(r)?13:n>=8?13:n>=4?10.5:n>=2?9:8;
  r.min=isOut(r)||n>=4?1:n>=2?1.9:2.8;
  const [x,y]=P(pos);
  r.lbl=labelsG.append("text").attr("class","lbl"+(isOut(r)?" out":"")).attr("x",x).attr("y",y).attr("dy","0.35em").text(r.s);
});
const PT=A.pointTypes||{ville:{label:"Ville",color:"var(--ink)"}};
const POINTS=A.points||[];
const ptsG=root.append("g");
POINTS.forEach((c,i)=>{
  const [x,y]=P([c[1],c[2]]),T=PT[c[3]]||PT.ville;
  const g=ptsG.append("g").attr("class","pt"+(c[5]?" major":"")).attr("tabindex",0).attr("role","button").attr("aria-label",c[0]);
  if(T.square)g.append("rect").attr("x",-2.4).attr("y",-2.4).attr("width",4.8).attr("height",4.8).style("fill",T.color);
  else g.append("circle").attr("r",c[5]?3.3:2.5).style("fill",T.color);
  c.g=g;c.x=x;c.y=y;c.t=g.append("text").attr("x",5).attr("y",-3).text(c[0]);
  g.on("click",()=>selectPoint(i)).on("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectPoint(i)}})
   .on("pointermove",e=>showTip(e,c[0],T.label)).on("pointerleave",hideTip);
});
const eventG=root.append("g");
const km=200,scalePx=km/111.2*K;
const sc=svg.append("g").attr("class","scale").attr("transform",`translate(${W-scalePx-24},${H-26})`);
sc.append("rect").attr("width",scalePx/2).attr("height",5).attr("fill","var(--ink)");
sc.append("rect").attr("x",scalePx/2).attr("width",scalePx/2).attr("height",5).attr("fill","var(--surface)");
sc.append("text").attr("y",-5).text("0");
sc.append("text").attr("x",scalePx).attr("y",-5).attr("text-anchor","end").text(km+" km");

/* ---------- zoom ---------- */
const zoom=d3.zoom().scaleExtent([1,14]).translateExtent([[0,0],[W,H]]).on("zoom",e=>{root.attr("transform",e.transform);state.k=e.transform.k;sizeLabels()});
svg.call(zoom).on("dblclick.zoom",null);
d3.select("#zin").on("click",()=>svg.transition().duration(300).call(zoom.scaleBy,1.7));
d3.select("#zout").on("click",()=>svg.transition().duration(300).call(zoom.scaleBy,1/1.7));
d3.select("#zreset").on("click",()=>svg.transition().duration(400).call(zoom.transform,d3.zoomIdentity));
function sizeLabels(){
  const k=state.k,L=document.getElementById("t-labels").checked,Pt=document.getElementById("t-points").checked;
  R.forEach(r=>r.lbl.attr("font-size",r.size/Math.pow(k,.82)).attr("stroke-width",2.8/k).style("display",L&&k>=r.min?null:"none"));
  POINTS.forEach(c=>{
    c.g.attr("transform",`translate(${c.x},${c.y}) scale(${1/Math.pow(k,.85)})`).style("display",Pt?null:"none");
    c.t.style("display",L&&(c[5]||k>=2.2)?null:"none");
  });
  eventG.selectAll("g").attr("transform",function(){return this.dataset.t+` scale(${1/k})`});
}
function zoomTo(x0,y0,x1,y1,maxK){
  const k=Math.min(maxK||8,0.6/Math.max((x1-x0)/W,(y1-y0)/H,0.02));
  svg.transition().duration(650).call(zoom.transform,d3.zoomIdentity.translate(W/2-(x0+x1)/2*Math.max(1,k),H/2-(y0+y1)/2*Math.max(1,k)).scale(Math.max(1,k)));
}

/* ---------- infobulle ---------- */
const tip=document.getElementById("tip"),box=document.getElementById("mapbox");
function showTip(e,a,b){
  const bb=box.getBoundingClientRect();
  tip.innerHTML=`<b>${esc(a)}</b>${b?`<span>${esc(b)}</span>`:""}`;tip.hidden=false;
  let x=e.clientX-bb.left+14,y=e.clientY-bb.top+14;
  if(x+tip.offsetWidth>bb.width-6)x=e.clientX-bb.left-tip.offsetWidth-14;
  if(y+tip.offsetHeight>bb.height-6)y=e.clientY-bb.top-tip.offsetHeight-14;
  tip.style.left=x+"px";tip.style.top=y+"px";
}
function hideTip(){tip.hidden=true}
rg.on("pointermove",(e,r)=>showTip(e,r.n,r.h||CATS[r.c].label)).on("pointerleave",hideTip)
  .on("click",(e,r)=>{if(!isOut(r))select(r.id)})
  .on("keydown",(e,r)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select(r.id)}})
  .on("focus",function(){d3.select(this).classed("hover",true)}).on("blur",function(){d3.select(this).classed("hover",false)});

function clearMarks(){
  eventG.selectAll("*").remove();ptsG.selectAll(".pt").classed("sel",false);
  document.querySelectorAll("#events button").forEach(b=>b.setAttribute("aria-pressed","false"));
}
function select(id,zoomIn){
  clearMarks();state.sel=id;state.selPt=null;state.event=null;
  selPath.attr("d",id?segD(SEGS.filter(s=>R[s.a].id===id||R[s.b].id===id)):"");
  if(id&&zoomIn){const xy=byId[id].p.map(P);zoomTo(d3.min(xy,d=>d[0]),d3.min(xy,d=>d[1]),d3.max(xy,d=>d[0]),d3.max(xy,d=>d[1]),6)}
  renderPanel();
}
function selectPoint(i,zoomIn){
  clearMarks();state.sel=null;state.event=null;state.selPt=i;selPath.attr("d","");
  POINTS[i].g.classed("sel",true);
  if(zoomIn){const c=POINTS[i];zoomTo(c.x-20,c.y-20,c.x+20,c.y+20,6)}
  renderPanel();
}

/* ---------- panneau ---------- */
const panel=document.getElementById("panel");
function back(label){return `<p><button class="linkbtn" type="button" id="back">${label}</button></p>`}
function renderPanel(){
  if(state.event!==null){
    const ev=A.events[state.event];
    panel.innerHTML=`<p class="panel-eyebrow">${esc(ev.d)}</p><h2>${esc(ev.t)}</h2><p>${esc(ev.x)}</p>${back("Revenir à la vue d'ensemble")}`;
  }else if(state.selPt!==null){
    const c=POINTS[state.selPt],T=PT[c[3]]||PT.ville;
    panel.innerHTML=`<p class="panel-eyebrow">${esc(T.label)}</p><h2>${esc(c[0])}</h2>${c[4]?`<p>${esc(c[4])}</p>`:""}${back("Fermer la notice")}`;
  }else if(!state.sel){
    const n=R.filter(r=>!isOut(r)).length;
    panel.innerHTML=A.overview.replace("{N}",n).replace("{V}",POINTS.length);
    return;
  }else{
    const r=byId[state.sel],C=CATS[r.c];
    panel.innerHTML=`<p class="panel-eyebrow">${esc(C.label)}</p><h2>${esc(r.n)}</h2>
      <dl><dt>Statut</dt><dd><span class="chip"><span class="sw" style="background:${C.color}"></span>${esc(C.sub||C.label)}</span></dd>
      ${r.h?`<dt>Tenu par</dt><dd>${esc(r.h)}</dd>`:""}
      ${r.cap?`<dt>Chef-lieu</dt><dd>${esc(r.cap)}</dd>`:""}
      ${hasK&&A.kLabels?`<dt>${esc(A.kLabels[0])}</dt><dd>${esc(r.k?A.kLabels[1]:A.kLabels[2])}</dd>`:""}</dl>
      ${r.t?`<p>${esc(r.t)}</p>`:""}${back("Fermer la notice")}`;
  }
  document.getElementById("back").onclick=()=>select(null);
}

/* ---------- légende ---------- */
const legend=document.getElementById("legend");
function paint(){rg.classed("on",r=>r.c===state.filter);regionsG.classed("dim",!!state.filter);renderLegend()}
function renderLegend(){
  const counts={};R.forEach(r=>counts[r.c]=(counts[r.c]||0)+1);
  legend.innerHTML=A.catOrder.map(c=>{const C=CATS[c];return `<li><button type="button" data-cat="${c}" aria-pressed="${state.filter===c}"${C.out?" disabled":""}>
    <span class="sw" style="background:${C.color}"></span><span>${esc(C.label)}${C.sub?`<span class="sub">${esc(C.sub)}</span>`:""}</span><span class="n">${C.out?"":counts[c]||0}</span></button></li>`}).join("");
  legend.querySelectorAll("button:not([disabled])").forEach(b=>b.onclick=()=>{state.filter=state.filter===b.dataset.cat?null:b.dataset.cat;paint()});
}
document.getElementById("legend-extra").innerHTML=Object.entries(PT).map(([k,T])=>`<div class="static"><span class="sw${T.square?"":" round"}" style="background:${T.color}"></span><span>${esc(T.label)}</span><span class="n">${POINTS.filter(p=>p[3]===k).length}</span></div>`).join("")
  +(hasK?`<div class="kline"><svg width="38" height="8" aria-hidden="true"><line x1="1" y1="4" x2="37" y2="4" style="stroke:var(--border-k);stroke-width:2.6"/></svg>${esc(A.borderLabel)}</div>`:"");

/* ---------- index ---------- */
const norm=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const ENTRIES=[...R.filter(r=>!isOut(r)).map(r=>({name:r.n,color:CATS[r.c].color,go:()=>select(r.id,true)})),
  ...POINTS.map((p,i)=>({name:p[0]+" ("+((PT[p[3]]||PT.ville).label.toLowerCase())+")",color:(PT[p[3]]||PT.ville).color,round:!(PT[p[3]]||{}).square,go:()=>selectPoint(i,true)}))]
  .sort((a,b)=>a.name.localeCompare(b.name,"fr"));
const resUl=document.getElementById("results"),cnt=document.getElementById("cnt");
function renderIndex(){
  const q=norm(document.getElementById("q").value.trim());
  const list=q?ENTRIES.filter(e=>norm(e.name).includes(q)):ENTRIES;
  cnt.textContent=`${list.length} sur ${ENTRIES.length}`;
  resUl.innerHTML=list.map(e=>`<li><button type="button" data-i="${ENTRIES.indexOf(e)}"><span class="sw${e.round?" round":""}" style="background:${e.color}"></span>${esc(e.name)}</button></li>`).join("");
  resUl.querySelectorAll("button").forEach(b=>b.onclick=()=>{ENTRIES[+b.dataset.i].go();box.scrollIntoView({behavior:"smooth",block:"nearest"})});
}
document.getElementById("q").addEventListener("input",renderIndex);

/* ---------- chronique ---------- */
const evUl=document.getElementById("events");
evUl.innerHTML=A.events.map((e,i)=>`<li><button type="button" data-i="${i}" aria-pressed="false"><span class="d">${esc(e.d)}</span><span class="t">${esc(e.t)}</span><span class="x">${esc(e.x)}</span></button></li>`).join("");
evUl.querySelectorAll("button").forEach(b=>b.onclick=()=>showEvent(+b.dataset.i));
function showEvent(i){
  clearMarks();state.sel=null;state.selPt=null;selPath.attr("d","");state.event=i;
  evUl.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.i===i)));
  const [x,y]=P(A.events[i].at);
  const g=eventG.append("g");g.node().dataset.t=`translate(${x},${y})`;
  g.append("circle").attr("class","pulse").attr("r",16);
  g.append("circle").attr("r",5).style("fill","var(--gold)").style("stroke","var(--coast)");
  sizeLabels();zoomTo(x-60,y-60,x+60,y+60,3);renderPanel();
  box.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"});
}

document.getElementById("t-labels").onchange=sizeLabels;
document.getElementById("t-points").onchange=sizeLabels;
document.getElementById("t-rivers").onchange=e=>riverG.style("display",e.target.checked?null:"none");
if(hasK)document.getElementById("t-king").onchange=e=>kingPath.style("display",e.target.checked?null:"none");
paint();renderIndex();renderPanel();sizeLabels();
})();
