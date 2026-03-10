// Apex Tier 0 — Game State & Configuration
// Config constants, game state (S), battle state (B), save/load

function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

const CFG={
TEAM_SIZE:4,BASE_AP:50,PULL1:5,PULL10:40,PITY:50,MAX_PLUS:10,PLUS_PER_DUP:1,
AI_DELAY:600,CELL:68,
};

const GRADES=['D','C','B','A','S','T0'];
const GRADE_WEIGHTS={D:25,C:30,B:22,A:14,S:7,T0:2};
const GRADE_MULT={D:0.8,C:1.0,B:1.2,A:1.45,S:1.75,T0:2.2};
const GRADE_LABEL={D:'GRADE D',C:'GRADE C',B:'GRADE B',A:'GRADE A',S:'GRADE S',T0:'TIER 0'};
const GRADE_COLOR={D:'#8e99a4',C:'#00e5ff',B:'#7c4dff',A:'#ff6b35',S:'#ffd700',T0:null};

const WEAPON_TYPES=['Sword','Lance','Axe','LightMag','DarkMag','AnimaMag','Bow','Dagger'];
const WEAPON_TRIANGLE={Sword:'Axe',Axe:'Lance',Lance:'Sword',LightMag:'DarkMag',DarkMag:'AnimaMag',AnimaMag:'LightMag'};

// Weapon effects — randomly assigned to a unit's weapon (~25% chance each)
const WEAPON_EFFECTS=[
{id:'killing_edge',name:'Killing Edge',desc:'Boosts crit chance +7%; reduces Special CD by 1 per hit',weapons:['Sword','Axe','Lance']},
{id:'brave_sword',name:'Brave Sword',desc:'Attacks twice in a row before enemy counterattack',weapons:['Sword','Axe']},
{id:'wo_dao',name:'Wo Dao',desc:'+10 extra damage when Special activates',weapons:['Sword']},
{id:'silver_bow',name:'Silver Bow',desc:'Bow attacks deal bonus damage vs armored units',weapons:['Bow']},
{id:'rauðrblað',name:'Rauðrblað',desc:'Magic hits both DEF and RES (average)',weapons:['LightMag','DarkMag','AnimaMag']},
];
const WEAPON_COLORS={Sword:'#ef4444',Lance:'#3b82f6',Axe:'#22c55e',LightMag:'#fbbf24',DarkMag:'#8b5cf6',AnimaMag:'#06b6d4',Bow:'#f97316',Dagger:'#a1a1aa'};
const MOVE_TYPES=['Infantry','Armored','Cavalry','Flying'];
const MOVE_STATS={Infantry:{mov:2,label:'INF'},Armored:{mov:1,label:'ARM'},Cavalry:{mov:3,label:'CAV'},Flying:{mov:2,label:'FLY'}};

// ═══ FACTION & CLASS SYNERGY SYSTEM ═════════════════════════
const FACTIONS=['Infernal','Cyber','Mystic','Abyssal','Verdant','Celestial','Ironclad','Phantom'];
const CLASSES=['Warden','Striker','Support','Duelist','Ravager','Sentinel','Trickster','Oracle'];
// Synergy bonuses: triggered when N+ units share the same faction or class
const FACTION_SYNERGIES={
Infernal:{2:{desc:'+8 Burn Dmg',apply:(u)=>u._burnBonus=8},4:{desc:'All attacks inflict Burn',apply:(u)=>u._alwaysBurn=true}},
Cyber:   {2:{desc:'+5 SPD',apply:(u)=>u.factionSpdBuff=(u.factionSpdBuff||0)+5},4:{desc:'+10 SPD, immune to freeze',apply:(u)=>{u.factionSpdBuff=(u.factionSpdBuff||0)+10;u._immuneFreeze=true;}}}, // Bug #39: use factionSpdBuff
Mystic:  {2:{desc:'+6 RES',apply:(u)=>{u.res+=6;}},4:{desc:'Specials charge 1 faster',apply:(u)=>u.specialCharges=Math.max(0,(u.specialCharges||0)-1)}},
Abyssal: {2:{desc:'+8 ATK',apply:(u)=>{u.atk+=8;}},4:{desc:'Crits deal 2× instead of 1.5×',apply:(u)=>u._megaCrit=true}},
Verdant: {2:{desc:'Heals 8 HP/turn',apply:(u)=>{u._verdantHeal=8;}},4:{desc:'Forest gives +4 DEF/+4 ATK',apply:(u)=>{u._verdantForestAtk=4;u._verdantForestDef=4;}}},
Celestial:{2:{desc:'+5 DEF/RES',apply:(u)=>{u.def+=5;u.res+=5;}},4:{desc:'Start turn with Shield active',apply:(u)=>u.shielded=true}},
Ironclad:{2:{desc:'+10 DEF',apply:(u)=>{u.def+=10;}},4:{desc:'All attacks reduce incoming damage 20%',apply:(u)=>u._shieldPct=0.2}},
Phantom: {2:{desc:'Ignore terrain penalties',apply:(u)=>{u._ignoreTerrainPenalty=true;}},4:{desc:'Can always counter regardless of range',apply:(u)=>u._distantCounter=true}},
};
const CLASS_SYNERGIES={
Warden:  {2:{desc:'+6 DEF, fortify bonus ×2',apply:(u)=>{u.def+=6;}},3:{desc:'+6 DEF, allies in range get DEF+4',apply:(u)=>{u.def+=6;u._wardenAura=4;}}},
Striker: {2:{desc:'+6 ATK when initiating',apply:(u)=>{u.atk+=6;}},3:{desc:'+6 ATK, always guaranteed follow-up',apply:(u)=>{u.atk+=6;u._guaranteedFollow=true;}}},
Support: {2:{desc:'Assist range +1',apply:(u)=>{u._assistRange=(u._assistRange||1)+1;}},3:{desc:'Assist range +1, assists refresh unit',apply:(u)=>{u._assistRange=(u._assistRange||1)+1;u._assistRefresh=true;}}},
Duelist: {2:{desc:'+5 SPD, +5 ATK when Solo',apply:(u)=>{u.spd+=5;u.atk+=5;}},3:{desc:'+5 SPD/ATK, double attacks deal +8',apply:(u)=>{u.spd+=5;u.atk+=5;u._doubleBonus=8;}}},
Ravager: {2:{desc:'+10% crit rate',apply:(u)=>{u._bonusCrit=(u._bonusCrit||0)+0.1;}},3:{desc:'+10% crit, crits prevent overkill (1 HP min)',apply:(u)=>{u._bonusCrit=(u._bonusCrit||0)+0.1;u._critOverkill=true;}}},
Sentinel:{2:{desc:'+8 DEF when defending',apply:(u)=>{u.def+=8;}},3:{desc:'+8 DEF, 50% chance to negate a hit',apply:(u)=>{u.def+=8;u._negateChance=0.5;}}},
Trickster:{2:{desc:'50% chance to steal buffs after hit',apply:(u)=>{u._stealBuffs=0.5;}},3:{desc:'Steal buffs + gravity effect on all hits',apply:(u)=>{u._stealBuffs=0.5;u._gravityHit=true;}}},
Oracle:  {2:{desc:'+4 to all stats',apply:(u)=>{u.atk+=4;u.def+=4;u.spd+=4;u.res+=4;u.mag+=4;}},3:{desc:'+4 all stats, units cannot be Panicked',apply:(u)=>{u.atk+=4;u.def+=4;u.spd+=4;u.res+=4;u.mag+=4;u._antiPanic=true;}}},
};

