// Apex Tier 0 — Combat Engine
// Damage calculation, combat resolution, battle state management

// Note: S, B, CFG and UI functions (drawMap, updateBUI, etc.)
// are accessed via window globals


function rollGrade(guaranteeHigh=false){
if(S.pullCount>=CFG.PITY){S.pullCount=0;return Math.random()<.15?'T0':Math.random()<.4?'S':'A';}
if(guaranteeHigh){S.pullCount=0;return Math.random()<.2?'T0':Math.random()<.5?'S':'A';} // 10-pull guarantee resets pity
const r=Math.random()*100;let acc=0;
for(const g of GRADES){acc+=GRADE_WEIGHTS[g];if(r<acc)return g;}
return'D';
}


    function createUnit(src, name, overrideGrade) {

        // INJECT VARIETY: Pick skills from the massive expansion ABILITY_DB (200 skills)
        // Give A/S/T0 units a 40% chance to start with a Rare ability
        if(typeof ABILITY_DB !== 'undefined' && ['A','S','T0'].includes(u.grade) && Math.random() < 0.4) {
            const rareAbilities = ABILITY_DB.filter(a => ['A','S','T0'].includes(a.rarity));
            if(rareAbilities.length) {
                const randAb = rareAbilities[~~(Math.random() * rareAbilities.length)];
                const slot = ['skillA','skillB','skillC'][~~(Math.random()*3)];
                u[slot] = {
                    name: randAb.name,
                    desc: randAb.desc,
                    trigger: randAb.trigger,
                    condition: randAb.condition,
                    effect: randAb.effect
                };
            }
        }

        // GENERATE PROCEDURAL WEAPON (The "Prf" System)
        // 30% chance for regular units, 100% for T0 units
        if(u.grade === 'T0' || Math.random() < 0.3) {
            const prefix = W_PREFIXES[~~(Math.random() * W_PREFIXES.length)];
            const suffix = W_SUFFIXES[~~(Math.random() * W_SUFFIXES.length)];
            const weaponBase = u.weapon.replace('Mag', ' Tome');
            const weaponName = `${prefix} ${weaponBase} ${suffix}`;

            // Apply random stat bump from the weapon
            const statBump = ['atk','spd','def','res'][~~(Math.random()*4)];
            u.baseStat[statBump] += 3;
            u[statBump] += 3;

            // Set the weapon name
            u.weaponEffectName = weaponName;

            // Attach a random ability from ABILITY_DB as the weapon's inherent effect
            if(typeof ABILITY_DB !== 'undefined' && ABILITY_DB.length) {
                const effectSource = ABILITY_DB[~~(Math.random() * ABILITY_DB.length)];
                u.weaponEffect = effectSource.id || 'prf_weapon';
                u.passives.push({
                    name: '\u2694 ' + weaponName,
                    desc: `Signature weapon. ${effectSource.desc}`,
                    trigger: effectSource.trigger,
                    condition: effectSource.condition,
                    effect: effectSource.effect
                });
            }
        }

        // Rebuild passives list to include weapon passive and updated skill slots
        u.passives = [u.skillA, u.skillB, u.skillC, u.skillS, ...u.passives.filter(p => p && p.name && p.name.startsWith('\u2694'))].filter(Boolean);

        return u;
    };


function applyLevel(unit){
const bs=unit.baseStat||{hp:unit.maxHp,atk:unit.atk,def:unit.def,mag:unit.mag,res:unit.res,spd:unit.spd};
const bn=unit.bonusStats||{hp:0,atk:0,def:0,mag:0,res:0,spd:0}; // Bug #8: shard bonuses
unit.maxHp=bs.hp+Math.floor((unit.level-1)*unit.growthRates.hp/100)+(bn.hp||0);
unit.atk=bs.atk+Math.floor((unit.level-1)*unit.growthRates.atk/100)+(bn.atk||0);
unit.def=bs.def+Math.floor((unit.level-1)*unit.growthRates.def/100)+(bn.def||0);
unit.mag=bs.mag+Math.floor((unit.level-1)*unit.growthRates.mag/100)+(bn.mag||0);
unit.res=bs.res+Math.floor((unit.level-1)*unit.growthRates.res/100)+(bn.res||0);
unit.spd=bs.spd+Math.floor((unit.level-1)*unit.growthRates.spd/100)+(bn.spd||0);
}


