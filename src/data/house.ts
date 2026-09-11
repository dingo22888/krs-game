import { rectanglePoints } from '../game/geometry.ts';
import type { Point2, Rect } from '../game/geometry.ts';

export type FloorId = 'kg' | 'eg' | 'og' | 'dg';
export type Surface = 'wood' | 'tile' | 'concrete' | 'carpet' | 'stone' | 'oak';
export interface Room { name:string; polygon:Point2[]; surface:Surface }
export interface Opening { rect:Rect; kind:'window'|'door'|'passage'; sill?:number; top?:number; frame?:'white'|'anthracite'; leaf?:{hinge:'start'|'end';side:-1|1;angle?:90|180}; balcony?:{side:'start'|'end';width:number} }
export const furnitureKinds=['sofa','table','counter','bed','shelf','chair','rug','armchair','tv','bathtub','vanity','toilet','radiator','dresser','wardrobe','nightstand','mirror','tilePanel','ledge','barstool','kitchenPendant','kitchenSplash','pantryDoor','windowBlind','wallClock','ceilingSpot'] as const;
export const kitchenKinds=['drawers','fridge','oven','sink','dishwasher','hob','corner'] as const;
export interface Furniture { kind:typeof furnitureKinds[number]; rect:Rect; height:number; bottom?:number; facing?:'north'|'south'|'east'|'west'; kitchen?:typeof kitchenKinds[number] }
export interface Staircase { to:FloorId; maxSlope?:number; steps:{polygon:Point2[];top:number;walkHeights?:number[]}[] }
export interface RoofSlope { rect:Rect; axis:'x'|'z'; startHeight:number; endHeight:number; cutouts?:Rect[] }
export interface FloorPlan {
  id:FloorId; name:string; height:number; footprint:Point2[]; walls:Point2[][];
  rooms:Room[]; openings:Opening[]; furniture:Furniture[]; stairZones:Rect[];
  spawn:{x:number;z:number;yaw:number};
  alternateSpawn?:{label:string;x:number;z:number;yaw:number};
  elevation?:number; offset?:Point2;
  floorHoles?:Rect[]; ceilingHoles?:Rect[];
  stairs?:Staircase[]; roofs?:RoofSlope[];
  supports?:{rect:Rect;bottom:number;top:number}[];
}

// Entirely synthetic test geometry. None of these dimensions, objects or room
// positions come from the owner's house plans. Replace this module only after
// explicit authorization to disclose the actual model in the target repository.
export const floorOrder:FloorId[] = ['kg','eg','og','dg'];
function testLevel(id:FloorId,index:number):FloorPlan {
  return {
    id,name:`Testetage ${index+1}`,height:2.6,
    footprint:rectanglePoints([0,0,10,8]),
    walls:[
      [0,0,10,.2],[0,7.8,10,8],[9.8,.2,10,7.8],
      [0,.2,.2,1.5],[0,3,.2,7.8],
      [.2,3.9,4.4,4.1],[5.6,3.9,9.8,4.1],
    ].map(bounds=>rectanglePoints(bounds as Rect)),
    rooms:[
      {name:'Bewegungsraum',polygon:rectanglePoints([.2,4.1,9.8,7.8]),surface:'wood'},
      {name:'Kollisionsraum',polygon:rectanglePoints([.2,.2,9.8,3.9]),surface:'tile'},
    ],
    openings:[
      {kind:'window',rect:[0,1.5,.2,3],sill:.85,top:2.1},
      {kind:'passage',rect:[4.4,3.9,5.6,4.1],top:2.1},
    ],
    furniture:[
      {kind:'sofa',rect:[.7,5,1.6,7],height:.75},
      {kind:'table',rect:[6.5,5.2,8.5,6.2],height:.76},
      {kind:'counter',rect:[7,.5,9.2,1.2],height:.9},
      {kind:'shelf',rect:[1,.6,3,1.1],height:1.7},
    ],
    stairZones:[],spawn:{x:3,z:6.3,yaw:.1},
  };
}
export const floors = Object.fromEntries(floorOrder.map((id,i)=>[id,testLevel(id,i)])) as Record<FloorId,FloorPlan>;