function assignFactionClass(u){
// Deterministic from unit id and name hash
const hash=(str)=>{let h=0;for(const c of str)h=(h*31+c.charCodeAt(0))&0xffffffff;return Math.abs(h);};
const h=hash(u.id+u.name);
u.faction=FACTIONS[h%FACTIONS.length];
u.unitClass=CLASSES[(h>>4)%CLASSES.length];
}

// Apply active synergies to a team of live battle units
function applyTeamSynergies(units){
if(!units||!units.length)return;
// Count factions and classes
const fCount={},cCount={};
units.forEach(u=>{
if(u.faction)fCount[u.faction]=(fCount[u.faction]||0)+1;
if(u.unitClass)cCount[u.unitClass]=(cCount[u.unitClass]||0)+1;
});
// Apply faction synergies
units.forEach(u=>{
if(!u.faction)return;
const syn=FACTION_SYNERGIES[u.faction];if(!syn)return;
const n=fCount[u.faction];
if(n>=4&&syn[4])syn[4].apply(u);
else if(n>=2&&syn[2])syn[2].apply(u);
});
// Bug #23: Apply class synergies
units.forEach(u=>{
if(!u.unitClass)return;
const syn=CLASS_SYNERGIES[u.unitClass];if(!syn)return;
const n=cCount[u.unitClass];
if(n>=3&&syn[3]&&syn[3].apply)syn[3].apply(u);
else if(n>=2&&syn[2]&&syn[2].apply)syn[2].apply(u);
});
// Warden aura: apply DEF bonus to all allied units from wardens with _wardenAura
units.forEach(w=>{
if(w._wardenAura)units.forEach(u=>{if(u!==w)u.def+=w._wardenAura;});
});
}

// Get synergy summary string for display
function getSynergySummary(teamIndices){
const units=teamIndices.map(i=>S.roster[i]).filter(Boolean);
if(!units.length)return'';
const fCount={},cCount={};
units.forEach(u=>{
if(u.faction)fCount[u.faction]=(fCount[u.faction]||0)+1;
if(u.unitClass)cCount[u.unitClass]=(cCount[u.unitClass]||0)+1;
});
const parts=[];
Object.entries(fCount).forEach(([f,n])=>{
const syn=FACTION_SYNERGIES[f];if(syn&&n>=2)parts.push(`${f}×${n}${n>=4?'★':''}${syn[n>=4?4:2]?': '+syn[n>=4?4:2].desc:''}`);
});
Object.entries(cCount).forEach(([c,n])=>{
const syn=CLASS_SYNERGIES[c];if(syn&&n>=2)parts.push(`${c}×${n}${n>=3?'★':''}`);
});
return parts.join(' | ');
}

// ROLES map weapon affinities
const ROLES=[
{name:'Swordmaster',weapon:'Sword',move:'Infantry',bias:{atk:15,spd:20,def:-5}},
{name:'Knight',weapon:'Lance',move:'Armored',bias:{def:25,hp:20,spd:-15,atk:5}},
{name:'Berserker',weapon:'Axe',move:'Infantry',bias:{atk:25,hp:10,def:-8,spd:5}},
{name:'Paladin',weapon:'Lance',move:'Cavalry',bias:{def:12,atk:10,hp:8}},
{name:'Sage',weapon:'AnimaMag',move:'Infantry',bias:{mag:28,res:12,spd:5,hp:-8}},
{name:'Bishop',weapon:'LightMag',move:'Infantry',bias:{mag:18,res:20,hp:10}},
{name:'Druid',weapon:'DarkMag',move:'Infantry',bias:{mag:24,res:15,spd:-5}},
{name:'Sniper',weapon:'Bow',move:'Infantry',bias:{atk:22,spd:12,def:-8}},
{name:'Assassin',weapon:'Dagger',move:'Infantry',bias:{spd:28,atk:10,def:-12}},
{name:'Wyvern',weapon:'Axe',move:'Flying',bias:{atk:18,def:15,spd:5}},
{name:'Pegasus',weapon:'Lance',move:'Flying',bias:{spd:22,res:15,def:-5}},
{name:'Cavalier',weapon:'Sword',move:'Cavalry',bias:{atk:12,spd:10,hp:5}},
];