function gainExp(u,amt){
if(!u||u.level>=40)return;
u.exp=(u.exp||0)+amt;
// Bug #25: while loop to allow multi-level gains from large EXP
let threshold=Math.floor(100*Math.pow(u.level,1.5));
while(u.exp>=threshold&&u.level<40){
u.exp-=threshold;u.level++;
applyLevel(u);
u.sp=(u.sp||0)+50;
bLog(`${u.name} reached Level ${u.level}!`,'spec');
sfx('victory');
trackQuest('levelups');
threshold=Math.floor(100*Math.pow(u.level,1.5));
}
}


function awardSP(u,amt){if(u)u.sp=(u.sp||0)+amt;}


    function prepUnit(unit, side) {
        const hadTempestHp = unit.tempestHp !== undefined;
        if(u && side === 'player') {
            const bonusMult = 1 + getCompendiumBonus();
            if(bonusMult > 1) {
                ['atk','def','mag','res','spd'].forEach(s => { u[s] = Math.floor(u[s] * bonusMult); });
                u.maxHp = Math.floor(u.maxHp * bonusMult);
                // Only scale current HP if NOT carrying over from Tempest (already multiplied)
                if(!hadTempestHp) {
                    u.hp = u.maxHp;
                }
                // Clamp carryover HP to new maxHp
                u.hp = Math.min(u.hp, u.maxHp);
            }
        }
        return u;
    };


    function createEnemyTeam(count, mult) {
        // On Lunatic+, melee enemies get a chance at Distant Counter
        if(['lunatic','max','apex'].includes(currentDifficulty)) {
            const dcChance = {lunatic: 0.25, max: 0.5, apex: 0.8}[currentDifficulty] || 0;
            team.forEach(u => {
                const range = getWeaponRange(u.weapon);
                // Only give DC to melee units (range 1)
                if(range === 1 && Math.random() < dcChance) {
                    u._distantCounter = true;
                }
            });
        }
        return team;
    };


    function calcDmg(atker, target, isSpecial){
        let atkBonus=0, defBonus=0;
        atker.passives?.forEach(p=>{
            if(p.trigger==='OnAttack'&&p.effect?.tag==='initiate_atk'&&evalCondition(p.condition,atker,target)) atkBonus+=p.effect.val;
        });
        target.passives?.forEach(p=>{
            if(p.trigger==='OnDefend'&&p.effect?.tag==='defend_def'&&evalCondition(p.condition,target,atker)) defBonus+=p.effect.val;
        });
        const sa=atker.atk, sd=target.def;
        atker.atk+=atkBonus; target.def+=defBonus;
        atker.atk=sa; target.def=sd;
        return r;
    };


