import { PIRATE_ACCEL, PIRATE_FRICTION, PIRATE_MAX_SPEED, PIRATE_HEALTH, PIRATE_BULLET_SPEED, PIRATE_BASE_AGGRO_RADIUS, BASE_DEFENSE_ORBIT_RADIUS, BASE_DEFENSE_ORBIT_SPEED, SHIP_COLLISION_RADIUS, STRUCTURE_SIZE_COLL, SHIP_SIZE } from './constants.js';

export class PirateSystem {
  constructor() {
    this.pirates = [];
    this.nextWaveTime = 120;
  }

  spawnPirateGroup(x, y, count, fromBase = null) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 100;
      this.pirates.push({
        id: Math.random(),
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        health: PIRATE_HEALTH,
        maxHealth: PIRATE_HEALTH,
        state: 'chase',
        stateTimer: 0,
        facingAngle: 0,
        cooldown: Math.random() * 2,
        defendingBase: fromBase, // Reference to base structure if defending
        orbitAngle: Math.random() * Math.PI * 2, // For defense orbit
        orbitRadius: BASE_DEFENSE_ORBIT_RADIUS + (Math.random() - 0.5) * 40,
        fromBaseSpawn: !!fromBase
      });
    }
  }

  update(dt, ship, asteroids, structures, bullets, levelElapsedTime, levelSpawnSettings, levelIsDebug) {
     // Spawning logic
     // ... (Logic from game.js updatePirates regarding spawning)
     // For now, I'll focus on the entity update loop to keep it clean, 
     // but the spawning logic relies on global levelElapsedTime. 
     // I'll assume the caller handles spawning or I pass all needed vars.
     
     // Let's implement the update loop for existing pirates
     for (let i = this.pirates.length - 1; i >= 0; i--) {
        const p = this.pirates[i];
        let inDefenseMode = false;
        
        if (p.defendingBase) {
            const base = p.defendingBase;
            if (base.health <= 0 || base.dead || base.aggroed) {
                // treat as normal
            } else {
                inDefenseMode = true;
                p.orbitAngle += dt * BASE_DEFENSE_ORBIT_SPEED;
                p.x = base.x + Math.cos(p.orbitAngle) * (p.orbitRadius || BASE_DEFENSE_ORBIT_RADIUS);
                p.y = base.y + Math.sin(p.orbitAngle) * (p.orbitRadius || BASE_DEFENSE_ORBIT_RADIUS);
                p.vx = 0;
                p.vy = 0;
                p.facingAngle = p.orbitAngle + Math.PI / 2;
            }
        }

        const dx = ship.x - p.x;
        const dy = ship.y - p.y;
        const distToPlayer = Math.sqrt(dx*dx + dy*dy);
        const dirToPlayer = distToPlayer > 0 ? {x: dx/distToPlayer, y: dy/distToPlayer} : {x:0, y:0};

        if (!inDefenseMode) {
             p.stateTimer -= dt;
             if (p.stateTimer <= 0) {
                 p.state = Math.random() < 0.6 ? 'chase' : 'circle';
                 p.stateTimer = 2 + Math.random() * 4;
             }
             
             let ax = 0;
             let ay = 0;
             if (p.state === 'chase') {
                 ax += dirToPlayer.x * PIRATE_ACCEL;
                 ay += dirToPlayer.y * PIRATE_ACCEL;
             } else {
                 const cw = (p.id > 0.5) ? 1 : -1;
                 ax += -dirToPlayer.y * cw * PIRATE_ACCEL;
                 ay += dirToPlayer.x * cw * PIRATE_ACCEL;
             }
             
             // Avoidance logic (simplified for brevity, should match game.js)
             // ... (Asteroids, Structures, Player, Other Pirates)
             // I will copy the avoidance logic from game.js
             const lookAhead = 150;
             const lookAheadObstacle = 50;
             
             // Asteroids
             for (const ast of asteroids) {
                 const adx = ast.x - p.x;
                 const ady = ast.y - p.y;
                 const adist = Math.sqrt(adx*adx + ady*ady);
                 if (adist < ast.radius + lookAheadObstacle) {
                     ax -= (adx / adist) * 400;
                     ay -= (ady / adist) * 400;
                 }
             }
             
             // Structures
             for (const st of structures) {
                 if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase' && st.type !== 'crafting' && st.type !== 'shipyard') continue;
                 if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
                 const sdx = st.x - p.x;
                 const sdy = st.y - p.y;
                 const sdist = Math.sqrt(sdx*sdx + sdy*sdy);
                 if (sdist < STRUCTURE_SIZE_COLL + lookAheadObstacle) {
                     ax -= (sdx / sdist) * 400;
                     ay -= (sdy / sdist) * 400;
                 }
             }
             
             // Player
             const PLAYER_AVOID_RADIUS = 5;
             if (distToPlayer > 0 && distToPlayer < PLAYER_AVOID_RADIUS + lookAhead) {
                 ax -= (dx / distToPlayer) * 400;
                 ay -= (dy / distToPlayer) * 400;
             }
             
             // Other Pirates
             for (const other of this.pirates) {
                 if (other === p) continue;
                 const odx = other.x - p.x;
                 const ody = other.y - p.y;
                 const odist = Math.sqrt(odx*odx + ody*ody);
                 if (odist < 40) {
                     ax -= (odx / odist) * 200;
                     ay -= (ody / odist) * 200;
                 }
             }

             p.vx += ax * dt;
             p.vy += ay * dt;
             
             // Facing
             const thrustMag = Math.sqrt(ax * ax + ay * ay);
             if (thrustMag > 10) {
                 const targetAngle = Math.atan2(ay, ax);
                 let angleDiff = targetAngle - p.facingAngle;
                 while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                 while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                 p.facingAngle += angleDiff * Math.min(1, 3 * dt);
             }
             
             // Friction
             p.vx *= Math.max(0, 1 - PIRATE_FRICTION * dt);
             p.vy *= Math.max(0, 1 - PIRATE_FRICTION * dt);
             
             // Max speed
             const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
             if (speed > PIRATE_MAX_SPEED) {
                 const scale = PIRATE_MAX_SPEED / speed;
                 p.vx *= scale;
                 p.vy *= scale;
             }
             
             p.x += p.vx * dt;
             p.y += p.vy * dt;
        }
        
        // Collisions (Bounce)
        // Asteroids
        for (const ast of asteroids) {
            const cdx = p.x - ast.x;
            const cdy = p.y - ast.y;
            const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
            const minDist = SHIP_COLLISION_RADIUS + ast.radius;
            if (cdist < minDist) {
                const nx = cdx/cdist;
                const ny = cdy/cdist;
                const overlap = minDist - cdist;
                p.x += nx * overlap;
                p.y += ny * overlap;
                const impact = p.vx * nx + p.vy * ny;
                if (impact < 0) {
                    p.vx -= 1.3 * impact * nx;
                    p.vy -= 1.3 * impact * ny;
                }
            }
        }
        
        // Structures
        for (const st of structures) {
            if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase' && st.type !== 'crafting' && st.type !== 'shipyard') continue;
            if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
            const cdx = p.x - st.x;
            const cdy = p.y - st.y;
            const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
            const minDist = SHIP_COLLISION_RADIUS + STRUCTURE_SIZE_COLL;
            if (cdist < minDist) {
                const nx = cdx/cdist;
                const ny = cdy/cdist;
                const overlap = minDist - cdist;
                p.x += nx * overlap;
                p.y += ny * overlap;
                const impact = p.vx * nx + p.vy * ny;
                if (impact < 0) {
                    p.vx -= 1.3 * impact * nx;
                    p.vy -= 1.3 * impact * ny;
                }
            }
        }
        
        // Firing
        if (!inDefenseMode) {
            p.cooldown -= dt;
            if (p.cooldown <= 0 && distToPlayer < 700) {
                p.cooldown = 1.0 + Math.random() * 2.0;
                
                const timeToHit = distToPlayer / PIRATE_BULLET_SPEED;
                const predX = ship.x + ship.vx * timeToHit;
                const predY = ship.y + ship.vy * timeToHit;
                
                const aimX = predX + (Math.random()-0.5) * 60;
                const aimY = predY + (Math.random()-0.5) * 60;
                
                const fdx = aimX - p.x;
                const fdy = aimY - p.y;
                const fdist = Math.sqrt(fdx*fdx + fdy*fdy);
                const fdir = (fdist > 0) ? {x: fdx/fdist, y: fdy/fdist} : {x:1, y:0};
                
                bullets.push({
                    x: p.x + fdir.x * SHIP_SIZE,
                    y: p.y + fdir.y * SHIP_SIZE,
                    vx: fdir.x * PIRATE_BULLET_SPEED + p.vx,
                    vy: fdir.y * PIRATE_BULLET_SPEED + p.vy,
                    lifespan: 4,
                    owner: 'pirate'
                });
            }
        }
        
        // Tilt
        let deltaAngle = p.facingAngle - (p.prevFacingAngle !== undefined ? p.prevFacingAngle : p.facingAngle);
        while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
        p.prevFacingAngle = p.facingAngle;
        
        const TILT_SENSITIVITY = 8;
        const TILT_DECAY = 4;
        p.tilt = (p.tilt || 0) + deltaAngle * TILT_SENSITIVITY - (p.tilt || 0) * TILT_DECAY * dt;
        p.tilt = Math.max(-0.5, Math.min(0.5, p.tilt));
     }
  }
}