// ═══ MODULAR ABILITY GENERATOR ═════════════════════════════
const AB_TRIGGERS=['TurnStart','OnAttack','OnDefend','OnKill','OnMove'];
const AB_CONDITIONS=['Always','HP<50%','HP>75%','IsArmored','InForest','Speed>Target','IsSolo','EnemyCount>=3','AdjacentAlly'];
const AB_EFFECTS=[
{name:'Brave',desc:'Attacks twice',tag:'brave',val:2},
{name:'Vantage',desc:'Counters first when HP<75%',tag:'vantage',val:0},
{name:'Push',desc:'Pushes target 1 tile after combat',tag:'push',val:1},
{name:'Poison',desc:'Inflicts 5 damage after combat',tag:'poison',val:5},
{name:'Burn',desc:'Inflicts 7 damage after combat',tag:'burn',val:7},
{name:'Freeze',desc:'Target cannot move next turn',tag:'freeze',val:0},
{name:'Panic',desc:'Reverses target buffs',tag:'panic',val:0},
{name:'ATK+6',desc:'Grants ATK+6 during combat',tag:'buff_atk',val:6},
{name:'DEF+6',desc:'Grants DEF+6 during combat',tag:'buff_def',val:6},
{name:'SPD+6',desc:'Grants SPD+6 during combat',tag:'buff_spd',val:6},
{name:'Heal 7',desc:'Restores 7 HP',tag:'heal',val:7},
{name:'Guard',desc:'Reduces damage by 30%',tag:'guard',val:.3},
{name:'Wrath',desc:'+10 damage when HP<50%',tag:'wrath',val:10},
{name:'Desperation',desc:'Follow-up attacks before counter if HP<75%',tag:'desperation',val:0},
];

const ACTIVE_SPECIALS=[
{name:'Dragon Fang',desc:'+50% damage',effect:'dmg_boost',val:.5,cd:4},
{name:'Moonbow',desc:'Pierces 30% of DEF',effect:'def_pierce',val:.3,cd:2},
{name:'Blazing Wind',desc:'AoE 50% damage to adjacent',effect:'aoe',val:.5,cd:4},
{name:'Daylight',desc:'Heals 30% max HP',effect:'heal_self',val:.3,cd:3},
{name:'Bonfire',desc:'+50% own DEF as damage',effect:'def_to_dmg',val:.5,cd:3},
{name:'Iceberg',desc:'+50% own RES as damage',effect:'res_to_dmg',val:.5,cd:3},
{name:'Aether',desc:'+30% dmg, heals 50% dealt',effect:'lifesteal',val:.5,cd:5},
{name:'Glimmer',desc:'+50% damage burst',effect:'dmg_boost',val:.5,cd:2},
{name:'Galeforce',desc:'Extra action after combat',effect:'extra_action',val:0,cd:5},
{name:'Luna',desc:'Ignores 50% DEF',effect:'def_ignore',val:.5,cd:3},
{name:'Reprisal',desc:'+dmg per HP missing',effect:'lowHp_boost',val:.3,cd:2},
{name:'Sacred Cowl',desc:'Halves next damage taken',effect:'shield',val:.5,cd:3},
{name:'Sol',desc:'+50% dmg, heal 50% dealt',effect:'lifesteal',val:.5,cd:3},
{name:'Radiant Aura',desc:'Heals nearby allies 12 HP',effect:'aura_heal',val:12,cd:4},
];

function generatePassive(){
const trigger=AB_TRIGGERS[~~(Math.random()*AB_TRIGGERS.length)];
const cond=AB_CONDITIONS[~~(Math.random()*AB_CONDITIONS.length)];
const eff=AB_EFFECTS[~~(Math.random()*AB_EFFECTS.length)];
const name=`${eff.name} (${trigger})`;
const desc=`${trigger}: ${cond==='Always'?'':cond+' → '}${eff.desc}`;
return{name,desc,trigger,condition:cond,effect:eff};
}