function performCombat(atker,target,isSpecial=false,isInitiating=true){
            if(atker && !atker.special) atker.special = {name:'None',desc:'',effect:'none',val:0,cd:99};
            if(target && !target.special) target.special = {name:'None',desc:'',effect:'none',val:0,cd:99};
if(!atker||!target)return;
// Reset per-combat item flags
if(atker){atker._firstHitTaken=false;atker._miracleUsed=false;}
if(target&&target!==atker){target._firstHitTaken=false;target._miracleUsed=false;}
const isSelf=atker===target;

if(isSpecial&&isSelf){
const sp=atker.special;
if(sp.effect==='heal_self'){
const h=Math.round(atker.maxHp*sp.val);atker.hp=Math.min(atker.maxHp,atker.hp+h);
bLog(`${atker.name}: ${sp.name} +${h} HP`,'spec');floatTxt(atker.x,atker.y,'+'+h,'#22c55e');sfx('heal');
}
if(sp.effect==='shield'){atker.shielded=true;bLog(`${atker.name}: Shield active`,'spec');}
if(sp.effect==='aura_heal'){
B.allUnits.filter(u=>u.side===atker.side&&u.hp>0&&u!==atker&&Math.abs(u.x-atker.x)+Math.abs(u.y-atker.y)<=2).forEach(a=>{
a.hp=Math.min(a.maxHp,a.hp+sp.val);floatTxt(a.x,a.y,'+'+sp.val,'#22c55e');
});bLog(`${atker.name}: ${sp.name} heals allies`,'spec');sfx('heal');
}
atker.specialCharges=atker.special.cd;
markActed(atker);drawMap();updateBUI();updateEList();checkTurnEnd();return;
}

if(!isSelf){
// Check Vantage
let vantage=false;
target.passives?.forEach(p=>{
if(p.effect.tag==='vantage'&&target.hp<target.maxHp*.75)vantage=true;
});

const executeHit=(a,d,spec,isDoubleHit=false)=>{
bumpAnim(a,d);
fireProjectile(a,d);
// Sentinel synergy: 50% chance to negate the hit entirely
if(d._negateChance&&Math.random()<d._negateChance){
floatTxt(d.x,d.y,'NEGATED!','#60a5fa');bLog(`${d.name} negated the hit!`,'spec');return{dmg:0,crit:false};
}
const result=calcDmg(a,d,spec);
// Duelist synergy: double attacks deal bonus damage
if(isDoubleHit&&a._doubleBonus)result.dmg+=a._doubleBonus;
// Ravager synergy: crits prevent overkill (target kept at 1 HP)
if(result.crit&&a._critOverkill&&d.hp>1)result.dmg=Math.min(result.dmg,d.hp-1);
d.hp=Math.max(0,d.hp-result.dmg);
// Miracle item: survive one lethal hit per combat
if(d.hp<=0&&d._itemMiracle&&!d._miracleUsed){d.hp=1;d._miracleUsed=true;if(typeof floatTxt==='function')floatTxt(d.x,d.y,'MIRACLE!','#00e5ff');bLog(`${d.name} survived by a miracle!`,'spec');}

if(result.crit){
screenShake();sfx('crit');
hitStop(d.x,d.y); // Impact frame: white flash + freeze
bLog(`CRIT! ${a.name} -> ${d.name}: ${result.dmg}`,'crit');
}else{
sfx('attack');
bLog(`${a.name} -> ${d.name}: ${result.dmg}${spec?' ('+a.special.name+')':''}${d.hp<=0?' DEFEATED':''}`,'dmg');
}
floatTxt(d.x,d.y,'-'+result.dmg,result.crit?'#ff2d55':'#ef4444',result.crit);
// Killing Edge: reduce special CD by 1
if(a.weaponEffect==='killing_edge'&&a.specialCharges>0){a.specialCharges=Math.max(0,a.specialCharges-1);}
// Gravity passive: target can't move next turn
a.passives?.forEach(p=>{if(p.effect.tag==='gravity'&&evalCondition(p.condition,a,d))d.gravityApplied=true;});
// Trickster synergy: gravity on all hits
if(a._gravityHit)d.gravityApplied=true;
// Panic passive: target's buffs become debuffs
a.passives?.forEach(p=>{if(p.effect.tag==='panic'&&evalCondition(p.condition,a,d)&&!d._antiPanic){d._panicked=true;bLog(`${d.name} Panicked!`,'spec');}});
// Trickster synergy: steal buffs after hit
if(a._stealBuffs&&Math.random()<a._stealBuffs){
const stealable=['_tempSpd'];if(d._tempSpd>0){a._tempSpd=(a._tempSpd||0)+d._tempSpd;d._tempSpd=0;bLog(`${a.name} stole buffs from ${d.name}!`,'spec');}
}

// Lifesteal
if(spec&&(a.special.effect==='lifesteal')){
const h=Math.round(result.dmg*a.special.val);a.hp=Math.min(a.maxHp,a.hp+h);
floatTxt(a.x,a.y,'+'+h,'#22c55e');
}
// AoE
if(spec&&a.special.effect==='aoe'){
B.allUnits.filter(u=>u.side!==a.side&&u.hp>0&&u!==d&&Math.abs(u.x-d.x)+Math.abs(u.y-d.y)<=1).forEach(ae=>{
const aoe=Math.round(result.dmg*a.special.val);ae.hp=Math.max(0,ae.hp-aoe);
floatTxt(ae.x,ae.y,'-'+aoe,'#ef4444');bLog(`AoE: ${ae.name} -${aoe}`,'dmg');
});
}
// Extra action (Galeforce) - once per turn only (Bug #67)
if(spec&&a.special.effect==='extra_action'&&!a._galeforceUsed){a.extraAction=true;a._galeforceUsed=true;bLog(`${a.name} gains extra action!`,'spec');}

// Post-combat effects from passives
a.passives?.forEach(p=>{
if(p.trigger==='OnAttack'&&evalCondition(p.condition,a,d)){
if(p.effect.tag==='poison'){d.poisoned+=p.effect.val;bLog(`${d.name} poisoned!`,'dmg');}
if(p.effect.tag==='burn'){d.burned+=p.effect.val;bLog(`${d.name} burned!`,'dmg');}
if(p.effect.tag==='freeze'){d.frozen=true;bLog(`${d.name} frozen!`,'dmg');}
if(p.effect.tag==='push'){
const dx=d.x-a.x,dy=d.y-a.y;
const nx=d.x+(dx?dx/Math.abs(dx):0),ny=d.y+(dy?dy/Math.abs(dy):0);
if(nx>=0&&ny>=0&&nx<B.mapW&&ny<B.mapH&&!unitAt(nx,ny)&&TERRAINS[B.grid[ny]?.[nx]]?.passable){
d.x=nx;d.y=ny;bLog(`${d.name} pushed!`,'sys');
}
}
// Bug #40: Lunge swaps positions
if(p.effect.tag==='lunge'&&d.hp>0){
const tx=a.x,ty=a.y;a.x=d.x;a.y=d.y;d.x=tx;d.y=ty;
bLog(`${a.name} and ${d.name} swap positions!`,'sys');
}
if(p.effect.tag==='heal'){a.hp=Math.min(a.maxHp,a.hp+p.effect.val);floatTxt(a.x,a.y,'+'+p.effect.val,'#22c55e');}
}
if(p.trigger==='OnKill'&&d.hp<=0&&evalCondition(p.condition,a,d)){
if(p.effect.tag==='heal'){a.hp=Math.min(a.maxHp,a.hp+p.effect.val);}
}
});
// OnDefend passives for the defender fire post-hit
d.passives?.forEach(p=>{
if(p.trigger==='OnDefend'&&evalCondition(p.condition,d,a)){
if(p.effect.tag==='heal'){d.hp=Math.min(d.maxHp,d.hp+p.effect.val);floatTxt(d.x,d.y,'+'+p.effect.val,'#22c55e');}
if(p.effect.tag==='poison'){a.poisoned=(a.poisoned||0)+p.effect.val;}
if(p.effect.tag==='burn'){a.burned=(a.burned||0)+p.effect.val;}
}
});
return result;
};

// Vantage: target attacks first
if(vantage&&!isSpecial){
const dist=Math.abs(atker.x-target.x)+Math.abs(atker.y-target.y);
const defRange=getWeaponRange(target.weapon);
if(target.hp>0&&(dist<=defRange||target._distantCounter)){
bLog(`${target.name} Vantage!`,'spec');
executeHit(target,atker,false);
if(atker.hp<=0){markActed(atker);hitPause(()=>{drawMap();updateBUI();updateEList();checkBattleOver()||checkTurnEnd();});return;}
}
}

// Main attack
if(isSpecial)bLog(`${atker.name}: ${atker.special.name}!`,'spec');
const r1=executeHit(atker,target,isSpecial);
if(isSpecial)atker.specialCharges=atker.special.cd;
else atker.specialCharges=Math.max(0,atker.specialCharges-1);

// Brave: attack twice (from passive or weapon effect) — only when initiating
let brave=false;
if(isInitiating){
atker.passives?.forEach(p=>{if(p.effect.tag==='brave'&&p.trigger==='OnAttack'&&evalCondition(p.condition,atker,target))brave=true;});
if(atker.weaponEffect==='brave_sword')brave=true;
}
if(brave&&target.hp>0){
// Bug #34: dynamically trigger special if charges hit 0
const braveSpec=!isSpecial&&atker.special&&atker.specialCharges===0;
bLog(`${atker.name} Brave!`,'spec');
executeHit(atker,target,braveSpec);
if(braveSpec)atker.specialCharges=atker.special.cd;
else if(!braveSpec)atker.specialCharges=Math.max(0,atker.specialCharges-1);
}
// Gravity: applied via passive, carry over gravityApplied flag after combat
// Pass passive: handled in getReachable

// Compute follow-up and desperation once
const canDouble=doubles(atker,target);
let desperation=false;
atker.passives?.forEach(p=>{if(p.effect.tag==='desperation'&&atker.hp<atker.maxHp*.75)desperation=true;});

// Desperation follow-up: attacks before counter
if(canDouble&&desperation&&target.hp>0){
const despSpec=atker.special&&atker.specialCharges===0&&!['heal_self','shield','aura_heal','extra_action'].includes(atker.special.effect);
executeHit(atker,target,despSpec,true);
if(despSpec)atker.specialCharges=atker.special.cd;
else atker.specialCharges=Math.max(0,atker.specialCharges-1);
bLog(`${atker.name} Desperation follow-up!`,'spec');
}

// Counter
const dist=Math.abs(atker.x-target.x)+Math.abs(atker.y-target.y);
const defRange=getWeaponRange(target.weapon);
if(target.hp>0&&(dist<=defRange||target._distantCounter)&&!vantage){
const defSpec1=target.special&&target.specialCharges===0&&!['heal_self','shield','aura_heal','extra_action'].includes(target.special.effect);
executeHit(target,atker,defSpec1);
if(defSpec1)target.specialCharges=target.special.cd;
else target.specialCharges=Math.max(0,target.specialCharges-1);
// Defender follow-up: Quick Riposte (OnDefend brave) or natural speed advantage
let defQuickRiposte=false;
target.passives?.forEach(p=>{if(p.trigger==='OnDefend'&&p.effect.tag==='brave'&&evalCondition(p.condition,target,atker))defQuickRiposte=true;});
if((defQuickRiposte||doubles(target,atker))&&atker.hp>0){
bLog(`${target.name} counter follow-up!`,'spec');
const defSpec2=target.special&&target.specialCharges===0&&!['heal_self','shield','aura_heal','extra_action'].includes(target.special.effect);
executeHit(target,atker,defSpec2);
if(defSpec2)target.specialCharges=target.special.cd;
else target.specialCharges=Math.max(0,target.specialCharges-1);
}
}

// Normal follow-up (only if desperation didn't already fire)
if(canDouble&&!desperation&&target.hp>0){
const dblSpec=atker.special&&atker.specialCharges===0&&!['heal_self','shield','aura_heal','extra_action'].includes(atker.special.effect);
executeHit(atker,target,dblSpec,true);
if(dblSpec)atker.specialCharges=atker.special.cd;
}

// Shard drop chance
if(target.hp<=0&&atker.side==='player'){
if(Math.random()<.15){
const rosterUnit=S.roster.find(u=>u.name===atker.name);
if(rosterUnit){rosterUnit.shards=(rosterUnit.shards||0)+1;bLog(`${atker.name} earned an Apex Shard!`,'spec');}
}
}
}

if(!atker.extraAction)markActed(atker);
else{atker.extraAction=false;atker.acted=false;atker.moved=false;bLog(`${atker.name} acts again!`,'spec');}

hitPause(()=>{
if(B.dangerZone)calcDangerZone(); // Bug #36
drawMap();updateBUI();updateEList();
if(!checkBattleOver())checkTurnEnd();
});
        if(!target||!atker) return;
        if(target.hp>0) atker.passives?.forEach(p=>{
            if(p.effect?.tag==='post_combat_debuff_atk'&&evalCondition(p.condition||'Always',atker,target))
                target._rallyAtk=Math.min(target._rallyAtk||0,-(p.effect.val||5));
        });
        if(target.hp>0&&atker.hp>0){
            if(atker._itemOnHitBurn>0) target.burned=(target.burned||0)+atker._itemOnHitBurn;
            if(atker._itemOnHitFreeze&&Math.random()<atker._itemOnHitFreeze) target.frozen=true;
            if(atker._itemOnHitPoison>0) target.poisoned=(target.poisoned||0)+atker._itemOnHitPoison;
            if(atker._itemOnHitPanic&&Math.random()<atker._itemOnHitPanic) target._panicked=true;
        }
        if(atker._itemLifesteal>0&&atker.hp>0&&target){
            const est=Math.max(1,atker.atk-(target.def||0));
            const h=Math.round(est*atker._itemLifesteal);
            if(h>0){ atker.hp=Math.min(atker.maxHp,atker.hp+h); floatTxt(atker.x,atker.y,'+'+h,'#22c55e'); }
        }
        if(target._itemReflect>0&&atker.hp>0){
            const est=Math.max(1,atker.atk-(target.def||0));
            const ref=Math.round(est*target._itemReflect);
            if(ref>0){ atker.hp=Math.max(0,atker.hp-ref); floatTxt(atker.x,atker.y,'-'+ref,'#a855f7'); }
        }

        // After combat, check for adjacent allies to bond with
        if(atker && atker.side === 'player' && atker.hp > 0) {
            const allies = B.pUnits.filter(u => u.hp > 0 && u !== atker &&
                Math.abs(u.x - atker.x) + Math.abs(u.y - atker.y) <= 2);
            allies.forEach(ally => {
                addSupport(atker.id, ally.id, BOND_PER_BATTLE_ADJ);
                // Spawn visual heart on the map
                spawnBattleHeart(atker.x, atker.y);
            });
        }

        // Check if an assist was used (heal/dance)
        if(atker && target && atker.side === target.side && atker.side === 'player') {
            addSupport(atker.id, target.id, BOND_PER_ASSIST);
            spawnBattleHeart(target.x, target.y);
        }
}


