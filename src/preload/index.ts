import { contextBridge } from 'electron';

export interface NovelEngineAPI {
  // Methods will be added in Session 11
}

contextBridge.exposeInMainWorld('novelEngine', {} satisfies NovelEngineAPI);

declare global {
  interface Window {
    novelEngine: NovelEngineAPI;
  }
}