// ═══ C-SKILLS ═══════════════════════════════════════════════
const C_SKILLS=[
{id:'hone_atk',name:'Hone ATK 3',slot:'skillC',desc:'Grants adjacent allies ATK+4 at start of turn',trigger:'TurnStart',condition:'Always',effect:{tag:'buff_atk',val:4}},
{id:'fortify_def',name:'Fortify DEF 3',slot:'skillC',desc:'Grants adjacent allies DEF+4 at start of turn',trigger:'TurnStart',condition:'Always',effect:{tag:'buff_def',val:4}},
{id:'spur_spd',name:'Spur SPD 3',slot:'skillC',desc:'Grants adjacent ally SPD+3 during combat',trigger:'Aura',condition:'Always',effect:{tag:'buff_spd',val:3}},
{id:'drive_atk',name:'Drive ATK 2',slot:'skillC',desc:'Grants nearby allies ATK+2 during combat',trigger:'Aura',condition:'Always',effect:{tag:'buff_atk',val:2}},
{id:'threaten_spd',name:'Threaten SPD 3',slot:'skillC',desc:'Inflicts SPD-4 on foes within 2 spaces at start of turn',trigger:'TurnStart',condition:'Always',effect:{tag:'threat_spd',val:4}},
{id:'hone_spd',name:'Hone SPD 3',slot:'skillC',desc:'Grants adjacent allies SPD+4 at start of turn',trigger:'TurnStart',condition:'Always',effect:{tag:'buff_spd',val:4}},
{id:'fortify_res',name:'Fortify RES 3',slot:'skillC',desc:'Grants adjacent allies RES+4 at start of turn',trigger:'TurnStart',condition:'Always',effect:{tag:'buff_res',val:4}},
{id:'goad_cav',name:'Goad Cavalry',slot:'skillC',desc:'Grants Cavalry allies ATK/SPD+4 during combat',trigger:'Aura',condition:'IsCavalry',effect:{tag:'spectrum',val:4}},
{id:'ward_cav',name:'Ward Cavalry',slot:'skillC',desc:'Grants Cavalry allies DEF/RES+4 during combat',trigger:'Aura',condition:'IsCavalry',effect:{tag:'buff_def',val:4}},
];

// ═══ SACRED SEALS ═══════════════════════════════════════════
const SEAL_POOL=[
{id:'atk1',name:'ATK+1 Seal',desc:'Grants ATK+1',stat:'atk',val:1},
{id:'def1',name:'DEF+1 Seal',desc:'Grants DEF+1',stat:'def',val:1},
{id:'spd1',name:'SPD+1 Seal',desc:'Grants SPD+1',stat:'spd',val:1},
{id:'hp3',name:'HP+3 Seal',desc:'Grants HP+3',stat:'maxHp',val:3},
{id:'res1',name:'RES+1 Seal',desc:'Grants RES+1',stat:'res',val:1},
{id:'atk3',name:'ATK+3 Seal',desc:'Grants ATK+3',stat:'atk',val:3},
{id:'spd3',name:'SPD+3 Seal',desc:'Grants SPD+3',stat:'spd',val:3},
];

// ═══ ORB COLORS ═════════════════════════════════════════════
const ORB_COLORS={
Red:{weapons:['Sword','LightMag','Bow'],css:'#ef4444'},
Blue:{weapons:['Lance','AnimaMag'],css:'#3b82f6'},
Green:{weapons:['Axe','DarkMag'],css:'#22c55e'},
Colorless:{weapons:['Dagger'],css:'#a1a1aa'},
};

function getOrbColor(weapon){
for(const[col,data]of Object.entries(ORB_COLORS))if(data.weapons.includes(weapon))return col;
return'Colorless';
}

// ═══ TERRAIN ════════════════════════════════════════════════
const TERRAINS={
plain:  {c1:'#1a2a1a',c2:'#223322',label:'',movCost:1,def:0,atk:0,name:'Plain',passable:1},
forest: {c1:'#0f1f0f',c2:'#1a301a',label:'F',movCost:2,def:2,atk:0,name:'Forest',passable:1},
water:  {c1:'#081428',c2:'#0f1e3a',label:'~',movCost:99,def:-1,atk:0,name:'Water',passable:0},
fort:   {c1:'#1e1e1e',c2:'#2a2a2a',label:'+',movCost:1,def:3,atk:0,name:'Fort',healPct:.2,passable:1},
lava:   {c1:'#2a0800',c2:'#3a1000',label:'!',movCost:2,def:-2,atk:0,name:'Lava',dmg:5,passable:1},
wall:   {c1:'#2a2220',c2:'#3a3230',label:'#',movCost:99,def:0,atk:0,name:'Wall',hp:20,passable:0},
peak:   {c1:'#221a12',c2:'#342a1a',label:'^',movCost:2,def:1,atk:2,name:'Peak',passable:1},
rough:  {c1:'#1a1a10',c2:'#2a2a18',label:'.',movCost:2,def:0,atk:0,name:'Rough',passable:1},
trench: {c1:'#1a1510',c2:'#2a2018',label:'T',movCost:2,def:4,atk:-1,name:'Trench',passable:1},
castle: {c1:'#1a1a22',c2:'#2a2a30',label:'C',movCost:1,def:5,atk:1,name:'Castle',healPct:.1,passable:1},
void:   {c1:'#000000',c2:'#000000',label:' ',movCost:99,def:0,atk:0,name:'Void',passable:0},
lightning_trap:{c1:'#2a2208',c2:'#3a3210',label:'⚡',movCost:1,def:0,atk:0,name:'Lightning Trap',passable:1},
gravity_trap:  {c1:'#180a28',c2:'#281438',label:'↓',movCost:1,def:0,atk:0,name:'Gravity Trap',passable:1},
};