function checkBattleOver() {
    const prevPhase = B.phase;

    // Track campaign_v2 victories
    if(prevPhase !== 'over' && B.phase === 'over' && currentBattleMode === 'campaign_v2') {
        const pe = B.pUnits.filter(u => u.hp > 0).length;
        const ee = B.eUnits.filter(u => u.hp > 0).length;
        const battleNum = B._currentCampaignBattle || currentBattleConfig?.battleNum;

        if(ee === 0 && pe > 0 && battleNum) {
            // Mark as cleared
            if(!S.campaignDone.includes(battleNum)) {
                S.campaignDone.push(battleNum);
            }
            // Track difficulty
            if(!S.campaignClears) S.campaignClears = {};
            if(!S.campaignClears[battleNum]) S.campaignClears[battleNum] = [];
            const diff = currentDifficulty || 'normal';
            if(!S.campaignClears[battleNum].includes(diff)) {
                S.campaignClears[battleNum].push(diff);
            }

            // Bonus Flux for first clear
            const config = generateBattleConfig(battleNum);
            const isFirstClear = S.campaignClears[battleNum].length === 1;
            if(isFirstClear) {
                S.ap += config.fluxReward;
                // Book completion bonus
                if(battleNum % 100 === 0) {
                    S.ap += 50;
                    toast(`BOOK ${Math.ceil(battleNum / 100)} COMPLETE! +50 Bonus Flux!`, 'gold');
                }
            }

            // Give AP meter progress for story battles
            if(typeof addApexMeter === 'function') {
                addApexMeter(15 + Math.floor(config.enemyMult * 5));
            }

            save(true);
        }
    }

    return result;
};


