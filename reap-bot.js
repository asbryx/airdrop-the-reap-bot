#!/usr/bin/env node
/**
 * The Reap — Standalone Farming Bot v5.0
 * Multi-Account | Interactive Console | Anti-Detection
 * Zero dependencies — Node.js only.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Paths ───────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOG_PATH = path.join(__dirname, 'activity.log');

const SUPABASE_PROJECT = 'nqwlrfckisarepakwaat';
const SUPABASE_URL = `https://${SUPABASE_PROJECT}.supabase.co`;
const SUPABASE_ANON_KEY = 'sb_publishable_S05vk7GUrmJiIO5jyfqJLA_-OCUGqsQ';
const SITE_ORIGIN = 'https://play.thereap.xyz';

// ─── ANSI ────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m',bold:'\x1b[1m',dim:'\x1b[2m',
  red:'\x1b[31m',green:'\x1b[32m',yellow:'\x1b[33m',blue:'\x1b[34m',
  magenta:'\x1b[35m',cyan:'\x1b[36m',white:'\x1b[37m',gray:'\x1b[90m',
};
const ICON = {AUTH:'🔑',DRIP:'💧',LOGIN:'🎁',SPECTATE:'👀',ROUND:'🎮',STEALTH:'🥷',BOT:'⚡',BALANCE:'💰',MENU:'📋',ACCOUNT:'👤'};

// ─── Account Colors (cycle for multi) ───────────────────
const ACC_COLORS = [C.cyan,C.green,C.yellow,C.magenta,C.blue,C.red,C.white];

// ─── Defaults ────────────────────────────────────────────
const DEFAULTS = {
  autoJoinRounds:false,joinBalanceThreshold:5000,roundJoinCost:1000,
  roundJoinStrategy:'random',roundJoinChance:0.3,
  roundJoinMinPerDay:2,roundJoinMaxPerDay:8,
  roundBurstSize:3,roundBurstCooldownMs:3600000,
  dripClaimBaseMs:300000,spectateBaseMs:480000,
  tokenRefreshBaseMs:2700000,mainLoopBaseMs:25000,
  jitterPercent:35,minActionDelayMs:800,maxActionDelayMs:4000,
  enableRandomIdle:true,idleChance:0.08,longIdleChance:0.02,
  longIdleMinMs:300000,longIdleMaxMs:900000,rotateUserAgent:true,
  maxSpectateBonusPerDay:10,showDashboardEvery:10,
  accountDelayMs:3000, // delay between accounts in loop
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

// ─── Global State ────────────────────────────────────────
let config = {};
let accounts = [];  // array of account state objects
let menuMode = false;
let paused = false;
let rl = null;
let selectedAccount = 0; // for menu
let globalCycle = 0;
let startedAt = Date.now();

// ─── Account State Template ─────────────────────────────
function newAccountState(name, auth) {
  return {
    name, auth,
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    expiresAt: (auth.expires_at || 0) * 1000,
    balance: null,
    lastDripClaim: 0, lastLoginBonus: 0, lastTokenRefresh: 0,
    lastSpectate: 0, lastRoundJoin: 0, lastBalanceCheck: 0,
    spectateCountToday: 0, spectateResetDate: '',
    roundsJoinedToday: 0, roundsResetDate: '',
    totalDripClaimed: 0, totalSpectateClaimed: 0, totalLoginBonuses: 0,
    totalRoundsJoined: 0, burstCount: 0, lastBurstTime: 0,
    cycleCount: 0, currentUserAgent: null, actionLog: [],
    color: ACC_COLORS[0],
    initialized: false,
  };
}

// ─── Utilities ───────────────────────────────────────────
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function jitter(ms){const p=config.settings.jitterPercent/100;return rand(Math.floor(ms*(1-p)),Math.floor(ms*(1+p)))}
function actionDelay(){return rand(config.settings.minActionDelayMs,config.settings.maxActionDelayMs)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function todayDate(){return new Date().toISOString().slice(0,10)}
function ts(){return new Date().toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false})}
function timeAgo(ms){if(!ms)return'never';const d=Date.now()-ms;if(d<60000)return`${Math.round(d/1000)}s ago`;if(d<3600000)return`${Math.round(d/60000)}m ago`;return`${Math.round(d/3600000)}h ago`}
function formatUptime(ms){const s=Math.floor(ms/1000);const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);if(h>0)return`${h}h ${m}m`;if(m>0)return`${m}m`;return`${s%60}s`}
function progressBar(cur,max,w=15){const p=Math.min(cur/max,1);const f=Math.round(p*w);const c=p>=1?C.green:p>=0.5?C.yellow:C.cyan;return`${c}${'█'.repeat(f)}${C.gray}${'░'.repeat(w-f)}${C.reset} ${Math.round(p*100)}%`}
function formatBal(b){if(b===null||b===undefined)return`${C.dim}?${C.reset}`;const s=b.toLocaleString();if(b>=10000)return`${C.bold}${C.green}${s}${C.reset}`;if(b>=5000)return`${C.yellow}${s}${C.reset}`;return`${C.red}${s}${C.reset}`}

function pickUA(acc){
  if(config.settings.rotateUserAgent&&(!acc.currentUserAgent||Math.random()<0.01))
    acc.currentUserAgent=USER_AGENTS[rand(0,USER_AGENTS.length-1)];
  else if(!acc.currentUserAgent)acc.currentUserAgent=USER_AGENTS[rand(0,USER_AGENTS.length-1)];
  return acc.currentUserAgent;
}

function shouldIdle(){
  if(!config.settings.enableRandomIdle)return 0;
  if(Math.random()<config.settings.longIdleChance)return rand(config.settings.longIdleMinMs,config.settings.longIdleMaxMs);
  if(Math.random()<config.settings.idleChance)return rand(30000,120000);
  return 0;
}

// ─── Logging ─────────────────────────────────────────────
function log(acc,tag,msg,data){
  const icon=ICON[tag]||`[${tag}]`;
  const label=`${acc.color}[${acc.name}]${C.reset}`;
  const d=data!==undefined?` ${C.dim}${typeof data==='object'?JSON.stringify(data):data}${C.reset}`:'';
  if(!menuMode)console.log(`  ${C.gray}${ts()}${C.reset} ${label} ${icon}  ${msg}${d}`);
  acc.actionLog.push({time:Date.now(),tag,msg:msg.replace(/\x1b\[[0-9;]*m/g,'').slice(0,50)});
  if(acc.actionLog.length>15)acc.actionLog.shift();
  try{fs.appendFileSync(LOG_PATH,`[${ts()}] [${acc.name}] [${tag}] ${msg.replace(/\x1b\[[0-9;]*m/g,'')}${data!==undefined?' '+JSON.stringify(data):''}\n`)}catch{}
}
function logOk(acc,tag,msg){log(acc,tag,`${C.green}${C.bold}${msg}${C.reset}`)}
function logErr(acc,tag,msg,e){
  if(!menuMode)console.error(`  ${C.gray}${ts()}${C.reset} ${acc.color}[${acc.name}]${C.reset} ${ICON[tag]||tag} ${C.red}ERROR${C.reset} ${msg} ${C.dim}${e?.message||e||''}${C.reset}`);
  try{fs.appendFileSync(LOG_PATH,`[${ts()}] [${acc.name}] [${tag}] ERROR: ${msg} ${e?.message||e||''}\n`)}catch{}
}

// ─── Config / State ──────────────────────────────────────
function statePath(name){return path.join(__dirname,`state_${name.replace(/[^a-zA-Z0-9]/g,'_')}.json`)}

function loadConfig(){
  if(!fs.existsSync(CONFIG_PATH)){console.error(`\n  ${C.red}Config not found: ${CONFIG_PATH}${C.reset}\n`);process.exit(1)}
  config=JSON.parse(fs.readFileSync(CONFIG_PATH,'utf-8'));
  config.settings={...DEFAULTS,...(config.settings||{})};

  // Support both single and multi-account config
  if(config.accounts&&Array.isArray(config.accounts)){
    // Multi-account format
    accounts=config.accounts.map((a,i)=>{
      const acc=newAccountState(a.name||`Account ${i+1}`,a.auth);
      acc.color=ACC_COLORS[i%ACC_COLORS.length];
      return acc;
    });
  }else if(config.auth){
    // Single account (backward compatible)
    const name=config.auth.user?.user_metadata?.preferred_username||config.auth.user?.user_metadata?.name||'Main';
    const acc=newAccountState(name,config.auth);
    acc.color=ACC_COLORS[0];
    accounts=[acc];
  }else{
    console.error(`\n  ${C.red}No auth config found${C.reset}\n`);process.exit(1);
  }
}

function loadAccountState(acc){
  const p=statePath(acc.name);
  if(fs.existsSync(p)){
    try{const saved=JSON.parse(fs.readFileSync(p,'utf-8'));
      Object.assign(acc,saved);
      // Restore auth tokens from saved state
      if(!acc.accessToken)acc.accessToken=acc.auth.access_token;
      if(!acc.refreshToken)acc.refreshToken=acc.auth.refresh_token;
    }catch{}
  }
  acc.actionLog=[];
}

function saveAccountState(acc){
  const s={...acc};delete s.actionLog;delete s.color;delete s.auth;
  fs.writeFileSync(statePath(acc.name),JSON.stringify(s,null,2));
}

function saveConfig(){fs.writeFileSync(CONFIG_PATH,JSON.stringify(config,null,2))}

// ─── HTTP ────────────────────────────────────────────────
function buildCookies(acc){
  const p=JSON.stringify({access_token:acc.accessToken,refresh_token:acc.refreshToken,token_type:'bearer',expires_in:3600,expires_at:Math.floor(acc.expiresAt/1000),user:acc.auth.user||{}});
  const prefix=`sb-${SUPABASE_PROJECT}-auth-token`;
  const enc=encodeURIComponent(p);const chunks=[];
  for(let i=0;i<enc.length;i+=3180)chunks.push(enc.slice(i,i+3180));
  return chunks.length===1?`${prefix}=${chunks[0]}`:chunks.map((c,i)=>`${prefix}.${i}=${c}`).join('; ');
}

function request(acc,method,url,body){
  return new Promise((res,rej)=>{
    const u=new URL(url);const isSupa=u.hostname.includes('supabase.co');
    const h={'User-Agent':pickUA(acc),'Accept':'application/json, text/plain, */*','Accept-Language':'en-US,en;q=0.9','Origin':SITE_ORIGIN,'Referer':`${SITE_ORIGIN}/reap`,'Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors','Sec-Fetch-Site':isSupa?'cross-site':'same-origin','Sec-Ch-Ua':'"Chromium";v="131"','Sec-Ch-Ua-Mobile':'?0','Sec-Ch-Ua-Platform':'"Windows"'};
    if(isSupa)h['apikey']=SUPABASE_ANON_KEY;else h['Cookie']=buildCookies(acc);
    if(body)h['Content-Type']='application/json';
    const pl=body?JSON.stringify(body):null;if(pl)h['Content-Length']=Buffer.byteLength(pl);
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname+u.search,method,headers:h},r=>{
      const ch=[];r.on('data',c=>ch.push(c));r.on('end',()=>{const raw=Buffer.concat(ch).toString();let d;try{d=JSON.parse(raw)}catch{d=raw}res({status:r.statusCode,headers:r.headers,data:d})});
    });req.on('error',rej);req.setTimeout(30000,()=>{req.destroy();rej(new Error('Timeout'))});if(pl)req.write(pl);req.end();
  });
}

