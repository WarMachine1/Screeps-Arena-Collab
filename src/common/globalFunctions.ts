/* eslint-disable @typescript-eslint/naming-convention */

import {
  ATTACK,
  BODYPART_COST,
  CARRY,
  ERR_NOT_IN_RANGE,
  HEAL,
  MOVE,
  RANGED_ATTACK,
  RESOURCE_ENERGY,
  TOUGH,
  WORK
} from "game/constants";
import { Creep, GameObject, Position, BodyPartType } from "game/prototypes";
import { Visual} from "game/visual";
import { findInRange, getTicks, findClosestByRange, getRange, } from "game/utils";
import { CostMatrix } from "game/path-finder";

export const MAXTICKSPERMOVE = 1000; // If a creep has no move body parts left, this value is used for the number of ticks it needs to move.

export function isFirstTick(): boolean {
  return getTicks() === 1;
}

export function bodyCost(body: BodyPartType[]): number {
  let sum = 0;
  for (let i in body)
      sum += BODYPART_COST[body[i]];
  return sum;
}

export function getCreepBodyCost(creep: Creep): number {
  // Extract body parts from the creep object
  const bodyParts = creep.body.map(part => part.type);
  return bodyCost(bodyParts);
  /*
  // Sum up the cost of each body part
  return bodyParts.reduce((totalCost, part) => {
    return totalCost + (BODYPART_COST[part] || 0);
  }, 0);
  */
}

export function getTicksPerMove(body: BodyPartType[], currentHits?: number): {plain: number, swamp: number} {
  let missingHits = 0;
  let livingBody = body;
  if (currentHits){
    missingHits = body.length*100 - currentHits;
    livingBody = body.slice(-Math.floor(missingHits/100)); 
  }
  let nMoveParts = livingBody.filter(a => a == MOVE).length;
  let nOtherParts = livingBody.length - nMoveParts

  return {plain: Math.max(Math.min(Math.ceil(( (nOtherParts*2)  / (nMoveParts*2) )),MAXTICKSPERMOVE),1), 
          swamp: Math.max(Math.min(Math.ceil(( (nOtherParts*10) / (nMoveParts*2) )),MAXTICKSPERMOVE),1)};
}


export function findMostDamagedCreep(damagedCreeps: Creep[]): Creep | null {
  let maxDamage = 0;
  let mostDamagedCreep: Creep | null = null;

  for (const dc of damagedCreeps) {
    const creepDamage: number = dc.hitsMax - dc.hits;
    if (creepDamage > maxDamage) {
      maxDamage = creepDamage;
      mostDamagedCreep = dc;
    }
  }

  return mostDamagedCreep;
}

export function getWithinRange(target: GameObject, objects: GameObject[], range: number): GameObject[] {
  const targetX = target.x;
  const targetY = target.y;
  const objectsWithinRange = objects.filter(o => Math.abs(targetX - o.x) <= range && Math.abs(targetY - o.y) <= range);
  return objectsWithinRange;
}

export function getMob(target: GameObject, objects: GameObject[], linkRange: number): GameObject[] {
  // This will hold all the GameObjects that are part of the "mob"
  const mob: GameObject[] = [];

  // Set to track already visited objects to prevent infinite loops
  const visited = new Set<GameObject>();

  // Start with the target object in the list
  const toVisit = [target];

  while (toVisit.length > 0) {
    const current = toVisit.pop();

    if (current && !visited.has(current)) {
      // Mark the current object as visited
      visited.add(current);

      // Add the current object to the mob
      mob.push(current);

      // Get objects within the range of the current object that haven't been visited
      const linkedObjects = findInRange(current, objects, linkRange).filter(o => !visited.has(o));

      // Add these linked objects to the list to visit
      toVisit.push(...linkedObjects);
    }
  }

  return mob;
}

export function getCostOfCombatMob(target: GameObject, creeps: Creep[], linkRange: number): number {
  // Filter out creeps that don't have Attack, Ranged_attack, or Heal body parts
  const filteredCreeps = creeps.filter(c =>
    c.body.some(part => part.type === ATTACK || part.type === RANGED_ATTACK || part.type === HEAL)
  );

  // Get the mob the input creep is part of
  const mob = getMob(target, filteredCreeps, linkRange) as Creep[];

  // Calculate the total cost of filtered creeps
  const totalCost = mob.reduce((cost, mobCreep) => {
    return cost + getCreepBodyCost(mobCreep);
  }, 0);

  return totalCost;
}

export function getNearestChokePoint(creep: Creep, spawnOnRight: boolean): object {
  let pos = { x: 50, y: 50 };
  const upperRight = { x: 90, y: 10 };
  const upperLeft = { x: 10, y: 10 };
  const lowerRight = { x: 90, y: 90 };
  const lowerLeft = { x: 10, y: 90 };
  const rightChokePoints = [upperRight, lowerRight];
  const leftChokePoints = [upperLeft, lowerLeft];

  if (spawnOnRight) {
    pos = creep.findClosestByRange(leftChokePoints) ?? pos;
  } else {
    pos = creep.findClosestByRange(rightChokePoints) ?? pos;
  }

  return pos;
}

