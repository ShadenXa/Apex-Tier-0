#!/usr/bin/env python3
"""
Phase 3: Extract engine modules from game.js
Creates: audio.js, pathfinding.js, combat.js, state.js
Updates: game.js with import statements
"""
import re

def read_file(path):
    with open(path, 'r') as f:
        return f.readlines()

def write_file(path, lines):
    with open(path, 'w') as f:
        f.writelines(lines)

def find_func_end(lines, start_idx):
    """Find the closing brace of a function starting at start_idx"""
    depth = 0
    started = False
    for i in range(start_idx, len(lines)):
        for ch in lines[i]:
            if ch == '{': depth += 1; started = True
            elif ch == '}': depth -= 1
        if started and depth == 0:
            return i
    return start_idx

def extract_range(lines, start, end):
    """Extract lines[start:end+1] and return them, replacing originals with empty"""
    extracted = lines[start:end+1]
    for i in range(start, end+1):
        lines[i] = ''
    return extracted

def main():
    lines = read_file('src/game.js')

    # ═══════════════════════════════════════════════════════════════
    # AUDIO MODULE: zzfx (lines 10-43) + MaestroV4 (lines 9348-9721)
    # ═══════════════════════════════════════════════════════════════

    audio_header = [
        "// Apex Tier 0 — Audio Engine\n",
        "// zzfx mini synth + sfx wrapper + MaestroV4 procedural music\n",
        "\n",
        "// Note: S.soundOn and bgm are accessed via window globals\n",
        "// These are set up by state.js and game.js respectively\n",
        "\n",
    ]

    # Extract zzfx + sfx (lines 9-43, 0-indexed: 8-42)
    zzfx_lines = extract_range(lines, 8, 42)

    # Extract MaestroV4 class
    # Find it by searching (line numbers may have shifted from earlier extractions)
    maestro_start = None
    maestro_end = None
    for i, line in enumerate(lines):
        if 'class MaestroV4' in line:
            maestro_start = i
            # Also grab the 'use strict' before it
            if i >= 2 and "'use strict'" in lines[i-2]:
                maestro_start = i - 2
            maestro_end = find_func_end(lines, i)
            break

    # Also grab lines between MaestroV4 end and next section (bgm init)
    maestro_extra_end = maestro_end
    for i in range(maestro_end + 1, min(len(lines), maestro_end + 30)):
        stripped = lines[i].strip()
        if stripped == '' or stripped.startswith('//') or 'bgm' in stripped.lower() or '_wasPlaying' in stripped or 'window.bgm' in stripped or 'MaestroV2' in stripped or 'MaestroV4' in stripped:
            maestro_extra_end = i
        else:
            break

    maestro_lines = extract_range(lines, maestro_start, maestro_extra_end)

    # Build audio.js
    audio_content = audio_header + zzfx_lines + ["\n\n"] + maestro_lines

    # Add exports at bottom
    audio_content.append("\n\n// Exports\n")
    audio_content.append("export { zzfx, zzfxG, sfx, MaestroV4 };\n")

    write_file('src/engine/audio.js', audio_content)
    print(f"Created audio.js ({sum(1 for l in audio_content if l.strip())} non-blank lines)")

    # ═══════════════════════════════════════════════════════════════
    # PATHFINDING MODULE: generateMap, unitAt, getReachable, getAtkRange
    # ═══════════════════════════════════════════════════════════════

    path_header = [
        "// Apex Tier 0 — Pathfinding & Map Engine\n",
        "// Grid generation, movement ranges, attack ranges\n",
        "\n",
        "// Note: B (battle state) is accessed via window globals\n",
        "\n",
    ]

    path_functions = []

    # Find and extract each function
    func_names = ['generateMap', 'unitAt', 'getReachable', 'getAtkRange']
    for fname in func_names:
        for i, line in enumerate(lines):
            if f'function {fname}(' in line and lines[i].strip():
                end = find_func_end(lines, i)
                extracted = extract_range(lines, i, end)
                path_functions.extend(['\n'])
                path_functions.extend(extracted)
                path_functions.append('\n')
                print(f"  Extracted {fname}: {end - i + 1} lines")
                break

    path_content = path_header + path_functions
    path_content.append("\n// Exports\n")
    path_content.append("export { generateMap, unitAt, getReachable, getAtkRange };\n")

    write_file('src/engine/pathfinding.js', path_content)
    print(f"Created pathfinding.js ({sum(1 for l in path_content if l.strip())} non-blank lines)")

    # ═══════════════════════════════════════════════════════════════
    # COMBAT MODULE: combat functions
    # ═══════════════════════════════════════════════════════════════

    combat_header = [
        "// Apex Tier 0 — Combat Engine\n",
        "// Damage calculation, combat resolution, battle state management\n",
        "\n",
        "// Note: S, B, CFG and UI functions (drawMap, updateBUI, etc.)\n",
        "// are accessed via window globals\n",
        "\n",
    ]

    combat_functions = []

    combat_func_names = [
        'rollGrade', 'createUnit', 'applyLevel', 'gainExp', 'awardSP',
        'prepUnit', 'createEnemyTeam',
        'calcDmg', 'performCombat',
        'checkBattleOver', 'showWin', 'showLose',
        'applyItemEffects',
    ]

    for fname in combat_func_names:
        found = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if f'function {fname}(' in stripped and stripped:
                end = find_func_end(lines, i)
                extracted = extract_range(lines, i, end)
                combat_functions.extend(['\n'])
                combat_functions.extend(extracted)
                combat_functions.append('\n')
                print(f"  Extracted {fname}: {end - i + 1} lines")
                found = True
                break
        if not found:
            print(f"  WARNING: {fname} not found!")

    combat_content = combat_header + combat_functions
    combat_content.append("\n// Exports\n")
    combat_content.append("export {\n")
    combat_content.append("    rollGrade, createUnit, applyLevel, gainExp, awardSP,\n")
    combat_content.append("    prepUnit, createEnemyTeam,\n")
    combat_content.append("    calcDmg, performCombat,\n")
    combat_content.append("    checkBattleOver, showWin, showLose,\n")
    combat_content.append("    applyItemEffects,\n")
    combat_content.append("};\n")

    write_file('src/engine/combat.js', combat_content)
    print(f"Created combat.js ({sum(1 for l in combat_content if l.strip())} non-blank lines)")

    # ═══════════════════════════════════════════════════════════════
    # STATE MODULE: Constants + S + B + save/load
    # ═══════════════════════════════════════════════════════════════

    state_header = [
        "// Apex Tier 0 — Game State & Configuration\n",
        "// Config constants, game state (S), battle state (B), save/load\n",
        "\n",
    ]

    state_functions = []

    # Extract CFG and constants block (lines 48-370ish)
    # Find CFG start
    cfg_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('const CFG='):
            cfg_start = i
            break

    # Find end of constants block (up to let S={)
    s_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('let S={'):
            s_start = i
            break

    if cfg_start and s_start:
        # Also grab esc() function before CFG
        esc_line = None
        for i in range(cfg_start - 3, cfg_start):
            if 'function esc(' in lines[i]:
                esc_line = i
                break

        start = esc_line if esc_line else cfg_start

        # Extract constants block: from esc/CFG to just before S
        extracted = extract_range(lines, start, s_start - 1)
        state_functions.extend(extracted)

    # Extract S state
    s_end = find_func_end(lines, s_start)
    extracted = extract_range(lines, s_start, s_end)
    state_functions.extend(extracted)
    state_functions.append('\n')

    # Extract uid and other state variables
    state_vars = ['let uid=', 'let sortMode=', 'let batchMode=', 'let batchSelected=', 'let modalIdx=',
                  'let currentBattleMode', 'let currentBattleConfig', 'let currentDifficulty',
                  'let currentCampaign', 'let currentBiome']
    for var_pattern in state_vars:
        for i, line in enumerate(lines):
            if line.strip().startswith(var_pattern):
                extracted = extract_range(lines, i, i)
                state_functions.extend(extracted)
                break
    state_functions.append('\n')

    # Extract PLACEHOLDERS
    for i, line in enumerate(lines):
        if line.strip().startswith('const PLACEHOLDERS='):
            end = find_func_end(lines, i) if '{' in line else i
            # It's an array, find closing ];
            if '[' in line:
                depth = 0
                for j in range(i, len(lines)):
                    depth += lines[j].count('[') - lines[j].count(']')
                    if depth == 0:
                        end = j
                        break
            extracted = extract_range(lines, i, end)
            state_functions.extend(extracted)
            state_functions.append('\n')
            break

    # Extract placeholder functions
    for fname in ['drawPlaceholder', 'makePlaceholderSrc', 'initPlaceholders']:
        for i, line in enumerate(lines):
            if f'function {fname}(' in line and lines[i].strip():
                end = find_func_end(lines, i)
                extracted = extract_range(lines, i, end)
                state_functions.extend(extracted)
                state_functions.append('\n')
                break

    # Extract SAVE_KEY, IDB, save, loadGame
    for i, line in enumerate(lines):
        if "const SAVE_KEY=" in line:
            save_block_start = i
            break

    # Find loadGame end
    for i, line in enumerate(lines):
        if 'async function loadGame()' in line:
            load_end = find_func_end(lines, i)
            break

    # Also include saveGame alias
    save_alias_end = load_end
    for i in range(load_end + 1, min(len(lines), load_end + 5)):
        if 'saveGame' in lines[i]:
            save_alias_end = i

    extracted = extract_range(lines, save_block_start, save_alias_end)
    state_functions.extend(['\n'])
    state_functions.extend(extracted)
    state_functions.append('\n')

    # Extract assignFactionClass, applyTeamSynergies, getSynergySummary
    for fname in ['assignFactionClass', 'applyTeamSynergies', 'getSynergySummary']:
        for i, line in enumerate(lines):
            if f'function {fname}(' in line and lines[i].strip():
                end = find_func_end(lines, i)
                extracted = extract_range(lines, i, end)
                state_functions.extend(extracted)
                state_functions.append('\n')
                break

    state_content = state_header + state_functions
    state_content.append("\n// Exports\n")
    state_content.append("export {\n")
    state_content.append("    esc, CFG, S, B, uid,\n")
    state_content.append("    GRADES, GRADE_WEIGHTS, GRADE_MULT, GRADE_LABEL, GRADE_COLOR,\n")
    state_content.append("    WEAPON_TYPES, WEAPON_TRIANGLE, WEAPON_EFFECTS, WEAPON_COLORS,\n")
    state_content.append("    MOVE_TYPES, MOVE_STATS,\n")
    state_content.append("    FACTIONS, CLASSES, FACTION_SYNERGIES, CLASS_SYNERGIES,\n")
    state_content.append("    ROLES, AB_TRIGGERS, AB_CONDITIONS, AB_EFFECTS, ACTIVE_SPECIALS,\n")
    state_content.append("    generatePassive, C_SKILLS, SEAL_POOL,\n")
    state_content.append("    ORB_COLORS, getOrbColor, TERRAINS,\n")
    state_content.append("    GHB_DATA, ELO_RANKS, getEloRank, CAMPAIGN,\n")
    state_content.append("    PLACEHOLDERS, drawPlaceholder, makePlaceholderSrc, initPlaceholders,\n")
    state_content.append("    SAVE_KEY, save, loadGame, saveGame,\n")
    state_content.append("    assignFactionClass, applyTeamSynergies, getSynergySummary,\n")
    state_content.append("};\n")

    write_file('src/engine/state.js', state_content)
    print(f"Created state.js ({sum(1 for l in state_content if l.strip())} non-blank lines)")

    # ═══════════════════════════════════════════════════════════════
    # UPDATE game.js: Add imports at top, clean empty lines
    # ═══════════════════════════════════════════════════════════════

    import_block = [
        "// Apex Tier 0 — Main Game Logic\n",
        "// Imports engine modules and contains UI/game flow code\n",
        "\n",
        "import {\n",
        "    esc, CFG, S, B, uid,\n",
        "    GRADES, GRADE_WEIGHTS, GRADE_MULT, GRADE_LABEL, GRADE_COLOR,\n",
        "    WEAPON_TYPES, WEAPON_TRIANGLE, WEAPON_EFFECTS, WEAPON_COLORS,\n",
        "    MOVE_TYPES, MOVE_STATS,\n",
        "    FACTIONS, CLASSES, FACTION_SYNERGIES, CLASS_SYNERGIES,\n",
        "    ROLES, AB_TRIGGERS, AB_CONDITIONS, AB_EFFECTS, ACTIVE_SPECIALS,\n",
        "    generatePassive, C_SKILLS, SEAL_POOL,\n",
        "    ORB_COLORS, getOrbColor, TERRAINS,\n",
        "    GHB_DATA, ELO_RANKS, getEloRank, CAMPAIGN,\n",
        "    PLACEHOLDERS, drawPlaceholder, makePlaceholderSrc, initPlaceholders,\n",
        "    SAVE_KEY, save, loadGame, saveGame,\n",
        "    assignFactionClass, applyTeamSynergies, getSynergySummary,\n",
        "} from './engine/state.js';\n",
        "\n",
        "import { zzfx, zzfxG, sfx, MaestroV4 } from './engine/audio.js';\n",
        "\n",
        "import { generateMap, unitAt, getReachable, getAtkRange } from './engine/pathfinding.js';\n",
        "\n",
        "import {\n",
        "    rollGrade, createUnit, applyLevel, gainExp, awardSP,\n",
        "    prepUnit, createEnemyTeam,\n",
        "    calcDmg, performCombat,\n",
        "    checkBattleOver, showWin, showLose,\n",
        "    applyItemEffects,\n",
        "} from './engine/combat.js';\n",
        "\n",
        "// Re-export to window for onclick handlers and cross-module access\n",
        "Object.assign(window, {\n",
        "    S, B, CFG, esc, sfx, zzfx, save, loadGame, saveGame,\n",
        "    generateMap, unitAt, getReachable, getAtkRange,\n",
        "    rollGrade, createUnit, applyLevel, gainExp, awardSP,\n",
        "    prepUnit, createEnemyTeam, calcDmg, performCombat,\n",
        "    checkBattleOver, showWin, showLose, applyItemEffects,\n",
        "    assignFactionClass, applyTeamSynergies, getSynergySummary,\n",
        "    GRADES, GRADE_WEIGHTS, GRADE_MULT, GRADE_LABEL, GRADE_COLOR,\n",
        "    WEAPON_TYPES, WEAPON_TRIANGLE, WEAPON_EFFECTS, WEAPON_COLORS,\n",
        "    MOVE_TYPES, MOVE_STATS, FACTIONS, CLASSES,\n",
        "    FACTION_SYNERGIES, CLASS_SYNERGIES,\n",
        "    ROLES, AB_TRIGGERS, AB_CONDITIONS, AB_EFFECTS, ACTIVE_SPECIALS,\n",
        "    generatePassive, C_SKILLS, SEAL_POOL,\n",
        "    ORB_COLORS, getOrbColor, TERRAINS,\n",
        "    GHB_DATA, ELO_RANKS, getEloRank, CAMPAIGN,\n",
        "    PLACEHOLDERS, drawPlaceholder, makePlaceholderSrc, initPlaceholders,\n",
        "    MaestroV4, zzfxG,\n",
        "});\n",
        "\n",
    ]

    # Remove old header lines
    for i in range(min(8, len(lines))):
        if lines[i].strip().startswith('//') or lines[i].strip().startswith('/*') or lines[i].strip().startswith('*') or lines[i].strip() == '':
            lines[i] = ''

    # Clean consecutive blank lines (max 2)
    final_lines = import_block[:]
    blank_count = 0
    for line in lines:
        if line == '':
            continue
        if line.strip() == '':
            blank_count += 1
            if blank_count <= 2:
                final_lines.append(line)
        else:
            blank_count = 0
            final_lines.append(line)

    write_file('src/game.js', final_lines)
    print(f"\nUpdated game.js ({sum(1 for l in final_lines if l.strip())} non-blank lines)")
    print(f"Total lines: {len(final_lines)}")

if __name__ == '__main__':
    main()
