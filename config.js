// Configuration and constants
const NODES = [
  {id:0,name:'Switch SUPERNAP Chicago',type:'source',lat:41.8781,lng:-87.6298,heat:8.4,temp:45,desc:'Hyperscale DC, West Loop'},
  {id:1,name:'CTA Blue Line Tunnel',type:'source',lat:41.8825,lng:-87.6341,heat:2.1,temp:38,desc:'Transit exhaust heat'},
  {id:2,name:'Merchandise Mart',type:'sink',lat:41.8886,lng:-87.6354,heat:5.2,temp:65,desc:'2.2M sq ft commercial'},
  {id:3,name:'River North District',type:'sink',lat:41.8923,lng:-87.6277,heat:3.8,temp:65,desc:'Mixed residential/commercial'},
  {id:4,name:'Kinzie Industrial Corr.',type:'source',lat:41.8878,lng:-87.6601,heat:5.7,temp:52,desc:'Industrial waste heat'},
  {id:5,name:'Goose Island Residential',type:'sink',lat:41.9001,lng:-87.6451,heat:2.9,temp:65,desc:'Dense residential'},
  {id:6,name:'Northwestern Chicago',type:'sink',lat:41.8957,lng:-87.6189,heat:4.1,temp:65,desc:'University campus'},
  {id:7,name:'Google Chicago HQ',type:'source',lat:41.8847,lng:-87.6392,heat:1.8,temp:40,desc:'Corporate DC heat'},
  {id:8,name:'Tank A — West Loop',type:'tank',lat:41.882,lng:-87.642,cap:50,desc:'200 MWh molten salt buffer'},
  {id:9,name:'Tank B — River North',type:'tank',lat:41.896,lng:-87.632,cap:30,desc:'120 MWh insulated water tank'},
  {id:10,name:'Tank C — Goose Island',type:'tank',lat:41.894,lng:-87.652,cap:40,desc:'160 MWh stratified tank'},
];

const N = NODES.length;
const NREL_DC = [.88,.87,.87,.86,.86,.87,.89,.92,.96,.98,.99,1,.99,1,.99,.98,.97,.96,.95,.93,.92,.91,.9,.89];
const NREL_OFF = [.28,.25,.23,.22,.23,.27,.38,.55,.72,.85,.91,.93,.92,.93,.92,.9,.85,.75,.62,.5,.42,.38,.35,.31];
const CAMBIUM = [410,398,385,371,362,358,365,388,425,448,461,468,472,470,465,458,450,462,480,492,485,465,445,428];
const EGRID = 386;
const EGRID_KG = .175;
