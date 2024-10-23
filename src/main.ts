import { getObjectsByPrototype, getDirection, getTicks, findClosestByRange } from 'game/utils';
import { Creep, StructureSpawn, Source, StructureContainer, GameObject, Position } from 'game/prototypes';
import { MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, TOUGH, ERR_NOT_IN_RANGE, ERR_BUSY, RESOURCE_ENERGY, BODYPART_COST } from 'game/constants';
import { isFirstTick, bodyCost, generateFlankerCostMatrix, visualizeCostMatrix } from "./common/globalFunctions";
import { searchPath } from 'game/path-finder';
import { CreepRole, CustomCreep } from "./common/expandCreep";

// calculated parameters at the start
const mySpawn = getObjectsByPrototype(StructureSpawn).find(i => i.my)!;
const enemySpawn = getObjectsByPrototype(StructureSpawn).find(i => !i.my)!;

// defined constants
const maxBodyCost = 1000;
const waitEngageTicks = 250;
const fleeDistance = 5;
const numberOfCollectors = 3;
const numberOfRaiders = 3;
const creepBodies = {
    [CreepRole.COLLECTOR]:      [MOVE, CARRY],
    [CreepRole.FIGHTER]:        [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE],
    [CreepRole.RAIDER]:         [MOVE, MOVE, MOVE, MOVE, MOVE, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE],
    [CreepRole.WORKCOLLECTOR]:  [MOVE, MOVE, MOVE, CARRY, CARRY,WORK, MOVE, MOVE],
    [CreepRole.HEALER]:         [MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, MOVE]
}
const upperRight = {x:90, y:10};
const upperLeft = {x:10, y:10};
const lowerRight = {x:90, y:90};
const lowerLeft = {x:10, y:90};
const spawnOnRight = mySpawn.x > 50;
const myTopChoke = spawnOnRight ? upperRight: upperLeft;
const myBotChoke = spawnOnRight ? lowerRight: lowerLeft;
const myChokes = [myTopChoke, myBotChoke]
const enemyTopChoke = spawnOnRight ? upperLeft: upperRight;
const enemyBotChoke = spawnOnRight ? lowerLeft: lowerRight;
const enemyChokes = [enemyTopChoke, enemyBotChoke]
const holdSpot = spawnOnRight ? {x:mySpawn.x-3, y:mySpawn.y}: {x:mySpawn.x+3, y:mySpawn.y};


// State variables which will be kept up to date during execution, defined here to use in multiple functions
var containers: StructureContainer[] = [];
var creeps: Creep[] = [];
var myCreeps: CustomCreep[] = []; //creeps are added at spawn, and removed if dead on state update
var enemyCreeps: Creep[] = [];

export function loop() {
    const costMatrix = generateFlankerCostMatrix(myCreeps, enemyCreeps, 2);
    visualizeCostMatrix(costMatrix);
    firstTickSetup();
    updateState();
    runCreeps();
    spawnCreeps();
}

function firstTickSetup() {
    if (isFirstTick()) {
        for (const [cr, cb] of Object.entries(creepBodies)) {
            if (bodyCost(cb) > maxBodyCost) {
                console.log('WARN: bodycost exceeds spawn max energy: ' + cr + ', bodyCost: ' + bodyCost(cb));
            }
        }
    }
}

function updateState() {
    containers = getObjectsByPrototype(StructureContainer); // get all current containers
    creeps = getObjectsByPrototype(Creep); // get all creeps in the game
    enemyCreeps = creeps.filter(c => !c.my); // get all enemy creeps in the game
    // check if some of my creeps are dead, and remove from myCreeps
    const creepIDs = new Set(creeps.map(c => c.id));
    myCreeps = myCreeps.filter(c => creepIDs.has(c.id)); 
}

