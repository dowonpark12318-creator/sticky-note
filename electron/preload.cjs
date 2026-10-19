'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cornerNote', Object.freeze({
  getState: () => ipcRenderer.invoke('corner-note:get-state'),
  saveNote: note => ipcRenderer.invoke('corner-note:save-note', { text: note?.text, color: note?.color }),
  fold: options => ipcRenderer.invoke('corner-note:fold', { corner: options?.corner }),
  unfold: () => ipcRenderer.invoke('corner-note:unfold'),
  setAlwaysOnTop: enabled => ipcRenderer.invoke('corner-note:set-always-on-top', enabled),
  beginInteraction: options => ipcRenderer.invoke('corner-note:begin-interaction', {
    kind: options?.kind, edge: options?.edge, screenX: options?.screenX, screenY: options?.screenY,
  }),
  updateInteraction: options => ipcRenderer.invoke('corner-note:update-interaction', {
    id: options?.id, screenX: options?.screenX, screenY: options?.screenY,
  }),
  endInteraction: options => ipcRenderer.invoke('corner-note:end-interaction', {
    id: options?.id, cancel: options?.cancel,
  }),
  hide: () => ipcRenderer.invoke('corner-note:hide'),
  quit: () => ipcRenderer.invoke('corner-note:quit'),
  onState: callback => {
    if (typeof callback !== 'function') throw new TypeError('A state callback is required.');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('corner-note:state', listener);
    return () => ipcRenderer.removeListener('corner-note:state', listener);
  },
}));
