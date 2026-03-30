export const InvestmentType = {
  LISTED_STOCK: 'listed_stock',
  PRIVATE_EQUITY: 'private_equity',
  PROPERTY: 'property',
  FRANCHISE: 'franchise',
  EM_STOCK: 'em_stock',
} as const;
export type InvestmentType = (typeof InvestmentType)[keyof typeof InvestmentType];

export const InvestmentStatus = {
  SCREENING: 'screening',
  RESEARCHING: 'researching',
  DEEP_DIVE: 'deep_dive',
  READY_TO_BUY: 'ready_to_buy',
  HELD: 'held',
  EXITED: 'exited',
  REJECTED: 'rejected',
} as const;
export type InvestmentStatus = (typeof InvestmentStatus)[keyof typeof InvestmentStatus];

export const PeDealStage = {
  NDA_PENDING: 'nda_pending',
  SCREENING: 'screening',
  MEETING_SCHEDULED: 'meeting_scheduled',
  DEEP_DD: 'deep_dd',
  IC_MEMO: 'ic_memo',
  BIDDING: 'bidding',
  CLOSED: 'closed',
  REJECTED: 'rejected',
} as const;
export type PeDealStage = (typeof PeDealStage)[keyof typeof PeDealStage];

export const DataSource = {
  EODHD: 'eodhd',
  YAHOO: 'yahoo',
  MANUAL: 'manual',
} as const;
export type DataSource = (typeof DataSource)[keyof typeof DataSource];

export interface Investment {
  id: string;
  type: InvestmentType;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  status: InvestmentStatus;
  peDealStage: PeDealStage | null;
  dataSource: DataSource;
  intrinsicValue: number | null;
  intrinsicValueCalculatedAt: Date | null;
  moatScore: number | null;
  managementScore: number | null;
  circleOfCompetenceFit: number | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