function showWin(ap,elo){
    if(Math.random() < 0.4) {
        const rarities = ['C','C','C','B','B','A','S'];
        const rarity = rarities[~~(Math.random()*rarities.length)];
        const item = grantRandomItem(rarity);
        if(item) {
            toast('Found item: ' + item.name + '!', 'gold');
        }
    }
    if(Math.random() < 0.2) {
        const ab = ABILITY_DB[~~(Math.random()*ABILITY_DB.length)];
        if(ab && !S.unlockedAbilities.includes(ab.id)) {
            S.unlockedAbilities.push(ab.id);
            toast('Unlocked ability: ' + ab.name + '!', 'gold');
        }
    }
        const xpData = [];
        const expMult = (typeof currentBattleConfig !== 'undefined' && currentBattleConfig?.expMult) ?? 1;
        if (typeof B !== 'undefined' && B.pUnits) {
            B.pUnits.filter(u => u.hp > 0).forEach(bu => {
                const ru = S.roster.find(r => r.id === bu.id);
                if (ru) {
                    const xpGain = Math.round(20 * expMult);
                    const expReq = Math.floor(100 * Math.pow(ru.level || 1, 1.5));
                    const prevPct = ru.level >= 40 ? 100 : Math.min(100, Math.round(((ru.exp || 0) / expReq) * 100));
                    const newExpReq = Math.floor(100 * Math.pow(ru.level || 1, 1.5));
                    const newPct = ru.level >= 40 ? 100 : Math.min(100, Math.round(((ru.exp || 0) / newExpReq) * 100));
                    xpData.push({
                        name: ru.name,
                        level: ru.level || 1,
                        xpGain: xpGain,
                        pct: newPct,
                        leveledUp: ru.level > (bu.level || ru.level)
                    });
                }
            });
        }
const r=getEloRank(S.elo);
document.getElementById('resultTitle').textContent='VICTORY';document.getElementById('resultTitle').className='win';
document.getElementById('resultSub').textContent=`${r.name} | ELO: ${S.elo} (+${elo})`;
document.getElementById('resultReward').textContent=`+${ap} AP | +${elo} ELO`;
document.getElementById('resultBg').classList.add('show');

        // Add XP breakdown to result card
        if (xpData.length > 0) {
            const rewardEl = document.getElementById('resultReward');
            if (rewardEl) {
                let xpHTML = rewardEl.innerHTML;
                xpHTML += '<div class="result-xp-list">';
                xpData.forEach((d, i) => {
                    xpHTML += `<div class="result-xp-unit" style="animation-delay:${i * 0.1 + 0.3}s">
                        <span class="result-xp-name">${d.name}</span>
                        <div class="result-xp-bar"><div class="result-xp-fill" style="width:0%"></div></div>
                        <span class="result-xp-text">+${d.xpGain} XP</span>
                        ${d.leveledUp ? '<span class="result-lvlup">LV UP!</span>' : ''}
                    </div>`;
                });
                xpHTML += '</div>';
                rewardEl.innerHTML = xpHTML;

                // Animate XP bars after a short delay
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        rewardEl.querySelectorAll('.result-xp-fill').forEach((bar, i) => {
                            bar.style.width = xpData[i].pct + '%';
                        });
                    }, 400);
                });
            }
        }
        // Add difficulty badge to result
        const resultSub = document.getElementById('resultSub');
        if(resultSub) {
            const diff = currentDifficulty || 'normal';
            const info = DIFF_LABELS[diff];
            resultSub.innerHTML += `<div style="margin-top:6px;font-family:var(--display);font-size:.7rem;color:${info.color};letter-spacing:2px">${info.icon} CLEARED ON ${info.name.toUpperCase()}</div>`;
        }

    if(currentBattleMode === 'campaign_v2') {
        const battleNum = B._currentCampaignBattle || currentBattleConfig?.battleNum;
        if(battleNum && battleNum < TOTAL_BATTLES) {
            const resultBtns = document.querySelector('.result-btns');
            // Guard: only add the button once (prevents duplicates from repeated showWin calls)
            if(resultBtns && !resultBtns.querySelector('#campNextBattleBtn')) {
                const contBtn = document.createElement('button');
                contBtn.id = 'campNextBattleBtn';
                contBtn.className = 'btn-t0';
                contBtn.style.cssText = 'font-size:.75rem;padding:8px 14px';
                contBtn.textContent = 'NEXT BATTLE ▸';
                contBtn.onclick = function() {
                    closeResult();
                    // Delay launch so closeResult screen transition settles
                    // and dialog/difficulty picker can render on a clean slate
                    setTimeout(function() {
                        launchCampaignBattle_v2(battleNum + 1);
                    }, 120);
                };
                resultBtns.appendChild(contBtn);
            }
        }
    }
}


