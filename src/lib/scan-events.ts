export type ScanResult = "logged" | "duplicate" | "unreadable" | "failed";

export interface ScanEvent {
  id: string;
  timestamp: number;
  time: string;
  name: string;
  detail: string;
  result: ScanResult;
  late: boolean;
  station: string;
  source: "camera" | "manual";
  studentId?: string;
}
