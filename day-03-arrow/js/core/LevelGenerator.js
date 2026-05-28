/**
 * Level Generator - generates random solvable arrow puzzles
 * 
 * Core Algorithm: Incremental Generation with Cycle Prevention
 * 
 * Instead of generating all arrows then removing problematic ones,
 * we generate each arrow one by one and immediately verify that adding it
 * doesn't create a cycle in the dependency graph. This ensures:
 * 1. Maximum coverage (no arrows need to be removed)
 * 2. Guaranteed solvability (DAG property maintained at all times)
 * 
 * Key strategies for high coverage:
 * - Prioritize growth directions that lead toward edges (easier escape)
 * - Try multiple growth patterns before giving up on a cell
 * - For isolated empty cells, extend existing arrows or create length-2 arrows
 * - The arrow's direction is ALWAYS the natural direction of its last segment
 */

import {
  GRID_COLS, GRID_ROWS, MIN_LENGTH, MAX_LENGTH,
  DIR, ALL_DIRS, ARROW_COLORS
} from './config.js';

let nextId = 1;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function inBounds(x, y) {
  return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
}

/**
 * Get the natural direction of an arrow from its segments.
 * Direction = from second-to-last segment to last segment (the head).
 */
function getNaturalDirection(segments) {
  if (segments.length < 2) return null;
  const prev = segments[segments.length - 2];
  const head = segments[segments.length - 1];
  const dx = head.x - prev.x;
  const dy = head.y - prev.y;
  for (const dir of ALL_DIRS) {
    if (dir.dx === dx && dir.dy === dy) {
      return dir;
    }
  }
  return null;
}

/**
 * Check if the dependency graph has a cycle using DFS.
 * Returns true if there's a cycle (unsolvable).
 */
function hasCycle(deps, allIds) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of allIds) {
    color.set(id, WHITE);
  }

  function dfs(node) {
    color.set(node, GRAY);
    const neighbors = deps.get(node) || new Set();
    for (const next of neighbors) {
      if (!color.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) return true;
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const id of allIds) {
    if (color.get(id) === WHITE) {
      if (dfs(id)) return true;
    }
  }
  return false;
}

/**
 * Build dependency graph for all arrows.
 * Arrow A depends on arrow B if B occupies any cell in A's escape path.
 */
function buildDependencyGraph(arrows, grid) {
  const deps = new Map();

  for (const arrow of arrows) {
    const dir = arrow.direction;
    const head = arrow.segments[arrow.segments.length - 1];
    const blockerSet = new Set();

    let cx = head.x + dir.dx;
    let cy = head.y + dir.dy;

    while (inBounds(cx, cy)) {
      const cellVal = grid[cy][cx];
      if (cellVal !== 0 && cellVal !== arrow.id) {
        blockerSet.add(cellVal);
      }
      cx += dir.dx;
      cy += dir.dy;
    }

    deps.set(arrow.id, blockerSet);
  }

  return deps;
}

/**
 * Check if adding a new arrow would create a cycle in the dependency graph.
 * This is an incremental check - much faster than rebuilding the full graph.
 */
function wouldCreateCycle(newArrow, existingArrows, grid) {
  // Temporarily add the new arrow to the grid
  const tempGrid = grid.map(row => [...row]);
  for (const seg of newArrow.segments) {
    tempGrid[seg.y][seg.x] = newArrow.id;
  }

  // Build dependency graph with the new arrow included
  const allArrows = [...existingArrows, newArrow];
  const deps = buildDependencyGraph(allArrows, tempGrid);
  const allIds = allArrows.map(a => a.id);

  return hasCycle(deps, allIds);
}

/**
 * Calculate how many steps an arrow needs to escape (distance to edge in its direction).
 * Lower is better (easier to escape).
 */
function distanceToEdge(segments, direction) {
  const head = segments[segments.length - 1];
  const dir = direction;
  let dist = 0;
  let cx = head.x + dir.dx;
  let cy = head.y + dir.dy;
  while (inBounds(cx, cy)) {
    dist++;
    cx += dir.dx;
    cy += dir.dy;
  }
  return dist;
}

