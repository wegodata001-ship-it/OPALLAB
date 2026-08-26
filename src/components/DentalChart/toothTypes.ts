export type ToothJaw = "upper" | "lower";
export type ToothSide = "left" | "right";

/** Four base occlusal morphologies (reference chart) */
export type ToothKind = "incisor" | "canine" | "premolar" | "molar";

export type ToothStatus = "idle" | "selected" | "completed" | "processing" | "problem";

export interface ToothDefinition {
  number: number;
  jaw: ToothJaw;
  side: ToothSide;
  kind: ToothKind;
  cx: number;
  cy: number;
  rotation: number;
}

export interface ToothProps {
  number: number;
  kind: ToothKind;
  cx: number;
  cy: number;
  rotation: number;
  selected: boolean;
  status: ToothStatus;
  disabled: boolean;
  /** Blue border — range start/end (Shift / long-press). */
  rangeEndpoint?: boolean;
  /** Brief pulse after a range is applied. */
  rangeFlash?: boolean;
  interaction: {
    // React synthetic events — kept loose to avoid DOM/React type clashes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onClick: (e: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPointerDown: (e: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPointerEnter: (e: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPointerUp: (e: any) => void;
    onPointerCancel: () => void;
  };
}

export interface DentalChartProps {
  selectedTeeth: number[];
  onChange: (teeth: number[]) => void;
  /** Explicit bridge pairs (e.g. [[14,15],[15,16]]). Not auto-derived from selection. */
  bridgeGroups?: number[][];
  onBridgeGroupsChange?: (groups: number[][]) => void;
  readOnly?: boolean;
  className?: string;
  toothStatuses?: Partial<Record<number, ToothStatus>>;
  /**
   * Lab production legend (בריאה / בטיפול / הושלם / בעיה).
   * Off by default — not relevant on doctor/staff order-create screens.
   */
  showStatusLegend?: boolean;
}

export function toothKindFromNumber(number: number): ToothKind {
  const d = number % 10;
  if (d === 1 || d === 2) return "incisor";
  if (d === 3) return "canine";
  if (d === 4 || d === 5) return "premolar";
  return "molar";
}