function runCreeps() {
    var targets: (Creep | StructureSpawn | CustomCreep)[];
    var target: (Creep | StructureSpawn | CustomCreep);
    const currentTick = getTicks();

    for (var creep of myCreeps) {
        console.log(creep.id, creep.role, creep.getTicksPerMove());

        // instead of checking type here based on body parts TODO: use CustomCreep.role
        switch (creep.role) {
            case CreepRole.COLLECTOR:
                if (creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
                    var nonEmptyContainers = containers.filter(c => (c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0);
                    var targetContainer = creep.findClosestByPath(nonEmptyContainers);
                    if (targetContainer) {
                        if (creep.withdraw(targetContainer, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(targetContainer);
                        }
                    }
                } else if (mySpawn) {
                    if (creep.transfer(mySpawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(mySpawn);
                    }
                }
                break;

            case CreepRole.FIGHTER:
                if (currentTick <= waitEngageTicks) {
                    creep.moveTo(holdSpot);
                    break;
                }
                targets = enemyCreeps;
                if (enemySpawn) {
                    targets = targets.concat(enemySpawn);
                }
                target = creep.findClosestByPath(targets);

                if (target) {
                    if (creep.attack(target) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(target);
                    }
                }
                break;

            case CreepRole.RAIDER:
                if (currentTick <= waitEngageTicks) {
                    creep.moveTo(holdSpot);
                    break;
                }
                var canAttack = creep.body.some(bp => (bp.hits > 0) && (bp.type == RANGED_ATTACK))
                targets = enemyCreeps;
                if (enemySpawn) {
                    targets = targets.concat(enemySpawn);
                }
                target = creep.findClosestByPath(targets);

                if (target) {
                    var target_range = creep.getRangeTo(target);
                    creep.rangedAttack(target); // always try to attack

                    if (target_range > 3 && canAttack) { // if closest target is far, and can attack, move to it
                        creep.moveTo(target);
                    } else if (target_range < 3 || !canAttack) { // if closest target is too close, or it cannot attack, avoid all enemies
                        creep.flee(enemyCreeps, fleeDistance);
                    }
                }
                break;

            case CreepRole.HEALER:
                if (currentTick <= waitEngageTicks) {
                    creep.moveTo(holdSpot);
                    break;
                }
                targets = myCreeps.filter(c => (c.id != creep.id) && ((c.role == CreepRole.FIGHTER) || (c.role == CreepRole.RAIDER)) );
                var closestEnemy = creep.findClosestByRange(enemyCreeps);
                var healtarget = creep.findClosestByRange(myCreeps.filter(c => c.hits < c.hitsMax))

                creep.rangedHeal(healtarget); // allways try to heal
                creep.heal(healtarget); // melee heal will overwrite ranged heal if available, due to priority
            
                // avoid enemies if they are too close
                if (closestEnemy && (creep.getRangeTo(closestEnemy) < 4)){
                    creep.flee(enemyCreeps, fleeDistance);
                }else if(healtarget){ // move to the closest damaged creep if it exists
                    creep.moveTo(healtarget);
                }else{  // otherwise move to the friendly creep which is the farthest towards the enemySpawn
                    target = enemySpawn.findClosestByPath(targets);
                    if (target) {
                        creep.moveTo(target);
                    }    
                }
        }
    }
}

function spawnCreeps() {
    if (!mySpawn.spawning) { // need to patch the interface for StructureSpawn in typings in order to have access to spawning.
        var makeRole: CreepRole | null = null;
        
        if (myCreeps.filter(c => c.role == CreepRole.COLLECTOR).length < numberOfCollectors) {
            makeRole = CreepRole.COLLECTOR;
        } else if (myCreeps.filter(c => c.role == CreepRole.RAIDER).length < numberOfRaiders) {
            makeRole = CreepRole.RAIDER;
        } else if((myCreeps.filter(c => (c.role == CreepRole.FIGHTER) || (c.role == CreepRole.RAIDER)).length > 5) && (myCreeps.filter(c => c.role == CreepRole.HEALER).length < 2)){
            makeRole = CreepRole.HEALER; // if there are atleast 5 combat creeps, and less than 2 healers, make a healer creep
        }else{
            makeRole = CreepRole.FIGHTER;
        }

        spawnCustomCreep(mySpawn, makeRole)
    }
}

function spawnCustomCreep(spawn: StructureSpawn, creepRole: CreepRole) {
    var c = spawn.spawnCreep(creepBodies[creepRole])
    if (c.object) {
        console.log('Spawning Creep:' + creepRole + ', cost: ' + bodyCost(creepBodies[creepRole]) + ', remaining energy: ' + ((spawn.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) - bodyCost(creepBodies[creepRole])));
        myCreeps.push(CustomCreep(c.object, creepRole));
    }
    return c;
}
