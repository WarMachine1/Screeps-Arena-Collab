import { getDirection } from 'game/utils';
import { searchPath } from 'game/path-finder';
import { Creep, GameObject, Position, StructureSpawn, BodyPartType, StructureContainer } from 'game/prototypes';
import { MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, TOUGH, ERR_NOT_IN_RANGE, ERR_BUSY, RESOURCE_ENERGY, BODYPART_COST } from 'game/constants';
import { bodyCost, getTicksPerMove} from "./globalFunctions";


////////////////////////////////////////////////////////////////////
// Add functionality applicable to all Creeps, to the Creep Class //
////////////////////////////////////////////////////////////////////

// Define what additions need to be made to the Creep class:
declare module "game/prototypes" {
    interface Creep {
        getTicksPerMove() : {plain: number, swamp: number};
    }
}

// implement additions:
Creep.prototype.getTicksPerMove = function() {return getTicksPerMove(this.body.map(bp => bp.type), this.hits)}


//////////////////////////////////////////////////////////////////////////////////////////
// CustomCreep 'fake-object' with added functionality only applicable to our own Creeps //
//////////////////////////////////////////////////////////////////////////////////////////

export enum CreepRole {
    COLLECTOR = 'COLLECTOR',
    ROAMCOLLECTOR = 'ROAMCOLLECTOR',
    WORKER = 'WORKER',
    FIGHTER = 'FIGHTER',
    RAIDER = 'RAIDER',
    HEALER = 'HEALER'
}

export interface CustomCreep extends Creep { // interface extends Class
    role: CreepRole;
    flee(targets: (GameObject | Position)[], range: number): void;
    collectAndDeliver(targetDeposit: StructureSpawn, targetContainers: StructureContainer[]): void;
}

export function CustomCreep(creep: Creep, role: CreepRole): CustomCreep {
    var cc = creep as CustomCreep;
    cc.role = role;
    cc.flee = (targets: (GameObject | Position)[], range: number) => { _flee(cc, targets, range) };
    cc.collectAndDeliver = (targetDeposit: StructureSpawn, targetContainers: StructureContainer[]) => { _collectAndDeliver(cc, targetDeposit, targetContainers) };
    return cc;
}

function _flee(creep: CustomCreep, targets: (GameObject | Position)[], range: number): void{
    const result = searchPath(
        creep,
        targets.map(i => ({ pos: i, range })),
        { flee: true } // flee option tries to get away from targets, but does not try to avoid range around target, also does not avoid walking onto other creeps
    );
    if (result.path.length > 0) {
        const direction = getDirection(result.path[0].x - creep.x, result.path[0].y - creep.y);
        creep.move(direction);
    }
}

function _collectAndDeliver(creep: CustomCreep, targetDeposit: StructureSpawn, targetContainers: StructureContainer[]): void {
    if(!creep.store.getCapacity(RESOURCE_ENERGY)){
        console.log("Collect() called on creep without Capacity, id: ", creep.id, ", role: ", creep.role );
        return;
    }
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
        let nonEmptyContainers = targetContainers.filter(c => (c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0);
        let targetContainer = creep.findClosestByPath(nonEmptyContainers);
        if(targetContainer){
            if (creep.getRangeTo(targetContainer) > 1) {
                creep.moveTo(targetContainer);
            }else{
                creep.withdraw(targetContainer, RESOURCE_ENERGY);
                creep.moveTo(targetDeposit);
            }
        }
    }else{
        if (creep.getRangeTo(targetDeposit) > 1) {
            creep.moveTo(targetDeposit);
        }else{
            let nonEmptyContainers = targetContainers.filter(c => (c.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0);
            let targetContainer = creep.findClosestByPath(nonEmptyContainers);
            creep.transfer(targetDeposit, RESOURCE_ENERGY)
            creep.moveTo(targetContainer);
        }
    }
}

