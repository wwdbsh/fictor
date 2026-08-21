export type RaceId =
  | "Stillkin"
  | "Burnkin"
  | "Joinkin"
  | "Scatterkin"
  | "Rotkin"
  | "Washkin";

export type GroundId =
  | "GROUND_STILL"
  | "GROUND_BURN"
  | "GROUND_SCATTER"
  | "GROUND_ROT"
  | "GROUND_WASH"
  | "GROUND_JOIN";

export type ContentStatus = "ENABLED" | "DISABLED";

export interface AssetReference {
  readonly id: string;
  readonly path: string;
}

export interface RaceDescriptor {
  readonly id: RaceId;
  readonly nameKo: string;
  readonly labelKo: string;
  readonly attribute: "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH" | "JOIN";
  readonly status: ContentStatus;
  readonly enabled: boolean;
  readonly groundIds: readonly GroundId[];
  readonly policyId: string | null;
}

export type GroundDepth = 1 | 2 | 3;

export interface GroundDepthDescriptor {
  readonly depth: GroundDepth;
  readonly label: string;
  readonly labelKo: string;
  readonly asset: AssetReference;
  readonly assetId: string;
  readonly assetPath: string;
}

export type EnemyShape = "SWARM" | "BULK" | "SHELL" | "REACH" | "MIMIC";

export interface NormalEnemyDescriptor {
  readonly id: string;
  readonly shape: EnemyShape;
  readonly labelKo: string;
  readonly asset: AssetReference;
  readonly assetId: string;
  readonly assetPath: string;
}

export type EliteMechanicId = "PRESSED_FIRE" | "BLAST" | "SPREADING" | "NEUTRALIZED" | "CLARIFIED" | "HARDENED";
export type BossMechanicId = "TOTAL_STOP" | "BURNOUT" | "DISPERSAL" | "SELF_EATING" | "EMPTIED" | "KNOT";
export type EncounterMechanicId = EliteMechanicId | BossMechanicId;

export interface EliteEnemyDescriptor {
  readonly id: string;
  readonly labelKo: string;
  readonly mechanicId: EliteMechanicId;
  readonly mechanic: MechanicMetadata;
  readonly asset: AssetReference;
  readonly assetId: string;
  readonly assetPath: string;
}

export interface BossEnemyDescriptor {
  readonly id: "the_stilling" | "the_burning" | "the_scattering" | "the_rotting" | "the_washing" | "the_joining";
  readonly name: "The Stilling" | "The Burning" | "The Scattering" | "The Rotting" | "The Washing" | "The Joining";
  readonly labelKo: string;
  readonly mechanicId: BossMechanicId;
  readonly mechanic: MechanicMetadata;
  readonly asset: AssetReference;
  readonly assetId: string;
  readonly assetPath: string;
  readonly reusesCardAssetId: "heart__still" | "heart__burn" | "heart__scatter" | "heart__rot" | "heart__wash" | "heart__join";
}

export interface MechanicMetadata {
  readonly id: EncounterMechanicId;
  readonly status: "PENDING_2026_08_21";
}

export type EventType = "CACHE" | "WORKSHOP" | "COLLAPSE" | "FICTOR" | "RECORD" | "ODDITY";

export interface EventDescriptor {
  readonly type: EventType;
  readonly labelKo: string;
  readonly asset: AssetReference;
  readonly assetId: string;
  readonly assetPath: string;
}

export interface GroundEncounters {
  readonly normals: readonly NormalEnemyDescriptor[];
  readonly elite: EliteEnemyDescriptor;
  readonly boss: BossEnemyDescriptor;
}

export interface GroundRewardMapping {
  readonly normal: {
    readonly source: "NORMAL";
    readonly allowedMaterialCategories: readonly ["ORE", "GROUND_PRODUCT"];
    readonly origin: GroundId;
  };
  readonly elite: {
    readonly source: "ELITE";
    readonly allowedMaterialCategories: readonly ["TOOL", "ODDITY"];
  };
  readonly boss: {
    readonly source: "BOSS";
    readonly heartId: "heart__still" | "heart__burn" | "heart__scatter" | "heart__rot" | "heart__wash" | "heart__join";
  };
}

export interface GroundDescriptor {
  readonly id: GroundId;
  readonly nameKo: string;
  readonly labelKo: string;
  readonly attribute: "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH" | "JOIN";
  readonly status: ContentStatus;
  readonly enabled: boolean;
  readonly depths: readonly GroundDepthDescriptor[];
  readonly encounters: GroundEncounters | null;
  readonly rewards: GroundRewardMapping | null;
  readonly events: readonly EventDescriptor[];
}

export type RegistryLookup<T> =
  | { readonly status: "ENABLED"; readonly value: T }
  | { readonly status: "DISABLED"; readonly value: T }
  | { readonly status: "MISSING" };

export interface ContentRegistry {
  readonly races: readonly RaceDescriptor[];
  readonly grounds: readonly GroundDescriptor[];
}

export interface AssetLookup {
  readonly status: "FOUND" | "MISSING";
  readonly asset?: AssetReference;
}