function showLose(elo){
document.getElementById('resultTitle').textContent='DEFEAT';document.getElementById('resultTitle').className='lose';
document.getElementById('resultSub').textContent=`ELO: ${S.elo} (-${elo})`;
document.getElementById('resultReward').textContent='';
document.getElementById('resultBg').classList.add('show');
// Clean up Hall of Forms temp units on defeat
if(hofState){const _ids=hofState.savedTeamIds||[];hofState=null;S.roster=S.roster.filter(u=>!u.isForma);S.team=_ids.map(id=>S.roster.findIndex(u=>u.id===id)).filter(i=>i>=0);}
}


function applyItemEffects(bu) {
    const item = bu.equippedItem; if(!item) return;
    const e = item.effect; if(!e) return;
    if(e.type === 'stat_boost') bu[e.stat] = (bu[e.stat]||0) + e.val;
    if(e.type === 'lifesteal') bu._itemLifesteal = (bu._itemLifesteal||0) + e.val;
    if(e.type === 'reflect') bu._itemReflect = (bu._itemReflect||0) + e.val;
    if(e.type === 'mov_boost') bu.mov = (bu.mov||2) + e.val;
    if(e.type === 'revive') bu._itemRevive = e.val;
    if(e.type === 'crit_chance') bu._itemCritBonus = (bu._itemCritBonus||0) + e.val;
    if(e.type === 'crit_mult') bu._itemCritMult = e.val;
    if(e.type === 'miracle') bu._itemMiracle = true;
    if(e.type === 'regen') bu._itemRegen = (bu._itemRegen||0) + e.val;
    if(e.type === 'first_hit_shield') bu._itemFirstHitShield = e.val;
    if(e.type === 'immune_freeze') bu._immuneFreeze = true;
    if(e.type === 'immune_dot') { bu._immunePoison = true; bu._immuneBurn = true; }
    if(e.type === 'immune_panic') bu._antiPanic = true;
    if(e.type === 'on_hit_burn') bu._itemOnHitBurn = e.val;
    if(e.type === 'on_hit_freeze') bu._itemOnHitFreeze = e.val;
    if(e.type === 'on_hit_poison') bu._itemOnHitPoison = e.val;
    if(e.type === 'always_double') bu._itemAlwaysDouble = true;
    if(e.type === 'anti_double') bu._itemAntiDouble = true;
    if(e.type === 'close_counter') bu._distantCounter = true;
    if(e.type === 'distant_counter') bu._distantCounter = true;
    if(e.type === 'range_boost') bu._rangeBoost = (bu._rangeBoost||0) + e.val;
    if(e.type === 'def_pierce') bu._itemDefPierce = (bu._itemDefPierce||0) + e.val;
    if(e.type === 'cd_reduce') bu.specialCharges = Math.max(0, (bu.specialCharges||0) - e.val);
    if(e.type === 'spec_boost') bu._itemSpecBoost = (bu._itemSpecBoost||0) + e.val;
    if(e.type === 'bond_boost') bu._itemBondBoost = e.val;
    if(e.type === 'solo_boost') bu._itemSoloBoost = e.val;
    if(e.type === 'null_bonuses') bu._itemNullBonuses = true;
    // Weapon/move specific
    if(e.type === 'weapon_stat' && bu.weapon === e.weapon) bu[e.stat] = (bu[e.stat]||0) + e.val;
    if(e.type === 'move_stat' && bu.moveType === e.moveType) bu[e.stat] = (bu[e.stat]||0) + e.val;
        /* reuse */ item = bu.equippedItem; if(!item) return;
        /* reuse */ e = item.effect; if(!e) return;
        const H = {
            legendary_binding:   ()=> bu.passives.push({name:'Binding Blade',desc:'Triangle \u00b140%',trigger:'OnAttack',condition:'Always',effect:{tag:'triangle_adept',val:0}}),
            legendary_falchion:  ()=> bu.passives.push({name:'Falchion',desc:'Heal 10/turn',trigger:'TurnStart',condition:'Always',effect:{tag:'heal',val:10}}),
            legendary_armads:    ()=> bu.passives.push({name:'Armads',desc:'QR when HP>80%',trigger:'OnDefend',condition:'HP>75%',effect:{tag:'brave',val:2}}),
            legendary_tyrfing:   ()=> bu.passives.push({name:'Tyrfing',desc:'DEF+10 <50%',trigger:'OnDefend',condition:'HP<50%',effect:{tag:'buff_def',val:10}}),
            legendary_naga:      ()=> { bu.res=(bu.res||0)+5; },
            legendary_booknaga:  ()=> { ['atk','def','mag','res','spd'].forEach(s=>bu[s]=(bu[s]||0)+3); bu._antiPanic=true; },
            legendary_ragnell:   ()=> { bu._distantCounter=true; bu.atk=(bu.atk||0)+4; },
            legendary_gradivus:  ()=> { bu._distantCounter=true; bu.passives.push({name:'Gradivus',desc:'Heal 10 post-combat',trigger:'OnAttack',condition:'Always',effect:{tag:'heal',val:10}}); },
            legendary_siegmund:  ()=> bu.passives.push({name:'Siegmund',desc:'ATK+6 >90%',trigger:'OnAttack',condition:'HP>75%',effect:{tag:'buff_atk',val:6}}),
            legendary_durandal:  ()=> bu.passives.push({name:'Durandal',desc:'ATK+8 initiate',trigger:'OnAttack',condition:'Always',effect:{tag:'buff_atk',val:8}}),
            legendary_solkatti:  ()=> bu.passives.push({name:'Sol Katti',desc:'Desperation <75%',trigger:'OnAttack',condition:'HP<75%',effect:{tag:'desperation',val:0}}),
            legendary_aura:      ()=> bu.passives.push({name:'Aura',desc:'Heal allies 7',trigger:'OnAttack',condition:'Always',effect:{tag:'heal',val:7}}),
            legendary_excalibur: ()=> { bu.spd=(bu.spd||0)+5; },
            legendary_forseti:   ()=> bu.passives.push({name:'Forseti',desc:'Follow-up if faster',trigger:'OnAttack',condition:'Speed>Target',effect:{tag:'brave',val:2}}),
            legendary_mjolnir:   ()=> { bu.atk=(bu.atk||0)+5; bu.specialCharges=Math.max(0,(bu.specialCharges||0)-2); },
            legendary_loptous:   ()=> { bu._shieldPct=Math.min(0.6,(bu._shieldPct||0)+0.5); },
            legendary_chaos:     ()=> { ['atk','def','mag','res','spd'].forEach(s=>bu[s]=(bu[s]||0)+5); },
            legendary_apex:      ()=> { ['atk','def','mag','res','spd'].forEach(s=>bu[s]=(bu[s]||0)+7); },
        };
        if(H[e.type]) H[e.type]();
}


// Exports
export {
    rollGrade, createUnit, applyLevel, gainExp, awardSP,
    prepUnit, createEnemyTeam,
    calcDmg, performCombat,
    checkBattleOver, showWin, showLose,
    applyItemEffects,
};