// ─── Actions (per account) ───────────────────────────────
async function refreshToken(acc){
  log(acc,'AUTH','Refreshing token...');
  try{
    const r=await request(acc,'POST',`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{refresh_token:acc.refreshToken});
    if(r.status===200&&r.data?.access_token){acc.accessToken=r.data.access_token;acc.refreshToken=r.data.refresh_token;acc.expiresAt=(r.data.expires_at||(Date.now()/1000+3600))*1000;acc.lastTokenRefresh=Date.now();saveAccountState(acc);logOk(acc,'AUTH',`Refreshed — expires ${new Date(acc.expiresAt).toLocaleString('en-GB',{timeZone:'Asia/Bangkok'})}`);return true}
    logErr(acc,'AUTH',`Failed (${r.status})`,r.data?.error_description);return false;
  }catch(e){logErr(acc,'AUTH','Failed',e);return false}
}

async function checkBalance(acc){
  try{const r=await request(acc,'GET',`${SITE_ORIGIN}/api/leaderboard`);
    if(r.status===200&&r.data){const uid=acc.auth.user?.id;if(Array.isArray(r.data)){const me=r.data.find(e=>e.user_id===uid||e.id===uid);if(me){acc.balance=me.balance||me.score||me.points;saveAccountState(acc)}}else if(r.data.balance!==undefined){acc.balance=r.data.balance;saveAccountState(acc)}}
  }catch{}
}

async function claimDrip(acc){
  log(acc,'DRIP','Claiming...');
  try{const r=await request(acc,'POST',`${SITE_ORIGIN}/api/drip/claim`);
    if(r.status===200){const a=r.data?.claimed||r.data?.amount||600;acc.totalDripClaimed+=a;acc.lastDripClaim=Date.now();if(r.data?.balance!==undefined)acc.balance=r.data.balance;saveAccountState(acc);logOk(acc,'DRIP',`+${a} cents (total: ${acc.totalDripClaimed})`);return true}
    log(acc,'DRIP',`${C.dim}(${r.status}) ${r.data?.error||r.data?.message||''}${C.reset}`);acc.lastDripClaim=Date.now();return false;
  }catch(e){logErr(acc,'DRIP','Failed',e);return false}
}

async function claimLoginBonus(acc){
  log(acc,'LOGIN','Claiming login bonus...');
  try{const r=await request(acc,'POST',`${SITE_ORIGIN}/api/drip/login-bonus`);
    if(r.status===200){acc.totalLoginBonuses++;acc.lastLoginBonus=Date.now();if(r.data?.balance!==undefined)acc.balance=r.data.balance;saveAccountState(acc);logOk(acc,'LOGIN','Claimed!');return true}
    log(acc,'LOGIN',`${C.dim}(${r.status})${C.reset}`);return false;
  }catch(e){logErr(acc,'LOGIN','Failed',e);return false}
}

async function claimSpectateBonus(acc){
  const today=todayDate();if(acc.spectateResetDate!==today){acc.spectateCountToday=0;acc.spectateResetDate=today}
  if(acc.spectateCountToday>=config.settings.maxSpectateBonusPerDay)return false;
  log(acc,'SPECTATE',`Claiming (${acc.spectateCountToday+1}/${config.settings.maxSpectateBonusPerDay})...`);
  try{const r=await request(acc,'POST',`${SITE_ORIGIN}/api/drip/spectate-bonus`,{round_id:'current'});
    if(r.status===200){acc.spectateCountToday++;acc.totalSpectateClaimed+=100;if(r.data?.balance!==undefined)acc.balance=r.data.balance;saveAccountState(acc);logOk(acc,'SPECTATE',`+100 (${acc.spectateCountToday}/${config.settings.maxSpectateBonusPerDay})`);return true}
    log(acc,'SPECTATE',`${C.dim}(${r.status})${C.reset}`);return false;
  }catch(e){logErr(acc,'SPECTATE','Failed',e);return false}
}

async function maybeJoinRound(acc){
  if(!config.settings.autoJoinRounds)return;
  const today=todayDate();if(acc.roundsResetDate!==today){acc.roundsJoinedToday=0;acc.roundsResetDate=today;acc.burstCount=0}
  if(acc.balance!==null&&acc.balance<config.settings.joinBalanceThreshold)return;
  if(acc.roundsJoinedToday>=config.settings.roundJoinMaxPerDay)return;

  let go=false;const strat=config.settings.roundJoinStrategy;
  switch(strat){
    case'random':go=Math.random()<config.settings.roundJoinChance;break;
    case'interval':{const t=rand(config.settings.roundJoinMinPerDay,config.settings.roundJoinMaxPerDay);go=Date.now()-(acc.lastRoundJoin||0)>=jitter((16*3600000)/t);break}
    case'burst':{if(acc.burstCount<config.settings.roundBurstSize)go=true;else if(Date.now()-(acc.lastBurstTime||0)>=config.settings.roundBurstCooldownMs){acc.burstCount=0;acc.lastBurstTime=Date.now();go=true}break}
  }
  if(!go)return;

  const d=rand(2000,8000);log(acc,'ROUND',`Joining in ${Math.round(d/1000)}s... (${strat})`);await sleep(d);
  try{const r=await request(acc,'POST',`${SITE_ORIGIN}/api/round/join`);
    if(r.status===200){acc.roundsJoinedToday++;acc.totalRoundsJoined++;if(strat==='burst')acc.burstCount++;acc.lastRoundJoin=Date.now();if(r.data?.balance!==undefined)acc.balance=r.data.balance;saveAccountState(acc);logOk(acc,'ROUND',`Joined! (today: ${acc.roundsJoinedToday})`)}
    else log(acc,'ROUND',`${C.dim}(${r.status})${C.reset}`);
  }catch(e){logErr(acc,'ROUND','Failed',e)}
}

// ─── Account Cycle ───────────────────────────────────────
async function runAccountCycle(acc){
  acc.cycleCount++;
  const now=Date.now();

  if(now-acc.lastTokenRefresh>=jitter(config.settings.tokenRefreshBaseMs)||acc.expiresAt<now+5*60000){
    await refreshToken(acc);await sleep(actionDelay());
  }
  if(now-acc.lastDripClaim>=jitter(config.settings.dripClaimBaseMs)){
    await claimDrip(acc);await sleep(actionDelay());
  }
  if(now-acc.lastSpectate>=jitter(config.settings.spectateBaseMs)){
    await claimSpectateBonus(acc);acc.lastSpectate=now;await sleep(actionDelay());
  }
  await maybeJoinRound(acc);await sleep(actionDelay());
  if(now-acc.lastBalanceCheck>=jitter(15*60000)){
    await checkBalance(acc);acc.lastBalanceCheck=now;
  }
}

// ─── Dashboard ───────────────────────────────────────────
function printDashboard(){
  const up=Date.now()-startedAt;
  const w=60;const sep=`  ${C.gray}${'─'.repeat(w)}${C.reset}`;
  const totalBal=accounts.reduce((s,a)=>s+(a.balance||0),0);
  const totalDrip=accounts.reduce((s,a)=>s+a.totalDripClaimed,0);
  const totalSpec=accounts.reduce((s,a)=>s+a.totalSpectateClaimed,0);
  const totalRounds=accounts.reduce((s,a)=>s+a.totalRoundsJoined,0);

  console.log('');
  console.log(`  ${C.bold}${C.cyan}╔${'═'.repeat(w)}╗${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}║${C.reset}  ${C.bold}${C.white}${ICON.BOT} THE REAP — MULTI-ACCOUNT DASHBOARD${C.reset}                  ${C.bold}${C.cyan}║${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}╚${'═'.repeat(w)}╝${C.reset}`);
  console.log('');
  console.log(`  ${ICON.BOT}  Uptime: ${C.white}${formatUptime(up)}${C.reset}  |  Cycle: ${C.white}#${globalCycle}${C.reset}  |  ${paused?`${C.red}PAUSED${C.reset}`:`${C.green}RUNNING${C.reset}`}  |  Accounts: ${C.white}${accounts.length}${C.reset}`);
  console.log('');
  console.log(sep);

  // Per-account summary
  console.log(`  ${C.bold}  ACCOUNTS${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}  ${'Name'.padEnd(14)} ${'Balance'.padEnd(10)} ${'Drip'.padEnd(8)} ${'Spect'.padEnd(8)} ${'Rounds'.padEnd(8)} ${'Token'.padEnd(12)}${C.reset}`);
  console.log(`  ${C.gray}  ${'─'.repeat(14)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(8)} ${'─'.repeat(8)} ${'─'.repeat(12)}${C.reset}`);

  accounts.forEach((a,i)=>{
    const ttl=Math.max(0,a.expiresAt-Date.now());
    const tokenStatus=ttl>600000?`${C.green}OK${C.reset}`:ttl>0?`${C.yellow}${Math.round(ttl/60000)}m${C.reset}`:`${C.red}EXPIRED${C.reset}`;
    const name=`${a.color}${a.name.slice(0,12).padEnd(14)}${C.reset}`;
    const bal=(a.balance!==null?a.balance.toLocaleString():'?').padEnd(10);
    const drip=a.totalDripClaimed.toLocaleString().padEnd(8);
    const spec=a.totalSpectateClaimed.toLocaleString().padEnd(8);
    const rounds=`${a.totalRoundsJoined}`.padEnd(8);
    console.log(`  ${i===selectedAccount?C.white+'>'+C.reset:' '} ${name} ${bal} ${drip} ${spec} ${rounds} ${tokenStatus}`);
  });

  console.log('');
  console.log(sep);

  // Totals
  console.log(`  ${C.bold}  TOTALS${C.reset}`);
  console.log(`  ${ICON.BALANCE}  Combined Balance: ${formatBal(totalBal)} cents`);
  console.log(`  ${ICON.DRIP}  Total Drip:       ${C.cyan}${totalDrip.toLocaleString()}${C.reset}`);
  console.log(`  ${ICON.SPECTATE}  Total Spectate:   ${C.magenta}${totalSpec.toLocaleString()}${C.reset}`);
  console.log(`  ${ICON.ROUND}  Total Rounds:     ${C.yellow}${totalRounds}${C.reset}`);
  console.log('');
  console.log(sep);

  // Settings
  console.log(`  ${C.bold}  SETTINGS${C.reset}`);
  console.log(`  ${ICON.ROUND}  Auto-join: ${config.settings.autoJoinRounds?`${C.green}ON${C.reset} (${config.settings.roundJoinStrategy})`:`${C.red}OFF${C.reset}`}  |  Threshold: ${config.settings.joinBalanceThreshold}  |  Max/day: ${config.settings.roundJoinMaxPerDay}`);
  console.log(`  ${ICON.STEALTH}  Jitter: ±${config.settings.jitterPercent}%  |  Idle: ${config.settings.enableRandomIdle?'ON':'OFF'}  |  UA: ${config.settings.rotateUserAgent?'ON':'OFF'}`);
  console.log('');
  console.log(sep);

  // Recent activity (last 8 across all accounts)
  console.log(`  ${C.bold}  RECENT ACTIVITY${C.reset}`);
  const allLogs=accounts.flatMap(a=>a.actionLog.map(l=>({...l,name:a.name,color:a.color})));
  allLogs.sort((a,b)=>a.time-b.time);
  const recent=allLogs.slice(-8);
  if(!recent.length)console.log(`  ${C.dim}  waiting...${C.reset}`);
  else recent.forEach(e=>console.log(`  ${C.dim}  ${timeAgo(e.time).padEnd(8)}${C.reset} ${e.color}${e.name.slice(0,8).padEnd(9)}${C.reset} ${ICON[e.tag]||'•'} ${e.msg}`));

  console.log('');
  console.log(`  ${C.gray}${'─'.repeat(w)}${C.reset}`);
  console.log(`  ${C.dim}${C.white}M${C.dim}=menu  ${C.white}D${C.dim}=dashboard  ${C.white}P${C.dim}=pause  ${C.white}Q${C.dim}=quit${C.reset}`);
  console.log('');
}

// ─── Menu ────────────────────────────────────────────────
function printMenu(){
  console.clear();
  const on=v=>v?`${C.green}ON${C.reset}`:`${C.red}OFF${C.reset}`;
  console.log('');
  console.log(`  ${C.bold}${C.yellow}╔${'═'.repeat(50)}╗${C.reset}`);
  console.log(`  ${C.bold}${C.yellow}║${C.reset}  ${C.bold}${ICON.MENU} CONTROL PANEL${C.reset}                                ${C.bold}${C.yellow}║${C.reset}`);
  console.log(`  ${C.bold}${C.yellow}╚${'═'.repeat(50)}╝${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}${C.white}  ROUND JOINING${C.reset}`);
  console.log(`  ${C.cyan}[1]${C.reset}  Auto-Join:     ${on(config.settings.autoJoinRounds)}`);
  console.log(`  ${C.cyan}[2]${C.reset}  Strategy:      ${C.white}${config.settings.roundJoinStrategy}${C.reset}`);
  console.log(`  ${C.cyan}[3]${C.reset}  Join Chance:   ${C.white}${Math.round(config.settings.roundJoinChance*100)}%${C.reset}`);
  console.log(`  ${C.cyan}[4]${C.reset}  Threshold:     ${C.white}${config.settings.joinBalanceThreshold}${C.reset}`);
  console.log(`  ${C.cyan}[5]${C.reset}  Max/Day:       ${C.white}${config.settings.roundJoinMaxPerDay}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}${C.white}  ANTI-DETECTION${C.reset}`);
  console.log(`  ${C.cyan}[6]${C.reset}  Jitter:        ${C.white}±${config.settings.jitterPercent}%${C.reset}`);
  console.log(`  ${C.cyan}[7]${C.reset}  Random Idle:   ${on(config.settings.enableRandomIdle)}`);
  console.log(`  ${C.cyan}[8]${C.reset}  UA Rotation:   ${on(config.settings.rotateUserAgent)}`);
  console.log('');
  console.log(`  ${C.bold}${C.white}  ACCOUNTS${C.reset}`);
  accounts.forEach((a,i)=>console.log(`  ${C.dim}  ${i+1}.${C.reset} ${a.color}${a.name}${C.reset} — bal: ${formatBal(a.balance)}`));
  console.log('');
  console.log(`  ${C.bold}${C.white}  ACTIONS${C.reset}`);
  console.log(`  ${C.cyan}[P]${C.reset}  ${paused?'Resume':'Pause'}`);
  console.log(`  ${C.cyan}[D]${C.reset}  Dashboard`);
  console.log(`  ${C.cyan}[R]${C.reset}  Refresh ALL tokens now`);
  console.log(`  ${C.cyan}[C]${C.reset}  Claim drip ALL now`);
  console.log(`  ${C.cyan}[B]${C.reset}  Check balance ALL now`);
  console.log(`  ${C.cyan}[A]${C.reset}  Add new account`);
  console.log(`  ${C.cyan}[Q]${C.reset}  Quit`);
  console.log(`  ${C.cyan}[0]${C.reset}  Back`);
  console.log('');
}

async function handleMenu(input){
  const cmd=input.trim().toLowerCase();
  switch(cmd){
    case'1':config.settings.autoJoinRounds=!config.settings.autoJoinRounds;saveConfig();console.log(`\n  ${ICON.ROUND} Auto-Join: ${config.settings.autoJoinRounds?`${C.green}ON${C.reset}`:`${C.red}OFF${C.reset}`}\n`);await sleep(800);printMenu();break;
    case'2':{const s=['random','interval','burst'];config.settings.roundJoinStrategy=s[(s.indexOf(config.settings.roundJoinStrategy)+1)%s.length];saveConfig();console.log(`\n  ${ICON.ROUND} Strategy: ${config.settings.roundJoinStrategy}\n`);await sleep(800);printMenu();break}
    case'3':console.log(`\n  Current: ${Math.round(config.settings.roundJoinChance*100)}%  Enter new (1-100):`);rl.question('  > ',a=>{const n=parseInt(a);if(n>=1&&n<=100){config.settings.roundJoinChance=n/100;saveConfig();console.log(`  ${C.green}Set ${n}%${C.reset}`)}setTimeout(()=>printMenu(),800)});return;
    case'4':console.log(`\n  Current: ${config.settings.joinBalanceThreshold}  Enter new:`);rl.question('  > ',a=>{const n=parseInt(a);if(n>=0){config.settings.joinBalanceThreshold=n;saveConfig();console.log(`  ${C.green}Set ${n}${C.reset}`)}setTimeout(()=>printMenu(),800)});return;
    case'5':console.log(`\n  Current: ${config.settings.roundJoinMaxPerDay}  Enter new:`);rl.question('  > ',a=>{const n=parseInt(a);if(n>=1){config.settings.roundJoinMaxPerDay=n;saveConfig();console.log(`  ${C.green}Set ${n}${C.reset}`)}setTimeout(()=>printMenu(),800)});return;
    case'6':console.log(`\n  Current: ±${config.settings.jitterPercent}%  Enter new (0-80):`);rl.question('  > ',a=>{const n=parseInt(a);if(n>=0&&n<=80){config.settings.jitterPercent=n;saveConfig();console.log(`  ${C.green}Set ±${n}%${C.reset}`)}setTimeout(()=>printMenu(),800)});return;
    case'7':config.settings.enableRandomIdle=!config.settings.enableRandomIdle;saveConfig();console.log(`\n  ${ICON.STEALTH} Idle: ${config.settings.enableRandomIdle?`${C.green}ON${C.reset}`:`${C.red}OFF${C.reset}`}\n`);await sleep(800);printMenu();break;
    case'8':config.settings.rotateUserAgent=!config.settings.rotateUserAgent;saveConfig();console.log(`\n  ${ICON.STEALTH} UA: ${config.settings.rotateUserAgent?`${C.green}ON${C.reset}`:`${C.red}OFF${C.reset}`}\n`);await sleep(800);printMenu();break;
    case'p':paused=!paused;console.log(`\n  ${ICON.BOT} ${paused?`${C.yellow}PAUSED${C.reset}`:`${C.green}RESUMED${C.reset}`}\n`);await sleep(800);printMenu();break;
    case'd':menuMode=false;console.clear();printDashboard();break;
    case'r':menuMode=false;for(const a of accounts){await refreshToken(a);await sleep(1000)}menuMode=true;console.log(`  ${C.green}All refreshed${C.reset}`);await sleep(1000);printMenu();break;
    case'c':menuMode=false;for(const a of accounts){await claimDrip(a);await sleep(1500)}menuMode=true;console.log(`  ${C.green}All claimed${C.reset}`);await sleep(1000);printMenu();break;
    case'b':menuMode=false;for(const a of accounts){await checkBalance(a);await sleep(500)}menuMode=true;accounts.forEach(a=>console.log(`  ${a.color}${a.name}${C.reset}: ${formatBal(a.balance)}`));await sleep(2000);printMenu();break;
    case'a':{
      console.log(`\n  ${ICON.ACCOUNT} Add New Account`);
      console.log(`  ${C.dim}Paste the base64 cookie value (without "base64-" prefix):${C.reset}`);
      rl.question('  > ',ans=>{
        try{
          let b64=ans.trim();if(b64.startsWith('base64-'))b64=b64.slice(7);
          const pad=4-b64.length%4;if(pad!==4)b64+='='.repeat(pad);
          const decoded=JSON.parse(Buffer.from(b64,'base64').toString('utf-8'));
          const name=decoded.user?.user_metadata?.preferred_username||decoded.user?.user_metadata?.name||`Account ${accounts.length+1}`;
          const acc=newAccountState(name,{access_token:decoded.access_token,token_type:'bearer',expires_in:decoded.expires_in||3600,expires_at:decoded.expires_at||0,refresh_token:decoded.refresh_token,user:decoded.user||{}});
          acc.color=ACC_COLORS[accounts.length%ACC_COLORS.length];
          accounts.push(acc);
          // Update config
          if(!config.accounts)config.accounts=accounts.map(a=>({name:a.name,auth:a.auth}));
          else config.accounts.push({name:acc.name,auth:acc.auth});
          saveConfig();saveAccountState(acc);
          console.log(`\n  ${C.green}${C.bold}Added: ${name}${C.reset} (${decoded.user?.id?.slice(0,8)}...)\n`);
        }catch(e){console.log(`\n  ${C.red}Failed to decode: ${e.message}${C.reset}\n`)}
        setTimeout(()=>printMenu(),1500);
      });return;
    }
    case'q':console.log(`\n  ${ICON.BOT} ${C.yellow}Bye!${C.reset}\n`);accounts.forEach(a=>saveAccountState(a));process.exit(0);
    case'0':case'':menuMode=false;console.clear();printDashboard();break;
    default:console.log(`  ${C.red}?${C.reset}`);await sleep(300);printMenu();
  }
}

// ─── Keyboard ────────────────────────────────────────────
function setupKeyboard(){
  rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true});
  if(process.stdin.isTTY){
    process.stdin.setRawMode(true);process.stdin.resume();
    process.stdin.on('data',k=>{
      const c=k.toString().toLowerCase();
      if(menuMode)return;
      if(c==='m'){menuMode=true;printMenu();rl.on('line',l=>{if(menuMode)handleMenu(l)})}
      else if(c==='d')printDashboard();
      else if(c==='p'){paused=!paused;console.log(`\n  ${ICON.BOT} ${paused?`${C.yellow}PAUSED${C.reset}`:`${C.green}RESUMED${C.reset}`}\n`)}
      else if(c==='q'||c==='\x03'){accounts.forEach(a=>saveAccountState(a));process.exit(0)}
    });
  }else{rl.on('line',l=>{const c=l.trim().toLowerCase();if(c==='m'){menuMode=true;printMenu()}else if(c==='d')printDashboard();else if(c==='p'){paused=!paused}else if(c==='q'){accounts.forEach(a=>saveAccountState(a));process.exit(0)}else if(menuMode)handleMenu(l)})}
}