export function findMostExpensiveMob(creeps: Creep[], linkRange: number): Creep[] {
  let mostExpensiveMob: Creep[] = [];
  let maxCost = 0;

  const visitedCreeps = new Set<Creep>();

  // Iterate through all creeps to find the most expensive mob
  for (const creep of creeps) {
    if (!visitedCreeps.has(creep)) {
      // Get the mob and add all members of the mob to the visited set
      const mob = getMob(creep, creeps, linkRange) as Creep[];
      mob.forEach(c => visitedCreeps.add(c));

      // Get the cost of the mob
      const mobCost = getCostOfCombatMob(creep, creeps, linkRange);
      if (mobCost > maxCost) {
        maxCost = mobCost;
        mostExpensiveMob = mob;
      }
    }
  }

  return mostExpensiveMob;
}

export function getCostWeightedCentroid(mob: Creep[]): { x: number, y: number } {
  let totalCost = 0;
  let weightedSumX = 0;
  let weightedSumY = 0;

  // Iterate over each creep in the mob
  for (const creep of mob) {
    const cost = getCreepBodyCost(creep); // Get the cost of the current creep

    // Add to the total cost
    totalCost += cost;

    // Weight the position by the creep's cost and accumulate
    weightedSumX += creep.x * cost;
    weightedSumY += creep.y * cost;
  }

  // If the total cost is zero (which shouldn't normally happen), return 0,0 as the centroid
  if (totalCost === 0) {
    return { x: 0, y: 0 };
  }

  // Calculate the cost-weighted centroid
  const centroidX = weightedSumX / totalCost;
  const centroidY = weightedSumY / totalCost;

  return { x: centroidX, y: centroidY };
}

function isOnOppositePath(position: Position, enemyCentroid: { x: number, y: number }, friendlyCentroid: { x: number, y: number }): boolean {
  const directionVectorX = friendlyCentroid.x - enemyCentroid.x;
  const directionVectorY = friendlyCentroid.y - enemyCentroid.y;

  // Check if position is within 1 tile of the line connecting the two centroids (a simplified approximation)
  const vectorToPositionX = position.x - enemyCentroid.x;
  const vectorToPositionY = position.y - enemyCentroid.y;

  const crossProduct = Math.abs(directionVectorX * vectorToPositionY - directionVectorY * vectorToPositionX);
  const distance = Math.sqrt(directionVectorX * directionVectorX + directionVectorY * directionVectorY);
  return crossProduct / distance < 1.5;  // Allow some tolerance to create a 3-wide path
}

/*
Cost matrix characteristics:
-Find closest mob centroids of friendly-non flankers and enemy combatants (flanker creep will move towards most expensive friendly mob)
-Set cost of squares which are closer to an enemy in mob by range than friendly creep (assumption is enemy targetting is based on closest by range) to 100

-Reduce cost to 0 for 3-wide path in opposite direction (enemy centroid => friendly centroid) for distance between closest enemy and friendly creeps in mobs
-Increase cost with gradient (200 within 1-range, 25 at 4-range) within range 4 of any armed enemy
*/

export function generateFlankerCostMatrix(myCreeps: Creep[], enemyCreeps: Creep[], linkRange: number): CostMatrix {
  const costMatrix = new CostMatrix();

  // 1. Find the centroids of the most expensive friendly and enemy mobs
  const friendlyMob = findMostExpensiveMob(myCreeps, linkRange);
  const enemyMob = findMostExpensiveMob(enemyCreeps, linkRange);

  const friendlyCentroid = getCostWeightedCentroid(friendlyMob);
  const enemyCentroid = getCostWeightedCentroid(enemyMob);

  // 2. Iterate through the room positions and set the costs based on the rules
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const position = {x:x, y:y};

      // Calculate distances from this position to the centroids
      const distanceToFriendly = getRange(position,findClosestByRange(position,friendlyMob));
      const distanceToEnemy = getRange(position,findClosestByRange(position,enemyMob));

      // Set cost for tiles closer to enemies than to friendlies (assumes enemy targeting is based on range)
      if (distanceToEnemy < distanceToFriendly) {
        costMatrix.set(x, y, 100);
      }

      // 3. Set a 3-wide path in the opposite direction from the enemy centroid to the friendly centroid
      // We'll reduce the cost for positions that fall on this path
      if (isOnOppositePath(position, enemyCentroid, friendlyCentroid)) {
        costMatrix.set(x, y, 0);  // Lower the cost for the flanker to travel in the direction opposite to the enemy
      }

      // 4. Increase cost with a gradient near enemy combatants
      for (const enemy of enemyMob) {
        const distanceToEnemyCreep = getRange(position,enemy);

        // Apply gradient costs based on the proximity to armed enemies
        if (distanceToEnemyCreep <= 1) {
          costMatrix.set(x, y, 200);  // High cost for squares adjacent to enemies
        } else if (distanceToEnemyCreep <= 4) {
          const cost = 200 - ((distanceToEnemyCreep - 1) * 50);  // Gradual reduction of cost with distance
          costMatrix.set(x, y, Math.max(costMatrix.get(x, y), cost));  // Take the max between existing cost and the new gradient
        }
      }
    }
  }

  return costMatrix;
}

export function visualizeCostMatrix(costMatrix: CostMatrix) {
  const visual = new Visual(10, false);  // Initialize the RoomVisual for the given room

  for (let x = 0; x < 100; x++) {
    for (let y = 0; y < 100; y++) {
      const cost = costMatrix.get(x, y);
      if (cost > 0) {
        // Display the cost on the tile
        visual.text(cost.toString(), {x: x, y: y});
      }
    }
  }
}