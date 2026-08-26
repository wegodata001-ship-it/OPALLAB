export { DentalChart } from "./DentalChart";
export { useDentalChart } from "./useDentalChart";
export { Tooth } from "./Tooth";
export { ToothShape } from "./ToothShape";
export type {
  DentalChartProps,
  ToothProps,
  ToothStatus,
  ToothDefinition,
  ToothKind,
} from "./toothTypes";
export {
  ALL_TEETH,
  UPPER_TEETH,
  LOWER_TEETH,
  ALL_TOOTH_NUMBERS,
  UPPER_JAW_NUMBERS,
  LOWER_JAW_NUMBERS,
} from "./toothData";
export {
  computeBridgeGroups,
  formatBridgeLabel,
  resolveBridgeGroups,
  toggleBridgePair,
  pruneBridgeGroups,
  listArchAdjacentPairs,
} from "@/lib/orders/bridge-groups";
export { getArchRange, sameArch } from "./tooth-range";