// ═══ GRAND HERO BATTLE DATA ══════════════════════════════════
// Each entry is a hand-crafted encounter. enemyMult scales all stats.
// terrain: optional override tile type for a spot
const GHB_DATA=[
{
id:'ghb_0',name:'The Immovable Wall',day:0,
desc:'A fortress knight with 50 DEF and two healers behind him. Siege the choke point.',
apReward:35,enemyCount:3,enemyMult:2.2,
boss:{role:'Knight',weapon:'Lance',moveType:'Armored',statBoost:{def:25,maxHp:30},
skillB:{id:'wary_fighter',name:'Wary Fighter 3',slot:'skillB',desc:'Cannot double when HP>50%',trigger:'OnDefend',condition:'HP>75%',effect:{tag:'guard',val:0.1}},
special:{name:'Pavise',desc:'Reduces damage by 30%',cd:3,effect:'shield',val:0.3}},
},
{
id:'ghb_1',name:'The Phantom Archer',day:1,
desc:'A ranged assassin that silences any unit that gets close. Keep your distance.',
apReward:35,enemyCount:3,enemyMult:2.0,
boss:{role:'Ranger',weapon:'Bow',moveType:'Infantry',statBoost:{spd:20,atk:15},
skillA:{id:'life_death',name:'Life and Death 3',slot:'skillA',desc:'ATK/SPD+6, DEF/RES-5',trigger:'OnAttack',condition:'Always',effect:{tag:'buff_atk',val:6}},
skillB:{id:'desperation3',name:'Desperation 3',slot:'skillB',desc:'Follow-up before counter when HP<75%',trigger:'OnAttack',condition:'HP<75%',effect:{tag:'desperation',val:0}}},
},
{
id:'ghb_2',name:'The Dancing Flame',day:2,
desc:'A sword dancer that buffs the entire team before striking. Kill the dancer first.',
apReward:40,enemyCount:4,enemyMult:1.8,
boss:{role:'Dancer',weapon:'Sword',moveType:'Infantry',statBoost:{spd:15,atk:10},
assist:{name:'Dance',desc:'Refresh target ally',range:1,effect:'refresh'},
skillA:{id:'fury4',name:'Fury 4',slot:'skillA',desc:'All stats +4',trigger:'OnAttack',condition:'Always',effect:{tag:'spectrum',val:4}}},
},
{
id:'ghb_3',name:'The Gravity Mage',day:3,
desc:'A mage who renders any unit caught in her range immobile. Stay spread out.',
apReward:40,enemyCount:3,enemyMult:2.0,
boss:{role:'Mage',weapon:'AnimaMag',moveType:'Infantry',statBoost:{mag:20,res:10},
skillC:{id:'gravity3',name:'Gravity 3',slot:'skillC',desc:'After combat: foe cannot move',trigger:'OnAttack',condition:'Always',effect:{tag:'gravity',val:0}},
special:{name:'Glacies',desc:'Deals RES-based bonus damage',cd:4,effect:'res_to_dmg',val:0.8}},
},
{
id:'ghb_4',name:'The Panic Tyrant',day:4,
desc:'Converts all your hard-earned buffs into penalties. Never let him attack first.',
apReward:45,enemyCount:3,enemyMult:2.1,
boss:{role:'Cavalier',weapon:'Axe',moveType:'Cavalry',statBoost:{atk:18,def:10},
skillC:{id:'panic3',name:'Panic 3',slot:'skillC',desc:'After combat: foe buffs become penalties',trigger:'OnAttack',condition:'Always',effect:{tag:'panic',val:0}},
skillA:{id:'triangle_adept3',name:'Triangle Adept 3',slot:'skillA',desc:'Weapon advantage ±40%',trigger:'OnAttack',condition:'Always',effect:{tag:'triangle_adept',val:0}}},
},
{
id:'ghb_5',name:'The Vantage Duelist',day:5,
desc:'When wounded, strikes first before you can even blink. Finish him in one hit.',
apReward:45,enemyCount:3,enemyMult:2.3,
boss:{role:'Hero',weapon:'Sword',moveType:'Infantry',statBoost:{atk:22,spd:18},
skillB:{id:'vantage3',name:'Vantage 3',slot:'skillB',desc:'Counterattack first when HP<75%',trigger:'OnDefend',condition:'HP<75%',effect:{tag:'vantage',val:0}},
skillA:{id:'swift_sparrow3',name:'Swift Sparrow 3',slot:'skillA',desc:'ATK+6/SPD+7 when initiating',trigger:'OnAttack',condition:'Always',effect:{tag:'buff_atk',val:6}}},
},
{
id:'ghb_6',name:'The Brazen Armored Boss',day:6,
desc:'Full-HP defense is impenetrable. Whittle her down, then strike with magic.',
apReward:50,enemyCount:4,enemyMult:2.4,
boss:{role:'Baron',weapon:'Lance',moveType:'Armored',statBoost:{def:30,maxHp:40,res:15},
skillB:{id:'bold_fighter3',name:'Bold Fighter 3',slot:'skillB',desc:'Guaranteed follow-up when armored',trigger:'OnAttack',condition:'IsArmored',effect:{tag:'brave',val:0}},
skillA:{id:'steady_breath',name:'Steady Breath',slot:'skillA',desc:'DEF+4 when foe initiates',trigger:'OnDefend',condition:'Always',effect:{tag:'buff_def',val:4}},
special:{name:'Aether',desc:'Heals half damage dealt',cd:5,effect:'lifesteal',val:0.5}},
},
];

// ═══ ELO / LADDER ═══════════════════════════════════════════
const ELO_RANKS=[
{name:'IRON',min:0,color:'#8e99a4'},
{name:'BRONZE',min:300,color:'#cd7f32'},
{name:'SILVER',min:600,color:'#c0c0c0'},
{name:'GOLD',min:1000,color:'#ffd700'},
{name:'PLATINUM',min:1500,color:'#00e5ff'},
{name:'DIAMOND',min:2000,color:'#7c4dff'},
{name:'TIER 0',min:2500,color:'#ff2d55'},
];

function getEloRank(elo){
let r=ELO_RANKS[0];
for(const rank of ELO_RANKS)if(elo>=rank.min)r=rank;
return r;
}

