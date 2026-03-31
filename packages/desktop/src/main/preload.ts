import { contextBridge, ipcRenderer } from 'electron';

/**
 * Typed IPC bridge exposed as window.dhando in the renderer process.
 * All communication passes through contextBridge for security.
 */
contextBridge.exposeInMainWorld('dhando', {
  init: () => ipcRenderer.invoke('dhando:init'),

  watchlist: {
    list: (status?: string) => ipcRenderer.invoke('dhando:watchlist:list', status),
    add: (data: unknown) => ipcRenderer.invoke('dhando:watchlist:add', data),
    advance: (id: string) => ipcRenderer.invoke('dhando:watchlist:advance', id),
    remove: (id: string) => ipcRenderer.invoke('dhando:watchlist:remove', id),
  },

  screen: (...args: unknown[]) => ipcRenderer.invoke('dhando:screen', ...args),

  analyze: (input: unknown) => ipcRenderer.invoke('dhando:analyze', input),

  portfolio: {
    list: () => ipcRenderer.invoke('dhando:portfolio:list'),
    upsert: (data: unknown) => ipcRenderer.invoke('dhando:portfolio:upsert', data),
    close: (investmentId: string, exitPrice: number) =>
      ipcRenderer.invoke('dhando:portfolio:close', investmentId, exitPrice),
    dashboard: (inputs: unknown) => ipcRenderer.invoke('dhando:portfolio:dashboard', inputs),
    trafficLight: (input: unknown) => ipcRenderer.invoke('dhando:portfolio:trafficlight', input),
  },

  rules: {
    list: () => ipcRenderer.invoke('dhando:rules:list'),
    load: (dir: string) => ipcRenderer.invoke('dhando:rules:load', dir),
  },

  distress: {
    check: (input: unknown) => ipcRenderer.invoke('dhando:distress:check', input),
  },

  privateMarkets: {
    analyze: (input: unknown) => ipcRenderer.invoke('dhando:privatemarkets:analyze', input),
  },
});
