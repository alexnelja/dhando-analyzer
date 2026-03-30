import { describe, it, expect } from 'vitest';
import {
  InvestmentType,
  InvestmentStatus,
  PeDealStage,
  type Investment,
} from '../../src/models/investment.js';

describe('Investment model', () => {
  it('has all investment types', () => {
    expect(InvestmentType.LISTED_STOCK).toBe('listed_stock');
    expect(InvestmentType.PRIVATE_EQUITY).toBe('private_equity');
    expect(InvestmentType.PROPERTY).toBe('property');
    expect(InvestmentType.FRANCHISE).toBe('franchise');
    expect(InvestmentType.EM_STOCK).toBe('em_stock');
  });

  it('has all investment statuses', () => {
    expect(InvestmentStatus.SCREENING).toBe('screening');
    expect(InvestmentStatus.RESEARCHING).toBe('researching');
    expect(InvestmentStatus.DEEP_DIVE).toBe('deep_dive');
    expect(InvestmentStatus.READY_TO_BUY).toBe('ready_to_buy');
    expect(InvestmentStatus.HELD).toBe('held');
    expect(InvestmentStatus.EXITED).toBe('exited');
    expect(InvestmentStatus.REJECTED).toBe('rejected');
  });

  it('has PE deal stages including NDA_PENDING', () => {
    expect(PeDealStage.NDA_PENDING).toBe('nda_pending');
    expect(PeDealStage.SCREENING).toBe('screening');
    expect(PeDealStage.IC_MEMO).toBe('ic_memo');
    expect(PeDealStage.BIDDING).toBe('bidding');
    expect(PeDealStage.CLOSED).toBe('closed');
    expect(PeDealStage.REJECTED).toBe('rejected');
  });

  it('creates a valid investment object', () => {
    const inv: Investment = {
      id: '1',
      type: InvestmentType.LISTED_STOCK,
      name: 'Capitec Bank',
      ticker: 'CPI',
      exchange: 'JSE',
      sector: 'Financials',
      industry: 'Banking',
      status: InvestmentStatus.SCREENING,
      peDealStage: null,
      dataSource: 'eodhd',
      intrinsicValue: null,
      intrinsicValueCalculatedAt: null,
      moatScore: null,
      managementScore: null,
      circleOfCompetenceFit: null,
      userId: 'solo-investor',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(inv.ticker).toBe('CPI');
    expect(inv.userId).toBe('solo-investor');
  });
});