// ═══ CAMPAIGN ═══════════════════════════════════════════════
const CAMPAIGN=[
{id:1,name:'First Steps',desc:'Learn the basics of combat.',enemyCount:2,enemyMult:.6,
dialog:[{name:'Commander',text:'Welcome, recruit. Today we test your mettle on the training grounds. Select your units and engage the dummies.'},{name:'Commander',text:'Remember: move first, then attack. Use terrain to your advantage.'}]},
{id:2,name:'The Forest Ambush',desc:'Enemy scouts lurk in the woods.',enemyCount:3,enemyMult:.8,terrain:'forest',
dialog:[{name:'Scout',text:'Enemy movement detected in the forest ahead. They have the terrain advantage.'},{name:'Commander',text:'Use the weapon triangle. Swords beat Axes, Axes beat Lances, Lances beat Swords.'}]},
{id:3,name:'Bridge Defense',desc:'Hold the bridge against cavalry.',enemyCount:4,enemyMult:1.0,terrain:'bridge',
dialog:[{name:'Commander',text:'Cavalry incoming! Remember, they cannot cross rough terrain. Use choke points!'},{name:'Scout',text:'Flying units bypass terrain. Watch the skies.'}]},
{id:4,name:'The Dark Tower',desc:'Face the dark mages.',enemyCount:4,enemyMult:1.2,terrain:'tower',
dialog:[{name:'Sage',text:'Dark magic ahead. Light magic has the advantage here.'},{name:'Commander',text:'Zone of Control! Enemies slow your movement when adjacent. Plan your approach.'}]},
{id:5,name:'APEX Challenge',desc:'The ultimate test. Prove you are Tier 0.',enemyCount:5,enemyMult:1.6,terrain:'apex',
dialog:[{name:'???',text:'So you\'ve come. Let us see if you deserve the title... TIER 0.'},{name:'???',text:'No mercy. No retreating. Only the apex survives.'}]},
];

// ═══ GAME STATE ═════════════════════════════════════════════
let S={
ap:CFG.BASE_AP,pullCount:0,
roster:[],team:[],images:[],
teamPresets:[null,null,null,null,null], // 5 named team loadouts
activePreset:0,
elo:0,wins:0,totalBattles:0,
soundOn:false,forecastOn:true,
campaignDone:[],
shards:0,
banners:[],activeBannerId:null,seals:[],
trainingFloor:1,arenaScore:0,arenaWeek:0,
loginStreak:0,lastLoginDate:'',
quests:{daily:[],story:[],lastDailyDate:''},questProgress:{},
ghbCleared:[],
gachaSession:null,
currentBattleMode:'ladder',currentBattleConfig:null,currentDifficulty:'normal',
achievements:[],compendium:[],
apexTokens:0,apexMeter:0,profileTitle:'Rookie',unlockedTitles:['Rookie'],
};

// ═══ BATTLE ENGINE ══════════════════════════════════════════
let B={
mapW:8,mapH:8,grid:[],
pUnits:[],eUnits:[],allUnits:[],
sel:null,phase:'player',mode:'select',
highlights:[],dangerZone:false,dangerCells:[],
canvas:null,ctx:null,unitImgs:{},
hover:{x:-1,y:-1},shaking:false,
isCampaign:false,campaignId:0,
battleId:0,
};
let CS=CFG.CELL;

let uid=0;
let sortMode='grade';
let batchMode=false;
let batchSelected=new Set();
let modalIdx=-1;
let currentBattleMode='ladder';
let currentBattleConfig=null;
let currentDifficulty='normal'; // 'normal' | 'hard' | 'lunatic'
let currentCampaign=null;
let currentBiome=null;

const PLACEHOLDERS=[
{name:'Crimson Blade',hue:0},{name:'Azure Lance',hue:210},{name:'Verdant Axe',hue:120},
{name:'Solar Sage',hue:45},{name:'Shadow Druid',hue:270},{name:'Storm Sniper',hue:190},
{name:'Iron Knight',hue:30},{name:'Wind Pegasus',hue:160},
];

function drawPlaceholder(canvas,hue,sz){
const c=canvas,ctx=c.getContext('2d');
c.width=c.height=sz;
const g=ctx.createRadialGradient(sz*.35,sz*.3,sz*.1,sz/2,sz/2,sz/2);
g.addColorStop(0,`hsl(${hue},70%,60%)`);g.addColorStop(.6,`hsl(${hue},60%,35%)`);g.addColorStop(1,`hsl(${hue},50%,15%)`);
ctx.fillStyle=g;ctx.beginPath();ctx.arc(sz/2,sz/2,sz/2-1,0,Math.PI*2);ctx.fill();
// Inner pattern
ctx.strokeStyle=`hsla(${hue},80%,70%,.3)`;ctx.lineWidth=2;
for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(sz/2,sz/2,sz*.15+i*sz*.1,0,Math.PI*2);ctx.stroke();}
// Center diamond
ctx.fillStyle=`hsl(${hue},80%,75%)`;ctx.save();ctx.translate(sz/2,sz/2);ctx.rotate(Math.PI/4);ctx.fillRect(-sz*.08,-sz*.08,sz*.16,sz*.16);ctx.restore();
}

function makePlaceholderSrc(hue){
const c=document.createElement('canvas');drawPlaceholder(c,hue,128);return c.toDataURL('image/png');
}

function initPlaceholders(){
PLACEHOLDERS.forEach(p=>{
if(!S.images.find(i=>i.name===p.name))
S.images.push({src:makePlaceholderSrc(p.hue),name:p.name,isDefault:true,hue:p.hue});
});
}


const SAVE_KEY='apex_tier0_v2';
const SAVE_KEY_V1='apex_tier0_v1';
const IDB_NAME='ApexTier0DB',IDB_STORE='images';
let _idb=null;

