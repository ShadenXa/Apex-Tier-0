// Apex Tier 0 — Pathfinding & Map Engine
// Grid generation, movement ranges, attack ranges

// Note: B (battle state) is accessed via window globals


function generateMap(w, h, theme) {
    // Helper: Check if (0,0) can reach (w-1, h-1)
    const isConnected = (grid) => {
        const q = [{x: 0, y: 0}];
        const visited = new Set(['0,0']);
        let reachedEnd = false;
        
        while (q.length) {
            const {x, y} = q.shift();
            // Check if we reached the enemy spawn area (right side)
            if (x === w - 1) reachedEnd = true;
            
            [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
                    const t = grid[ny][nx];
                    // Only traverse passable terrain
                    if (TERRAINS[t] && TERRAINS[t].passable && !visited.has(`${nx},${ny}`)) {
                        visited.add(`${nx},${ny}`);
                        q.push({x: nx, y: ny});
                    }
                }
            });
        }
        return reachedEnd;
    };

    let grid = [];
    let attempts = 0;
    let valid = false;

    // Retry loop: Keep generating until we get a playable map
    while (!valid && attempts < 50) {
        attempts++;
        grid = [];
        for (let y = 0; y < h; y++) {
            grid.push([]);
            for (let x = 0; x < w; x++) grid[y].push('plain');
        }

        // Pick biome
        currentBiome = typeof pickBiome === 'function' ? pickBiome() : null;
        const biome = currentBiome;

        const addCluster = (type, count) => {
            if (biome?.terrainSwap?.[type]) type = biome.terrainSwap[type];
            for (let i = 0; i < count; i++) {
                const x = 2 + ~~(Math.random() * (w - 4)), y = ~~(Math.random() * h);
                grid[y][x] = type;
                for (let j = 0; j < 2; j++) {
                    const nx = x + ~~(Math.random() * 3) - 1, ny = y + ~~(Math.random() * 3) - 1;
                    if (nx >= 2 && nx < w - 2 && ny >= 0 && ny < h) grid[ny][nx] = type;
                }
            }
        };

        // --- ADJUSTED DENSITY (Fixes clutter/blocking) ---
        addCluster('forest', ~~(w * h * .08)); // Reduced from .12
        addCluster('peak', ~~(w * h * .03));   // Reduced from .04
        addCluster('water', ~~(w * h * .04));  // Reduced from .06
        addCluster('fort', ~~(w * h * .03));
        addCluster('rough', ~~(w * h * .03));  // Reduced from .05
        if (Math.random() < .3) addCluster('lava', ~~(w * h * .03));
        
        // Extra terrain from biome
        if (biome?.extraTerrain) biome.extraTerrain.forEach(t => addCluster(t, ~~(w * h * .03)));

        // Walls (Breakable)
        if (Math.random() < .4) {
            for (let i = 0; i < 3; i++) {
                const wx = 3 + ~~(Math.random() * (w - 6)), wy = ~~(Math.random() * h);
                grid[wy][wx] = 'wall';
            }
        }
        
        // Void pits (Rare)
        if (Math.random() < .15) {
            for (let i = 0; i < 2; i++) {
                const vx = 3 + ~~(Math.random() * (w - 6)), vy = ~~(Math.random() * h);
                grid[vy][vx] = 'void';
            }
        }

        // Ensure spawn areas are clear
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < 2; x++) grid[y][x] = 'plain'; // Player spawn
            for (let x = w - 2; x < w; x++) grid[y][x] = 'plain'; // Enemy spawn
        }

        // Check if map is playable
        valid = isConnected(grid);
    }

    // Failsafe: If RNG creates 50 bad maps, drill a tunnel through the middle
    if (!valid) {
        const midY = ~~(h / 2);
        for (let x = 0; x < w; x++) {
            if (!TERRAINS[grid[midY][x]].passable) grid[midY][x] = 'plain';
        }
    }

    return grid;
}


function unitAt(x,y){return B.allUnits.find(u=>u.x===x&&u.y===y&&u.hp>0);}


function getReachable(unit){
const visited=new Map();
const queue=[{x:unit.x,y:unit.y,cost:0}];
visited.set(`${unit.x},${unit.y}`,0);
const result=[];
while(queue.length){
queue.sort((a,b)=>a.cost-b.cost);
const{x,y,cost}=queue.shift();
for(const[dx,dy]of[[0,-1],[0,1],[-1,0],[1,0]]){
const nx=x+dx,ny=y+dy;
if(nx<0||ny<0||nx>=B.mapW||ny>=B.mapH)continue;
if(!canTraverse(unit,nx,ny))continue;
const nc=cost+moveCost(unit,nx,ny);
if(nc>unit.mov)continue;
const k=`${nx},${ny}`;
if(visited.has(k)&&visited.get(k)<=nc)continue;
const blocker=unitAt(nx,ny);
if(blocker&&blocker!==unit){
// Enemies block completely; allies can be passed through but not landed on
if(blocker.side!==unit.side)continue;
// Can traverse through ally tile — continue pathfinding but don't add as landing spot
if(!visited.has(k)||visited.get(k)>nc){visited.set(k,nc);queue.push({x:nx,y:ny,cost:nc});}
continue;
}
visited.set(k,nc);result.push({x:nx,y:ny,type:'move'});
queue.push({x:nx,y:ny,cost:nc});
}
}return result;
}


function getAtkRange(unit){
const range=(['Bow','Dagger','Sniper'].includes(unit.weapon)||unit.role==='Sniper')?2:1; // Bug #20: add Dagger
const cells=[];
for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++){
const d=Math.abs(dx)+Math.abs(dy);if(d===0||d>range)continue;
if(d<range&&unit.weapon==='Bow')continue; // Bows are 2-only, daggers/snipers hit at 1 and 2
const nx=unit.x+dx,ny=unit.y+dy;
if(nx<0||ny<0||nx>=B.mapW||ny>=B.mapH)continue;
const t=unitAt(nx,ny);
// Highlight enemies OR breakable walls within weapon range
if((t&&t.side!==unit.side)||(B.grid[ny]?.[nx]==='wall'&&wallHpMap&&wallHpMap.has(`${nx},${ny}`)))
cells.push({x:nx,y:ny,type:'attack'});
}return cells;
}


// Exports
export { generateMap, unitAt, getReachable, getAtkRange };
