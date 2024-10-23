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
import { Creep, GameObject, BodyPartType } from "game/prototypes";
import { findInRange, getTicks } from "game/utils";
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

  // Sum up the cost of each body part
  return bodyParts.reduce((totalCost, part) => {
    return totalCost + (BODYPART_COST[part] || 0);
  }, 0);
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

/*
Cost matrix characteristics:
-Find closest mob centroids of friendly-non flankers and enemy combatants (flanker creep will move towards most expensive friendly mob)
-High cost of squares which are closer to an enemy in mob by range than friendly creep (assumption is enemy targetting is based on closest by range)
-Increase cost near friendly and enemy centroids
-Reduce cost to near 0 for 3-wide path in opposite direction (enemy centroid => friendly centroid) for distance between closest enemy and friendly creeps in mobs
-Increase cost with gradient within range 4 of any armed enemy
*/

export function generateFlankerCostMatrix(flankers: Creep[]): CostMatrix {
  const matrix = new CostMatrix();
  //Jordi tests
  return matrix;
}