/**
 * Count how many empty neighbors a cell would have if we mark certain cells as occupied.
 */
function countEmptyNeighbors(x, y, grid, occupied) {
  let count = 0;
  for (const dir of ALL_DIRS) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (inBounds(nx, ny) && grid[ny][nx] === 0 && !occupied.has(`${nx},${ny}`)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if placing segments would create any isolated empty cells
 * (cells with no empty neighbors, making them impossible to fill).
 */
function wouldCreateIsolation(segments, grid) {
  const occupied = new Set(segments.map(s => `${s.x},${s.y}`));
  
  // Check all cells adjacent to the segments
  for (const seg of segments) {
    for (const dir of ALL_DIRS) {
      const nx = seg.x + dir.dx;
      const ny = seg.y + dir.dy;
      if (!inBounds(nx, ny)) continue;
      if (grid[ny][nx] !== 0) continue; // already occupied
      if (occupied.has(`${nx},${ny}`)) continue; // part of this arrow
      
      // This is an empty neighbor - check if it would become isolated
      if (countEmptyNeighbors(nx, ny, grid, occupied) === 0) {
        return true; // Would create an isolated cell
      }
    }
  }
  return false;
}

/**
 * Grow an arrow from a starting position.
 * Returns multiple candidate arrows sorted by escape ease.
 * Avoids creating isolated empty cells during growth.
 */
function growArrowCandidates(startX, startY, grid, targetLength, maxCandidates = 8) {
  if (grid[startY][startX] !== 0) return [];

  const candidates = [];

  for (let attempt = 0; attempt < maxCandidates * 4; attempt++) {
    const segments = [{ x: startX, y: startY }];
    const visited = new Set([`${startX},${startY}`]);

    for (let step = 1; step < targetLength; step++) {
      const last = segments[segments.length - 1];
      const neighbors = [];
      for (const dir of ALL_DIRS) {
        const nx = last.x + dir.dx;
        const ny = last.y + dir.dy;
        if (inBounds(nx, ny) && grid[ny][nx] === 0 && !visited.has(`${nx},${ny}`)) {
          neighbors.push({ x: nx, y: ny });
        }
      }
      if (neighbors.length === 0) break;
      
      // Prefer neighbors that don't create isolated cells
      const safeNeighbors = neighbors.filter(n => {
        const testSegs = [...segments, n];
        const testOccupied = new Set(testSegs.map(s => `${s.x},${s.y}`));
        // Check if any adjacent empty cell would become isolated
        for (const dir of ALL_DIRS) {
          const ax = n.x + dir.dx;
          const ay = n.y + dir.dy;
          if (!inBounds(ax, ay)) continue;
          if (grid[ay][ax] !== 0 || testOccupied.has(`${ax},${ay}`)) continue;
          if (countEmptyNeighbors(ax, ay, grid, testOccupied) === 0) return false;
        }
        return true;
      });
      
      const chosen = safeNeighbors.length > 0 ? safeNeighbors : neighbors;
      shuffle(chosen);
      segments.push(chosen[0]);
      visited.add(`${chosen[0].x},${chosen[0].y}`);
    }

    if (segments.length < MIN_LENGTH) continue;

    const direction = getNaturalDirection(segments);
    if (!direction) continue;

    // Skip if this would create isolated cells
    if (wouldCreateIsolation(segments, grid)) continue;

    // Check if this candidate is unique
    if (candidates.some(c => {
      const h = c.segments[c.segments.length - 1];
      return h.x === segments[segments.length - 1].x && 
             h.y === segments[segments.length - 1].y &&
             c.direction.dx === direction.dx && c.direction.dy === direction.dy;
    })) continue;

    candidates.push({ segments, direction });
    if (candidates.length >= maxCandidates) break;
  }

  // Sort by distance to edge (prefer arrows that can escape easily)
  candidates.sort((a, b) => {
    return distanceToEdge(a.segments, a.direction) - distanceToEdge(b.segments, b.direction);
  });

  return candidates;
}

/**
 * Try to grow an arrow specifically ending at a given direction.
 * This is used to fill gaps by creating arrows that point toward edges.
 */
function growArrowWithDirection(startX, startY, grid, targetLength, preferredDir) {
  if (grid[startY][startX] !== 0) return null;

  // Strategy: grow the arrow so the last step is in the preferred direction
  // This means the second-to-last point should be at (endX - dir.dx, endY - dir.dy)
  
  const segments = [{ x: startX, y: startY }];
  const visited = new Set([`${startX},${startY}`]);

  for (let step = 1; step < targetLength; step++) {
    const last = segments[segments.length - 1];
    const neighbors = [];
    
    for (const dir of ALL_DIRS) {
      const nx = last.x + dir.dx;
      const ny = last.y + dir.dy;
      if (inBounds(nx, ny) && grid[ny][nx] === 0 && !visited.has(`${nx},${ny}`)) {
        // On the last step, prefer the preferred direction
        const isLastStep = (step === targetLength - 1);
        const isPreferred = (dir.dx === preferredDir.dx && dir.dy === preferredDir.dy);
        neighbors.push({ x: nx, y: ny, priority: isLastStep && isPreferred ? 0 : 1 });
      }
    }
    
    if (neighbors.length === 0) break;
    neighbors.sort((a, b) => a.priority - b.priority);
    
    // If last step and preferred direction available, use it; otherwise random
    if (neighbors[0].priority === 0) {
      segments.push({ x: neighbors[0].x, y: neighbors[0].y });
      visited.add(`${neighbors[0].x},${neighbors[0].y}`);
    } else {
      shuffle(neighbors);
      segments.push({ x: neighbors[0].x, y: neighbors[0].y });
      visited.add(`${neighbors[0].x},${neighbors[0].y}`);
    }
  }

  if (segments.length < MIN_LENGTH) return null;

  const direction = getNaturalDirection(segments);
  if (!direction) return null;

  return { segments, direction };
}

/**
 * Get the best escape direction for a given position.
 * Returns the direction that has the shortest path to the edge.
 */
function getBestEscapeDir(x, y) {
  const distances = [
    { dir: DIR.LEFT, dist: x },
    { dir: DIR.RIGHT, dist: GRID_COLS - 1 - x },
    { dir: DIR.UP, dist: y },
    { dir: DIR.DOWN, dist: GRID_ROWS - 1 - y },
  ];
  distances.sort((a, b) => a.dist - b.dist);
  return distances[0].dir;
}

/**
 * Main level generation function.
 * Incrementally adds arrows, checking for cycles after each addition.
 * Prioritizes high coverage by trying multiple growth patterns.
 */
export function generateLevel() {
  let bestResult = null;
  let bestCoverage = 0;
  const totalCells = GRID_COLS * GRID_ROWS;

  for (let attempt = 0; attempt < 5; attempt++) {
    nextId = 1;
    const grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));
    const arrows = [];

    // Collect all cells, prioritize edge cells first (they're easier to make escapable)
    const edgeCells = [];
    const innerCells = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (x === 0 || x === GRID_COLS - 1 || y === 0 || y === GRID_ROWS - 1) {
          edgeCells.push({ x, y });
        } else {
          innerCells.push({ x, y });
        }
      }
    }
    shuffle(edgeCells);
    shuffle(innerCells);
    const allCells = [...edgeCells, ...innerCells];

    // Phase 1: Fill with longer arrows (3-4 length)
    for (const cell of allCells) {
      if (grid[cell.y][cell.x] !== 0) continue;

      const targetLength = randInt(MIN_LENGTH, MAX_LENGTH);
      const candidates = growArrowCandidates(cell.x, cell.y, grid, targetLength);

      let placed = false;
      for (const candidate of candidates) {
        const id = nextId;
        const newArrow = { id, segments: candidate.segments, direction: candidate.direction };

        if (!wouldCreateCycle(newArrow, arrows, grid)) {
          // Place it
          nextId++;
          for (const seg of candidate.segments) {
            grid[seg.y][seg.x] = id;
          }
          arrows.push(newArrow);
          placed = true;
          break;
        }
      }

      // If no candidate worked with target length, try shorter
      if (!placed && targetLength > MIN_LENGTH) {
        const shortCandidates = growArrowCandidates(cell.x, cell.y, grid, MIN_LENGTH);
        for (const candidate of shortCandidates) {
          const id = nextId;
          const newArrow = { id, segments: candidate.segments, direction: candidate.direction };

          if (!wouldCreateCycle(newArrow, arrows, grid)) {
            nextId++;
            for (const seg of candidate.segments) {
              grid[seg.y][seg.x] = id;
            }
            arrows.push(newArrow);
            break;
          }
        }
      }
    }

    // Phase 2: Fill remaining gaps with length-2 arrows, trying all 4 directions
    for (let pass = 0; pass < 3; pass++) {
      const emptyCells = [];
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          if (grid[y][x] === 0) emptyCells.push({ x, y });
        }
      }
      if (emptyCells.length === 0) break;
      shuffle(emptyCells);

      for (const cell of emptyCells) {
        if (grid[cell.y][cell.x] !== 0) continue;

        // Try to create a length-2 arrow in each direction, preferring escape directions
        const bestDir = getBestEscapeDir(cell.x, cell.y);
        const dirs = [bestDir, ...ALL_DIRS.filter(d => d !== bestDir)];
        
        let placed = false;
        for (const dir of dirs) {
          // Try growing in this direction (the arrow will end pointing this way)
          const candidate = growArrowWithDirection(cell.x, cell.y, grid, 2, dir);
          if (!candidate) continue;

          const id = nextId;
          const newArrow = { id, segments: candidate.segments, direction: candidate.direction };

          if (!wouldCreateCycle(newArrow, arrows, grid)) {
            nextId++;
            for (const seg of candidate.segments) {
              grid[seg.y][seg.x] = id;
            }
            arrows.push(newArrow);
            placed = true;
            break;
          }
        }

        // If still can't place, try as the second cell of an arrow starting from a neighbor
        if (!placed) {
          for (const dir of ALL_DIRS) {
            const nx = cell.x + dir.dx;
            const ny = cell.y + dir.dy;
            if (!inBounds(nx, ny) || grid[ny][nx] !== 0) continue;

            // Create arrow from neighbor to this cell
            const segments = [{ x: nx, y: ny }, { x: cell.x, y: cell.y }];
            const direction = getNaturalDirection(segments);
            if (!direction) continue;

            const id = nextId;
            const newArrow = { id, segments, direction };

            if (!wouldCreateCycle(newArrow, arrows, grid)) {
              nextId++;
              grid[ny][nx] = id;
              grid[cell.y][cell.x] = id;
              arrows.push(newArrow);
              placed = true;
              break;
            }
          }
        }
      }
    }

    // Phase 3: Handle truly isolated cells by extending adjacent arrows
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (grid[y][x] !== 0) continue;
        
        // This cell is isolated - try to extend an adjacent arrow to include it
        for (const dir of shuffle([...ALL_DIRS])) {
          const nx = x + dir.dx;
          const ny = y + dir.dy;
          if (!inBounds(nx, ny) || grid[ny][nx] === 0) continue;
          
          const adjacentId = grid[ny][nx];
          const arrowIdx = arrows.findIndex(a => a.id === adjacentId);
          if (arrowIdx === -1) continue;
          
          const arrow = arrows[arrowIdx];
          
          // Check if (nx, ny) is the tail (first segment) of this arrow
          // If so, we can prepend (x, y) to extend it
          const isHead = arrow.segments[arrow.segments.length - 1].x === nx && 
                         arrow.segments[arrow.segments.length - 1].y === ny;
          const isTail = arrow.segments[0].x === nx && arrow.segments[0].y === ny;
          
          if (isTail) {
            // Prepend the isolated cell to the arrow's tail
            const newSegments = [{ x, y }, ...arrow.segments];
            const newDirection = getNaturalDirection(newSegments);
            if (!newDirection) continue;
            
            // Remove old arrow from grid, test new one
            for (const seg of arrow.segments) {
              grid[seg.y][seg.x] = 0;
            }
            
            const newArrow = { id: arrow.id, segments: newSegments, direction: newDirection };
            const otherArrows = arrows.filter((_, i) => i !== arrowIdx);
            
            if (!wouldCreateCycle(newArrow, otherArrows, grid)) {
              // Accept the extension
              for (const seg of newSegments) {
                grid[seg.y][seg.x] = arrow.id;
              }
              arrows[arrowIdx] = newArrow;
              break;
            } else {
              // Revert
              for (const seg of arrow.segments) {
                grid[seg.y][seg.x] = arrow.id;
              }
            }
          } else if (isHead) {
            // Append the isolated cell to the arrow's head
            const newSegments = [...arrow.segments, { x, y }];
            const newDirection = getNaturalDirection(newSegments);
            if (!newDirection) continue;
            
            // Remove old arrow from grid, test new one
            for (const seg of arrow.segments) {
              grid[seg.y][seg.x] = 0;
            }
            
            const newArrow = { id: arrow.id, segments: newSegments, direction: newDirection };
            const otherArrows = arrows.filter((_, i) => i !== arrowIdx);
            
            if (!wouldCreateCycle(newArrow, otherArrows, grid)) {
              for (const seg of newSegments) {
                grid[seg.y][seg.x] = arrow.id;
              }
              arrows[arrowIdx] = newArrow;
              break;
            } else {
              // Revert
              for (const seg of arrow.segments) {
                grid[seg.y][seg.x] = arrow.id;
              }
            }
          }
        }
      }
    }

    // Calculate coverage
    let filledCells = 0;
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (grid[y][x] !== 0) filledCells++;
      }
    }

    const coverage = filledCells / totalCells;
    if (filledCells > bestCoverage) {
      bestCoverage = filledCells;
      bestResult = { arrows, grid };
    }

    // If coverage is excellent (>95%), use it immediately
    if (coverage > 0.95) break;
  }

  if (bestResult && bestResult.arrows.length >= 10) {
    const colorPool = shuffle([...ARROW_COLORS]);
    for (let i = 0; i < bestResult.arrows.length; i++) {
      bestResult.arrows[i].color = colorPool[i % colorPool.length];
    }
    console.log(`[LevelGen] Generated ${bestResult.arrows.length} arrows, coverage: ${(bestCoverage / totalCells * 100).toFixed(1)}%`);
    return bestResult;
  }

  // Fallback
  return generateSimpleLevel();
}

/**
 * Fallback: simple guaranteed-solvable level with full coverage
 */
function generateSimpleLevel() {
  nextId = 1;
  const grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));
  const arrows = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    let col = 0;
    while (col < GRID_COLS) {
      const len = Math.min(randInt(2, 4), GRID_COLS - col);
      if (len < 2) { col++; continue; }

      const segments = [];
      const id = nextId++;
      for (let c = col; c < col + len; c++) {
        segments.push({ x: c, y: row });
        grid[row][c] = id;
      }

      // Direction follows the segment direction
      const direction = row % 2 === 0 ? DIR.RIGHT : DIR.LEFT;
      if (direction === DIR.LEFT) segments.reverse();

      arrows.push({ id, segments, direction });
      col += len;
    }
  }

  const colorPool = shuffle([...ARROW_COLORS]);
  for (let i = 0; i < arrows.length; i++) {
    arrows[i].color = colorPool[i % colorPool.length];
  }

  return { arrows, grid };
}