// ─── Banner ──────────────────────────────────────────────
function printBanner(){
  console.clear();
  console.log(`${C.bold}${C.cyan}`);
  console.log(`    ████████╗██╗  ██╗███████╗    ██████╗ ███████╗ █████╗ ██████╗ `);
  console.log(`    ╚══██╔══╝██║  ██║██╔════╝    ██╔══██╗██╔════╝██╔══██╗██╔══██╗`);
  console.log(`       ██║   ███████║█████╗      ██████╔╝█████╗  ███████║██████╔╝`);
  console.log(`       ██║   ██╔══██║██╔══╝      ██╔══██╗██╔══╝  ██╔══██║██╔═══╝ `);
  console.log(`       ██║   ██║  ██║███████╗    ██║  ██║███████╗██║  ██║██║     `);
  console.log(`       ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     `);
  console.log(`${C.reset}`);
  console.log(`${C.dim}            Farming Bot v5.0 — Multi-Account Edition${C.reset}`);
  console.log('');
  console.log(`  ${C.gray}${'─'.repeat(50)}${C.reset}`);
  console.log(`  ${ICON.ACCOUNT}  Accounts:   ${C.white}${accounts.length}${C.reset}`);
  accounts.forEach(a=>console.log(`     ${a.color}• ${a.name}${C.reset}`));
  console.log(`  ${ICON.ROUND}  Auto-join:  ${config.settings.autoJoinRounds?`${C.green}ON${C.reset} (${config.settings.roundJoinStrategy})`:`${C.red}OFF${C.reset}`}`);
  console.log(`  ${ICON.STEALTH}  Stealth:    jitter ±${config.settings.jitterPercent}% | idle ${config.settings.enableRandomIdle?'ON':'OFF'}`);
  console.log(`  ${C.gray}${'─'.repeat(50)}${C.reset}`);
  console.log(`  ${C.dim}Hotkeys: ${C.white}M${C.dim}=menu  ${C.white}D${C.dim}=dashboard  ${C.white}P${C.dim}=pause  ${C.white}Q${C.dim}=quit${C.reset}`);
  console.log('');
}

