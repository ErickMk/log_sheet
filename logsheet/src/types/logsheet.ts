export type DutyStatus = 'OFF' | 'SB' | 'D' | 'ON';

export interface LogEntry {
  status: DutyStatus;
  startUtc: string;
  endUtc: string;
}

export interface LogDaySheetFields {
  dateLocalISO: string;
  driverHomeTz: string;
  fromLocation?: string;
  carrierName?: string;
  mainOfficeAddress?: string;
  homeTerminalAddress?: string;
  truckTractorAndTrailer?: string;
  totalMilesDrivingToday?: number;
  totalMileageToday?: number;
  shippingDocuments?: string[];
  shipperCommodity?: string;
  remarks?: string;
  cycle: '60/7' | '70/8';
  logEntriesUtc: LogEntry[];
}

export interface DrawableSegment {
  status: DutyStatus;
  x1: number;
  x2: number;
  y: number;
  startLocal: string;
  endLocal: string;
}

export interface DrawableTransition {
  x: number;
  yFrom: number;
  yTo: number;
}

export interface PreparedLogDay {
  segments: DrawableSegment[];
  transitions: DrawableTransition[];
  totalsHours: { OFF: number; SB: number; D: number; ON: number; };
}

export interface Stop {
  id: string;
  label: string;
  location: { lat: number; lng: number; placeId?: string };
  type: 'pickup' | 'dropoff' | 'fuel' | 'break' | 'rest' | 'custom';
  plannedStartUtc?: string;
  plannedEndUtc?: string;
}

export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  distanceMiles: number;
  durationSec: number;
  polyline: string;
  startTimeUtc?: string;
  endTimeUtc?: string;
}

export interface DutySegment {
  status: DutyStatus;
  startUtc: string;
  endUtc: string;
  source: 'drive' | 'auto' | 'planned' | 'manual';
  note?: string;
}

export interface TripPlan {
  id: string;
  driverHomeTz: string;
  startOfDayLocal: '00:00' | '12:00';
  cycle: '60/7' | '70/8';
  stops: Stop[];
  legs: RouteLeg[];
  duty: DutySegment[];
}