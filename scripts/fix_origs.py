#!/usr/bin/env python3
"""
Fix remaining _orig references and syntax errors in game.js after merge.
"""
import re

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def main():
    content = read_file('/home/user/Apex-Tier-0/src/game.js')
    lines = content.split('\n')

    # ═══════════════════════════════════════════════════════════════
    # FIX 1: doSpecial — three overlapping versions causing duplicate `const u`
    # Replace lines 2092-2126 with a single clean merged version
    # ═══════════════════════════════════════════════════════════════

    # Find doSpecial function
    for i, line in enumerate(lines):
        if line.strip().startswith('function doSpecial()'):
            ds_start = i
            break

    # Find next function (doWait)
    for i in range(ds_start + 1, len(lines)):
        if lines[i].strip().startswith('function doWait()'):
            ds_end = i
            break

    # Replace doSpecial with clean merged version
    new_doSpecial = """function doSpecial(){
const u=B.sel;if(!u||u.specialCharges>0||u.acted){toast('Special not ready','err');return;}
// Map-wide effects (from mega patch)
const mapEffects=[
'heal_self','shield','aura_heal',
'map_quake','map_blizzard','map_fire','map_heal','map_timestop',
'heal_all','heal_all_full','buff_all_atk','buff_all_def',
'buff_all_spd','buff_all_spectrum','buff_all_full',
'debuff_all_aoe','panic_all','gravity_all'
];
if(mapEffects.includes(u.special.effect)){
if(['heal_self','shield','aura_heal'].includes(u.special.effect)){
gameConfirm(
`Use ${u.special.name}? (${u.special.desc})`,
()=>{ _hfExecuteMapSpecial(u); },
()=>{ B.mode='select'; }
);
return;
}
_hfExecuteMapSpecial(u);return;
}
B.mode='special';B.highlights=getAtkRange(u);
if(!B.highlights.length){toast('No targets','err');B.mode='select';return;}
drawMap();sfx('click');
}

"""
    lines[ds_start:ds_end] = new_doSpecial.split('\n')
    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 1: Replaced doSpecial with clean merged version")

    # ═══════════════════════════════════════════════════════════════
    # FIX 2: nav — move original body into setTimeout, remove _origNav
    # The original nav body (screen switching) is currently inlined
    # before the transition code. It should ONLY run inside the setTimeout.
    # ═══════════════════════════════════════════════════════════════

    # Find nav function
    nav_start = None
    for i, line in enumerate(lines):
        if line.strip() == 'function nav(id){':
            nav_start = i
            break

    if nav_start is None:
        for i, line in enumerate(lines):
            if 'function nav(id)' in line.strip():
                nav_start = i
                break

    # Find nav end (next top-level function)
    nav_end = None
    for i in range(nav_start + 1, len(lines)):
        if lines[i].strip().startswith('function updateEloDisplay()'):
            nav_end = i
            break

    # Build the corrected nav function
    # The original nav logic is the core screen switch
    nav_core = """        // Core navigation logic
        if(id!=='battle'&&typeof _mapAnimRAF!=='undefined'&&_mapAnimRAF){cancelAnimationFrame(_mapAnimRAF);_mapAnimRAF=0;}
        if(id!=='battle'&&B.phase&&B.phase!=='over'){
            B.phase='over';
            B.battleId=(B.battleId||0)+1;
            if(typeof hofState!=='undefined'&&hofState){const _ids=hofState.savedTeamIds||[];hofState=null;S.roster=S.roster.filter(u=>!u.isForma);S.team=_ids.map(id=>S.roster.findIndex(u=>u.id===id)).filter(i=>i>=0);}
            save(true);
        }
        document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
        const el=document.getElementById(id);if(el)el.classList.add('active');
        if(id==='gacha')refreshGacha();
        if(id==='barracks')refreshBarracks();
        if(id==='campaign')refreshCampaign();
        if(id==='settings'){activeSettingsTab='images';setSettingsTab('images');}
        if(id==='modes')refreshModes();
        if(id==='daycare'&&typeof refreshDaycare==='function')refreshDaycare();
        if(id==='quests'){renderQuests();updateQuestBadge();}
        if(id==='tavern'&&typeof refreshTavern==='function')refreshTavern();
        if(id==='home')updateHomeScreen();
        const hintBtn=document.getElementById('tutHintBtn');
        if(hintBtn)hintBtn.style.display=(id==='battle'||tutActive)?'none':'flex';
        updateEloDisplay();"""

    new_nav = """function nav(id){
    if(_transActive) return;
    const currentScreen = document.querySelector('.screen.active');
    if(currentScreen && currentScreen.id === id) return;
    if(bgm && bgm.setIntensity) {
        if(id === 'battle') bgm.setIntensity('player');
        else if(id === 'home') bgm.setIntensity('menu');
    }
    if(id !== 'battle' && typeof _mapAnimRAF !== 'undefined' && _mapAnimRAF) {
        cancelAnimationFrame(_mapAnimRAF); _mapAnimRAF = 0;
    }
    const transType = TRANS_MAP[id] || 'fade';
    const layer = document.getElementById('transLayer');

    _transActive = true;
    layer.innerHTML = '';

    // Build transition DOM
    let inner = '';
    if(transType === 'shutter') {
        inner = '<div class="sbar-l"></div><div class="sbar-r"></div>';
        layer.className = 'transition-layer active trans-shutter in';
    } else if(transType === 'light') {
        inner = '<div class="flash"></div>';
        layer.className = 'transition-layer active trans-light in';
    } else if(transType === 'fade') {
        inner = '<div class="blur"></div>';
        layer.className = 'transition-layer active trans-fade in';
    } else if(transType.startsWith('slide')) {
        inner = '<div class="panel"></div>';
        layer.className = `transition-layer active trans-slide ${transType} in`;
    }
    layer.innerHTML = inner;

    // At midpoint (450ms), do the actual screen switch
    setTimeout(() => {
        try {
""" + nav_core + """
            if(id === 'battle' && typeof resizeCanvas === 'function') resizeCanvas();
        } catch(e) {
            console.warn('Nav transition error:', e);
        }

        // Reverse animation
        layer.classList.remove('in');
        layer.classList.add('out');

        // Cleanup
        setTimeout(() => {
            layer.className = 'transition-layer';
            layer.innerHTML = '';
            _transActive = false;
        }, 500);
    }, 450);
    setTimeout(renameTermsInUI, 50);
    if(id === 'home') {
        setTimeout(() => {
            let strip = document.getElementById('homeCurrencyStrip');
            if(!strip) {
                strip = document.createElement('div');
                strip.id = 'homeCurrencyStrip';
                strip.style.cssText = 'font-family:var(--mono);font-size:.7rem;display:flex;align-items:center;gap:12px;justify-content:center;padding:6px 0';
                const statStrip = document.getElementById('homeStatStrip');
                if(statStrip) statStrip.after(strip);
                else {
                    const btns = document.querySelector('.home-btns');
                    if(btns) btns.before(strip);
                }
            }
            strip.innerHTML = `<span style="color:var(--gold)">\\u2605 ${S.ap} Flux</span> \\u00b7 <span style="color:#7c4dff">\\u25c6 ${S.shards||0} Prisms</span> \\u00b7 <span style="color:#ff6b35">\\u25cf ${S.apexTokens||0} ZM</span>`;
        }, 60);
    }
}

"""
    lines[nav_start:nav_end] = new_nav.split('\n')
    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 2: Rewrote nav function with transition + core logic properly merged")

    # ═══════════════════════════════════════════════════════════════
    # FIX 3: startTempest — replace with original (handles both cases)
    # ═══════════════════════════════════════════════════════════════

    for i, line in enumerate(lines):
        if 'function startTempest(' in line:
            st_start = i
            break

    # Find end of startTempest
    for i in range(st_start + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped == '}' and not any(lines[j].strip().startswith('{') for j in [i]):
            # Check if this closes the function
            depth = 0
            for j in range(st_start, i + 1):
                for ch in lines[j]:
                    if ch == '{': depth += 1
                    elif ch == '}': depth -= 1
            if depth == 0:
                st_end = i + 1
                break

    new_startTempest = """function startTempest(stage=1){
currentBattleMode='tempest';
currentBattleConfig={stage,totalStages:7,expMult:0.8,apReward:10+stage*5};
if(stage===1){chooseDifficulty(()=>startBattle());}else{startBattle();}
}
"""
    lines[st_start:st_end] = new_startTempest.split('\n')
    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 3: Replaced startTempest with original function body")

    # ═══════════════════════════════════════════════════════════════
    # FIX 4: _origDrawImage — add const declaration before the wrapper
    # ═══════════════════════════════════════════════════════════════

    for i, line in enumerate(lines):
        if '// ─── 1. CANVAS CRASH SAFETY' in line:
            # Insert _origDrawImage declaration before the wrapper
            lines.insert(i + 1, '    const _origDrawImage = CanvasRenderingContext2D.prototype.drawImage;')
            break

    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 4: Added _origDrawImage declaration before canvas wrapper")

    # ═══════════════════════════════════════════════════════════════
    # FIX 5: Delete empty _origPC/_origBlog conditionals
    # ═══════════════════════════════════════════════════════════════

    # Find and delete lines with _origPC and _origBlog empty blocks
    delete_ranges = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if "typeof _origPC === 'function'" in stripped:
            # Delete this block (3 lines)
            j = i
            while j < len(lines) and '}' not in lines[j] or j == i:
                j += 1
            delete_ranges.append((i, j + 1))
        elif "_origBlog" in stripped and '{' in stripped:
            j = i
            while j < len(lines) and ('}' not in lines[j] or j == i):
                j += 1
            delete_ranges.append((i, j + 1))
        i += 1

    # Also delete "// ─── 8. ADDITIONAL NULL GUARDS" and nearby comments
    for start, end in sorted(delete_ranges, reverse=True):
        # Also delete preceding comment lines
        while start > 0 and (lines[start-1].strip().startswith('// ─── ') or lines[start-1].strip().startswith('// Guard') or lines[start-1].strip().startswith('// Already') or lines[start-1].strip() == ''):
            start -= 1
        lines[start:end] = []

    content = '\n'.join(lines)
    lines = content.split('\n')
    print(f"FIX 5: Deleted {len(delete_ranges)} empty _origPC/_origBlog blocks")

    # ═══════════════════════════════════════════════════════════════
    # FIX 6: Delete duplicate save/loadGame patch versions (lines ~8005-8025)
    # The canonical versions at lines ~3169 and ~3199 already include all fields
    # ═══════════════════════════════════════════════════════════════

    # Find the patch save/loadGame functions
    patch_save_start = None
    patch_save_end = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == 'function save(quiet) {' and i > 5000:
            patch_save_start = i
        if stripped == 'function loadGame() {' and i > 5000:
            patch_load_start = i

    if patch_save_start:
        # Find the block containing both save and loadGame patches
        # Look backwards for a comment header
        block_start = patch_save_start
        while block_start > 0 and lines[block_start - 1].strip().startswith('// ─── 12'):
            block_start -= 1

        # Find end of loadGame patch (closing }; )
        depth = 0
        started = False
        for i in range(patch_load_start, len(lines)):
            for ch in lines[i]:
                if ch == '{': depth += 1; started = True
                elif ch == '}': depth -= 1
            if started and depth == 0:
                block_end = i + 1
                # Skip trailing blank lines and ';'
                while block_end < len(lines) and lines[block_end].strip() in ['', ';', '};']:
                    block_end += 1
                break

        lines[block_start:block_end] = []
        content = '\n'.join(lines)
        lines = content.split('\n')
        print("FIX 6: Deleted duplicate save/loadGame patch versions")

    # ═══════════════════════════════════════════════════════════════
    # FIX 7: Merge APEX startBattle override into canonical startBattle
    # Line 8445: window.startBattle = ... adds APEX auto-battle disable
    # Line 9217: window.startBattle = ... adds boss enhancements
    # Both should be appended to the canonical startBattle (ending at ~line 1570)
    # ═══════════════════════════════════════════════════════════════

    # Find canonical startBattle end
    for i, line in enumerate(lines):
        if line.strip() == 'async function startBattle(campaignData=null){':
            sb_func_start = i
            break

    # Find closing brace
    depth = 0
    started = False
    for i in range(sb_func_start, len(lines)):
        for ch in lines[i]:
            if ch == '{': depth += 1; started = True
            elif ch == '}': depth -= 1
        if started and depth == 0:
            sb_func_end = i
            break

    # Insert APEX + boss enhancement code before the closing brace
    apex_code = """
// APEX difficulty handling (from APEX patch)
if(currentDifficulty === 'apex') {
    B.autoPlay = false;
    const autoBtn = document.getElementById('autoBtn');
    if(autoBtn) {
        autoBtn.classList.remove('auto-active');
        autoBtn.textContent = 'AUTO';
        autoBtn.disabled = true;
        autoBtn.style.opacity = '0.3';
        autoBtn.title = 'Auto-battle disabled on APEX difficulty';
    }
    toast('APEX DIFFICULTY — Auto-battle DISABLED. All enemies are T0 +10 with full synergies!', 'err');
} else {
    const autoBtn = document.getElementById('autoBtn');
    if(autoBtn) {
        autoBtn.disabled = false;
        autoBtn.style.opacity = '';
        autoBtn.title = '';
    }
}
// Campaign v2 boss battle enhancements
if(currentBattleMode === 'campaign_v2' && currentBattleConfig?.boss) {
    const config = currentBattleConfig;
    const bookIdx = config.bookIdx || 0;
    if(B.eUnits.length > 0) {
        const boss = B.eUnits[B.eUnits.length - 1];
        boss.maxHp = Math.round(boss.maxHp * (1.5 + bookIdx * 0.15));
        boss.hp = boss.maxHp;
        boss.atk = Math.round(boss.atk * (1.2 + bookIdx * 0.1));
        boss.def = Math.round(boss.def * (1.2 + bookIdx * 0.1));
        if(bookIdx >= 8) boss.grade = 'T0';
        else if(bookIdx >= 5) boss.grade = 'S';
        else if(bookIdx >= 3) boss.grade = 'A';
        if(bookIdx >= 4) boss._distantCounter = true;
        boss.personality = 'aggressive';
    }
}"""

    lines[sb_func_end] = apex_code + '\n}'
    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 7: Merged APEX + boss enhancement code into canonical startBattle")

    # Now delete the two override blocks
    # Find and delete "window.startBattle = startBattle = async function" blocks
    delete_ranges = []
    for i, line in enumerate(lines):
        if 'window.startBattle = startBattle = async function' in line or \
           (line.strip() == 'window.startBattle = async function(campaignData) {' and i > 5000):
            # Find end of this function
            depth = 0
            started = False
            for j in range(i, len(lines)):
                for ch in lines[j]:
                    if ch == '{': depth += 1; started = True
                    elif ch == '}': depth -= 1
                if started and depth == 0:
                    end = j + 1
                    # Skip trailing semicolons/blanks
                    while end < len(lines) and lines[end].strip() in ['', ';', '};']:
                        end += 1
                    delete_ranges.append((i, end))
                    break

    # Also find the APEX comment before the first override
    for start, end in sorted(delete_ranges, reverse=True):
        # Extend backwards to capture comment
        while start > 0 and (lines[start-1].strip().startswith('// Apply synergies') or
                             lines[start-1].strip().startswith('// Override result') or
                             lines[start-1].strip().startswith('// BOSS BATTLE') or
                             lines[start-1].strip().startswith('// BATTLE COMPLETION') or
                             lines[start-1].strip().startswith('// BATTLE LAUNCHER') or
                             lines[start-1].strip() == ''):
            start -= 1
        lines[start:end] = []

    content = '\n'.join(lines)
    lines = content.split('\n')
    print(f"FIX 7b: Deleted {len(delete_ranges)} startBattle override blocks")

    # ═══════════════════════════════════════════════════════════════
    # FIX 8: Fix toggleAutoBattle — replace _origToggleAuto with inline logic
    # ═══════════════════════════════════════════════════════════════

    for i, line in enumerate(lines):
        if "if(typeof _origToggleAuto === 'function') _origToggleAuto();" in line:
            lines[i] = """    B.autoPlay = !B.autoPlay;
    const btn = document.getElementById('autoBtn');
    if(btn) {
        btn.classList.toggle('auto-active', B.autoPlay);
        btn.textContent = B.autoPlay ? 'AUTO ON' : 'AUTO';
    }
    toast(B.autoPlay ? 'Auto-Battle ON — your units will act automatically' : 'Auto-Battle OFF', 'ok');
    if(B.autoPlay && B.phase === 'player') {
        runAutoPlayer();
    }"""
            break

    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 8: Replaced _origToggleAuto with inline toggle logic")

    # ═══════════════════════════════════════════════════════════════
    # FIX 9: Delete empty if(_origXxx) blocks
    # Lines with if(_origStartExpandedCampaign), if(_origStartHoF), etc.
    # ═══════════════════════════════════════════════════════════════

    empty_orig_patterns = [
        '_origStartExpandedCampaign',
        '_origStartHoF',
        '_origStartOrdeal',
        '_origStartBHB',
        '_origShowWin',
    ]

    delete_lines = set()
    for i, line in enumerate(lines):
        stripped = line.strip()
        for pat in empty_orig_patterns:
            if pat in stripped and (stripped.startswith('if(') or stripped.startswith('if (')):
                # Check if it's an empty block
                delete_lines.add(i)
                # Check next line for closing brace
                if i + 1 < len(lines) and lines[i + 1].strip() == '}':
                    delete_lines.add(i + 1)
                break

    # Also delete comment lines before them
    extra_deletes = set()
    for ln in sorted(delete_lines):
        j = ln - 1
        while j >= 0 and lines[j].strip().startswith('//'):
            extra_deletes.add(j)
            j -= 1
        # Also blank lines
        while j >= 0 and lines[j].strip() == '':
            extra_deletes.add(j)
            j -= 1

    all_deletes = sorted(delete_lines | extra_deletes, reverse=True)
    for i in all_deletes:
        if i < len(lines):
            lines[i] = None
    lines = [l for l in lines if l is not None]
    content = '\n'.join(lines)
    lines = content.split('\n')
    print(f"FIX 9: Deleted {len(all_deletes)} lines of empty if(_orig) blocks")

    # ═══════════════════════════════════════════════════════════════
    # FIX 10: Merge claimMaxReward/claimApexReward — add awardVictoryXPAndQuests
    # into the canonical functions
    # ═══════════════════════════════════════════════════════════════

    # Find canonical claimMaxReward
    for i, line in enumerate(lines):
        if 'window.claimMaxReward = function(idx)' in line:
            # Add awardVictoryXPAndQuests() call right after the opening
            # Find first line of function body
            for j in range(i + 1, i + 5):
                if lines[j].strip().startswith('const choices'):
                    lines.insert(j, '    awardVictoryXPAndQuests();')
                    break
            break

    content = '\n'.join(lines)
    lines = content.split('\n')

    # Find canonical claimApexReward
    for i, line in enumerate(lines):
        if 'window.claimApexReward = function(idx)' in line:
            for j in range(i + 1, i + 5):
                if lines[j].strip().startswith('const choices'):
                    lines.insert(j, '    awardVictoryXPAndQuests();')
                    break
            break

    content = '\n'.join(lines)
    lines = content.split('\n')

    # Now delete the patch versions of claimMaxReward/claimApexReward
    delete_ranges = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('if(_origClaimMaxReward)') or stripped.startswith('if(_origClaimApexReward)'):
            # Find end of this if block
            depth = 0
            started = False
            for j in range(i, len(lines)):
                for ch in lines[j]:
                    if ch == '{': depth += 1; started = True
                    elif ch == '}': depth -= 1
                if started and depth == 0:
                    delete_ranges.append((i, j + 1))
                    break

    for start, end in sorted(delete_ranges, reverse=True):
        # Also delete blank lines before
        while start > 0 and lines[start-1].strip() == '':
            start -= 1
        lines[start:end] = []

    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 10: Merged awardVictoryXPAndQuests into canonical claim functions, deleted patches")

    # ═══════════════════════════════════════════════════════════════
    # FIX 11: Delete duplicate currentDifficulty = d in setDifficulty
    # ═══════════════════════════════════════════════════════════════

    for i, line in enumerate(lines):
        if 'function setDifficulty(d){' in line:
            # Check for duplicate currentDifficulty = d
            if '// --- Pre-code' in lines[i+1]:
                # Delete the pre-code comment and the indented version
                # Keep only one currentDifficulty=d
                lines[i+1] = ''  # Delete comment
                lines[i+2] = ''  # Delete indented duplicate
            break

    content = '\n'.join(lines)
    lines = content.split('\n')
    print("FIX 11: Cleaned duplicate currentDifficulty assignment in setDifficulty")

    # ═══════════════════════════════════════════════════════════════
    # FIX 12: Delete _origBlog comment line
    # ═══════════════════════════════════════════════════════════════

    # Clean up "// ─── 9. UI POLISH: BATTLE LOG TIMESTAMPS" empty section
    delete_lines = []
    for i, line in enumerate(lines):
        if '// ─── 9. UI POLISH: BATTLE LOG TIMESTAMPS' in line:
            delete_lines.append(i)

    for i in sorted(delete_lines, reverse=True):
        lines.pop(i)

    content = '\n'.join(lines)
    lines = content.split('\n')

    # ═══════════════════════════════════════════════════════════════
    # FIX 13: Clean up remaining comment artifacts
    # Delete "// --- Pre-code from patch" and "// --- Post-code from patch" comments
    # ═══════════════════════════════════════════════════════════════

    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('// --- Pre-code from patch') or \
           stripped.startswith('// --- Post-code from patch') or \
           stripped.startswith('// --- From patch block'):
            continue
        new_lines.append(line)

    removed = len(lines) - len(new_lines)
    lines = new_lines
    content = '\n'.join(lines)
    print(f"FIX 13: Removed {removed} patch comment artifacts")

    # ═══════════════════════════════════════════════════════════════
    # FIX 14: Clean up "// Track turn count" — ensure it's in proper context
    # ═══════════════════════════════════════════════════════════════

    # Delete standalone "B.turnCount = 0" outside of functions (it's set in startBattle already)
    for i, line in enumerate(lines):
        if line.strip() == "if(typeof B !== 'undefined') B.turnCount = 0;":
            # Delete this and the comment before it
            if lines[i-1].strip() == '// Track turn count':
                lines[i-1] = ''
            lines[i] = ''

    content = '\n'.join(lines)
    lines = content.split('\n')

    # ═══════════════════════════════════════════════════════════════
    # FIX 15: Remove toast about Infinite Convergence (leftover from patch init)
    # ═══════════════════════════════════════════════════════════════

    for i, line in enumerate(lines):
        if "toast('The Infinite Convergence: 1000 battles loaded!'" in line:
            lines[i] = ''

    content = '\n'.join(lines)
    lines = content.split('\n')

    # ═══════════════════════════════════════════════════════════════
    # FINAL: Remove consecutive blank lines (max 2)
    # ═══════════════════════════════════════════════════════════════

    final_lines = []
    blank_count = 0
    for line in lines:
        if line.strip() == '':
            blank_count += 1
            if blank_count <= 2:
                final_lines.append(line)
        else:
            blank_count = 0
            final_lines.append(line)

    content = '\n'.join(final_lines)
    write_file('/home/user/Apex-Tier-0/src/game.js', content)

    print(f"\nFinal line count: {len(final_lines)}")

    # Verify remaining _orig references
    remaining = []
    for i, line in enumerate(final_lines):
        if '_orig' in line and not line.strip().startswith('//'):
            remaining.append((i + 1, line.strip()[:80]))

    print(f"\nRemaining _orig references: {len(remaining)}")
    for ln, text in remaining:
        print(f"  Line {ln}: {text}")

if __name__ == '__main__':
    main()