// ─── Main Loop ───────────────────────────────────────────
async function mainLoop(){
  printBanner();
  setupKeyboard();

  // Initialize all accounts
  for(const acc of accounts){
    if(acc.expiresAt<Date.now()+5*60000){
      if(!await refreshToken(acc)){logErr(acc,'AUTH','Initial refresh failed — skipping');continue}
    }
    await sleep(rand(500,1500));
    await claimLoginBonus(acc);
    await sleep(actionDelay());
    await checkBalance(acc);
    await sleep(rand(2000,5000)); // stagger between accounts
    acc.initialized=true;
  }

  while(true){
    if(paused||menuMode){await sleep(1000);continue}
    globalCycle++;

    // Random idle applies to whole cycle
    const idle=shouldIdle();
    if(idle>0){
      if(!menuMode)console.log(`  ${C.gray}${ts()}${C.reset} ${ICON.STEALTH}  ${C.dim}All accounts idle for ${Math.round(idle/60000)}m${C.reset}`);
      await sleep(idle);continue;
    }

    // Run each account with stagger delay
    for(let i=0;i<accounts.length;i++){
      if(paused||menuMode)break;
      const acc=accounts[i];
      if(!acc.initialized)continue;
      await runAccountCycle(acc);
      // Stagger between accounts
      if(i<accounts.length-1)await sleep(rand(config.settings.accountDelayMs,config.settings.accountDelayMs*2));
    }

    if(globalCycle%config.settings.showDashboardEvery===0&&!menuMode)printDashboard();
    await sleep(jitter(config.settings.mainLoopBaseMs));
  }
}

// ─── Entry ───────────────────────────────────────────────
try{loadConfig();accounts.forEach(a=>loadAccountState(a));mainLoop().catch(e=>{console.error('Fatal:',e);accounts.forEach(a=>saveAccountState(a));process.exit(1)})}
catch(e){console.error('Init failed:',e);process.exit(1)}
process.on('SIGINT',()=>{console.log(`\n  ${ICON.BOT} ${C.yellow}Bye!${C.reset}\n`);accounts.forEach(a=>saveAccountState(a));process.exit(0)});
process.on('SIGTERM',()=>{accounts.forEach(a=>saveAccountState(a));process.exit(0)});
