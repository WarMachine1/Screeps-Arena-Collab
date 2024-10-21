import { findClosestByRange, getDirection, getObjectsByPrototype } from "game/utils";
import { Creep, GameObject, Source, StructureContainer, StructureSpawn, Position } from "game/prototypes";
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
import { getCostOfCombatMob, getMob, getNearestChokePoint, isFirstTick } from "./common/globalFunctions";

interface CustomCreep extends Creep {
  // interface extends Class
  role: string;
  testFunc(num: number): number;
}

// build defense creep first to start moving to chokepoint
// build a tow creep to bring the defense creep to the chokepoint and then gather resources
// build a sapper first to get enough energy to build a rampart & extension at chokepoint

// 'fake class' for Harvester creeps ???
function HarvesterCreep(creep: Creep): CustomCreep {
  const cc = creep as CustomCreep;
  cc.role = "Harvester";
  cc.testFunc = function (num: number) {
    return num * 2;
  };
  return cc;
}

// 'fake class' for Harvester creeps ???
function MoverCreep(creep: Creep): CustomCreep {
  const cc = creep as CustomCreep;
  cc.role = "Mover";
  cc.testFunc = function (num: number) {
    return num * 2;
  };
  return cc;
}

// 'fake class' for fighter creeps ???
function FighterCreep(creep: Creep): CustomCreep {
  const cc = creep as CustomCreep;
  cc.role = "Fighter";
  cc.testFunc = function (num: number) {
    return num * 3;
  };
  return cc;
}

// 'fake class' for Harvester creeps ???
function TowCreep(creep: Creep): CustomCreep {
  const cc = creep as CustomCreep;
  cc.role = "Tow";
  cc.testFunc = function (num: number) {
    return num * 2;
  };
  return cc;
}

// 'fake class' for fighter creeps ???
function DefenseCreep(creep: Creep): CustomCreep {
  const cc = creep as CustomCreep;
  cc.role = "Defense";
  cc.testFunc = function (num: number) {
    return num * 3;
  };
  return cc;
}

// 'fake class' for fighter creeps ???
function SapperCreep(creep: Creep): CustomCreep {
  const cc = creep as CustomCreep;
  cc.role = "Sapper";
  cc.testFunc = function (num: number) {
    return num * 3;
  };
  return cc;
}

// defined constants
const maxBodyCost = 1000;
const numberOfCollectors = 3;
const numberOfSappers = 1;
const numberOfTows = 1;
const numberOfDefenseCreeps = 1;
const collectorBody = [MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY, MOVE, CARRY];
const fighterBody = [
  MOVE,
  MOVE,
  MOVE,
  MOVE,
  MOVE,
  MOVE,
  MOVE,
  MOVE,
  ATTACK,
  ATTACK,
  ATTACK,
  ATTACK,
  ATTACK,
  ATTACK,
  MOVE,
  MOVE
];
const defenseBody = [
  RANGED_ATTACK,
  RANGED_ATTACK,
  RANGED_ATTACK,
  RANGED_ATTACK,
  RANGED_ATTACK,
  RANGED_ATTACK,
  MOVE,
  MOVE
];

const sapperBody = [MOVE, MOVE, MOVE, MOVE, WORK, WORK, CARRY, WORK, WORK, CARRY, MOVE];

const towBody = [MOVE, MOVE, MOVE, MOVE, WORK, WORK, CARRY, WORK, WORK, CARRY, WORK, WORK, CARRY, MOVE];

// calculated parameters at the start
const mySpawn = getObjectsByPrototype(StructureSpawn).find(i => i.my);
const enemySpawn = getObjectsByPrototype(StructureSpawn).find(i => !i.my);
let spawnOnRightSide = true;
if (mySpawn) {
  spawnOnRightSide = mySpawn.x > 50;
}

// State variables which will be kept up to date during execution, defined here to use in multiple functions
let containers: StructureContainer[];
let myCreeps: CustomCreep[] = [];
let enemyCreeps: Creep[];

export function loop() {
  spawnCreeps();
  updateState();

  runCreeps();
}

function updateState() {
  containers = getObjectsByPrototype(StructureContainer);
  enemyCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my);

  // just some logging right now, TODO: remove creeps from myCreeps when they are dead.
  for (const creep of myCreeps) {
    console.log(creep.role);
    console.log(creep.testFunc(1));
  }
}

