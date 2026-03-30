export const GeopoliticalEventType = {
  DEDOLLARIZATION: 'dedollarization',
  OIL_PRICE: 'oil_price',
  BRICS: 'brics',
  LOAD_SHEDDING: 'load_shedding',
  AGOA: 'agoa',
  CONFLICT: 'conflict',
  OTHER: 'other',
} as const;
export type GeopoliticalEventType = (typeof GeopoliticalEventType)[keyof typeof GeopoliticalEventType];

export interface GeopoliticalEvent {
  id: string;
  eventType: GeopoliticalEventType;
  eventPattern: string;
  affectedSectors: string[];
  affectedTickers: string[] | null;
  relevanceWeight: number;
  triggerThreshold: number;
  lastTriggered: Date | null;
  active: boolean;
}
