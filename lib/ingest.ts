// Shared shapes for inbox extraction — types only, imported by both the
// server actions and the client view.

export interface ExtractedMeta {
  confirmationNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  cancelBy?: string | null;
  flightNumber?: string | null;
  terminal?: string | null;
  gate?: string | null;
  seat?: string | null;
  hostName?: string | null;
  wifi?: string | null;
  notes?: string | null;
}

export interface ExtractedBlock {
  type:
    | "FLIGHT" | "TRAIN" | "BUS" | "FERRY"
    | "LODGING" | "ACTIVITY" | "MEAL" | "TRANSIT" | "NOTE";
  title: string;
  subtitle?: string | null;
  date: string;                 // "YYYY-MM-DD" destination-local
  startTime?: string | null;    // "HH:MM"
  endTime?: string | null;
  placeName?: string | null;
  address?: string | null;
  meta: ExtractedMeta;
}

export interface ExtractResult {
  blocks: ExtractedBlock[];
  confidence: number;           // 0..1
  sourceSummary: string;
}

export interface IngestView {
  id: string;
  sourceType: string;
  status: string;
  preview: string | null;
  hasImage: boolean;
  parsed: ExtractResult | null;
  confidence: number | null;
}
