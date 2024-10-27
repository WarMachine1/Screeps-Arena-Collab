import { getObjectsByPrototype, getDirection, getTicks, findClosestByRange, createConstructionSite } from 'game/utils';
import { Creep, StructureSpawn, Source, StructureContainer, GameObject, Position, ConstructionSite, StructureRampart } from 'game/prototypes';
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
    [CreepRole.ROAMCOLLECTOR]:  [MOVE, CARRY, MOVE, CARRY],
    [CreepRole.WORKER]:         [MOVE, MOVE, MOVE, CARRY, CARRY,WORK, MOVE, MOVE],
    [CreepRole.FIGHTER]:        [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE],
    [CreepRole.RAIDER]:         [MOVE, MOVE, MOVE, MOVE, MOVE, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE],
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
var myConstructionSites: ConstructionSite[] = [];
var creeps: Creep[] = [];
var myCreeps: CustomCreep[] = []; //creeps are added at spawn, and removed if dead on state update
var mySpawnedCreepCount = 0;
var enemyCreeps: Creep[] = [];

export function loop() {
    //const costMatrix = generateFlankerCostMatrix(myCreeps, enemyCreeps, 2);
    //visualizeCostMatrix(costMatrix);
    firstTickSetup();
    updateState();
    runCreeps();
    spawnCreeps();
}

function firstTickSetup() {
    if (isFirstTick()) {
        console.log('Starting up!');
        let constructionSite = createConstructionSite(mySpawn, StructureRampart);
        console.log('Placed Spawn Rampart, x:', mySpawn.x, ', y:', mySpawn.y );

        for (const role in creepBodies) {
            const bodyParts = creepBodies[role as CreepRole]; // Get the body part array for the role
            if (bodyCost(bodyParts) > maxBodyCost) {
                console.log('WARN: bodycost exceeds spawn max energy: ' + role + ', bodyCost: ' + bodyCost(bodyParts));
            }
        }
    }
}

function updateState() {
    containers = getObjectsByPrototype(StructureContainer); // get all current containers
    myConstructionSites = getObjectsByPrototype(ConstructionSite).filter(c => c.my);
    creeps = getObjectsByPrototype(Creep); // get all creeps in the game
    enemyCreeps = creeps.filter(c => !c.my); // get all enemy creeps in the game
    // check if some of my creeps are dead, and remove from myCreeps
    const creepIDs = new Set(creeps.map(c => c.id));
    myCreeps = myCreeps.filter(c => creepIDs.has(c.id)); 
}

function runCreeps() {
    var targets: (Creep | StructureSpawn | CustomCreep | ConstructionSite)[];
    var target: (Creep | StructureSpawn | CustomCreep | ConstructionSite);
    const currentTick = getTicks();

    for (var creep of myCreeps) {
        // Creep behaviours:
        // Collector: Will look for nearest non-empty container, and deposit energy into the spawn
            // TODO: Flee enemies,  if all 3 starting containers are empty, changes role to Roam Collector
        // Roam Collector: Will look for nearest non-base container (ticksToDecay != null), and deposit in spawn
            // TODO: Deposit in extension, withdraw and drop energy on ground before expiration of container, Flee enemies
        // Worker: Gathers energy from nearest non-empty container, and builds nearest construction site, if there are no construction sites behaves same as a roam collector.
            // TODO: 
        // Fighter: Attacks nearest hostile creep
            // TODO: Attack lowest health enemy in range
        // Raider: Ranged attacker, will try to stay at range 3 of the closest enemy
            // TODO: Attack Lowest health enemy in range
        // Healer: Heals healer/attack creeps, will move to closest damaged creep, otherwise creep which is closest to hostile spawn, also flees from enemies

        switch (creep.role) {
            case CreepRole.COLLECTOR:
                creep.collect(mySpawn, containers.filter(c => (c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0));
                break;

            case CreepRole.ROAMCOLLECTOR:
                creep.collect(mySpawn, containers.filter(c => ((c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0 ) && (c.ticksToDecay != null) ));
                break;

            case CreepRole.WORKER:
                if (myConstructionSites.length > 0){
                    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) == 0) {
                        creep.collect(mySpawn, containers.filter(c => ((c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0 )));
                    }else{
                        target = creep.findClosestByRange(myConstructionSites);
                        if(target){
                            if(creep.build(target) == ERR_NOT_IN_RANGE){
                                creep.moveTo(target);
                            }
                        }
                        // also try to withdraw extra energy from nearest container
                        creep.withdraw(creep.findClosestByRange(containers.filter(c => ((c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0 ))), RESOURCE_ENERGY);
                    }
                }else{
                    creep.collect(mySpawn, containers.filter(c => ((c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0 ) && (c.ticksToDecay != null) ));
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
        // Current logic
        // creep 1,2,3    COLLECTOR
        // creep 4      WORKER
        // creep 5,6    ROAMCOLLECTOR
        // creep 7,8,9  RAIDER
        // creep 10,11   FIGHTER
        // creep 12,13  HEALER
        // creep ...    FIGHTER

        var makeRole: CreepRole | null = null;
        if(mySpawnedCreepCount < 3){
            makeRole = CreepRole.COLLECTOR;
        }else if(mySpawnedCreepCount < 4){
            makeRole = CreepRole.WORKER;
        }else if(mySpawnedCreepCount < 6){
            makeRole = CreepRole.ROAMCOLLECTOR;
        }else if(mySpawnedCreepCount < 9){
            makeRole = CreepRole.RAIDER;
        }else if(mySpawnedCreepCount < 11){
            makeRole = CreepRole.FIGHTER;
        }else if(mySpawnedCreepCount < 13){
            makeRole = CreepRole.HEALER;
        }else{
            makeRole = CreepRole.FIGHTER;
        }

        spawnCustomCreep(mySpawn, makeRole)
        /*
        if (myCreeps.filter(c => c.role == CreepRole.COLLECTOR).length < numberOfCollectors) {
            makeRole = CreepRole.COLLECTOR;
        } else if (myCreeps.filter(c => c.role == CreepRole.RAIDER).length < numberOfRaiders) {
            makeRole = CreepRole.RAIDER;
        } else if((myCreeps.filter(c => (c.role == CreepRole.FIGHTER) || (c.role == CreepRole.RAIDER)).length > 5) && (myCreeps.filter(c => c.role == CreepRole.HEALER).length < 2)){
            makeRole = CreepRole.HEALER; // if there are atleast 5 combat creeps, and less than 2 healers, make a healer creep
        }else{
            makeRole = CreepRole.FIGHTER;
        }*/
    }
}

function spawnCustomCreep(spawn: StructureSpawn, creepRole: CreepRole) {
    var c = spawn.spawnCreep(creepBodies[creepRole])
    if (c.object) {
        console.log('Spawning Creep:' + creepRole + ', cost: ' + bodyCost(creepBodies[creepRole]) + ', remaining energy: ' + ((spawn.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) - bodyCost(creepBodies[creepRole])));
        myCreeps.push(CustomCreep(c.object, creepRole));
        mySpawnedCreepCount += 1;
    }
    return c;
}
