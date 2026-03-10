#!/usr/bin/env python3
"""
Phase 2 Merge Script: Consolidate all monkey patches in game.js.

Architecture:
1. Parse game.js to find all original functions and all their override chains
2. For each patched function: extract new code from patches, merge into original
3. Extract new standalone code from patch blocks (new functions, MaestroV4, etc.)
4. Delete all patch blocks, IIFEs, _orig vars, obsolete classes
5. Write the consolidated game.js
"""
import re
import sys

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def find_block_end(lines, start_idx):
    """Find the closing brace of a block starting at start_idx by tracking {}."""
    depth = 0
    started = False
    for i in range(start_idx, len(lines)):
        for ch in lines[i]:
            if ch == '{':
                depth += 1
                started = True
            elif ch == '}':
                depth -= 1
                if started and depth == 0:
                    return i
    return len(lines) - 1


def find_orig_call_in_range(lines, start, end):
    """Find the first line that calls _orig/_patched/_current within [start, end)."""
    for i in range(start, end):
        stripped = lines[i].strip()
        # Skip declarations, comments, and if-statements
        if stripped.startswith(('const ', 'let ', 'var ', '//')):
            continue
        # Check for _orig call patterns
        if re.search(r'_orig\w*\s*[\.(]|_orig\w*\.apply|_patched\w*\s*[\.(]|_current\w*\s*[\.(]', stripped):
            return i
    return None


def extract_function_body_lines(lines, func_start, func_end):
    """Extract the function body lines (between opening { and closing })."""
    # func_start is the line with 'function name(' or 'window.name = function('
    # Find the opening brace on func_start line
    body_start = func_start + 1  # Line after the function declaration
    body_end = func_end  # The closing brace line
    return lines[body_start:body_end]


