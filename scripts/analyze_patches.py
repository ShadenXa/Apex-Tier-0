#!/usr/bin/env python3
"""
Phase 2 Merge Script: Consolidate all monkey patches in game.js
Strategy: Read game.js, find each patched function and its overrides,
produce a single merged version, delete patch blocks.
"""
import re
import sys

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def find_function_end(lines, start_line_idx):
    """Find the end of a function/block starting at start_line_idx by tracking braces."""
    depth = 0
    started = False
    for i in range(start_line_idx, len(lines)):
        for ch in lines[i]:
            if ch == '{':
                depth += 1
                started = True
            elif ch == '}':
                depth -= 1
                if started and depth == 0:
                    return i
    return len(lines) - 1

def find_block_end(lines, start_idx):
    """Find end of a block (function, IIFE, etc) starting at start_idx."""
    return find_function_end(lines, start_idx)

def extract_lines(lines, start, end):
    """Extract lines[start:end+1] as a string."""
    return '\n'.join(lines[start:end+1])

def main():
    content = read_file('/home/user/Apex-Tier-0/src/game.js')
    lines = content.split('\n')

    # Track regions to delete (start_line, end_line) - 0-indexed
    deletions = []
    # Track replacements: (start_line, end_line, new_content)
    replacements = []

    # === STEP 1: Find all IIFE patch blocks to delete ===
    # These are the major patch IIFEs that contain monkey-patch code
    iife_starts = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Match IIFE openings like (function() { or (function patchName() {
        if re.match(r'^\(function\s*\w*\s*\(\)\s*\{', stripped):
            # Check this isn't a utility IIFE (initBG, drawHomeEmblem, drawOrb)
            # Those are at lines < 700 in the original and are NOT patches
            if i < 640:  # Skip early utility IIFEs
                continue
            iife_starts.append(i)

    # Find the end of each IIFE
    iife_blocks = []
    for start in iife_starts:
        end = find_block_end(lines, start)
        # Check if the next line(s) contain })();
        for j in range(end, min(end + 3, len(lines))):
            if '})()' in lines[j] or '});' in lines[j]:
                end = j
                break
        iife_blocks.append((start, end))

    print(f"Found {len(iife_blocks)} IIFE patch blocks")
    for start, end in iife_blocks:
        print(f"  IIFE: lines {start+1}-{end+1}: {lines[start].strip()[:60]}")

    # === STEP 2: Find all standalone patch code (not in IIFEs) ===
    # These are lines like:
    #   const _origFoo = foo;
    #   window.foo = function() { ... }
    # that exist OUTSIDE of IIFEs

    # First, build a set of line numbers that are INSIDE IIFEs
    iife_line_set = set()
    for start, end in iife_blocks:
        for i in range(start, end + 1):
            iife_line_set.add(i)

    # Find standalone _orig declarations outside IIFEs
    standalone_patches = []
    for i, line in enumerate(lines):
        if i in iife_line_set:
            continue
        stripped = line.strip()
        if re.match(r'^(const|let|var)\s+_orig', stripped):
            standalone_patches.append(i)
        elif re.match(r'^const _patchedUpdate', stripped):
            standalone_patches.append(i)

    print(f"\nFound {len(standalone_patches)} standalone _orig declarations outside IIFEs:")
    for i in standalone_patches:
        print(f"  Line {i+1}: {lines[i].strip()[:80]}")

    # === STEP 3: Find console.log patch messages outside IIFEs ===
    patch_logs = []
    for i, line in enumerate(lines):
        if i in iife_line_set:
            continue
        stripped = line.strip()
        if re.match(r"console\.log\('%c", stripped):
            patch_logs.append(i)

    print(f"\nFound {len(patch_logs)} console.log patch messages outside IIFEs")

    # === STEP 4: Identify Maestro V1/V2/V3 classes ===
    maestro_classes = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'^class Maestro[^V]|^class MaestroV2|^class MaestroV3', stripped):
            end = find_block_end(lines, i)
            maestro_classes.append((i, end))
            print(f"\nFound obsolete Maestro class at line {i+1}-{end+1}: {stripped[:40]}")

    # Also find const bgm = new Maestro() instances (not MaestroV4)
    bgm_inits = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'(const|let|var|window\.)\s*bgm\s*=\s*new\s+Maestro[^V]', stripped) or \
           re.match(r'window\.bgm\s*=\s*new\s+Maestro(V2|V3)', stripped):
            bgm_inits.append(i)
            print(f"Found obsolete bgm init at line {i+1}: {stripped[:60]}")

    # === STEP 5: Find _orig-based override blocks outside IIFEs ===
    # These typically span: const _orig = func; window.func = function() { ... };
    # We need to find the whole block including the replacement function
    override_blocks = []
    for i in standalone_patches:
        # Find the end of the override block
        # Pattern: const _orig = foo; followed by window.foo = function() {...}
        # or foo = function() {...}
        block_end = i
        # Look forward for the replacement function
        for j in range(i + 1, min(i + 5, len(lines))):
            stripped = lines[j].strip()
            if re.match(r'(window\.\w+\s*=|(\w+)\s*=\s*function)', stripped):
                func_end = find_block_end(lines, j)
                block_end = func_end
                # Check for trailing semicolons
                if block_end + 1 < len(lines) and lines[block_end + 1].strip() in [';', '};']:
                    block_end += 1
                break
        override_blocks.append((i, block_end))

    print(f"\nOverride blocks to delete:")
    for start, end in override_blocks:
        print(f"  Lines {start+1}-{end+1}")

    # === OUTPUT SUMMARY ===
    print(f"\n=== SUMMARY ===")
    print(f"IIFE blocks to delete: {len(iife_blocks)}")
    print(f"Override blocks to delete: {len(override_blocks)}")
    print(f"Patch console.logs to delete: {len(patch_logs)}")
    print(f"Obsolete Maestro classes to delete: {len(maestro_classes)}")
    print(f"Obsolete bgm inits to delete: {len(bgm_inits)}")

    total_lines_to_delete = sum(e - s + 1 for s, e in iife_blocks) + \
                            sum(e - s + 1 for s, e in override_blocks) + \
                            len(patch_logs) + \
                            sum(e - s + 1 for s, e in maestro_classes) + \
                            len(bgm_inits)
    print(f"Total lines affected: ~{total_lines_to_delete}")
    print(f"Original line count: {len(lines)}")

if __name__ == '__main__':
    main()
