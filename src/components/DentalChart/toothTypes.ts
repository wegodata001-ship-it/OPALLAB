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
  onClick: () => void;
}

export interface DentalChartProps {
  selectedTeeth: number[];
  onChange: (teeth: number[]) => void;
  readOnly?: boolean;
  className?: string;
  toothStatuses?: Partial<Record<number, ToothStatus>>;
}

export function toothKindFromNumber(number: number): ToothKind {
  const d = number % 10;
  if (d === 1 || d === 2) return "incisor";
  if (d === 3) return "canine";
  if (d === 4 || d === 5) return "premolar";
  return "molar";
}