function openIDB(){
if(_idb)return Promise.resolve(_idb);
return new Promise((res,rej)=>{
const r=indexedDB.open(IDB_NAME,1);
r.onupgradeneeded=e=>{if(!e.target.result.objectStoreNames.contains(IDB_STORE))e.target.result.createObjectStore(IDB_STORE,{keyPath:'name'});};
r.onsuccess=e=>{_idb=e.target.result;res(_idb);};r.onerror=()=>rej(r.error);
});
}

async function saveIDB(images){
try{const db=await openIDB();const tx=db.transaction(IDB_STORE,'readwrite');const st=tx.objectStore(IDB_STORE);st.clear();
images.forEach(img=>st.put({name:img.name,src:img.src,isDefault:img.isDefault||false,hue:img.hue||0}));
return new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(e){console.warn('IDB save fail:',e);}
}

async function loadIDB(){
try{const db=await openIDB();return new Promise((res,rej)=>{
const tx=db.transaction(IDB_STORE,'readonly');const r=tx.objectStore(IDB_STORE).getAll();
r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);
});}catch(e){return[];}
}

async function save(silent=false){
try{
// Bug #10: Strip src (image data) from roster to reduce save size
// Bug #11: Filter out temporary Forma units and remap team indices
// During HoF, use savedTeamIds so we don't wipe the original team
const teamIds=(typeof hofState!=='undefined'&&hofState&&hofState.savedTeamIds)?hofState.savedTeamIds:S.team.map(idx=>S.roster[idx]?.id).filter(Boolean);
const clean=S.roster.filter(u=>!u.isForma).map(({img,src,...r})=>({...r,equippedItem:r.equippedItem||null,equippedAbilities:r.equippedAbilities||[null,null]}));
const cleanTeam=teamIds.map(id=>clean.findIndex(u=>u.id===id)).filter(idx=>idx>=0);
const cleanPresets=S.teamPresets?S.teamPresets.map(p=>{if(!p||!p.team)return p;const pIds=p.team.map(idx=>S.roster[idx]?.id).filter(Boolean);return{...p,team:pIds.map(id=>clean.findIndex(u=>u.id===id)).filter(idx=>idx>=0)};}):S.teamPresets;
const sd={ap:S.ap,pullCount:S.pullCount,roster:clean,team:cleanTeam,teamPresets:cleanPresets,activePreset:S.activePreset,elo:S.elo,wins:S.wins,totalBattles:S.totalBattles,
soundOn:S.soundOn,musicTempo:bgm?bgm.tempo:90,forecastOn:S.forecastOn,campaignDone:S.campaignDone,shards:S.shards,uid,
banners:S.banners,activeBannerId:S.activeBannerId,seals:S.seals,
trainingFloor:S.trainingFloor,arenaScore:S.arenaScore,arenaWeek:S.arenaWeek,
loginStreak:S.loginStreak,lastLoginDate:S.lastLoginDate,
quests:S.quests,questProgress:S.questProgress,
ghbCleared:S.ghbCleared||[],
gachaSession:null,
itemInventory:S.itemInventory||[],
unlockedAbilities:S.unlockedAbilities||[],
teamSize:S.teamSize||4,currentBattleMode:currentBattleMode||'ladder',currentBattleConfig:currentBattleConfig,currentDifficulty:currentDifficulty||'normal',
daycareSlots:S.daycareSlots||[null,null],daycareBond:S.daycareBond||0,supportMap:S.supportMap||{},fusionChildren:S.fusionChildren||[],
achievements:S.achievements||[],compendium:S.compendium||[],
apexTokens:S.apexTokens||0,apexMeter:S.apexMeter||0,profileTitle:S.profileTitle||'Rookie',unlockedTitles:S.unlockedTitles||['Rookie']};
localStorage.setItem(SAVE_KEY,JSON.stringify(sd));
await saveIDB(S.images);
if(!silent)toast('Saved!','ok');refreshSettings();
}catch(e){if(!silent)toast('Save failed','err');}
}
const saveGame=save;