def main():
    content = read_file('/home/user/Apex-Tier-0/src/game.js')
    lines = content.split('\n')
    N = len(lines)

    print(f"=== Phase 2: Consolidating Monkey Patches ===")
    print(f"Input: {N} lines, {content.count('_orig')} _orig references\n")

    # ================================================================
    # PHASE A: Build complete map of all functions and their overrides
    # ================================================================

    # Find all original function definitions (in the main code, roughly lines 0-5300)
    orig_funcs = {}  # name -> (start, end)
    for i, line in enumerate(lines):
        m = re.match(r'^function\s+(\w+)\s*\(', line.strip())
        if m:
            name = m.group(1)
            end = find_block_end(lines, i)
            if name not in orig_funcs:
                orig_funcs[name] = (i, end)

    print(f"Found {len(orig_funcs)} function definitions")

    # Find all override assignments (window.name = function... or name = function...)
    # Also track the _orig declaration that precedes each
    overrides = []  # list of {name, orig_var, decl_line, func_start, func_end, complete_replacement}

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Match: const _origXxx = someFunc;
        m_decl = re.match(r'^(?:const|let|var)\s+((_orig|_patched)\w*)\s*=\s*(\w+)', stripped)
        if not m_decl:
            continue

        orig_var = m_decl.group(1)
        captured_func = m_decl.group(3)

        # Look for the associated override in the next 5 lines
        for j in range(i + 1, min(i + 8, N)):
            sj = lines[j].strip()
            # Match: window.name = function( or name = function( or window.name = name = function(
            m_override = re.match(r'(?:window\.)?(\w+)\s*=\s*(?:\w+\s*=\s*)?function\s*[\(]', sj)
            if m_override:
                func_name = m_override.group(1)
                func_end = find_block_end(lines, j)

                # Check if this override calls _orig (is it a wrapper or complete replacement?)
                orig_call = find_orig_call_in_range(lines, j + 1, func_end)

                overrides.append({
                    'name': func_name,
                    'orig_var': orig_var,
                    'decl_line': i,
                    'func_start': j,
                    'func_end': func_end,
                    'is_complete_replacement': orig_call is None,
                    'orig_call_line': orig_call,
                })
                break

    print(f"Found {len(overrides)} override assignments")

    # Group overrides by function name
    overrides_by_func = {}
    for ov in overrides:
        name = ov['name']
        if name not in overrides_by_func:
            overrides_by_func[name] = []
        overrides_by_func[name].append(ov)

    print(f"Functions with overrides: {list(overrides_by_func.keys())}")

    # ================================================================
    # PHASE B: For each patched function, merge all overrides into original
    # ================================================================

    # Tracking: lines to delete, lines to insert
    delete_set = set()
    # insert_before[line_idx] = list of strings to insert before that line
    insert_before = {}
    # replace_range[line_idx] = (end_idx, replacement_lines)
    replace_range = {}

    def mark_delete(start, end):
        for i in range(start, end + 1):
            delete_set.add(i)

    for func_name, func_overrides in overrides_by_func.items():
        # Sort by line number (order of application)
        func_overrides.sort(key=lambda x: x['func_start'])

        # Check if we have an original definition
        if func_name not in orig_funcs:
            # No original function definition - these overrides define the function
            # Just keep the latest version
            print(f"  {func_name}: no original def found, keeping latest override")
            # Delete all but the latest
            for ov in func_overrides[:-1]:
                mark_delete(ov['decl_line'], ov['decl_line'])
                mark_delete(ov['func_start'], ov['func_end'])
            # Convert latest to a function declaration
            latest = func_overrides[-1]
            mark_delete(latest['decl_line'], latest['decl_line'])
            # Convert window.name = function() to function name()
            old_line = lines[latest['func_start']]
            new_line = re.sub(
                r'(?:window\.)?(\w+)\s*=\s*(?:\w+\s*=\s*)?function\s*',
                rf'function {func_name}',
                old_line
            )
            lines[latest['func_start']] = new_line
            continue

        orig_start, orig_end = orig_funcs[func_name]

        # Check if the last override is a complete replacement
        if func_overrides[-1]['is_complete_replacement']:
            # Use the LATEST complete replacement as the canonical definition
            # Find the last complete replacement
            last_complete = None
            for ov in reversed(func_overrides):
                if ov['is_complete_replacement']:
                    last_complete = ov
                    break

            if last_complete:
                # Extract the latest version's body
                latest_lines = lines[last_complete['func_start']:last_complete['func_end'] + 1]
                # Convert to function declaration
                latest_lines[0] = re.sub(
                    r'(?:window\.)?(\w+)\s*=\s*(?:\w+\s*=\s*)?function\s*',
                    rf'function {func_name}',
                    latest_lines[0]
                )
                # Remove any remaining _orig calls from this body (they reference deleted functions)
                cleaned = []
                for ln in latest_lines:
                    s = ln.strip()
                    # Skip standalone _orig calls
                    if re.match(r'_orig\w*\s*[\.(]', s) or re.match(r'_orig\w*\.apply', s):
                        continue
                    # Skip lines like: const result = _origXxx(...)
                    if re.match(r'(?:const|let|var)\s+\w+\s*=\s*_orig', s):
                        continue
                    # Replace _orig references in return statements
                    if '_orig' in ln:
                        ln = re.sub(r'return\s+_orig\w*\(', f'return /* merged */ (', ln)
                    cleaned.append(ln)

                # Replace original with this version
                replace_range[orig_start] = (orig_end, cleaned)

                # Delete ALL overrides
                for ov in func_overrides:
                    mark_delete(ov['decl_line'], ov['decl_line'])
                    mark_delete(ov['func_start'], ov['func_end'])

                print(f"  {func_name}: REPLACED with complete version from line {last_complete['func_start']+1}")
                continue

        # For wrapper overrides: merge by extracting pre/post code from each patch
        all_pre_code = []  # code to prepend (in reverse patch order)
        all_post_code = []  # code to append (in patch order)

        for ov in func_overrides:
            if ov['is_complete_replacement']:
                # This is a complete replacement in the middle of a chain
                # The later wrappers call THIS version which doesn't call the original
                # Treat its body as the new "original"
                # For now, extract its body as post-code minus any _orig calls
                body = lines[ov['func_start'] + 1:ov['func_end']]
                # Remove wrapper artifacts
                cleaned_body = []
                for ln in body:
                    s = ln.strip()
                    if s.startswith(('const _orig', 'let _orig', 'var _orig')):
                        continue
                    if re.match(r'_orig\w*[\.(]', s):
                        continue
                    cleaned_body.append(ln)
                if cleaned_body:
                    all_post_code.append(f'// --- From complete-replacement patch at line {ov["func_start"]+1} ---')
                    all_post_code.extend(cleaned_body)
            else:
                # Wrapper: split around the _orig call
                call_line = ov['orig_call_line']
                body_start = ov['func_start'] + 1
                body_end = ov['func_end']

                # Pre-code: everything before the _orig call
                pre = lines[body_start:call_line]
                pre = [l for l in pre if l.strip() and not l.strip().startswith('//')]

                # Post-code: everything after the _orig call
                post = lines[call_line + 1:body_end]
                # Strip trailing empty lines
                while post and not post[-1].strip():
                    post.pop()

                if pre:
                    all_pre_code.append(f'// --- Pre-code from patch at line {ov["func_start"]+1} ---')
                    all_pre_code.extend(pre)

                if post:
                    all_post_code.append(f'// --- Post-code from patch at line {ov["func_start"]+1} ---')
                    all_post_code.extend(post)

            # Mark override for deletion
            mark_delete(ov['decl_line'], ov['decl_line'])
            mark_delete(ov['func_start'], ov['func_end'])

        # Insert pre-code after original function's opening brace
        if all_pre_code:
            if orig_start + 1 not in insert_before:
                insert_before[orig_start + 1] = []
            insert_before[orig_start + 1].extend(all_pre_code)

        # Insert post-code before original function's closing brace
        if all_post_code:
            if orig_end not in insert_before:
                insert_before[orig_end] = []
            insert_before[orig_end].extend(all_post_code)

        n_patches = len(func_overrides)
        n_pre = len([l for l in all_pre_code if not l.startswith('//')])
        n_post = len([l for l in all_post_code if not l.startswith('//')])
        print(f"  {func_name}: merged {n_patches} patches (+{n_pre} pre, +{n_post} post lines)")

    # ================================================================
    # PHASE C: Extract new standalone code from IIFE patch blocks
    # ================================================================

    # Find all IIFEs after line 5300
    iife_ranges = []
    for i, line in enumerate(lines):
        if i < 5300:
            continue
        stripped = line.strip()
        if re.match(r'^\(function\s*\w*\s*\(\)\s*\{', stripped):
            end = find_block_end(lines, i)
            # Include })(); line
            for j in range(end, min(end + 3, N)):
                if '})()' in lines[j]:
                    end = j
                    break
            iife_ranges.append((i, end))

    print(f"\nFound {len(iife_ranges)} IIFE blocks")

    # Set of line ranges that are INSIDE already-processed overrides
    override_line_set = set()
    for ov in overrides:
        for i in range(ov['decl_line'], ov['func_end'] + 1):
            override_line_set.add(i)

    # Known patched function names (don't extract these from IIFEs)
    patched_names = set(overrides_by_func.keys())

    new_code_blocks = []

    for iife_start, iife_end in iife_ranges:
        extracted = []
        j = iife_start + 1  # Skip opening line

        while j < iife_end:
            stripped = lines[j].strip()

            # Skip _orig declarations
            if re.match(r'^(?:const|let|var)\s+_orig', stripped) or \
               re.match(r'^(?:const|let|var)\s+_patched', stripped):
                j += 1
                continue

            # Skip window.func = function() overrides (already processed)
            if re.match(r'(?:window\.)?\w+\s*=\s*(?:\w+\s*=\s*)?function\s*\(', stripped) and \
               not re.match(r'^function\s', stripped):
                func_end = find_block_end(lines, j)
                j = func_end + 1
                while j < iife_end and lines[j].strip() in ('', ';', '};'):
                    j += 1
                continue

            # Skip console.log patch messages
            if re.match(r"console\.log\('%c", stripped):
                j += 1
                continue

            # Skip patch comment headers
            if stripped.startswith(('// ╔', '// ║', '// ╚', '// ═', '// ||')):
                j += 1
                continue
            if re.match(r'// (MEGA |HOTFIX|PATCH|11K|Patch )', stripped):
                j += 1
                continue

            # Keep everything else (new functions, classes, variables, logic)
            extracted.append(lines[j])
            j += 1

        # Clean up
        while extracted and not extracted[0].strip():
            extracted.pop(0)
        while extracted and not extracted[-1].strip():
            extracted.pop()

        if extracted:
            has_maestro = any('class MaestroV4' in l for l in extracted)
            new_code_blocks.append({
                'source': iife_start,
                'lines': extracted,
                'has_maestro': has_maestro,
            })

        # Mark entire IIFE for deletion
        mark_delete(iife_start, iife_end)

    print(f"Extracted new code from {len(new_code_blocks)} IIFEs")

    # ================================================================
    # PHASE D: Delete obsolete classes, bgm inits, patch logs, comments
    # ================================================================

    # Delete Maestro V1/V2/V3 classes
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'^class Maestro\s*\{', stripped) or \
           re.match(r'^class MaestroV2\s*\{', stripped) or \
           re.match(r'^class MaestroV3\s*\{', stripped):
            end = find_block_end(lines, i)
            mark_delete(i, end)
            print(f"  Deleted obsolete class at line {i+1}")

    # Delete old bgm inits
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'(?:const|let)\s+bgm\s*=\s*new\s+Maestro\s*\(', stripped) or \
           re.match(r'window\.bgm\s*=\s*new\s+Maestro(V2|V3)\s*\(', stripped):
            mark_delete(i, i)

    # Delete patch console.logs (outside IIFEs - inside ones already deleted)
    for i, line in enumerate(lines):
        if i in delete_set:
            continue
        stripped = line.strip()
        if re.match(r"console\.log\('%c", stripped) and \
           any(kw in stripped for kw in ['PATCH', 'HOTFIX', 'LOADING', 'APPLIED', 'COMPLETE',
                                          'MEGA', 'PATCHER', 'CONVERGENCE', 'loaded', '✓']):
            mark_delete(i, i)

    # Delete standalone patch comment headers (after line 5300)
    for i, line in enumerate(lines):
        if i < 5300 or i in delete_set:
            continue
        stripped = line.strip()
        if stripped.startswith(('// ╔═', '// ║', '// ╚═', '// ═══', '// ||')):
            mark_delete(i, i)
        elif re.match(r'// (MEGA PATCH|HOTFIX|PATCH|11K|Patch )', stripped):
            mark_delete(i, i)

    # ================================================================
    # PHASE E: Assemble the final output
    # ================================================================

    result_lines = []

    for i, line in enumerate(lines):
        # Handle range replacements
        if i in replace_range:
            end_idx, replacement = replace_range[i]
            result_lines.extend(replacement)
            mark_delete(i, end_idx)  # Mark remaining lines in range as deleted
            continue

        # Insert before this line
        if i in insert_before:
            result_lines.extend(insert_before[i])

        # Skip deleted lines (including those from replace_range)
        if i in delete_set:
            continue

        result_lines.append(line)

    # Append extracted new code at the end
    result_lines.append('')
    result_lines.append('// ═══════════════════════════════════════════════════════════')
    result_lines.append('// CONSOLIDATED PATCH CODE — New features extracted from patches')
    result_lines.append('// ═══════════════════════════════════════════════════════════')
    result_lines.append('')

    for block in new_code_blocks:
        result_lines.append(f'// --- From patch block at original line {block["source"]+1} ---')
        result_lines.extend(block['lines'])
        result_lines.append('')

    # Final cleanup: remove _orig references that snuck through
    final_content = '\n'.join(result_lines)

    # Count remaining issues
    remaining_orig = len(re.findall(r'_orig\w*', final_content))
    remaining_patched = len(re.findall(r'_patched\w*', final_content))

    # Clean up consecutive blank lines (max 2)
    final_content = re.sub(r'\n{4,}', '\n\n\n', final_content)

    result_line_count = final_content.count('\n') + 1

    print(f"\n=== RESULTS ===")
    print(f"Input: {N} lines")
    print(f"Output: {result_line_count} lines")
    print(f"Lines deleted: {len(delete_set)}")
    print(f"Remaining _orig references: {remaining_orig}")
    print(f"Remaining _patched references: {remaining_patched}")

    write_file('/home/user/Apex-Tier-0/src/game.js', final_content)
    print(f"\nWritten to src/game.js")

    return remaining_orig + remaining_patched

if __name__ == '__main__':
    remaining = main()
    if remaining > 0:
        print(f"\nWARNING: {remaining} _orig/_patched references remain — manual cleanup needed")
    sys.exit(0)