function runCreeps() {
  const nonEmptyContainers = containers.filter(c => (c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0);

  for (const creep of myCreeps) {
    // instead of checking type here based on body parts TODO: use CustomCreep.role
    if (creep.role === "Harvester") {
      // check if the array of bodyparts contains a carry part.

      if (creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
        const targetContainer = creep.findClosestByPath(nonEmptyContainers);
        if (targetContainer) {
          if (creep.withdraw(targetContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(targetContainer);
          }
        }
      } else if (mySpawn) {
        if (creep.transfer(mySpawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(mySpawn);
        }
      }
    } else if (creep.role === "Tow") {
      // If no defense go to mySpawn
      if (numberOfDefenseCreeps <= 0) {
        creep.moveTo(mySpawn ?? {x:50, y:50});
      } else {
        const dCreep = myCreeps.find(c => c.role === "Defense");
        const sCreep = myCreeps.find(c => c.role === "Sapper");
        if (sCreep) {
          if (creep.pull(sCreep) === ERR_NOT_IN_RANGE) {
            creep.moveTo(sCreep);
          } else {
            const nearestChokePoint = getNearestChokePoint(creep, spawnOnRightSide);
            creep.moveTo(enemySpawn ?? {x:50, y:50});
            sCreep.moveTo(creep);
            if (dCreep) {
              if (sCreep.pull(dCreep) === ERR_NOT_IN_RANGE) {
                sCreep.moveTo(dCreep);
              }
            }
          }
        } else if (dCreep) {
          if (creep.pull(dCreep) === ERR_NOT_IN_RANGE) {
            creep.moveTo(dCreep);
          } else {
            const nearestChokePoint = getNearestChokePoint(creep, spawnOnRightSide);
            creep.moveTo(enemySpawn ?? {x:50, y:50});
            dCreep.moveTo(creep);
          }
        }
      }
      // If defense exists, attempt to pull, and move towards defense creep if out of range
      // If not out of range, determine chokepoints, and move to closest one
    } else if (creep.role === "Defense") {
      // Determine chokepoints, and move to closest one
      // If further than 2 squares than chokepoint, move towards tow
      // Else, move to nearest chokepoint
    } else if (creep.role === "Fighter") {
      let targets: (Creep | StructureSpawn)[];
      targets = enemyCreeps;
      if (enemySpawn) {
        targets = targets.concat(enemySpawn);
      }
      const target = creep.findClosestByRange(targets);

      const myArmedCreeps = myCreeps.filter(c => c.body.some(i => i.type === ATTACK));

      if (target) {
        if (
          creep.getRangeTo(target) < 15 &&
          enemyCreeps.filter(c =>
            c.body.some(part => part.type === ATTACK || part.type === RANGED_ATTACK || part.type === HEAL)
          ).length > 0
        ) {
          /* console.log("Cost of my mob: ", getCostOfCombatMob(creep, myCreeps, 2));
          if (enemyCreeps.length > 0) {
            console.log("Cost of their mob: ", getCostOfCombatMob(target, enemyCreeps, 2));
          }*/
          if (getCostOfCombatMob(creep, myCreeps, 2) <= 1.1 * getCostOfCombatMob(target, enemyCreeps, 2)) {
            // get myArmedCreeps that are not in my mob
            const filteredCreeps = myCreeps.filter(c =>
              c.body.some(part => part.type === ATTACK || part.type === RANGED_ATTACK || part.type === HEAL)
            );

            // Get the mob the input creep is part of
            const mob = getMob(creep, filteredCreeps, 2) as Creep[];

            const myArmedCreepsNotInMob = myArmedCreeps.filter(oA => !mob.some(oB => oB.id === oA.id));

            const closestArmedCreep = creep.findClosestByRange(myArmedCreepsNotInMob);
            if (closestArmedCreep) {
              /* console.log("Retreating: Moving to friendly creep at ", closestArmedCreep.x, ",", closestArmedCreep.y);
              console.log("MyArmedCreeps:");
              myArmedCreeps.forEach(element => console.log("x: ", element.x, " y: ", element.y));
              console.log("");
              console.log("My Mob:");
              mob.forEach(element => console.log("x: ", element.x, " y: ", element.y));
              console.log("");
              console.log("Armed Creeps not in My Mob:");
              myArmedCreepsNotInMob.forEach(element => console.log("x: ", element.x, " y: ", element.y)); */
              creep.moveTo({ x: closestArmedCreep.x, y: closestArmedCreep.y });
            } else {
              console.log("No armed creep found within range.");
            }
          } else {
            if (creep.attack(target) === ERR_NOT_IN_RANGE) {
              creep.moveTo(target);
            }
          }
        } else {
          if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
          }
        }
      }
    }
  }
}

function spawnCreeps() {
  // instead of checking type here based on body parts TODO: use CustomCreep.role
  myCreeps = myCreeps.filter(c => c.exists);
  const numCarryCreeps = myCreeps.filter(c => c.body.some(i => i.type === CARRY)).length;
  const numDefenseCreeps = myCreeps.filter(c => c.role === "Defense").length;
  const numSapperCreeps = myCreeps.filter(c => c.role === "Sapper").length;
  const numTowCreeps = myCreeps.filter(c => c.role === "Tow").length;
  if (mySpawn) {
    if (numCarryCreeps < numberOfCollectors) {
      const c = mySpawn.spawnCreep(collectorBody).object;
      if (c) {
        myCreeps.push(HarvesterCreep(c));
      }
    } else if (numDefenseCreeps < numberOfDefenseCreeps) {
      const c = mySpawn.spawnCreep(defenseBody).object;
      if (c) {
        myCreeps.push(DefenseCreep(c));
      }
    } else if (numTowCreeps < numberOfTows) {
      const c = mySpawn.spawnCreep(towBody).object;
      if (c) {
        myCreeps.push(TowCreep(c));
      }
    } else if (numTowCreeps < numberOfSappers) {
      const c = mySpawn.spawnCreep(sapperBody).object;
      if (c) {
        myCreeps.push(SapperCreep(c));
      }
    } else {
      /* const c = mySpawn.spawnCreep(fighterBody).object;
      if (c) {
        myCreeps.push(FighterCreep(c));
      }*/
    }
  }
}