async function loadGame(){
try{
let raw=localStorage.getItem(SAVE_KEY);
// v1 migration
if(!raw){const v1=localStorage.getItem(SAVE_KEY_V1);if(v1)raw=v1;}
const idbImgs=await loadIDB();
if(raw){
const d=JSON.parse(raw);
Object.assign(S,{ap:d.ap??CFG.BASE_AP,pullCount:d.pullCount??0,roster:d.roster??[],team:d.team??[],
images:idbImgs.length?idbImgs:S.images,elo:d.elo??0,wins:d.wins??0,totalBattles:d.totalBattles??0,
soundOn:d.soundOn??false,forecastOn:d.forecastOn??true,campaignDone:d.campaignDone??[],shards:d.shards??0,
banners:d.banners??[],activeBannerId:d.activeBannerId??null,seals:d.seals??[],
trainingFloor:d.trainingFloor??1,arenaScore:d.arenaScore??0,arenaWeek:d.arenaWeek??0,
loginStreak:d.loginStreak??0,lastLoginDate:d.lastLoginDate??'',
quests:d.quests??{daily:[],story:[],lastDailyDate:''},
questProgress:d.questProgress??{},
ghbCleared:d.ghbCleared??[],
teamSize:d.teamSize??4,
itemInventory:d.itemInventory??[],
unlockedAbilities:d.unlockedAbilities??[],
teamPresets:d.teamPresets??[null,null,null,null,null],
activePreset:d.activePreset??0});
if(d.uid)uid=d.uid;
if(d.currentBattleMode)currentBattleMode=d.currentBattleMode;
if(d.currentBattleConfig)currentBattleConfig=d.currentBattleConfig;
if(d.currentDifficulty)currentDifficulty=d.currentDifficulty;
// Restore daycare & support systems from save
if(d.daycareSlots)S.daycareSlots=d.daycareSlots;
if(d.daycareBond!==undefined)S.daycareBond=d.daycareBond;
if(d.supportMap)S.supportMap=d.supportMap;
if(d.fusionChildren)S.fusionChildren=d.fusionChildren;
// v3.5 expansion data
if(d.achievements)S.achievements=d.achievements;
if(d.compendium)S.compendium=d.compendium;
if(d.apexTokens)S.apexTokens=d.apexTokens;
if(d.apexMeter)S.apexMeter=d.apexMeter;
if(d.profileTitle)S.profileTitle=d.profileTitle;
if(d.unlockedTitles)S.unlockedTitles=d.unlockedTitles;
}else if(idbImgs.length)S.images=idbImgs;
// Migrate all roster units
// Restore team size from save
CFG.TEAM_SIZE=S.teamSize||4;
S.roster.forEach(u=>{
u.level=u.level??40;
u.exp=u.exp??0;
u.sp=u.sp??0;
u.growthRates=u.growthRates??{hp:50,atk:50,def:40,mag:40,res:40,spd:50};
// Bug #48: Reverse-engineer baseStat for legacy saves by subtracting growth gains
if(!u.baseStat){
const gr=u.growthRates;const lvl=u.level||1;
u.baseStat={
hp:u.maxHp-Math.floor((lvl-1)*gr.hp/100),
atk:u.atk-Math.floor((lvl-1)*gr.atk/100),
def:u.def-Math.floor((lvl-1)*gr.def/100),
mag:u.mag-Math.floor((lvl-1)*gr.mag/100),
res:u.res-Math.floor((lvl-1)*gr.res/100),
spd:u.spd-Math.floor((lvl-1)*gr.spd/100)};
}
u.skillA=u.skillA??(u.passives?.[0]??null);
u.skillB=u.skillB??(u.passives?.[1]??null);
u.skillC=u.skillC??C_SKILLS[~~(Math.random()*C_SKILLS.length)];
u.skillS=u.skillS??null;
u.isAnimated=u.isAnimated??false;
u.storyText=u.storyText??'';
u.boon=u.boon??null;
u.bane=u.bane??null;
u.assist=u.assist??(typeof ASSIST_SKILLS!=='undefined'&&ASSIST_SKILLS.length?ASSIST_SKILLS[~~(Math.random()*ASSIST_SKILLS.length)]:null);
if(!u.faction&&typeof assignFactionClass==='function')assignFactionClass(u);
u.equippedItem=u.equippedItem??null;
u.equippedAbilities=u.equippedAbilities??[null,null];
u.passives=[u.skillA,u.skillB,u.skillC,u.skillS].filter(Boolean);
// Bug #10: Reconstruct src from images by name (try originalImageName first for renamed units)
if(!u.src){
const imgMatch=S.images.find(i=>i.name===(u.originalImageName||u.name));
if(imgMatch)u.src=imgMatch.src;
}
});
if(!S.banners)S.banners=[];
if(!S.activeBannerId)S.activeBannerId=null;
if(!S.seals)S.seals=[];
if(!S.teamPresets||!Array.isArray(S.teamPresets))S.teamPresets=[null,null,null,null,null];
// Sanitize team — remove indices that point beyond roster length
S.team=S.team.filter(idx=>idx>=0&&idx<S.roster.length);
// Sanitize daycare — remove unit IDs that no longer exist
const rosterIds=new Set(S.roster.map(u=>u.id));
if(S.daycareSlots)S.daycareSlots=S.daycareSlots.map(uid=>uid&&rosterIds.has(uid)?uid:null);
// Sanitize presets — remove stale indices
S.teamPresets=(S.teamPresets||[]).map(p=>{
if(!p||!p.team)return null;
return{...p,team:p.team.filter(idx=>idx>=0&&idx<S.roster.length)};
});
if(S.activePreset===undefined)S.activePreset=0;
if(!S.trainingFloor)S.trainingFloor=1;
if(!S.arenaScore)S.arenaScore=0;
if(!S.arenaWeek)S.arenaWeek=0;
if(!S.loginStreak)S.loginStreak=0;
if(!S.lastLoginDate)S.lastLoginDate='';
if(!S.quests)S.quests={daily:[],story:[],lastDailyDate:''};
if(!S.questProgress)S.questProgress={};
refreshSettings();updateEloDisplay();
}catch(e){console.warn('Load fail:',e);}
}


// Exports
export {
    esc, CFG, S, B, CS, uid,
    GRADES, GRADE_WEIGHTS, GRADE_MULT, GRADE_LABEL, GRADE_COLOR,
    WEAPON_TYPES, WEAPON_TRIANGLE, WEAPON_EFFECTS, WEAPON_COLORS,
    MOVE_TYPES, MOVE_STATS,
    FACTIONS, CLASSES, FACTION_SYNERGIES, CLASS_SYNERGIES,
    ROLES, AB_TRIGGERS, AB_CONDITIONS, AB_EFFECTS, ACTIVE_SPECIALS,
    generatePassive, C_SKILLS, SEAL_POOL,
    ORB_COLORS, getOrbColor, TERRAINS,
    GHB_DATA, ELO_RANKS, getEloRank, CAMPAIGN,
    PLACEHOLDERS, drawPlaceholder, makePlaceholderSrc, initPlaceholders,
    SAVE_KEY, save, loadGame, saveGame,
    assignFactionClass, applyTeamSynergies, getSynergySummary,
};
